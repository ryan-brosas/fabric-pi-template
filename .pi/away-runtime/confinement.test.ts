// B2 — Immutable closure and resource limits.
//
// Run: node --experimental-strip-types --test .pi/away-runtime/confinement.test.ts
//
// Two surfaces under test:
//   closure.ts  — resolves + hashes the immutable startup inputs (wrapper, inner
//                guest, lane extension, pinned Pi/Fabric/provider/Node/bwrap
//                sources, manifest) and detects drift on recheck. Mutable
//                session/Fabric state stays OUTSIDE the closure.
//   resources.ts — cgroup PID/memory/CPU enforcement via systemd-run --user
//                (service mode; --scope is unsuitable per A3) + quota-backed
//                storage/file-count accounting. NOTE: bwrap --size is rejected in
//                setuid mode, so hard storage is bounded by cgroup MemoryMax
//                (tmpfs pages are charged to the cgroup); storage_bytes +
//                max_file_count are verified post-run via accounting.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  symlinkSync,
  readFileSync,
  rmSync,
  existsSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, isAbsolute } from "node:path";
import { spawnSync } from "node:child_process";

import { resolveClosure, verifyClosure, canonicalize } from "./closure.ts";
import {
  buildCgroupArgs,
  buildSandboxSpawnArgs,
  runInCgroup,
  countFiles,
  measureDirBytes,
  listCgroupProcs,
} from "./resources.ts";
import { buildBwrapArgs, PINNED_CHILD_SOURCE_DIGEST } from "./executor-wrapper.mjs";
import { loadManifest } from "./bootstrap.ts";

const HERE = import.meta.dirname;
const REPO = resolve(HERE, "..", "..");
const REAL_MANIFEST = join(REPO, ".pi", "away-sandbox.json");

// Preflight: is `systemd-run --user` actually usable in this environment?
// A3 proved it is on this host; tests skip gracefully elsewhere.
const SR_OK = (() => {
  try {
    const r = spawnSync("systemd-run", ["--user", "--wait", "--collect", "--", "/usr/bin/true"], {
      timeout: 10000,
      encoding: "utf8",
    });
    return r.status === 0;
  } catch {
    return false;
  }
})();

// ---- fixture helpers --------------------------------------------------------

interface FixturePaths {
  root: string;
  manifest: string;
  wrapper: string;
  innerGuest: string;
  laneExt: string;
  runtimeFile: string;
  childSourceFile: string;
}

function writeFixtureManifest(
  root: string,
  opts: { laneExtMissing?: boolean; providerSource?: string | null },
) {
  const manifest = {
    schema: "away-sandbox/1",
    version: 1,
    pinned_versions: {
      node: "24.16.0",
      pi: "0.81.1",
      pi_path: process.execPath,
      pi_fabric: "0.23.0",
      pi_fabric_path: ".pi/npm/node_modules/pi-fabric",
      pi_fabric_node_process_runtime: "dist/runtime/node-process-runtime.js:29",
      pi_fabric_node_process_child_source: "dist/runtime/node-process-child-source.js",
      bwrap: "0.9.0",
      bwrap_path: "/usr/bin/bwrap",
      makora_provider: "1.12.1",
      makora_provider_path: "/opt/nope",
    },
    model_registry: {
      builtin: {
        provider: "openai-codex",
        model: "gpt-5.4-mini",
        thinking: "medium",
        provider_source: null,
      },
      makora:
        opts.providerSource !== undefined
          ? {
              provider: "makora",
              model: "makora/zai-org/GLM-5.2-NVFP4",
              thinking: "max",
              provider_source: opts.providerSource,
            }
          : undefined,
    },
    extensions: { lane_extension: ".pi/away-runtime/lane-extension.ts" },
    exec_path_override: ".pi/away-runtime/wrapper.mjs",
    control_cwd_root: "~/.local/state/pi-away-fixtures/control",
    env_allowlist: ["PATH", "LANG"],
    env_deny_prefixes: ["PI_FABRIC_", "PI_TRUST"],
    limits: {
      cgroup_pid_max: 256,
      cgroup_memory_bytes: 17179869184,
      cgroup_cpu_weight: 100,
      cgroup_storage_bytes: 1073741824,
      executor_memory_limit_bytes: 17179869184,
      executor_timeout_ms: 600000,
      max_file_count: 4096,
      max_output_chars: 200000,
      max_nested_result_chars: 100000,
    },
    host_call_refs: ["away_read"],
    host_call_risks: { away_read: "read" },
    lanes: {
      writer: {
        network: false,
        filesystem: false,
        writable: true,
        tools: ["fabric_exec"],
        host_call_refs: ["away_read"],
        approvals: {
          read: "allow",
          write: "deny",
          execute: "deny",
          network: "deny",
          agent: "deny",
        },
        model: opts.providerSource ? "makora" : "builtin",
      },
      scout: {
        network: true,
        filesystem: false,
        writable: false,
        tools: ["fabric_exec"],
        host_call_refs: [],
        approvals: {
          read: "allow",
          write: "deny",
          execute: "deny",
          network: "allow",
          agent: "deny",
        },
        model: "builtin",
      },
    },
    protected_paths: [],
    runtime_protected_paths: [],
  };
  const manifestPath = join(root, ".pi", "away-sandbox.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifestPath;
}

function makeFixture(
  opts: { laneExtMissing?: boolean; providerSource?: string | null } = {},
): FixturePaths {
  const root = mkdtempSync(join(tmpdir(), "away-b2-"));
  mkdirSync(join(root, ".pi", "away-runtime"), { recursive: true });
  mkdirSync(join(root, ".pi", "npm", "node_modules", "pi-fabric", "dist", "runtime"), {
    recursive: true,
  });
  const wrapper = join(root, ".pi", "away-runtime", "wrapper.mjs");
  const innerGuest = join(root, ".pi", "away-runtime", "inner-guest.mjs");
  const laneExt = join(root, ".pi", "away-runtime", "lane-extension.ts");
  const runtimeFile = join(
    root,
    ".pi",
    "npm",
    "node_modules",
    "pi-fabric",
    "dist",
    "runtime",
    "node-process-runtime.js",
  );
  const childSourceFile = join(
    root,
    ".pi",
    "npm",
    "node_modules",
    "pi-fabric",
    "dist",
    "runtime",
    "node-process-child-source.js",
  );
  writeFileSync(wrapper, "export const x = 'wrapper';\n");
  writeFileSync(innerGuest, "export const x = 'inner';\n");
  if (!opts.laneExtMissing) writeFileSync(laneExt, "export const x = 'lane';\n");
  writeFileSync(runtimeFile, "export class NodeProcessRuntime {}\n");
  writeFileSync(childSourceFile, "export const NODE_PROCESS_CHILD_SOURCE = 'fixture';\n");
  const manifest = writeFixtureManifest(root, opts);
  return {
    root,
    manifest,
    wrapper,
    innerGuest,
    laneExt,
    runtimeFile,
    childSourceFile,
  };
}

let fixtures: string[] = [];
after(() => {
  for (const f of fixtures) {
    try {
      rmSync(f, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

// =============================================================================
// closure.ts
// =============================================================================

describe("closure: resolve real manifest (requireAll:false tolerates forward refs)", () => {
  test("resolves existing inputs and marks lane-extension as not-yet-present", () => {
    const c = resolveClosure(REAL_MANIFEST, "writer", { requireAll: false });
    assert.ok(isAbsolute(c.manifestPath), "manifestPath absolute");
    const byCanonical = new Map(c.inputs.map((i) => [i.canonical, i]));
    // wrapper + inner-guest must exist (A2 deliverables)
    const wrapper = c.inputs.find((i) => i.canonical.endsWith("executor-wrapper.mjs"));
    assert.ok(wrapper && wrapper.exists && wrapper.hash, "wrapper hashed");
    const inner = c.inputs.find((i) => i.canonical.endsWith("inner-guest.mjs"));
    assert.ok(inner && inner.exists && inner.hash, "inner-guest hashed");
    // lane-extension is a forward ref to C2; not present at B2
    const laneExt = c.inputs.find((i) => i.canonical.endsWith("lane-extension.ts"));
    assert.ok(laneExt, "lane-extension declared");
    assert.equal(laneExt!.exists, false, "lane-extension absent at B2");
    assert.equal(laneExt!.hash, null, "no hash for absent forward ref");
    // pinned binaries present
    const bwrap = c.inputs.find((i) => i.canonical === realpath("/usr/bin/bwrap"));
    assert.ok(bwrap && bwrap.exists, "bwrap hashed");
    // the two Fabric runtime files present
    const childSrc = c.inputs.find((i) => i.canonical.endsWith("node-process-child-source.js"));
    assert.ok(childSrc && childSrc.exists, "child-source file hashed");
    const runtime = c.inputs.find((i) => i.canonical.endsWith("node-process-runtime.js"));
    assert.ok(runtime && runtime.exists, "node-process-runtime hashed");
    // writer lane model is makora → provider source present
    const provider = c.inputs.find((i) => i.canonical.includes("pi-makora-provider"));
    assert.ok(provider && provider.exists, "makora provider source hashed");
  });

  test("hash is a 64-char hex string and deterministic across calls", () => {
    const a = resolveClosure(REAL_MANIFEST, "writer", { requireAll: false });
    const b = resolveClosure(REAL_MANIFEST, "writer", { requireAll: false });
    assert.match(a.hash, /^[0-9a-f]{64}$/);
    assert.equal(a.hash, b.hash, "deterministic");
  });

  test("mutable session/Fabric state is excluded from the closure", () => {
    const c = resolveClosure(REAL_MANIFEST, "writer", { requireAll: false });
    for (const i of c.inputs) {
      assert.ok(!i.canonical.startsWith(join(tmpdir(), "away-")), `no tmp scratch: ${i.canonical}`);
      assert.ok(!/\/sessions\//.test(i.canonical), `no session state: ${i.canonical}`);
      assert.ok(!/\/mesh\//.test(i.canonical), `no mesh state: ${i.canonical}`);
    }
  });
});

describe("closure: canonical-path and symlink handling", () => {
  test("canonicalize rejects relative paths and resolves symlinks", () => {
    const fix = makeFixture();
    fixtures.push(fix.root);
    const target = join(fix.root, "real-target.txt");
    writeFileSync(target, "hello");
    const link = join(fix.root, "link.txt");
    symlinkSync(target, link);
    assert.throws(() => canonicalize("relative/path"), /absolute/);
    assert.equal(canonicalize(link), realpath(target), "symlink resolved to realpath");
  });

  test("a symlink swap changes the closure hash", () => {
    const fix = makeFixture();
    fixtures.push(fix.root);
    // Replace the wrapper with a symlink, then swap its target.
    rmSync(fix.wrapper, { force: true });
    const targetA = join(fix.root, "wrap-a.mjs");
    const targetB = join(fix.root, "wrap-b.mjs");
    writeFileSync(targetA, "A");
    writeFileSync(targetB, "B");
    symlinkSync(targetA, fix.wrapper);
    const before = resolveClosure(fix.manifest, "writer", { requireAll: false });
    rmSync(fix.wrapper, { force: true });
    symlinkSync(targetB, fix.wrapper);
    const after = resolveClosure(fix.manifest, "writer", { requireAll: false });
    assert.notEqual(before.hash, after.hash, "symlink swap detected as drift");
  });
});

describe("closure: requireAll (launch-time completeness)", () => {
  test("passes when all declared inputs exist", () => {
    const fix = makeFixture();
    fixtures.push(fix.root);
    const c = resolveClosure(fix.manifest, "writer", { requireAll: true });
    assert.equal(
      c.inputs.every((i) => i.exists),
      true,
    );
  });

  test("throws when a required input is missing", () => {
    const fix = makeFixture({ laneExtMissing: true });
    fixtures.push(fix.root);
    assert.throws(
      () => resolveClosure(fix.manifest, "writer", { requireAll: true }),
      /missing required closure input/i,
    );
  });

  test("requireAll:false tolerates the missing forward ref", () => {
    const fix = makeFixture({ laneExtMissing: true });
    fixtures.push(fix.root);
    const c = resolveClosure(fix.manifest, "writer", { requireAll: false });
    const laneExt = c.inputs.find((i) => i.canonical.endsWith("lane-extension.ts"));
    assert.equal(laneExt!.exists, false);
  });
});

describe("closure: drift detection (recheck before launch / after restart / before result)", () => {
  test("verifyClosure passes on unchanged inputs and fails on drift", () => {
    const fix = makeFixture();
    fixtures.push(fix.root);
    const expected = resolveClosure(fix.manifest, "writer", { requireAll: true });
    const ok = verifyClosure(fix.manifest, "writer", expected.hash, { requireAll: true });
    assert.equal(ok.ok, true, "unchanged → ok");

    // Mutate the wrapper → drift.
    writeFileSync(fix.wrapper, "export const x = 'tampered';\n");
    const drifted = verifyClosure(fix.manifest, "writer", expected.hash, { requireAll: true });
    assert.equal(drifted.ok, false, "tampered → drift");
    assert.ok(drifted.drift.length > 0, "drift reports the changed input");
  });

  test("verifyClosure fails if a previously-present input disappears", () => {
    const fix = makeFixture();
    fixtures.push(fix.root);
    const expected = resolveClosure(fix.manifest, "writer", { requireAll: true });
    rmSync(fix.innerGuest, { force: true });
    const r = verifyClosure(fix.manifest, "writer", expected.hash, { requireAll: true });
    assert.equal(r.ok, false);
  });
});

// =============================================================================
// resources.ts
// =============================================================================

describe("resources: buildCgroupArgs (systemd-run service mode, NOT scope)", () => {
  const limits = loadManifest(REAL_MANIFEST).manifest.limits;

  test("produces systemd-run --user --wait --pipe --collect with TasksMax/MemoryMax/CPUWeight", () => {
    const args = buildCgroupArgs(limits);
    assert.equal(args[0], "systemd-run");
    assert.ok(args.includes("--user"), "user");
    assert.ok(args.includes("--wait"), "wait (service mode)");
    assert.ok(args.includes("--pipe"), "pipe");
    assert.ok(args.includes("--collect"), "collect");
    assert.ok(!args.includes("--scope"), "scope is unsuitable (A3)");
    assert.ok(
      args.some((a) => a === "TasksMax" || a.startsWith("TasksMax=")),
      "TasksMax",
    );
    assert.ok(
      args.some((a) => a === "MemoryMax" || a.startsWith("MemoryMax=")),
      "MemoryMax",
    );
    assert.ok(
      args.some((a) => a === "CPUWeight" || a.startsWith("CPUWeight=")),
      "CPUWeight",
    );
  });

  test("derives exact limit values from the manifest", () => {
    const args = buildCgroupArgs(limits);
    const pidProp = args.find((a) => a.startsWith("TasksMax="))!;
    const memProp = args.find((a) => a.startsWith("MemoryMax="))!;
    const cpuProp = args.find((a) => a.startsWith("CPUWeight="))!;
    assert.equal(pidProp, `TasksMax=${limits.cgroup_pid_max}`);
    assert.equal(memProp, `MemoryMax=${limits.cgroup_memory_bytes}`);
    assert.equal(cpuProp, `CPUWeight=${limits.cgroup_cpu_weight}`);
  });
});

describe("resources: buildSandboxSpawnArgs (cgroup wraps bwrap)", () => {
  const libs = ["/lib/x86_64-linux-gnu/libc.so.6"];
  const base = {
    realNode: process.execPath,
    libs,
    innerGuestPath: "/guest.mjs",
    guestArgs: ["--input-type=module", "--import", "/guest.mjs", "--eval", "x"],
  };

  test("composes systemd-run prefix + bwrap args", () => {
    const args = buildSandboxSpawnArgs(loadManifest(REAL_MANIFEST).manifest.limits, {
      ...base,
      network: false,
      bwrapPath: "/usr/bin/bwrap",
    });
    assert.equal(args[0], "systemd-run");
    const sep = args.indexOf("--");
    assert.ok(sep > 0, "-- separator present");
    assert.equal(args[sep + 1], "/usr/bin/bwrap", "bwrap after separator");
    const bwrapSlice = args.slice(sep + 1);
    assert.ok(bwrapSlice.includes("--unshare-user"), "strict userns");
    assert.ok(!bwrapSlice.includes("--unshare-user-try"), "never fail-open");
    assert.ok(bwrapSlice.includes("--unshare-net"), "writer lane: no net");
    assert.ok(!bwrapSlice.includes("--share-net"), "writer lane: no share-net");
    assert.ok(bwrapSlice.includes("--die-with-parent"), "die-with-parent");
    assert.ok(bwrapSlice.includes("--clearenv"), "clearenv");
  });

  test("scout lane gets --share-net, no --unshare-net", () => {
    const args = buildSandboxSpawnArgs(loadManifest(REAL_MANIFEST).manifest.limits, {
      ...base,
      network: true,
      bwrapPath: "/usr/bin/bwrap",
    });
    const sep = args.indexOf("--");
    const bwrapSlice = args.slice(sep + 1);
    assert.ok(bwrapSlice.includes("--share-net"), "scout: share-net");
    assert.ok(!bwrapSlice.includes("--unshare-net"), "scout: no unshare-net");
  });
});

describe("resources: quota accounting (countFiles / measureDirBytes)", () => {
  test("counts files and sums sizes", () => {
    const root = mkdtempSync(join(tmpdir(), "away-b2-q-"));
    fixtures.push(root);
    mkdirSync(join(root, "sub"), { recursive: true });
    writeFileSync(join(root, "a.txt"), "aaaa");
    writeFileSync(join(root, "sub", "b.txt"), "bb");
    assert.equal(countFiles(root), 2, "two files");
    assert.equal(measureDirBytes(root), 6, "4 + 2 bytes");
  });
});

describe("resources: live cgroup enforcement", { skip: !SR_OK }, () => {
  const tightLimits = {
    cgroup_pid_max: 1,
    cgroup_memory_bytes: 20 * 1024 * 1024,
    cgroup_cpu_weight: 100,
    cgroup_storage_bytes: 1073741824,
    executor_memory_limit_bytes: 17179869184,
    executor_timeout_ms: 600000,
    max_file_count: 4096,
    max_output_chars: 200000,
    max_nested_result_chars: 100000,
  };

  test("TasksMax=1 aborts a node process (pids enforcement)", () => {
    const r = runInCgroup({ ...tightLimits, cgroup_pid_max: 1 }, [process.execPath, "-e", "0"]);
    assert.notEqual(r.status, 0, "non-zero exit under TasksMax=1");
  });

  test("MemoryMax=20M oom-kills an allocating process (memory enforcement)", () => {
    const r = runInCgroup(tightLimits, [
      process.execPath,
      "-e",
      "const a = new Uint8Array(5e8); a.fill(1); 0",
    ]);
    assert.ok(r.signal === "SIGKILL" || r.status !== 0, "oom-kill or non-zero under MemoryMax=20M");
  });

  test("generous limits let normal work complete", () => {
    const r = runInCgroup(
      { ...tightLimits, cgroup_pid_max: 64, cgroup_memory_bytes: 1024 * 1024 * 1024 },
      [process.execPath, "-e", "process.exit(0)"],
    );
    assert.equal(r.status, 0, "completes with room");
  });
});

describe("resources: live no-descendants-after-termination", { skip: !SR_OK }, () => {
  test("a detached child does not survive the cgroup service stopping", () => {
    // Spawn a node that forks a long-sleeping child, then the parent exits.
    // systemd-run --wait --collect stops the service (and its cgroup) when the
    // MAIN process exits; the lingering child must be killed by the cgroup.
    const r = runInCgroup(
      { cgroup_pid_max: 64, cgroup_memory_bytes: 1024 * 1024 * 1024, cgroup_cpu_weight: 100 },
      [
        process.execPath,
        "-e",
        `const{spawn}=require('child_process');spawn(process.execPath,['-e','setTimeout(()=>{},30000)'],{detached:true,stdio:'ignore'});process.exit(0)`,
      ],
      { timeoutMs: 15000 },
    );
    assert.equal(r.status, 0, "main exited 0");
    // If the child had survived, --wait would not have returned within timeout.
    assert.ok(r.status === 0, "service drained (no surviving descendants)");
  });
});

// Small realpath helper (bwrap / pi paths may be symlinks).
function realpath(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}
