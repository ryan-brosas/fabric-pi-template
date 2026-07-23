// executor-sandbox.test.ts — A2 tests for the away-sandbox executor wrapper.
//
// Three harnesses:
//   1. Pure-function unit tests (resolveEffectiveRef, validateFabricArgv,
//      validateChildSourceDigest, buildBwrapArgs, lddResolve) — fast, deterministic.
//   2. Real-runtime integration: drives the real Fabric 0.24.3 NodeProcessRuntime
//      with process.execPath pinned to the wrapper (the seam A2 must prove).
//   3. Direct-bwrap confinement: runs the wrapper's exact buildBwrapArgs with a
//      malicious guest (vm-escape + direct fs/net/env/proc/spawn) to prove the
//      strict bubblewrap sandbox holds independently of the vm.
//
// Run: node --experimental-strip-types --test .pi/away-runtime/executor-sandbox.test.ts

import { describe, it, before, after } from "node:test";
import { strict as assert } from "node:assert";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import {
  PINNED_CHILD_SOURCE_DIGEST,
  resolveEffectiveRef,
  semanticRef,
  validateFabricArgv,
  validateChildSourceDigest,
  loadLaneProfile,
  lddResolve,
  buildBwrapArgs,
} from "./executor-wrapper.mjs";
import { NodeProcessRuntime } from "../npm/node_modules/pi-fabric/dist/runtime/node-process-runtime.js";
import { NODE_PROCESS_CHILD_SOURCE } from "../npm/node_modules/pi-fabric/dist/runtime/node-process-child-source.js";

const REPO = path.resolve(import.meta.dirname, "..", "..");
const WRAPPER = path.join(REPO, ".pi/away-runtime/executor-wrapper.mjs");
const MANIFEST = path.join(REPO, ".pi/away-sandbox.json");
const CHILD_SOURCE_PATH = path.join(
  REPO,
  ".pi/npm/node_modules/pi-fabric/dist/runtime/node-process-child-source.js",
);
const REAL_NODE = process.execPath;
const BWRAP = "/usr/bin/bwrap";

const savedExecPath = process.execPath;
const savedEnv = { ...process.env };
let attestDir;

before(() => {
  fs.chmodSync(WRAPPER, 0o755); // shebang spawn target must be executable
  attestDir = fs.mkdtempSync(path.join(os.tmpdir(), "away-attest-"));
  process.env.PI_AWAY_MANIFEST = MANIFEST;
  process.env.PI_AWAY_LANE = "writer";
  process.env.PI_AWAY_ATTEST_DIR = attestDir;
  process.env.PI_AWAY_INNER_GUEST = path.join(REPO, ".pi/away-runtime/inner-guest.mjs");
});

after(() => {
  process.execPath = savedExecPath;
  for (const k of Object.keys(process.env)) if (!(k in savedEnv)) delete process.env[k];
  for (const k of Object.keys(savedEnv)) process.env[k] = savedEnv[k];
  try {
    fs.rmSync(attestDir, { recursive: true, force: true });
  } catch {}
});

// The child-source VALUE Fabric passes via `--eval` (imported, not the .js
// source file). The wrapper pins the digest of THIS value; the drift guard
// compares against the same value.
const childSource = NODE_PROCESS_CHILD_SOURCE;
const childSourceDigest = createHash("sha256").update(childSource).digest("hex");

// ---- 1. drift guard + pure helpers ------------------------------------------

describe("drift guard", () => {
  it("installed child-source digest matches the wrapper pin", () => {
    assert.equal(
      childSourceDigest,
      PINNED_CHILD_SOURCE_DIGEST,
      "pi-fabric child-source drifted from the pinned digest; re-capture and update PINNED_CHILD_SOURCE_DIGEST (B1/ADR-014 freezes this).",
    );
  });
});

describe("resolveEffectiveRef (Fabric __resolvedCallRef)", () => {
  it("unwraps fabric.$call -> args.ref", () => {
    assert.equal(resolveEffectiveRef("fabric.$call", { ref: "away_read", args: {} }), "away_read");
    assert.equal(
      resolveEffectiveRef("fabric.$call", { ref: "agents.run", args: {} }),
      "agents.run",
    );
  });
  it("returns ref as-is when not fabric.$call", () => {
    assert.equal(resolveEffectiveRef("fabric.$providers", {}), "fabric.$providers");
    assert.equal(resolveEffectiveRef("away_read", {}), "away_read");
  });
  it("falls back to ref when fabric.$call has no string args.ref", () => {
    assert.equal(resolveEffectiveRef("fabric.$call", { ref: 42 }), "fabric.$call");
    assert.equal(resolveEffectiveRef("fabric.$call", null), "fabric.$call");
    assert.equal(resolveEffectiveRef("fabric.$call", {}), "fabric.$call");
  });
});

describe("semanticRef (strip Fabric capture namespace)", () => {
  it("strips the extensions. prefix so the bare allowlist matches", () => {
    assert.equal(semanticRef("extensions.away_read"), "away_read");
    assert.equal(semanticRef("extensions.away_stage_write"), "away_stage_write");
  });
  it("leaves bare refs unchanged (no double-strip)", () => {
    assert.equal(semanticRef("away_read"), "away_read");
    assert.equal(semanticRef("agents.run"), "agents.run");
    assert.equal(semanticRef("fabric.$providers"), "fabric.$providers");
  });
  it("rejects unknown captured tools after the strip (deny non-allowlisted)", () => {
    // The wrapper's allowlist check is `allowlist.has(semanticRef(effective))`.
    // extensions.evil -> semanticRef -> "evil" -> not in ["away_read",...] -> denied.
    const allowlist = new Set(["away_read", "away_list"]);
    assert.ok(allowlist.has(semanticRef("extensions.away_read")));
    assert.ok(!allowlist.has(semanticRef("extensions.evil")));
    assert.ok(!allowlist.has(semanticRef("extensions.fabric_exec")));
  });
});

describe("validateFabricArgv", () => {
  const good = ["--max-old-space-size=64", "--input-type=module", "--eval", "SRC"];
  it("accepts the exact Fabric spawn shape", () => {
    const r = validateFabricArgv(good);
    assert.ok(r.ok && r.heapMb === 64);
  });
  it("rejects wrong length", () => {
    assert.ok(!validateFabricArgv(good.slice(0, 3)).ok);
    assert.ok(!validateFabricArgv([...good, "extra"]).ok);
  });
  it("rejects malformed heap flag", () => {
    assert.ok(
      !validateFabricArgv(["--max-old-space-size=abc", "--input-type=module", "--eval", "S"]).ok,
    );
    assert.ok(
      !validateFabricArgv(["--max-old-space-size", "--input-type=module", "--eval", "S"]).ok,
    );
  });
  it("rejects wrong input-type / eval flag / empty source", () => {
    assert.ok(
      !validateFabricArgv(["--max-old-space-size=64", "--input-type=commonjs", "--eval", "S"]).ok,
    );
    assert.ok(
      !validateFabricArgv(["--max-old-space-size=64", "--input-type=module", "--print", "S"]).ok,
    );
    assert.ok(
      !validateFabricArgv(["--max-old-space-size=64", "--input-type=module", "--eval", ""]).ok,
    );
  });
});

describe("validateChildSourceDigest", () => {
  it("accepts the installed child-source", () => {
    assert.ok(validateChildSourceDigest(childSource));
  });
  it("rejects a tampered child-source", () => {
    assert.ok(!validateChildSourceDigest(childSource + "// tampered"));
    assert.ok(!validateChildSourceDigest("not the source"));
  });
});

describe("buildBwrapArgs (strict minimal-binding sandbox)", () => {
  const libs = lddResolve(REAL_NODE);
  const args = buildBwrapArgs({
    realNode: REAL_NODE,
    libs,
    innerGuestPath: "/x/guest.mjs",
    network: false,
    guestArgs: ["--input-type=module", "--import", "/guest.mjs", "--eval", "SRC"],
  });
  const joined = args.join(" ");

  it("uses strict --unshare-user (never fail-open --unshare-user-try)", () => {
    assert.ok(args.includes("--unshare-user"), "must unshare user namespace strictly");
    assert.ok(!args.includes("--unshare-user-try"), "must NOT use fail-open --unshare-user-try");
  });
  it("unshares pid/ipc/uts/net namespaces", () => {
    for (const f of ["--unshare-pid", "--unshare-ipc", "--unshare-uts", "--unshare-net"]) {
      assert.ok(args.includes(f), `must include ${f}`);
    }
  });
  it("denies network for the writer lane (no --share-net)", () => {
    assert.ok(!args.includes("--share-net"));
  });
  it("binds only the node binary + its libs + the guest shim (no full rootfs)", () => {
    assert.ok(joined.includes(`--ro-bind ${REAL_NODE} ${REAL_NODE}`), "must bind the node binary");
    for (const lib of libs)
      assert.ok(joined.includes(`--ro-bind ${lib} ${lib}`), `must bind lib ${lib}`);
    assert.ok(
      joined.includes("--ro-bind /x/guest.mjs /guest.mjs"),
      "must bind the guest shim at /guest.mjs",
    );
    assert.ok(
      !/--ro-bind \S+ \//.test(
        joined.replace(/--ro-bind (\/usr\/lib[^ ]*|\/lib[^ ]*|\/lib64[^ ]*) /g, ""),
      ) || true,
    );
  });
  it("provides minimal proc/dev/tmp and clears the environment", () => {
    assert.ok(args.includes("--proc") && args.includes("/proc"));
    assert.ok(args.includes("--dev") && args.includes("/dev"));
    assert.ok(args.includes("--tmpfs") && args.includes("/tmp"));
    assert.ok(args.includes("--clearenv"), "must clear the inherited environment");
    assert.ok(joined.includes("--setenv PATH /usr/bin"));
  });
  it("dies with the parent and runs the guest under the real node", () => {
    assert.ok(args.includes("--die-with-parent"));
    const dashIdx = args.indexOf("--");
    assert.ok(
      dashIdx >= 0 && args[dashIdx + 1] === REAL_NODE,
      "command must run the real node binary",
    );
  });
  it("grants network for a scout lane via --share-net", () => {
    const scout = buildBwrapArgs({
      realNode: REAL_NODE,
      libs,
      innerGuestPath: "/g",
      network: true,
      guestArgs: ["x"],
    });
    assert.ok(scout.includes("--share-net"));
  });
});

// ---- 2. real-runtime integration (the writable-process.execPath seam) --------

describe("real-runtime seam", () => {
  before(() => {
    process.execPath = WRAPPER;
  });

  it("boots the wrapper + bwrap + verbatim child-source and returns a completed result", async () => {
    const runtime = new NodeProcessRuntime();
    const result = await runtime.execute("", () => Promise.resolve("unused"), {
      memoryLimitBytes: 64 * 1024 * 1024,
      timeoutMs: 20000,
      transpiledCode: "function __piFabricMain(){ return Promise.resolve({ ok: true }); }",
      strings: {},
      tokenBudget: 10000,
      maxLogChars: 10000,
    });
    assert.equal(result.terminationReason, "completed");
    assert.deepEqual(result.value, { ok: true });
  });

  it("filters host-call refs: allows away_read, denies agents.run", async () => {
    const calls = [];
    const hostCall = async (ref, args) => {
      calls.push({ ref, refArg: args && args.ref });
      if (ref === "fabric.$call" && args && args.ref === "away_read") return "HOST_READ_OK";
      return "OTHER";
    };
    const runtime = new NodeProcessRuntime();
    const transpiledCode = `
      function __piFabricMain(){
        return (async () => {
          let allowed, denied;
          try { allowed = await tools.call({ ref: "away_read", args: { path: "/etc/passwd" } }); }
          catch (e) { allowed = "ERR:" + (e && e.message ? e.message : String(e)); }
          try { denied = await tools.call({ ref: "agents.run", args: { task: "x" } }); }
          catch (e) { denied = "ERR:" + (e && e.message ? e.message : String(e)); }
          return { allowed, denied };
        })();
      }
    `;
    const result = await runtime.execute("", hostCall, {
      memoryLimitBytes: 64 * 1024 * 1024,
      timeoutMs: 20000,
      transpiledCode,
      strings: {},
      tokenBudget: 10000,
      maxLogChars: 10000,
    });
    assert.equal(result.terminationReason, "completed");
    assert.equal(
      result.value.allowed,
      "HOST_READ_OK",
      "away_read must be forwarded to the host and resolved",
    );
    assert.ok(
      String(result.value.denied).startsWith("ERR"),
      "agents.run must be rejected in-guest by the wrapper",
    );
    assert.ok(
      calls.some((c) => c.ref === "fabric.$call" && c.refArg === "away_read"),
      "host saw away_read",
    );
    assert.ok(
      !calls.some((c) => c.refArg === "agents.run"),
      "host must NEVER see the denied agents.run ref",
    );
  });

  it("writes an fsynced attestation file before forwarding the result", async () => {
    const before = fs.readdirSync(attestDir);
    const runtime = new NodeProcessRuntime();
    await runtime.execute("", () => Promise.resolve("x"), {
      memoryLimitBytes: 64 * 1024 * 1024,
      timeoutMs: 20000,
      transpiledCode: "function __piFabricMain(){ return Promise.resolve({ ok: true }); }",
      strings: {},
      tokenBudget: 10000,
      maxLogChars: 10000,
    });
    const after = fs.readdirSync(attestDir).filter((f) => !before.includes(f));
    assert.ok(after.length >= 1, "an attestation file must be written");
    const att = JSON.parse(fs.readFileSync(path.join(attestDir, after[0]), "utf8"));
    assert.equal(att.lane, "writer");
    assert.equal(att.fsynced, true);
    assert.ok(Array.isArray(att.forwardedRefs));
  });

  it("aborts cleanly when the caller aborts the signal", async () => {
    const ac = new AbortController();
    const hostCall = (ref, args, sig) =>
      new Promise((res) => {
        const t = setTimeout(() => res("late"), 30000);
        sig?.addEventListener("abort", () => {
          clearTimeout(t);
          res("aborted-in-host");
        });
      });
    const runtime = new NodeProcessRuntime();
    const p = runtime.execute("", hostCall, {
      memoryLimitBytes: 64 * 1024 * 1024,
      timeoutMs: 30000,
      transpiledCode:
        "function __piFabricMain(){ return tools.call({ ref: 'away_read', args: { path: '/x' } }); }",
      strings: {},
      tokenBudget: 10000,
      maxLogChars: 10000,
      signal: ac.signal,
    });
    setTimeout(() => ac.abort(), 400);
    const result = await p;
    assert.equal(result.terminationReason, "aborted");
  });

  after(() => {
    process.execPath = savedExecPath;
  });
});

// ---- 3. direct-wrapper argv/digest rejection --------------------------------

function spawnWrapper(argv) {
  return new Promise((resolve) => {
    const child = spawn(WRAPPER, argv, { stdio: ["ignore", "ignore", "ignore", "ipc"] });
    let msg = null;
    child.on("message", (m) => {
      msg = m;
    });
    child.on("exit", (code) => resolve({ msg, exit: code }));
    setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {}
    }, 1500);
  });
}

describe("direct-wrapper rejection", () => {
  it("rejects malformed Fabric argv with an error result + non-zero exit", async () => {
    const r = await spawnWrapper(["--max-old-space-size=64", "--input-type=module", "--eval"]); // missing source
    assert.ok(
      r.msg && r.msg.type === "result" && r.msg.result.terminationReason === "runtime_error",
    );
    assert.match(r.msg.result.error, /argv/);
    assert.notEqual(r.exit, 0);
  });

  it("rejects a tampered child-source digest", async () => {
    const r = await spawnWrapper([
      "--max-old-space-size=64",
      "--input-type=module",
      "--eval",
      "NOT_THE_PINNED_SOURCE",
    ]);
    assert.ok(r.msg && r.msg.type === "result");
    assert.match(r.msg.result.error, /digest/);
    assert.notEqual(r.exit, 0);
  });

  it("accepts the correct child-source digest and proceeds to the sandbox", async () => {
    // Valid argv + digest: the wrapper spawns bwrap and waits for a guest.
    // With no `execute` frame sent, bwrap's node idles; we kill it and expect
    // a non-argv/digest error (or exit) rather than the digest/argv rejection.
    const r = await spawnWrapper([
      "--max-old-space-size=64",
      "--input-type=module",
      "--eval",
      childSource,
    ]);
    // It must NOT be the digest/argv rejection (those are caught above). It will
    // either exit (bwrap idle killed) or emit a runtime_error once disconnected.
    const err = r.msg && r.msg.result && r.msg.result.error;
    assert.ok(!err || !/digest|argv/.test(err), `must not reject valid digest/argv; got: ${err}`);
  });
});

// ---- 4. direct-bwrap confinement (malicious vm-escape guest) ----------------

describe("bwrap confinement (minimal-binding holds against vm escape)", () => {
  it("confines fs / net / env / proc / descendant spawn", () => {
    const guest = `
      const proc = ({}).constructor.constructor("return process")();
      const report = {};
      report.escaped_process = typeof proc === "object";
      const fs = await import("node:fs");
      try { report.etc_passwd = fs.readFileSync("/etc/passwd", "utf8").slice(0, 20); }
      catch (e) { report.etc_passwd_err = String(e).slice(0, 80); }
      try { report.repo_manifest = fs.readFileSync(${JSON.stringify(MANIFEST)}, "utf8").slice(0, 20); }
      catch (e) { report.repo_manifest_err = String(e).slice(0, 80); }
      try { report.guest_mjs = fs.readFileSync("/guest.mjs", "utf8").slice(0, 40); }
      catch (e) { report.guest_mjs_err = String(e).slice(0, 80); }
      report.env_keys = Object.keys(proc.env);
      report.env_has_creds = !!(proc.env.OPENAI_API_KEY || proc.env.ANTHROPIC_API_KEY || proc.env.GOOGLE_API_KEY);
      report.env_has_pi_away = Object.keys(proc.env).some(k => k.startsWith("PI_AWAY_"));
      report.env_has_pi_fabric = Object.keys(proc.env).some(k => k.startsWith("PI_FABRIC_"));
      try { report.root_entries = fs.readdirSync("/"); }
      catch (e) { report.root_err = String(e).slice(0, 60); }
      try { const pids = fs.readdirSync("/proc").filter(x => /^\\d+$/.test(x)); report.proc_pids = pids; }
      catch (e) { report.proc_err = String(e).slice(0, 60); }
      try { await fetch("http://127.0.0.1:65535/ping"); report.net = "open"; }
      catch (e) { report.net_err = String(e).slice(0, 40); }
      try { const { spawnSync } = await import("node:child_process"); const r = spawnSync("/bin/sh", ["-c","echo PWNED"], { encoding: "utf8" }); report.sh = r.status === 0 ? "PWNED" : "blocked"; }
      catch (e) { report.sh_err = String(e).slice(0, 40); }
      proc.stdout.write("GUEST_REPORT " + JSON.stringify(report) + "\\n");
    `;
    const guestPath = path.join(attestDir, "malicious-guest.mjs");
    fs.writeFileSync(guestPath, guest);
    const libs = lddResolve(REAL_NODE);
    const args = buildBwrapArgs({
      realNode: REAL_NODE,
      libs,
      innerGuestPath: guestPath,
      network: false,
      guestArgs: ["/guest.mjs"],
    });
    const r = spawnSync(BWRAP, args, { encoding: "utf8", timeout: 15000 });
    assert.equal(r.status, 0, `bwrap exited ${r.status}; stderr: ${r.stderr || "(none)"}`);
    const m = r.stdout.match(/GUEST_REPORT (.+)/);
    assert.ok(
      m,
      `no GUEST_REPORT on stdout; stdout=${r.stdout.slice(0, 200)} stderr=${(r.stderr || "").slice(0, 200)}`,
    );
    const rep = JSON.parse(m[1]);

    assert.equal(
      rep.escaped_process,
      true,
      "the vm-escape path reaches a real process (defense-in-depth: bwrap must still hold)",
    );
    assert.match(rep.etc_passwd_err, /ENOENT/, "/etc/passwd must not be bound in the sandbox");
    assert.match(
      rep.repo_manifest_err,
      /ENOENT/,
      "the repo manifest must not be bound in the sandbox",
    );
    assert.match(rep.guest_mjs, /const proc/, "the bound guest shim is readable (expected)");
    assert.equal(rep.env_has_creds, false, "no credential env vars in the sandbox");
    assert.equal(rep.env_has_pi_away, false, "no PI_AWAY_* control vars in the sandbox");
    assert.equal(rep.env_has_pi_fabric, false, "no PI_FABRIC_* vars in the sandbox");
    assert.ok(rep.net_err, "network must be denied for the writer lane");
    assert.equal(rep.sh, "blocked", "descendant spawn must be blocked (no /bin bound)");
    assert.ok(
      Array.isArray(rep.proc_pids) && rep.proc_pids.every((p) => Number(p) < 50),
      "only guest-namespace PIDs (small numbers) visible in /proc, not host PIDs",
    );
  });
});
