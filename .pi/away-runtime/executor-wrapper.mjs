#!/usr/bin/env node
// executor-wrapper.mjs — the pinned `process.execPath` target (A2).
//
// Fabric 0.23.0 spawns its node-process guest with:
//   spawn(process.execPath,
//     ['--max-old-space-size=<mb>', '--input-type=module', '--eval', NODE_PROCESS_CHILD_SOURCE],
//     { stdio: ['ignore','ignore','ignore','ipc'] })
// The C1 launcher reassigns `process.execPath` to this wrapper before Fabric
// boots (host-owned; the model cannot influence it). Because this file is the
// SCRIPT node runs (via its shebang), Fabric's argv becomes process.argv.slice(2)
// and node never evals the child-source. This wrapper:
//   1. validates the EXACT Fabric argv shape and the child-source SHA-256
//      (anti-tamper; version-coupled to pi-fabric 0.23.0, locked at B1/ADR-014);
//   2. launches the verbatim child-source inside strict bubblewrap (user/PID/
//      IPC/UTS/net namespaces via `--unshare-user` strict — never the fail-open
//      `--unshare-user-try`) with minimal binding (node binary + ldd-resolved
//      libs + ld-linux + inner-guest.mjs only; no project rootfs, no creds);
//   3. bridges Fabric's node-ipc transport to the sandbox's stdin/stdout
//      JSON-line transport (inner-guest.mjs re-binds the verbatim child-source);
//   4. filters every host-call by effective ref (Fabric's `__resolvedCallRef`:
//      fabric.$call -> args.ref) against the lane's allowlisted host_call_refs;
//   5. enforces frame discipline (malformed/oversized/duplicate-id/forged-result/
//      post-result calls/unknown frames terminate; unknown refs are rejected
//      in-guest without forwarding);
//   6. fsyncs a terminal attestation file BEFORE forwarding the result to Fabric.
//
// Pure helpers are exported for unit tests. The bridge runs only when this
// process was spawned as a Fabric child (an ipc channel is present).

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { createInterface } from "node:readline";

// Pinned SHA-256 of the verbatim Fabric 0.23.0 node-process child-source VALUE
// (NODE_PROCESS_CHILD_SOURCE — the string Fabric passes via `--eval`, NOT the
// .js source file). The drift-guard test imports this same value and compares;
// a concurrent pi-fabric reinstall changes it, surfacing a re-pin (B1/ADR-014
// freezes the version).
export const PINNED_CHILD_SOURCE_DIGEST =
  "ee0bb190d5af47ff6ee99a0dd5874889b44b0857db23b897b4c57c88956793fb";

const MAX_FRAME_BYTES = 4 * 1024 * 1024; // 4 MiB max per JSON-line frame

// ---- pure helpers (exported for unit tests) --------------------------------

// Fabric's __resolvedCallRef: a fabric.$call frame carries the effective tool ref
// in args.ref; every other ref is the effective ref itself. The wrapper must use
// the SAME resolution the Fabric host uses (execution-service.js: case
// "fabric.$call" -> invokeAction(String(args.ref), args.args)).
export function resolveEffectiveRef(ref, args) {
  if (ref === "fabric.$call" && args && typeof args.ref === "string") return args.ref;
  return String(ref);
}

// Validates the exact Fabric spawn argv shape.
export function validateFabricArgv(argv) {
  if (!Array.isArray(argv) || argv.length !== 4) {
    return {
      ok: false,
      reason: `argv length (${Array.isArray(argv) ? argv.length : "non-array"})`,
    };
  }
  const m = String(argv[0]).match(/^--max-old-space-size=(\d+)$/);
  if (!m) return { ok: false, reason: "heap-flag" };
  if (argv[1] !== "--input-type=module") return { ok: false, reason: "input-type" };
  if (argv[2] !== "--eval") return { ok: false, reason: "eval-flag" };
  if (typeof argv[3] !== "string" || argv[3].length === 0) {
    return { ok: false, reason: "child-source" };
  }
  return { ok: true, heapMb: Number(m[1]) };
}

export function validateChildSourceDigest(childSource, pinned = PINNED_CHILD_SOURCE_DIGEST) {
  if (typeof childSource !== "string" || childSource.length === 0) return false;
  return createHash("sha256").update(childSource).digest("hex") === pinned;
}

export function loadLaneProfile(manifestPath, laneId) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const lane = manifest && manifest.lanes && manifest.lanes[laneId];
  if (!lane) throw new Error(`away-sandbox: unknown lane: ${laneId}`);
  return { manifest, lane, allowlist: new Set(lane.host_call_refs || []) };
}

// Resolve the shared libraries the node binary needs, so the sandbox can bind
// only those (plus ld-linux) instead of the whole rootfs. `linux-vdso` and
// entries without a resolved path are skipped.
export function lddResolve(nodeBinary) {
  const out = spawnSync("ldd", [nodeBinary], { encoding: "utf8" });
  if (out.status !== 0 || !out.stdout) throw new Error(`ldd failed for ${nodeBinary}`);
  const libs = new Set();
  for (const raw of out.stdout.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    // "libX => /path/to/libX (0xaddr)"
    const arrow = line.match(/\S+\s+=>\s+(\S+)\s+\(/);
    if (arrow && arrow[1] && arrow[1] !== "(0x0)") libs.add(arrow[1]);
    else if (line.startsWith("/") && line.includes("ld-linux")) {
      // "/lib64/ld-linux-x86-64.so.2 (0xaddr)" — the dynamic linker itself
      const p = line.split(/\s+/)[0];
      if (p) libs.add(p);
    }
  }
  return [...libs];
}

// Build the strict bubblewrap argv. Binds ONLY: the node binary, its ldd-resolved
// libs, ld-linux, and the inner-guest transport shim. No project rootfs, no creds,
// no /etc, no /home, no repo. A cleared minimal env (no PI_AWAY_*, no PI_FABRIC_*,
// no credentials) is set for the sandbox.
export function buildBwrapArgs({ realNode, libs, innerGuestPath, network, guestArgs }) {
  if (!Array.isArray(guestArgs) || guestArgs.length === 0) {
    throw new Error("buildBwrapArgs: guestArgs required");
  }
  const args = [
    "--unshare-user",
    "--unshare-pid",
    "--unshare-ipc",
    "--unshare-uts",
    network ? "--share-net" : "--unshare-net",
    "--die-with-parent",
    "--ro-bind",
    realNode,
    realNode,
  ];
  for (const lib of libs) args.push("--ro-bind", lib, lib);
  args.push("--ro-bind", innerGuestPath, "/guest.mjs");
  args.push("--tmpfs", "/tmp", "--proc", "/proc", "--dev", "/dev");
  // Cleared minimal env: no credentials, no PI_AWAY_* control vars, no PI_FABRIC_*.
  args.push("--clearenv", "--setenv", "PATH", "/usr/bin", "--setenv", "LANG", "C.UTF-8");
  args.push("--", realNode, ...guestArgs);
  return args;
}

export function writeAttestation(dir, info) {
  if (!dir) return null;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(
      dir,
      `attest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.json`,
    );
    const fd = fs.openSync(file, "w");
    fs.writeSync(fd, JSON.stringify(info));
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    return file;
  } catch {
    return null;
  }
}

// ---- bridge (runs only when spawned as a Fabric child) ----------------------

function writeLine(stream, obj) {
  try {
    stream.write(JSON.stringify(obj) + "\n");
  } catch {
    /* bridge closed */
  }
}

function sendToFabric(msg) {
  try {
    process.send(msg);
    return true;
  } catch {
    return false;
  }
}

function failWrapper(reason) {
  sendToFabric({
    type: "result",
    result: { terminationReason: "runtime_error", error: `executor-wrapper: ${reason}` },
  });
  // Ref'd timer: keep the process alive so the ipc message flushes, then exit
  // non-zero. An unref'd timer would let the process exit 0 before firing once
  // the ipc channel is gone, masking the rejection as a clean exit.
  setTimeout(() => process.exit(1), 50);
}

async function main() {
  const manifestPath = process.env.PI_AWAY_MANIFEST;
  const laneId = process.env.PI_AWAY_LANE;
  const attestDir = process.env.PI_AWAY_ATTEST_DIR;
  const innerGuestPath =
    process.env.PI_AWAY_INNER_GUEST ||
    path.join(path.dirname(process.argv[1] || import.meta.filename), "inner-guest.mjs");
  if (!manifestPath || !laneId) {
    failWrapper("missing PI_AWAY_MANIFEST or PI_AWAY_LANE");
    return;
  }

  const argv = process.argv.slice(2);
  const validation = validateFabricArgv(argv);
  if (!validation.ok) {
    failWrapper(`invalid Fabric argv: ${validation.reason}`);
    return;
  }

  const childSource = argv[3];
  if (!validateChildSourceDigest(childSource)) {
    failWrapper("child-source digest mismatch (pi-fabric version drift)");
    return;
  }

  const { manifest, lane, allowlist } = loadLaneProfile(manifestPath, laneId);
  const realNode = process.execPath; // inside this wrapper = the real node binary
  let libs;
  try {
    libs = lddResolve(realNode);
  } catch (e) {
    failWrapper(`ldd resolve failed: ${e.message}`);
    return;
  }

  const bwrapPath =
    (manifest.pinned_versions && manifest.pinned_versions.bwrap_path) || "/usr/bin/bwrap";
  const guestArgs = ["--input-type=module", "--import", "/guest.mjs", "--eval", childSource];
  const bwrapArgs = buildBwrapArgs({
    realNode,
    libs,
    innerGuestPath,
    network: !!lane.network,
    guestArgs,
  });

  const child = spawn(bwrapPath, bwrapArgs, { stdio: ["pipe", "pipe", "ignore"] });
  let settled = false;
  let resultSeen = false;
  const seenIds = new Set();
  const forwardedRefs = [];
  const deniedRefs = [];
  let attestationPath = null;

  // Fabric -> guest: forward execute/response frames verbatim.
  process.on("message", (msg) => {
    if (settled || !msg || typeof msg !== "object") return;
    if (msg.type === "execute" || msg.type === "response") writeLine(child.stdin, msg);
  });

  // guest -> Fabric: filter + discipline frames read from bwrap stdout.
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  rl.on("line", (line) => {
    if (settled) return;
    if (Buffer.byteLength(line, "utf8") > MAX_FRAME_BYTES) {
      terminate("oversized frame");
      return;
    }
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      terminate("malformed frame");
      return;
    }
    if (msg && msg.type === "call") handleCall(msg);
    else if (msg && msg.type === "result") handleResult(msg);
    else terminate("unknown frame type");
  });

  child.on("error", () => {
    if (!settled) terminate("bwrap spawn error");
  });
  child.on("exit", () => {
    if (!settled && !resultSeen)
      finish({ terminationReason: "runtime_error", error: "sandbox exited before result" });
  });
  process.on("disconnect", () => {
    try {
      child.kill("SIGKILL");
    } catch {}
  });
  process.on("SIGTERM", () => {
    try {
      child.kill("SIGKILL");
    } catch {}
    process.exit(0);
  });
  process.on("SIGINT", () => {
    try {
      child.kill("SIGKILL");
    } catch {}
    process.exit(0);
  });

  function handleCall(msg) {
    if (resultSeen) {
      terminate("call after terminal result");
      return;
    }
    if (typeof msg.id !== "number" || !Number.isInteger(msg.id)) {
      terminate("non-integer call id");
      return;
    }
    if (seenIds.has(msg.id)) {
      terminate("duplicate call id");
      return;
    }
    seenIds.add(msg.id);
    const effective = resolveEffectiveRef(msg.ref, msg.args);
    if (!allowlist.has(effective)) {
      deniedRefs.push(effective);
      // Reject in-guest: do NOT forward to Fabric. The guest's pending call rejects.
      writeLine(child.stdin, {
        type: "response",
        id: msg.id,
        ok: false,
        error: `away-sandbox: denied ref '${effective}' not in lane '${laneId}' allowlist`,
      });
      return;
    }
    forwardedRefs.push(effective);
    sendToFabric({ type: "call", id: msg.id, ref: msg.ref, args: msg.args });
  }

  function handleResult(msg) {
    if (resultSeen) {
      terminate("forged or duplicate result frame");
      return;
    }
    resultSeen = true;
    attestationPath = writeAttestation(attestDir, {
      lane: laneId,
      terminationReason: msg.result && msg.result.terminationReason,
      forwardedRefs,
      deniedRefs,
      fsynced: true,
    });
    sendToFabric({ type: "result", result: msg.result });
    finish(null);
  }

  function terminate(reason) {
    if (settled) return;
    try {
      child.kill("SIGKILL");
    } catch {}
    if (!resultSeen)
      finish({ terminationReason: "runtime_error", error: `executor-wrapper: ${reason}` });
    else finish(null);
  }

  function finish(result) {
    if (settled) return;
    settled = true;
    try {
      rl.close();
    } catch {}
    try {
      child.stdin.end();
    } catch {}
    try {
      child.kill("SIGKILL");
    } catch {}
    if (result && !resultSeen) {
      // No legitimate result was forwarded; emit a terminal error to Fabric.
      resultSeen = true;
      if (!attestationPath) {
        attestationPath = writeAttestation(attestDir, {
          lane: laneId,
          terminationReason: result.terminationReason,
          forwardedRefs,
          deniedRefs,
          error: result.error,
          fsynced: true,
        });
      }
      sendToFabric({ type: "result", result });
    }
    try {
      process.disconnect();
    } catch {}
    setTimeout(() => process.exit(0), 50).unref();
  }
}

// Run the bridge only when spawned as a Fabric child (ipc channel present).
// When imported as a module (e.g. by the test for its pure helpers), the
// top-level guards short-circuit and only the exports are used.
if (typeof process.send === "function") {
  main().catch((e) => failWrapper(`main: ${e && e.message ? e.message : String(e)}`));
}
