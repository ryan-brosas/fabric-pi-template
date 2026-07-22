// C3 — Candidate verifier sandbox.
//
// Runs a candidate test/build command (selected by command ID, never
// model-supplied argv) from command-catalog.ts inside a strict bubblewrap +
// cgroup sandbox over an immutable exact-OID evidence tree. The evidence tree
// is materialized via `git archive <oid> | tar -x` (no `.git`, no hardlinks —
// probed: extracted files get independent inodes). Source, deps, and the
// command catalog are mounted read-only; a writable scratch tmpfs is the
// quota-bounded execution clone; there is no network and no credentials. The
// verifier compares pre/post manifests of all inputs (source/test/dependency/
// catalog) and binds OID + command ID + manifests + resource limits + exit
// result into a fsynced verifier receipt (allowlisted keys only — never
// prompts, source, credentials, or logs).
//
// The verifier is invoked host-side by the C2 lane extension's away_run_verify
// handler (which already rejected model-supplied argv). The model never reaches
// this module directly.
//
// Run: node --experimental-strip-types --test .pi/away-runtime/verifier.test.ts

import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  statSync,
  openSync,
  writeSync,
  fsyncSync,
  closeSync,
  renameSync,
  existsSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { createHash, randomBytes } from "node:crypto";

import { lddResolve } from "./executor-wrapper.mjs";
import { runInCgroup } from "./resources.ts";
import type { Limits } from "./bootstrap.ts";
import {
  validateCatalog,
  lookupCommand,
  hashCatalog,
  type CommandCatalog,
  type CommandDef,
} from "./command-catalog.ts";

/** Outcome of a verifier run. Fixed schema; never free text. */
export type VerifierOutcome = "completed" | "failed" | "aborted";

/**
 * The verifier receipt. Allowlisted keys only — no prompts, source,
 * credentials, or logs. The command's stdout/stderr are NOT in the receipt
 * (they are returned by verify() for diagnostics but never persisted as
 * evidence).
 */
export interface VerifierReceipt {
  schema: "away-verifier-receipt/1";
  oid: string;
  commandId: string;
  catalogHash: string;
  depsHash: string | null;
  preManifest: string;
  postManifest: string;
  manifestMatch: boolean;
  limits: Record<string, number>;
  exitStatus: number | null;
  exitSignal: string | null;
  outcome: VerifierOutcome;
  timestamp: number;
}

const ALLOWED_RECEIPT_KEYS = new Set<keyof VerifierReceipt>([
  "schema",
  "oid",
  "commandId",
  "catalogHash",
  "depsHash",
  "preManifest",
  "postManifest",
  "manifestMatch",
  "limits",
  "exitStatus",
  "exitSignal",
  "outcome",
  "timestamp",
]);

/** Reject any receipt key outside the allowlist (defense against smuggling). */
export function assertVerifierReceiptSafe(receipt: VerifierReceipt): void {
  for (const k of Object.keys(receipt) as (keyof VerifierReceipt)[]) {
    if (!ALLOWED_RECEIPT_KEYS.has(k)) {
      throw new Error(`verifier receipt: forbidden key: ${k}`);
    }
  }
  if (receipt.schema !== "away-verifier-receipt/1") {
    throw new Error(`verifier receipt: unexpected schema: ${receipt.schema}`);
  }
  if (
    receipt.outcome !== "completed" &&
    receipt.outcome !== "failed" &&
    receipt.outcome !== "aborted"
  ) {
    throw new Error(`verifier receipt: invalid outcome: ${receipt.outcome}`);
  }
}

export interface VerifyOptions {
  /** Exact OID to verify against. */
  oid: string;
  /** Git repo to materialize the OID from (host path). */
  repoPath: string;
  /** Command to run (looked up in the catalog). */
  commandId: string;
  /** Immutable command-ID → definition map (host-owned). */
  catalog: CommandCatalog;
  /** Resource limits (cgroup + storage accounting). */
  limits: Limits;
  /** Temp working root. verify() creates evidence/ scratch/ catalog.json under it. */
  workRoot: string;
  /** Host path to the command binary (e.g. the node binary), bound read-only. */
  commandBinary: string;
  /** bwrap binary path (e.g. /usr/bin/bwrap). */
  bwrapPath: string;
  /** Where the verifier receipt is fsynced. */
  attestDir: string;
  /** Optional deps dir, mounted read-only at /deps. */
  depsDir?: string;
}

export interface VerifyResult {
  receipt: VerifierReceipt;
  receiptPath: string;
  /** Command stdout (bounded by limits.max_output_chars). Diagnostics only. */
  stdout: string;
  /** Command stderr (bounded). Diagnostics only. */
  stderr: string;
}

/**
 * Materialize an exact-OID evidence tree. `git archive <oid>` produces a tar of
 * the tracked tree at that OID; `tar -x` extracts it to destDir. The result has
 * NO `.git` directory and NO hardlinks (each extracted file is an independent
 * inode copy), so a candidate command cannot mutate git state or share inodes
 * with the source repo. Throws if git/tar fail.
 */
export function materializeEvidenceTree(repoPath: string, oid: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true });
  const archive = spawnSync("git", ["archive", oid], {
    cwd: repoPath,
    encoding: "buffer",
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (archive.status !== 0) {
    const err = archive.stderr ? Buffer.from(archive.stderr).toString("utf8") : "(no stderr)";
    throw new Error(`materializeEvidenceTree: git archive ${oid} failed: ${err.trim()}`);
  }
  const tar = spawnSync("tar", ["-x", "-C", destDir], {
    input: archive.stdout,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (tar.status !== 0) {
    throw new Error(`materializeEvidenceTree: tar failed: ${(tar.stderr || "").trim()}`);
  }
}

/** sha256 of a file's bytes. */
function sha256File(p: string): string {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

/**
 * Build a manifest hash over all regular files under `dir`: sha256 over the
 * sorted sequence of (relativePath, sha256(content)). Bounded by maxFiles
 * (throws if exceeded) so a runaway tree cannot OOM the verifier. Symlinks are
 * skipped (the evidence tree from git archive has none).
 */
export function buildManifest(dir: string, maxFiles: number): string {
  const entries: string[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      let s;
      try {
        s = statSync(p);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        walk(p);
      } else if (s.isFile() && !s.isSymbolicLink()) {
        const rel = p.slice(dir.length).replace(/\\/g, "/");
        entries.push(`${rel}:${sha256File(p)}`);
        if (entries.length > maxFiles) {
          throw new Error(`buildManifest: exceeded maxFiles ${maxFiles} under ${dir}`);
        }
      }
    }
  };
  if (existsSync(dir)) walk(dir);
  entries.sort();
  return createHash("sha256").update(entries.join("\n")).digest("hex");
}

/**
 * Combined manifest of all verifier INPUTS (evidence tree + catalog file +
 * deps). This is what pre/post comparison checks: any mutation of an input
 * between pre and post invalidates the evidence (manifestMatch=false).
 */
export function buildInputManifest(inp: {
  evidenceDir: string;
  catalogFile: string;
  depsDir?: string;
  maxFiles: number;
}): string {
  const evidence = buildManifest(inp.evidenceDir, inp.maxFiles);
  const catalog = sha256File(inp.catalogFile);
  const deps = inp.depsDir ? buildManifest(inp.depsDir, inp.maxFiles) : "";
  return createHash("sha256").update(`${evidence}|${catalog}|${deps}`).digest("hex");
}

export interface VerifierBwrapInputs {
  evidenceDir: string;
  depsDir?: string;
  /** Host directory containing catalog.json; bound read-only at /catalog. */
  catalogDir: string;
  commandBinary: string;
  libs: string[];
  network: boolean;
  commandArgv: string[];
  cwd: string;
}

/**
 * Build the strict bubblewrap argv for the candidate command. Strict
 * `--unshare-user` (never fail-open `--unshare-user-try`), PID/IPC/UTS/net
 * namespaces (verifier has no network), `--die-with-parent`, minimal read-only
 * binding (command binary + libs + evidence tree + deps + catalog), a writable
 * scratch tmpfs (quota-bounded by the wrapping cgroup's MemoryMax), cleared
 * minimal env (no credentials), cwd = the command's cwd. The command runs as
 * PID 1 in the PID namespace, so a detached descendant is SIGKILLed when the
 * command exits (the PID namespace is destroyed) — no descendants survive.
 *
 * The evidence tree is mounted read-only at `/src` (a subdirectory, NOT the
 * rootfs — binding it as `/` would make the rootfs read-only and bwrap could
 * not mkdir the mount points for the binary/libs/scratch binds). A catalog
 * command references repo-relative paths under `/src` (e.g. `/src/test.ts` for
 * the candidate's `test.ts`). Deps bind at `/deps`, the catalog DIRECTORY at
 * `/catalog` (a dir bind so the whole catalog tree is read-only — a file bind
 * would leave the parent dir writable), and a writable scratch tmpfs at
 * `/scratch`.
 */
export function buildVerifierBwrapArgs(inp: VerifierBwrapInputs): string[] {
  if (!Array.isArray(inp.commandArgv) || inp.commandArgv.length === 0) {
    throw new Error("buildVerifierBwrapArgs: commandArgv required");
  }
  const args = [
    "--unshare-user",
    "--unshare-pid",
    "--unshare-ipc",
    "--unshare-uts",
    inp.network ? "--share-net" : "--unshare-net",
    "--die-with-parent",
    "--ro-bind",
    inp.commandBinary,
    inp.commandBinary,
  ];
  for (const lib of inp.libs) args.push("--ro-bind", lib, lib);
  args.push("--ro-bind", inp.evidenceDir, "/src");
  if (inp.depsDir) args.push("--ro-bind", inp.depsDir, "/deps");
  args.push("--ro-bind", inp.catalogDir, "/catalog");
  // Writable execution clone: bounded by the wrapping cgroup MemoryMax (tmpfs
  // page cache is charged to the cgroup; A3 proved oom-kill under MemoryMax).
  args.push("--tmpfs", "/scratch", "--tmpfs", "/tmp", "--proc", "/proc", "--dev", "/dev");
  args.push("--clearenv", "--setenv", "PATH", "/usr/bin", "--setenv", "LANG", "C.UTF-8");
  if (inp.cwd) args.push("--chdir", inp.cwd);
  args.push("--", inp.commandBinary, ...inp.commandArgv);
  return args;
}

function fsyncDir(dir: string): void {
  let fd: number;
  try {
    fd = openSync(dir, "r");
  } catch {
    return;
  }
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** Atomically write + fsync the verifier receipt. Filename uses the
 * `verifier-receipt-` prefix (distinct from the wrapper's `attest-` and the
 * extension's `extension-receipt-`). */
export function writeVerifierAttestation(attestDir: string, receipt: VerifierReceipt): string {
  assertVerifierReceiptSafe(receipt);
  mkdirSync(attestDir, { recursive: true });
  const file = join(
    attestDir,
    `verifier-receipt-${Date.now()}-${randomBytes(4).toString("hex")}.json`,
  );
  const tmp = `${file}.tmp`;
  const fd = openSync(tmp, "w");
  try {
    writeSync(fd, JSON.stringify(receipt));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, file);
  fsyncDir(dirname(file));
  return file;
}

function buildVerifierReceipt(inp: {
  oid: string;
  commandId: string;
  catalogHash: string;
  depsHash: string | null;
  preManifest: string;
  postManifest: string;
  manifestMatch: boolean;
  limits: Limits;
  exitStatus: number | null;
  exitSignal: NodeJS.Signals | null;
  outcome: VerifierOutcome;
}): VerifierReceipt {
  const receipt: VerifierReceipt = {
    schema: "away-verifier-receipt/1",
    oid: inp.oid,
    commandId: inp.commandId,
    catalogHash: inp.catalogHash,
    depsHash: inp.depsHash,
    preManifest: inp.preManifest,
    postManifest: inp.postManifest,
    manifestMatch: inp.manifestMatch,
    limits: { ...inp.limits } as Record<string, number>,
    exitStatus: inp.exitStatus,
    exitSignal: inp.exitSignal,
    outcome: inp.outcome,
    timestamp: Date.now(),
  };
  assertVerifierReceiptSafe(receipt);
  return receipt;
}

function maxOutput(len: number): (s: string) => string {
  return (s) => (s.length > len ? `${s.slice(0, len)}…[truncated ${s.length - len} chars]` : s);
}

/**
 * Run a candidate command in the verifier sandbox. Materializes the exact-OID
 * evidence tree, computes the pre manifest of all inputs, runs the command
 * under a cgroup-wrapped strict bwrap (no net, no creds, source/deps/catalog
 * read-only, writable scratch tmpfs), computes the post manifest, compares,
 * and fsyncs the verifier receipt. Returns the receipt + bounded command
 * stdout/stderr (diagnostics only — never in the receipt).
 */
export function verify(opts: VerifyOptions): VerifyResult {
  validateCatalog(opts.catalog);
  const def: CommandDef = lookupCommand(opts.catalog, opts.commandId);
  if (def.binary !== opts.commandBinary) {
    // The broker binds exactly the catalog's binary; a mismatch is a host-side
    // configuration error, never a model-supplied value.
    throw new Error(
      `verify: command ${opts.commandId} binary ${def.binary} != verifier binary ${opts.commandBinary}`,
    );
  }

  const evidenceDir = join(opts.workRoot, "evidence");
  const scratchDir = join(opts.workRoot, "scratch");
  // Catalog is written to a host DIRECTORY (bound read-only at /catalog) so the
  // whole catalog tree is read-only — a file bind would leave the parent dir
  // writable and a candidate could write /catalog/x.
  const catalogDir = join(opts.workRoot, "catalog");
  const catalogFile = join(catalogDir, "catalog.json");
  mkdirSync(opts.workRoot, { recursive: true });
  mkdirSync(scratchDir, { recursive: true });
  mkdirSync(catalogDir, { recursive: true });

  // Host-owned catalog file (bound read-only into the sandbox at /catalog).
  writeFileSync(catalogFile, JSON.stringify(opts.catalog, null, 2));
  const catalogHash = hashCatalog(opts.catalog);
  const depsHash = opts.depsDir ? buildManifest(opts.depsDir, opts.limits.max_file_count) : null;

  // Immutable exact-OID evidence tree (no .git, no hardlinks).
  materializeEvidenceTree(opts.repoPath, opts.oid, evidenceDir);

  // Pre manifest of all inputs (source/test/dependency/catalog).
  const preManifest = buildInputManifest({
    evidenceDir,
    catalogFile,
    depsDir: opts.depsDir,
    maxFiles: opts.limits.max_file_count,
  });

  const libs = lddResolve(opts.commandBinary);
  const bwrapArgs = buildVerifierBwrapArgs({
    evidenceDir,
    depsDir: opts.depsDir,
    catalogDir,
    commandBinary: opts.commandBinary,
    libs,
    network: false, // verifier: no network, ever.
    commandArgv: def.argv,
    cwd: def.cwd ?? "/scratch",
  });

  const result = runInCgroup(opts.limits, [opts.bwrapPath, ...bwrapArgs], {
    timeoutMs: opts.limits.executor_timeout_ms,
  });

  // Post manifest of all inputs. Read-only mounts mean this should equal pre;
  // a mismatch is an integrity failure (a leaked writable path or a bypass).
  const postManifest = buildInputManifest({
    evidenceDir,
    catalogFile,
    depsDir: opts.depsDir,
    maxFiles: opts.limits.max_file_count,
  });
  const manifestMatch = preManifest === postManifest;

  // Outcome: completed only on a clean exit AND input immutability. A signal
  // (oom-kill / timeout / external) is aborted; any other non-zero or manifest
  // mismatch is failed.
  let outcome: VerifierOutcome;
  if (result.signal !== null || result.status === null) {
    outcome = "aborted";
  } else if (result.status === 0 && manifestMatch) {
    outcome = "completed";
  } else {
    outcome = "failed";
  }

  const receipt = buildVerifierReceipt({
    oid: opts.oid,
    commandId: opts.commandId,
    catalogHash,
    depsHash,
    preManifest,
    postManifest,
    manifestMatch,
    limits: opts.limits,
    exitStatus: result.status,
    exitSignal: result.signal,
    outcome,
  });
  const receiptPath = writeVerifierAttestation(opts.attestDir, receipt);

  const bound = maxOutput(opts.limits.max_output_chars);
  return { receipt, receiptPath, stdout: bound(result.stdout), stderr: bound(result.stderr) };
}
