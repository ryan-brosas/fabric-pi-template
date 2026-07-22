// verifier.test.ts — C3 tests for the candidate verifier sandbox.
//
// Tests (1) the strict bwrap binding, manifest, catalog, and receipt LOGIC in
// isolation; (2) the exact-OID evidence tree (no .git, no hardlinks, exact
// content at the OID); and (3) real verify() runs of a malicious candidate
// command that attempts credential reads, network, source mutation, catalog
// mutation, and descendant survival — asserting each is confined, plus the
// immutable-input manifest comparison and the fsynced verifier receipt.
//
// The malicious probe runs inside a real cgroup + strict bwrap (the same
// confinement path A2/A3 proved). No pi, no Fabric — those end-to-end are D1.
//
// Run: node --experimental-strip-types --test .pi/away-runtime/verifier.test.ts

import { describe, it, before, after } from "node:test";
import { strict as assert } from "node:assert";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import * as os from "node:os";

import { loadManifest, type Limits } from "./bootstrap.ts";
import {
  validateCatalog,
  lookupCommand,
  hashCatalog,
  type CommandCatalog,
} from "./command-catalog.ts";
import {
  buildVerifierBwrapArgs,
  buildManifest,
  buildInputManifest,
  materializeEvidenceTree,
  assertVerifierReceiptSafe,
  verify,
  writeVerifierAttestation,
  type VerifierReceipt,
} from "./verifier.ts";

const REAL_MANIFEST = join(import.meta.dirname, "..", "away-sandbox.json");
const REAL_NODE = process.execPath;
const BWRAP = loadManifest(REAL_MANIFEST).manifest.pinned_versions.bwrap_path;

// Test limits: generous (the probe uses little) but with a short timeout so a
// surviving descendant fails the test fast rather than hanging 10 minutes.
const REAL_LIMITS: Limits = loadManifest(REAL_MANIFEST).manifest.limits;
const TEST_LIMITS: Limits = {
  ...REAL_LIMITS,
  executor_timeout_ms: 20000,
};

// A malicious candidate probe. Runs as `node /src/probe.mjs` inside the sandbox
// and reports each confinement attempt to stdout as JSON. It spawns a detached
// long-lived child (setInterval) then exits as PID 1 — the PID-namespace
// destroy-on-PID1-exit must SIGKILL the child or the cgroup --wait hangs.
const PROBE_SRC = `
import fs from "node:fs";
import cp from "node:child_process";

const tryRead = (p) => {
  try { return "OK:" + fs.readFileSync(p, "utf8").slice(0, 24); }
  catch (e) { return "ERR:" + (e.code || String(e).slice(0, 24)); }
};
const tryWrite = (p, c = "x") => {
  try { fs.writeFileSync(p, c); return "OK"; }
  catch (e) { return "ERR:" + (e.code || String(e).slice(0, 24)); }
};

let fetchRes = "no-fetch";
try {
  const r = await Promise.race([
    fetch("https://example.com"),
    new Promise((_, rej) => setTimeout(() => rej(new Error("race-timeout")), 3000)),
  ]);
  fetchRes = "OK:" + r.status;
} catch (e) { fetchRes = "ERR:" + String((e && e.message) || e).slice(0, 30); }

let child = "no-child";
try {
  const c = cp.spawn(process.execPath, ["-e", "setInterval(()=>{},500)"], {
    detached: true, stdio: "ignore",
  });
  c.unref();
  child = "spawned:" + c.pid;
} catch (e) { child = "ERR:" + String(e).slice(0, 30); }

const report = {
  authJson: tryRead("/home/ryan/.pi/agent/auth.json"),
  etc: tryRead("/etc/passwd"),
  srcFile: tryRead("/src/probe.mjs"),
  fetch: fetchRes,
  srcWrite: tryWrite("/src/marker.txt"),
  catalogWrite: tryWrite("/catalog/x"),
  scratchWrite: tryWrite("/scratch/marker.txt"),
  child,
};
console.log(JSON.stringify(report));
process.exit(0);
`;

interface Repo {
  path: string;
  oid: string;
  cleanup: () => void;
}

function git(repoPath: string, args: string[]): void {
  const r = spawnSync("git", args, { cwd: repoPath, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${(r.stderr || "").trim()}`);
  }
}

function makeRepo(extraFiles?: Record<string, string>): Repo {
  const path = mkdtempSync(join(os.tmpdir(), "c3-repo-"));
  git(path, ["init", "-q"]);
  mkdirSync(join(path, "src"), { recursive: true });
  // The malicious probe lives at the repo ROOT; the verifier mounts the
  // evidence tree at /src, so the catalog argv `/src/probe.mjs` resolves it.
  writeFileSync(join(path, "probe.mjs"), PROBE_SRC);
  writeFileSync(join(path, "src", "lib.ts"), "export const X = 1;\n");
  if (extraFiles) {
    for (const [rel, content] of Object.entries(extraFiles)) {
      const abs = join(path, rel);
      mkdirSync(join(abs, ".."), { recursive: true });
      writeFileSync(abs, content);
    }
  }
  git(path, ["-c", "user.email=t@t", "-c", "user.name=t", "add", "-A"]);
  git(path, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "init"]);
  const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd: path, encoding: "utf8" });
  return {
    path,
    oid: r.stdout.trim(),
    cleanup: () => rmSync(path, { recursive: true, force: true }),
  };
}

function buildCatalog(): CommandCatalog {
  return {
    probe: {
      id: "probe",
      binary: REAL_NODE,
      argv: ["/src/probe.mjs"],
      cwd: "/scratch",
    },
    exit0: {
      id: "exit0",
      binary: REAL_NODE,
      argv: ["-e", "process.exit(0)"],
      cwd: "/scratch",
    },
    exit3: {
      id: "exit3",
      binary: REAL_NODE,
      argv: ["-e", "process.exit(3)"],
      cwd: "/scratch",
    },
  };
}

describe("buildVerifierBwrapArgs (strict candidate-command sandbox)", () => {
  const args = buildVerifierBwrapArgs({
    evidenceDir: "/host/evidence",
    catalogDir: "/host/catalog",
    commandBinary: REAL_NODE,
    libs: ["/usr/lib/x.so"],
    network: false,
    commandArgv: ["/src/test.ts"],
    cwd: "/scratch",
  });

  it("uses strict --unshare-user (never fail-open --unshare-user-try)", () => {
    assert.ok(args.includes("--unshare-user"), "must unshare user namespace strictly");
    assert.ok(!args.includes("--unshare-user-try"), "must NOT use fail-open --unshare-user-try");
  });

  it("unshares pid/ipc/uts/net (verifier: no network, ever)", () => {
    for (const f of ["--unshare-pid", "--unshare-ipc", "--unshare-uts", "--unshare-net"]) {
      assert.ok(args.includes(f), `must include ${f}`);
    }
    assert.ok(!args.includes("--share-net"), "verifier must NOT share net");
  });

  it("dies with parent and clears env", () => {
    assert.ok(args.includes("--die-with-parent"));
    assert.ok(args.includes("--clearenv"));
  });

  it("mounts evidence at /src, catalog read-only and scratch writable", () => {
    const joined = args.join(" ");
    assert.ok(joined.includes("--ro-bind /host/evidence /src"), "evidence ro at /src");
    assert.ok(joined.includes("--ro-bind /host/catalog /catalog"), "catalog dir ro at /catalog");
    assert.ok(args.includes("--tmpfs") && args.includes("/scratch"), "scratch tmpfs writable");
  });

  it("binds the command binary + libs read-only", () => {
    assert.ok(args.includes("--ro-bind"), "ro-bind present");
    const joined = args.join(" ");
    assert.ok(joined.includes(`--ro-bind ${REAL_NODE} ${REAL_NODE}`), "binary bound ro");
    assert.ok(joined.includes("--ro-bind /usr/lib/x.so /usr/lib/x.so"), "lib bound ro");
  });

  it("chdirs to the command cwd and runs the exact broker argv", () => {
    assert.ok(args.includes("--chdir") && args.includes("/scratch"), "chdir /scratch");
    const dashIdx = args.indexOf("--");
    assert.ok(dashIdx >= 0);
    assert.equal(args[dashIdx + 1], REAL_NODE, "binary is the command after --");
    assert.deepEqual(args.slice(dashIdx + 2), ["/src/test.ts"], "exact broker argv");
  });

  it("rejects an empty commandArgv", () => {
    assert.throws(
      () =>
        buildVerifierBwrapArgs({
          evidenceDir: "/e",
          catalogDir: "/c",
          commandBinary: REAL_NODE,
          libs: [],
          network: false,
          commandArgv: [],
          cwd: "/scratch",
        }),
      /commandArgv required/,
    );
  });
});

describe("buildManifest + buildInputManifest", () => {
  it("is stable across two reads of the same tree", () => {
    const d = mkdtempSync(join(os.tmpdir(), "c3-man-"));
    try {
      writeFileSync(join(d, "a.txt"), "hello");
      mkdirSync(join(d, "sub"), { recursive: true });
      writeFileSync(join(d, "sub", "b.txt"), "world");
      const m1 = buildManifest(d, 1000);
      const m2 = buildManifest(d, 1000);
      assert.equal(m1, m2);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("changes when content changes", () => {
    const d = mkdtempSync(join(os.tmpdir(), "c3-man2-"));
    try {
      writeFileSync(join(d, "a.txt"), "hello");
      const m1 = buildManifest(d, 1000);
      writeFileSync(join(d, "a.txt"), "HELLO");
      const m2 = buildManifest(d, 1000);
      assert.notEqual(m1, m2);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("throws when the tree exceeds maxFiles", () => {
    const d = mkdtempSync(join(os.tmpdir(), "c3-man3-"));
    try {
      for (let i = 0; i < 5; i++) writeFileSync(join(d, `f${i}.txt`), "x");
      assert.throws(() => buildManifest(d, 3), /exceeded maxFiles 3/);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("combines evidence + catalog + deps into one input manifest", () => {
    const e = mkdtempSync(join(os.tmpdir(), "c3-e-"));
    const c = join(e, "catalog.json");
    const dp = mkdtempSync(join(os.tmpdir(), "c3-d-"));
    try {
      writeFileSync(join(e, "a.txt"), "a");
      writeFileSync(c, "{}");
      writeFileSync(join(dp, "dep.txt"), "d");
      const m1 = buildInputManifest({ evidenceDir: e, catalogFile: c, depsDir: dp, maxFiles: 100 });
      const m2 = buildInputManifest({ evidenceDir: e, catalogFile: c, depsDir: dp, maxFiles: 100 });
      assert.equal(m1, m2);
      writeFileSync(c, '{"x":1}');
      const m3 = buildInputManifest({ evidenceDir: e, catalogFile: c, depsDir: dp, maxFiles: 100 });
      assert.notEqual(m1, m3, "catalog change must change the input manifest");
    } finally {
      rmSync(e, { recursive: true, force: true });
      rmSync(dp, { recursive: true, force: true });
    }
  });
});

describe("command-catalog", () => {
  it("lookupCommand throws on unknown id", () => {
    assert.throws(() => lookupCommand(buildCatalog(), "nope"), /unknown command: nope/);
  });

  it("lookupCommand returns the exact def for a known id", () => {
    const def = lookupCommand(buildCatalog(), "exit0");
    assert.equal(def.id, "exit0");
    assert.equal(def.binary, REAL_NODE);
    assert.deepEqual(def.argv, ["-e", "process.exit(0)"]);
  });

  it("validateCatalog rejects a non-string argv", () => {
    assert.throws(
      () => validateCatalog({ bad: { id: "bad", binary: "/x", argv: [1 as unknown as string] } }),
      /argv must be string/,
    );
  });

  it("validateCatalog rejects a missing binary", () => {
    assert.throws(
      () => validateCatalog({ bad: { id: "bad", binary: "", argv: [] } }),
      /binary missing/,
    );
  });

  it("hashCatalog is stable and changes on argv change", () => {
    const c = buildCatalog();
    const h1 = hashCatalog(c);
    const h2 = hashCatalog(c);
    assert.equal(h1, h2);
    const c2 = { ...c, exit0: { ...c.exit0, argv: ["-e", "process.exit(1)"] } };
    assert.notEqual(h1, hashCatalog(c2));
  });
});

describe("assertVerifierReceiptSafe", () => {
  function base(): VerifierReceipt {
    return {
      schema: "away-verifier-receipt/1",
      oid: "deadbeef",
      commandId: "test",
      catalogHash: "h",
      depsHash: null,
      preManifest: "p",
      postManifest: "p",
      manifestMatch: true,
      limits: {},
      exitStatus: 0,
      exitSignal: null,
      outcome: "completed",
      timestamp: 1,
    };
  }

  it("accepts a well-formed receipt", () => {
    assert.doesNotThrow(() => assertVerifierReceiptSafe(base()));
  });

  it("rejects an extra key (no smuggling prompts/source/creds/logs)", () => {
    const r = base() as VerifierReceipt & { secret?: string };
    r.secret = "LEAKED";
    assert.throws(() => assertVerifierReceiptSafe(r), /forbidden key: secret/);
  });

  it("rejects a bad schema and a bad outcome", () => {
    const r1 = base();
    (r1 as { schema: string }).schema = "evil/1";
    assert.throws(() => assertVerifierReceiptSafe(r1), /unexpected schema/);
    const r2 = base();
    (r2 as { outcome: string }).outcome = "won";
    assert.throws(() => assertVerifierReceiptSafe(r2), /invalid outcome/);
  });
});

describe("materializeEvidenceTree (exact-OID, no .git, no hardlinks)", () => {
  it("produces a tree with no .git and the exact OID content", () => {
    const repo = makeRepo({ "src/extra.txt": "ONLY-IN-OID2\n" });
    try {
      // Commit a second change to get a distinct OID with extra.txt.
      writeFileSync(join(repo.path, "src", "after.txt"), "later\n");
      git(repo.path, ["-c", "user.email=t@t", "-c", "user.name=t", "add", "-A"]);
      git(repo.path, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "second"]);
      const oid2 = spawnSync("git", ["rev-parse", "HEAD"], {
        cwd: repo.path,
        encoding: "utf8",
      }).stdout.trim();

      const out1 = mkdtempSync(join(os.tmpdir(), "c3-ev1-"));
      const out2 = mkdtempSync(join(os.tmpdir(), "c3-ev2-"));
      try {
        materializeEvidenceTree(repo.path, repo.oid, out1);
        materializeEvidenceTree(repo.path, oid2, out2);
        // No .git in either.
        assert.ok(!existsSync(join(out1, ".git")), "oid1 tree has no .git");
        assert.ok(!existsSync(join(out2, ".git")), "oid2 tree has no .git");
        // Exact OID content: oid1 lacks after.txt; oid2 has it.
        assert.ok(!existsSync(join(out1, "src", "after.txt")), "oid1: no after.txt");
        assert.ok(existsSync(join(out2, "src", "after.txt")), "oid2: has after.txt");
        assert.ok(existsSync(join(out1, "probe.mjs")), "oid1: probe present at root");
      } finally {
        rmSync(out1, { recursive: true, force: true });
        rmSync(out2, { recursive: true, force: true });
      }
    } finally {
      repo.cleanup();
    }
  });

  it("extracted files are independent inodes (no hardlinks; mutating the copy does not touch the repo)", () => {
    const repo = makeRepo();
    try {
      const out = mkdtempSync(join(os.tmpdir(), "c3-ev3-"));
      try {
        materializeEvidenceTree(repo.path, repo.oid, out);
        const probeOut = join(out, "probe.mjs");
        const probeRepo = join(repo.path, "probe.mjs");
        const inoOut = statSync(probeOut).ino;
        const inoRepo = statSync(probeRepo).ino;
        assert.notEqual(inoOut, inoRepo, "extracted file has a distinct inode");
        // Mutate the extracted copy.
        writeFileSync(probeOut, "MUTATED");
        // Repo file unchanged.
        assert.notEqual(readFileSync(probeRepo, "utf8"), "MUTATED", "repo file untouched");
      } finally {
        rmSync(out, { recursive: true, force: true });
      }
    } finally {
      repo.cleanup();
    }
  });

  it("throws on a bad OID", () => {
    const repo = makeRepo();
    try {
      const out = mkdtempSync(join(os.tmpdir(), "c3-ev4-"));
      try {
        assert.throws(
          () => materializeEvidenceTree(repo.path, "not-a-real-oid", out),
          /git archive.*failed/,
        );
      } finally {
        rmSync(out, { recursive: true, force: true });
      }
    } finally {
      repo.cleanup();
    }
  });
});

describe("verify (real cgroup + strict bwrap)", () => {
  let repo: Repo;
  let workRoot: string;
  let attestDir: string;

  before(() => {
    repo = makeRepo();
    workRoot = mkdtempSync(join(os.tmpdir(), "c3-work-"));
    attestDir = join(workRoot, "attest");
    mkdirSync(attestDir, { recursive: true });
  });

  after(() => {
    repo.cleanup();
    rmSync(workRoot, { recursive: true, force: true });
  });

  it("confines a malicious candidate: no creds, no net, no source/catalog mutation; scratch writable; manifest match; completed", () => {
    const start = Date.now();
    const res = verify({
      oid: repo.oid,
      repoPath: repo.path,
      commandId: "probe",
      catalog: buildCatalog(),
      limits: TEST_LIMITS,
      workRoot: join(workRoot, "probe"),
      commandBinary: REAL_NODE,
      bwrapPath: BWRAP,
      attestDir: join(attestDir, "probe"),
    });
    const elapsed = Date.now() - start;

    const report = JSON.parse(res.stdout);
    // Credential unreachable (auth.json not bound).
    assert.match(report.authJson, /^ERR/, "auth.json must be unreachable");
    assert.match(report.etc, /^ERR/, "/etc/passwd must be absent (no host /etc)");
    // Source read-only accessible.
    assert.match(report.srcFile, /^OK/, "evidence tree is readable at /src");
    // No network.
    assert.match(report.fetch, /^ERR/, "fetch must fail (no net namespace)");
    // Source + catalog read-only (mutation rejected).
    assert.match(report.srcWrite, /^ERR/, "source write must fail (read-only)");
    assert.match(report.catalogWrite, /^ERR/, "catalog write must fail (read-only)");
    // Scratch writable (execution clone).
    assert.equal(report.scratchWrite, "OK", "scratch must be writable");
    // A detached child was spawned (the reaping is proven by verify returning
    // fast + completed, not by the child surviving).
    assert.match(report.child, /^spawned:/, "detached child spawned");

    // Receipt: completed, exit 0, immutable inputs.
    assert.equal(res.receipt.outcome, "completed");
    assert.equal(res.receipt.exitStatus, 0);
    assert.equal(res.receipt.manifestMatch, true, "inputs unchanged post-run");
    assert.equal(res.receipt.oid, repo.oid);
    assert.equal(res.receipt.commandId, "probe");
    // Descendant reaping: a surviving child would hang the cgroup --wait until
    // the 20s timeout (aborted). Returning fast + completed proves the child
    // was SIGKILLed when PID 1 exited.
    assert.ok(elapsed < 15000, `verify returned in ${elapsed}ms (descendant reaped)`);
  });

  it("records completed for a clean exit", () => {
    const res = verify({
      oid: repo.oid,
      repoPath: repo.path,
      commandId: "exit0",
      catalog: buildCatalog(),
      limits: TEST_LIMITS,
      workRoot: join(workRoot, "exit0"),
      commandBinary: REAL_NODE,
      bwrapPath: BWRAP,
      attestDir: join(attestDir, "exit0"),
    });
    assert.equal(res.receipt.outcome, "completed");
    assert.equal(res.receipt.exitStatus, 0);
    assert.equal(res.receipt.manifestMatch, true);
  });

  it("records failed for a non-zero exit", () => {
    const res = verify({
      oid: repo.oid,
      repoPath: repo.path,
      commandId: "exit3",
      catalog: buildCatalog(),
      limits: TEST_LIMITS,
      workRoot: join(workRoot, "exit3"),
      commandBinary: REAL_NODE,
      bwrapPath: BWRAP,
      attestDir: join(attestDir, "exit3"),
    });
    assert.equal(res.receipt.outcome, "failed");
    assert.equal(res.receipt.exitStatus, 3);
    assert.equal(res.receipt.manifestMatch, true);
  });

  it("rejects an unknown command id", () => {
    assert.throws(
      () =>
        verify({
          oid: repo.oid,
          repoPath: repo.path,
          commandId: "nope",
          catalog: buildCatalog(),
          limits: TEST_LIMITS,
          workRoot: join(workRoot, "unknown"),
          commandBinary: REAL_NODE,
          bwrapPath: BWRAP,
          attestDir: join(attestDir, "unknown"),
        }),
      /unknown command: nope/,
    );
  });

  it("rejects a binary mismatch (broker binds exactly the catalog binary)", () => {
    const catalog: CommandCatalog = {
      bad: { id: "bad", binary: "/nonexistent/node", argv: ["-e", "process.exit(0)"] },
    };
    assert.throws(
      () =>
        verify({
          oid: repo.oid,
          repoPath: repo.path,
          commandId: "bad",
          catalog,
          limits: TEST_LIMITS,
          workRoot: join(workRoot, "mismatch"),
          commandBinary: REAL_NODE,
          bwrapPath: BWRAP,
          attestDir: join(attestDir, "mismatch"),
        }),
      /binary.*!=/,
    );
  });

  it("fsyncs a verifier receipt to the attest dir", () => {
    const sub = join(attestDir, "fsync");
    verify({
      oid: repo.oid,
      repoPath: repo.path,
      commandId: "exit0",
      catalog: buildCatalog(),
      limits: TEST_LIMITS,
      workRoot: join(workRoot, "fsync"),
      commandBinary: REAL_NODE,
      bwrapPath: BWRAP,
      attestDir: sub,
    });
    const receipts = readdirSync(sub).filter(
      (n) => n.startsWith("verifier-receipt-") && n.endsWith(".json"),
    );
    assert.equal(receipts.length, 1, "exactly one verifier receipt fsynced");
    const parsed = JSON.parse(readFileSync(join(sub, receipts[0]), "utf8")) as VerifierReceipt;
    assert.equal(parsed.schema, "away-verifier-receipt/1");
    assert.equal(parsed.commandId, "exit0");
    // Receipt keys are exactly the allowlist (no smuggled secrets).
    const allowed = new Set([
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
    for (const k of Object.keys(parsed)) {
      assert.ok(allowed.has(k), `no extra receipt key: ${k}`);
    }
  });
});

describe("verifier.ts verify-gate (no destructive git strings)", () => {
  it("contains no reset --hard / clean -fd / rm -rf / force push / branch -D", () => {
    const src = readFileSync(join(import.meta.dirname, "verifier.ts"), "utf8");
    assert.doesNotMatch(src, /reset\s+--hard|clean\s+-fd|rm\s+-rf|force[.-]push|branch\s+-D/);
  });
});
