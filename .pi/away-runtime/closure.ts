// B2 — Immutable closure.
//
// The away runtime must refuse to launch (or to accept a result) if ANY of the
// immutable startup inputs drifted since the last accepted closure. This module
// resolves + hashes the declared immutable inputs read from the host-owned
// manifest (.pi/away-sandbox.json) and produces a single closure hash; mutable
// session/Fabric state (sessions/, mesh/, /tmp scratch, control cwd fabric.json)
// is deliberately OUTSIDE the closure.
//
// The authoritative anti-tamper for the Fabric child-source is its VALUE digest,
// validated by the A2 wrapper (executor-wrapper.mjs). closure.ts hashes the
// child-source FILE as one drift input among many — a concurrent pi-fabric
// reinstall changes the file and surfaces here as closure drift. The two checks
// are complementary: the wrapper pins the value at spawn; closure pins the whole
// startup set across launch / restart / result.
//
// `requireAll:true` is the launch-time gate (every declared input must exist).
// `requireAll:false` is the recheck tolerance used by verifyClosure so a
// disappeared input reports as DRIFT rather than a hard throw.
//
// Run: node --experimental-strip-types --test .pi/away-runtime/confinement.test.ts

import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, resolve, dirname, join } from "node:path";
import { loadManifest } from "./bootstrap.ts";

export interface ClosureInput {
  declared: string; // resolved absolute path as declared
  canonical: string; // realpath if present, else resolved absolute
  exists: boolean;
  hash: string | null; // sha256 hex of file bytes, or null if absent
}

export interface Closure {
  manifestPath: string;
  laneId: string;
  inputs: ClosureInput[];
  hash: string;
}

export interface ResolveOptions {
  /** Hard-fail if any declared input is absent. Default false. */
  requireAll?: boolean;
  /** Override the Node binary input (defaults to process.execPath). */
  nodeBinary?: string;
  /** Additional immutable inputs declared by later waves (e.g. command catalog). */
  extraPaths?: string[];
}

export interface VerifyResult {
  ok: boolean;
  actual: string;
  expected: string;
  drift: ClosureInput[];
}

/** Reject relative paths; resolve symlinks to their real target. */
export function canonicalize(p: string): string {
  if (!isAbsolute(p)) throw new Error(`closure: path must be absolute: ${p}`);
  return realpathSync(p);
}

function hashFile(p: string): string | null {
  try {
    return createHash("sha256").update(readFileSync(p)).digest("hex");
  } catch {
    return null;
  }
}

function toCanonical(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    // Absent path: fall back to the resolved absolute path so a later appearance
    // (exists false -> true) registers as drift.
    return resolve(p);
  }
}

function stripLineSuffix(p: string): string {
  // "dist/runtime/node-process-runtime.js:29" -> "dist/runtime/node-process-runtime.js"
  const m = p.match(/^(.*):(\d+)$/);
  return m ? m[1] : p;
}

function absPath(declared: string, repoRoot: string): string {
  return isAbsolute(declared) ? declared : resolve(repoRoot, declared);
}

export function resolveClosure(
  manifestPath: string,
  laneId: string,
  opts: ResolveOptions = {},
): Closure {
  const { manifest } = loadManifest(manifestPath);
  const lane = manifest.lanes[laneId];
  if (!lane) throw new Error(`closure: unknown lane: ${laneId}`);
  const model = manifest.model_registry[lane.model];
  if (!model) throw new Error(`closure: lane ${laneId} references unknown model: ${lane.model}`);

  // repoRoot mirrors bootstrap.ts: manifest lives at <repoRoot>/.pi/away-sandbox.json.
  const repoRoot = resolve(dirname(manifestPath), "..");

  const declared: string[] = [];
  declared.push(manifestPath);
  const wrapperAbs = absPath(manifest.exec_path_override, repoRoot);
  declared.push(wrapperAbs);
  declared.push(join(dirname(wrapperAbs), "inner-guest.mjs"));
  declared.push(absPath(manifest.extensions.lane_extension, repoRoot));
  declared.push(absPath(manifest.pinned_versions.pi_path, repoRoot));
  declared.push(opts.nodeBinary ?? process.execPath);
  declared.push(absPath(manifest.pinned_versions.bwrap_path, repoRoot));
  const fabricRoot = absPath(manifest.pinned_versions.pi_fabric_path, repoRoot);
  declared.push(
    resolve(fabricRoot, stripLineSuffix(manifest.pinned_versions.pi_fabric_node_process_runtime)),
  );
  declared.push(
    resolve(
      fabricRoot,
      stripLineSuffix(manifest.pinned_versions.pi_fabric_node_process_child_source),
    ),
  );
  if (model.provider_source) declared.push(absPath(model.provider_source, repoRoot));
  if (opts.extraPaths) for (const p of opts.extraPaths) declared.push(absPath(p, repoRoot));

  const inputs: ClosureInput[] = [];
  for (const d of declared) {
    const exists = existsSync(d);
    const canonical = toCanonical(d);
    inputs.push({ declared: d, canonical, exists, hash: exists ? hashFile(canonical) : null });
  }

  if (opts.requireAll) {
    const missing = inputs.filter((i) => !i.exists);
    if (missing.length) {
      throw new Error(
        `closure: missing required closure input: ${missing.map((m) => m.declared).join(", ")}`,
      );
    }
  }

  // Deterministic hash over the sorted (canonical, exists, hash) tuples.
  const sorted = [...inputs].sort((a, b) => a.canonical.localeCompare(b.canonical));
  const hash = createHash("sha256")
    .update(sorted.map((i) => `${i.canonical}\0${i.exists}\0${i.hash ?? ""}`).join("\n"))
    .digest("hex");

  return { manifestPath, laneId, inputs, hash };
}

/**
 * Recheck the closure against an expected hash. Always resolves tolerantly
 * (requireAll forced false) so a disappeared input surfaces as DRIFT, not a
 * throw. Returns ok:false + the drifted inputs on mismatch.
 */
export function verifyClosure(
  manifestPath: string,
  laneId: string,
  expectedHash: string,
  opts: ResolveOptions = {},
): VerifyResult {
  const cur = resolveClosure(manifestPath, laneId, { ...opts, requireAll: false });
  if (cur.hash === expectedHash) {
    return { ok: true, actual: cur.hash, expected: expectedHash, drift: [] };
  }
  // Report disappeared inputs precisely; for content drift (exists unchanged),
  // we only have the expected hash, so fall back to the full input set.
  const disappeared = cur.inputs.filter((i) => !i.exists);
  return {
    ok: false,
    actual: cur.hash,
    expected: expectedHash,
    drift: disappeared.length ? disappeared : cur.inputs,
  };
}
