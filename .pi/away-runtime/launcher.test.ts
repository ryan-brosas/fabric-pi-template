// C1 — Dedicated Pi RPC lane launcher.
//
// Tests for rpc.ts (raw-buffer LF-only RPC parser) and launcher.ts (spawns Pi
// from the inert control cwd with the exact A1 argv/env, pins process.execPath
// to the trusted A2 wrapper via a preload, binds one immutable profile to a
// single-use lane process, rejects reload/model-switch/profile-reuse, and
// rechecks the B2 closure before launch + before accepting a result).
//
// Run: node --experimental-strip-types --test .pi/away-runtime/launcher.test.ts

import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test, describe, before, after } from "node:test";

import {
  RpcFramedReader,
  RpcDispatcher,
  parseRpcLine,
  serializeCommand,
  type RpcEvent,
} from "./rpc.ts";
import { launch, type Launcher, type LauncherOptions } from "./launcher.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const MANIFEST_PATH = join(HERE, "..", "away-sandbox.json");
const WRAPPER_PATH = join(HERE, "executor-wrapper.mjs");

// ---------------------------------------------------------------------------
// rpc.ts — raw-buffer LF-only parser (mirrors pi's jsonl.js framing).
// ---------------------------------------------------------------------------

describe("rpc.ts — RpcFramedReader (LF-only framing)", () => {
  test("a single complete record emits one line", () => {
    const r = new RpcFramedReader({ maxRecordBytes: 1024 });
    const out: string[] = [];
    r.on("line", (l) => out.push(l));
    r.push(Buffer.from('{"type":"prompt","id":"req_1"}\n'));
    assert.deepEqual(out, ['{"type":"prompt","id":"req_1"}']);
    assert.equal(r.pendingBytes(), 0);
  });

  test("a record split across multiple chunks emits once complete", () => {
    const r = new RpcFramedReader({ maxRecordBytes: 1024 });
    const out: string[] = [];
    r.on("line", (l) => out.push(l));
    const rec = '{"type":"prompt","id":"req_1","message":"hello world"}';
    // Split mid-record in arbitrary places.
    r.push(Buffer.from(rec.slice(0, 10)));
    assert.equal(out.length, 0);
    r.push(Buffer.from(rec.slice(10, 40)));
    assert.equal(out.length, 0);
    r.push(Buffer.from(rec.slice(40) + "\n"));
    assert.deepEqual(out, [rec]);
  });

  test("trailing CR is stripped (CRLF tolerance); bare CR is NOT a separator", () => {
    const r = new RpcFramedReader({ maxRecordBytes: 1024 });
    const out: string[] = [];
    r.on("line", (l) => out.push(l));
    r.push(Buffer.from('{"a":1}\r\n{"b":2}\n'));
    assert.deepEqual(out, ['{"a":1}', '{"b":2}']);
    // A bare \r inside content stays part of the record (not a separator).
    const r2 = new RpcFramedReader({ maxRecordBytes: 1024 });
    const out2: string[] = [];
    r2.on("line", (l) => out2.push(l));
    r2.push(Buffer.from('{"msg":"line1\rline2"}\n'));
    assert.deepEqual(out2, ['{"msg":"line1\rline2"}']);
  });

  test("U+2028 and U+2029 inside JSON strings are NOT line separators", () => {
    const r = new RpcFramedReader({ maxRecordBytes: 4096 });
    const out: string[] = [];
    r.on("line", (l) => out.push(l));
    // U+2028 = \u2028, U+2029 = \u2029 — embedded inside a string value.
    const rec = '{"msg":"before\u2028mid\u2029after"}';
    r.push(Buffer.from(rec + "\n", "utf8"));
    assert.deepEqual(out, [rec]);
  });

  test("chunked UTF-8 multi-byte chars split across chunks decode correctly", () => {
    const r = new RpcFramedReader({ maxRecordBytes: 4096 });
    const out: string[] = [];
    r.on("line", (l) => out.push(l));
    // A multi-byte char (U+2028 = E2 80 A8) split across the chunk boundary.
    const rec = '{"msg":"x\u2028y"}';
    const bytes = Buffer.from(rec + "\n", "utf8");
    // Find the byte index of the multibyte sequence and split there.
    const seqByte = Buffer.from("\u2028", "utf8"); // 3 bytes
    const idx = bytes.indexOf(seqByte);
    assert.ok(idx > 0);
    r.push(bytes.subarray(0, idx + 1)); // first byte of the multibyte char
    assert.equal(out.length, 0);
    r.push(bytes.subarray(idx + 1)); // rest of the char + the LF
    assert.deepEqual(out, [rec]);
  });

  test("multiple records in one chunk emit each in order", () => {
    const r = new RpcFramedReader({ maxRecordBytes: 1024 });
    const out: string[] = [];
    r.on("line", (l) => out.push(l));
    r.push(Buffer.from('{"a":1}\n{"b":2}\n{"c":3}\n'));
    assert.deepEqual(out, ['{"a":1}', '{"b":2}', '{"c":3}']);
  });

  test("oversized record (>maxRecordBytes) emits an error and clears", () => {
    const r = new RpcFramedReader({ maxRecordBytes: 16 });
    let err: Error | null = null;
    let lines = 0;
    r.on("line", () => lines++);
    r.on("error", (e) => (err = e));
    r.push(Buffer.from("X".repeat(64) + "\n"));
    assert.ok(err, "expected an oversized-record error");
    assert.match(err!.message, /oversized|too large|exceeds/i);
    assert.equal(lines, 0);
  });

  test("end() flushes a trailing unterminated record", () => {
    const r = new RpcFramedReader({ maxRecordBytes: 1024 });
    const out: string[] = [];
    r.on("line", (l) => out.push(l));
    r.push(Buffer.from('{"unterminated":true}'));
    assert.equal(out.length, 0);
    r.end();
    assert.deepEqual(out, ['{"unterminated":true}']);
  });

  test("end() with no pending data is a no-op", () => {
    const r = new RpcFramedReader({ maxRecordBytes: 1024 });
    const out: string[] = [];
    r.on("line", (l) => out.push(l));
    r.push(Buffer.from('{"a":1}\n'));
    r.end();
    assert.deepEqual(out, ['{"a":1}']);
  });
});

describe("rpc.ts — parseRpcLine (record -> object)", () => {
  test("valid JSON object parses to the object", () => {
    const o = parseRpcLine('{"type":"response","id":"req_1","success":true}');
    assert.deepEqual(o, { type: "response", id: "req_1", success: true });
  });

  test("invalid JSON returns null (non-JSON lines are ignored, not fatal)", () => {
    assert.equal(parseRpcLine("not json"), null);
    assert.equal(parseRpcLine(""), null);
  });

  test("a non-object JSON value (array, number) returns null", () => {
    assert.equal(parseRpcLine("[1,2,3]"), null);
    assert.equal(parseRpcLine("42"), null);
    assert.equal(parseRpcLine('"string"'), null);
  });
});

describe("rpc.ts — serializeCommand", () => {
  test("serializes a command object as a single LF-terminated JSON line", () => {
    const buf = serializeCommand({ type: "prompt", id: "req_1", message: "hi" });
    assert.equal(buf.toString("utf8"), '{"type":"prompt","id":"req_1","message":"hi"}\n');
  });
});

describe("rpc.ts — RpcDispatcher (wrong IDs + early process exit)", () => {
  test("a response with a registered id resolves the pending promise", async () => {
    const d = new RpcDispatcher({ maxRecordBytes: 1024 });
    const pending = d.registerPending("req_1");
    d.push(Buffer.from('{"type":"response","id":"req_1","command":"prompt","success":true}\n'));
    const rec = await pending;
    assert.equal(rec.type, "response");
    assert.equal(rec.id, "req_1");
    assert.equal(rec.success, true);
  });

  test("a response with an UNKNOWN id emits wrongId (not fatal)", () => {
    const d = new RpcDispatcher({ maxRecordBytes: 1024 });
    const wrong: string[] = [];
    d.on("wrongId", (rec) => wrong.push(String(rec.id)));
    // No pending registered for "other".
    d.push(Buffer.from('{"type":"response","id":"other","success":true}\n'));
    assert.deepEqual(wrong, ["other"]);
  });

  test("a known-id response resolves while an unknown-id response emits wrongId", async () => {
    const d = new RpcDispatcher({ maxRecordBytes: 1024 });
    const wrong: string[] = [];
    d.on("wrongId", (rec) => wrong.push(String(rec.id)));
    const pending = d.registerPending("req_1");
    // Wrong-id response arrives first — must not resolve req_1, must not crash.
    d.push(Buffer.from('{"type":"response","id":"other","success":true}\n'));
    d.push(Buffer.from('{"type":"response","id":"req_1","command":"prompt","success":true}\n'));
    const rec = await pending;
    assert.equal(rec.id, "req_1");
    assert.deepEqual(wrong, ["other"]);
  });

  test("early process exit (stream end) rejects still-pending commands", async () => {
    const d = new RpcDispatcher({ maxRecordBytes: 1024 });
    const pending = d.registerPending("req_1");
    // Stream closes before a response arrives for req_1.
    d.end();
    await assert.rejects(pending, /early process exit|stream closed/i);
  });

  test("non-response records stream as events", () => {
    const d = new RpcDispatcher({ maxRecordBytes: 1024 });
    const events: string[] = [];
    d.on("event", (ev) => events.push(ev.type));
    d.push(Buffer.from('{"type":"agent_start"}\n{"type":"agent_settled"}\n'));
    assert.deepEqual(events, ["agent_start", "agent_settled"]);
  });

  test("an oversized frame closes the dispatcher and rejects pending", async () => {
    const d = new RpcDispatcher({ maxRecordBytes: 16 });
    const pending = d.registerPending("req_1");
    d.push(Buffer.from("X".repeat(64) + "\n"));
    await assert.rejects(pending, /early process exit|stream closed/i);
  });
});

// ---------------------------------------------------------------------------
// launcher.ts — construction (no spawn): argv/env exactness, execPath pin,
// single-use, reject reuse/switch, closure validation.
// ---------------------------------------------------------------------------

describe("launcher.ts — launch() construction", () => {
  test("launch() builds the exact A1 argv (provider/model/thinking/print/no-session present)", () => {
    const l = launch({ manifestPath: MANIFEST_PATH, profileId: "writer" });
    const argv = l.argv;
    // A1 argv shape: pi_path, --approve ... --tools fabric_exec, -e pi-fabric, -e lane-ext,
    // [-e provider_source], --mode rpc, --provider, --model, --thinking, --print, --no-session.
    assert.equal(argv[0], JSON.parse(readFileSync(MANIFEST_PATH, "utf8")).pinned_versions.pi_path);
    assert.ok(argv.includes("--approve"));
    assert.ok(argv.includes("--no-extensions"));
    assert.ok(argv.includes("--tools"));
    assert.ok(argv.includes("fabric_exec"));
    assert.ok(argv.includes("--mode"));
    assert.ok(argv.includes("rpc"));
    assert.ok(argv.includes("--print"));
    assert.ok(argv.includes("--no-session"));
    // No prompt appended (launcher appends at prompt-time).
    assert.ok(!argv.some((a) => a === "prompt"));
  });

  test("launch() env is allowlisted (no PI_FABRIC_* / PI_TRUST / PI_APPROVE / PI_PROJECT)", () => {
    const l = launch({
      manifestPath: MANIFEST_PATH,
      profileId: "writer",
      processEnv: {
        PATH: "/usr/bin",
        HOME: "/home/ryan",
        PI_FABRIC_GRANTED_RISKS: "write,execute,network,agent",
        PI_TRUST: "1",
        PI_APPROVE: "1",
        PI_PROJECT: "/evil",
        MAKORA_OPTIMIZE_TOKEN: "secret-token",
      },
    });
    const env = l.env;
    assert.ok(env.PATH);
    assert.ok(env.HOME);
    assert.equal(env.PI_FABRIC_GRANTED_RISKS, undefined);
    assert.equal(env.PI_TRUST, undefined);
    assert.equal(env.PI_APPROVE, undefined);
    assert.equal(env.PI_PROJECT, undefined);
  });

  test("launch() pins the real host Node binary into the lane closure context", () => {
    const l = launch({ manifestPath: MANIFEST_PATH, profileId: "writer" });
    assert.equal(l.env.PI_AWAY_NODE_BINARY, process.execPath);
  });

  test("launch() pins process.execPath to the wrapper via NODE_OPTIONS --import preload", () => {
    const l = launch({ manifestPath: MANIFEST_PATH, profileId: "writer" });
    const env = l.env;
    // The preload reassigns process.execPath to the manifest exec_path_override
    // (the wrapper) before pi/Fabric boots.
    const nodeOpts = (env.NODE_OPTIONS ?? "").split(/\s+/).filter(Boolean);
    const importFlag = nodeOpts.find((o) => o.startsWith("--import"));
    assert.ok(importFlag, "NODE_OPTIONS must include --import <preload>");
    // The execPath-target is the manifest's exec_path_override.
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
    const expectedWrapper = resolve(REPO, manifest.exec_path_override);
    // The launcher exposes the resolved execPath pin target for inspection.
    assert.equal(l.execPathPin, expectedWrapper);
  });

  test("launch() control cwd is NOT the repository", () => {
    const l = launch({
      manifestPath: MANIFEST_PATH,
      profileId: "writer",
      controlCwd: mkdtempSync(join(tmpdir(), "c1-control-")),
    });
    assert.notEqual(resolve(l.controlCwd), resolve(REPO));
  });

  test("launch() refuses the repository as control cwd", () => {
    assert.throws(
      () => launch({ manifestPath: MANIFEST_PATH, profileId: "writer", controlCwd: REPO }),
      /control cwd must not be the repository/i,
    );
  });

  test("launch() rejects an unknown profile id before spawning", () => {
    assert.throws(
      () => launch({ manifestPath: MANIFEST_PATH, profileId: "no-such-lane" }),
      /unknown lane/i,
    );
  });

  test("launch() computes a closure hash (B2 resolveClosure)", () => {
    const l = launch({ manifestPath: MANIFEST_PATH, profileId: "writer" });
    assert.ok(typeof l.closureHash === "string" && l.closureHash.length === 64);
  });

  test("launch() rejects when the closure is missing required inputs (requireAll)", () => {
    // Point at a manifest whose exec_path_override doesn't exist.
    const tmp = mkdtempSync(join(tmpdir(), "c1-bad-"));
    try {
      const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
      manifest.exec_path_override = "/nonexistent/wrapper.mjs";
      const badManifest = join(tmp, "away-sandbox.json");
      writeFileSync(badManifest, JSON.stringify(manifest));
      assert.throws(
        () => launch({ manifestPath: badManifest, profileId: "writer" }),
        /closure|missing/i,
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("launcher.ts — single-use + reject reuse / model-switch / reload", () => {
  test("a Launcher is single-use: a second launch() with the same process is rejected", () => {
    const l = launch({ manifestPath: MANIFEST_PATH, profileId: "writer" });
    l.markUsed();
    assert.throws(() => l.assertUnused(), /single-use|already used|reuse/i);
  });

  test("set_model / cycle_model commands are rejected by the command gate", () => {
    const l = launch({ manifestPath: MANIFEST_PATH, profileId: "writer" });
    assert.throws(
      () => l.send({ type: "set_model", id: "x", model: "other" }),
      /model.switch|model.*reject|forbidden|immutable/i,
    );
    assert.throws(
      () => l.send({ type: "cycle_model", id: "x" }),
      /model.switch|model.*reject|forbidden|immutable/i,
    );
  });

  test("switch_session / new_session / reload commands are rejected", () => {
    const l = launch({ manifestPath: MANIFEST_PATH, profileId: "writer" });
    assert.throws(
      () => l.send({ type: "switch_session", id: "x" }),
      /session|reload|forbidden|immutable/i,
    );
    assert.throws(
      () => l.send({ type: "new_session", id: "x" }),
      /session|reload|forbidden|immutable/i,
    );
  });

  test("the prompt command is accepted (the allowed settlement command)", () => {
    // We don't actually spawn here; we only check the command gate allows prompt.
    const l = launch({ manifestPath: MANIFEST_PATH, profileId: "writer" });
    // prompt must NOT throw at the command-gate (it's the one allowed command).
    // (We do not send over a real pipe; just assert the gate passes.)
    assert.doesNotThrow(() =>
      l.assertCommandAllowed({ type: "prompt", id: "req_1", message: "x" }),
    );
  });

  test("abort is allowed (cancellation is safe)", () => {
    const l = launch({ manifestPath: MANIFEST_PATH, profileId: "writer" });
    assert.doesNotThrow(() => l.assertCommandAllowed({ type: "abort", id: "req_1" }));
  });

  test("bash command is rejected (no shell egress from the lane)", () => {
    const l = launch({ manifestPath: MANIFEST_PATH, profileId: "writer" });
    assert.throws(
      () => l.send({ type: "bash", id: "x", command: "ls" }),
      /bash|forbidden|immutable|shell/i,
    );
  });
});

// ---------------------------------------------------------------------------
// Real prompt/event settlement with a deterministic fake provider.
// Spawns real pi in an inert control cwd with a -e fake-provider fixture,
// sends a prompt over rpc.ts, collects events until agent_settled, and
// asserts the deterministic "A3_OK" reply arrived.
// ---------------------------------------------------------------------------

// Build a fake-provider -e extension fixture that yields a fixed reply.
function writeFakeProviderFixture(dir: string): string {
  const fixture = join(dir, "faux-provider.mjs");
  // An inline EventStream shape (mirrors pi-ai/utils/event-stream.js): push/end
  // + async iterator + result(). streamSimple returns a stream that yields
  // start -> text_start -> text_delta("A3_OK") -> text_end -> done with a fixed
  // assistant message.
  writeFileSync(
    fixture,
    `// Deterministic fake provider for C1 launcher tests.
class FakeStream {
  constructor() {
    this.queue = [];
    this.waiters = [];
    this.done = false;
    this._final = new Promise((res) => { this._resolveFinal = res; });
  }
  push(ev) {
    if (this.done) return;
    const w = this.waiters.shift();
    if (w) w({ value: ev, done: false });
    else this.queue.push(ev);
    if (ev.type === "done" || ev.type === "error") {
      this.done = true;
      this._resolveFinal(ev.type === "done" ? ev.message : ev.error);
      for (const w of this.waiters) w({ done: true });
      this.waiters = [];
    }
  }
  end(result) {
    this.done = true;
    this._resolveFinal(result);
    for (const w of this.waiters) w({ done: true });
    this.waiters = [];
  }
  result() { return this._final; }
  [Symbol.asyncIterator]() {
    return {
      next: () => {
        if (this.queue.length) return Promise.resolve({ value: this.queue.shift(), done: false });
        if (this.done) return Promise.resolve({ done: true });
        return new Promise((res) => this.waiters.push(res));
      },
    };
  }
}

export default function (pi) {
  const FIXED_TEXT = "A3_OK";
  pi.registerProvider("faux", {
    name: "Faux",
    baseUrl: "http://localhost:0",
    apiKey: "faux-no-key",
    api: "faux",
    streamSimple: (_model, context, _options) => {
      const stream = new FakeStream();
      // Defer the scripted events so the consumer can attach its iterator.
      setImmediate(() => {
        const text = FIXED_TEXT;
        const message = {
          role: "assistant",
          content: [{ type: "text", text }],
          api: "faux",
          provider: "faux",
          model: "faux-1",
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: {} },
          stopReason: "stop",
          timestamp: new Date(0).toISOString(),
        };
        stream.push({ type: "start", partial: {} });
        stream.push({ type: "text_start", contentIndex: 0, partial: {} });
        stream.push({ type: "text_delta", contentIndex: 0, delta: text, partial: {} });
        stream.push({ type: "text_end", contentIndex: 0, content: text, partial: {} });
        stream.push({ type: "done", reason: "stop", message });
      });
      return stream;
    },
    models: [
      {
        id: "faux-1",
        name: "Faux Model",
        api: "faux",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 16384,
      },
    ],
  });
}
`,
  );
  return fixture;
}

// Build a synthetic manifest pointing at the fake provider + a noop lane
// extension stub, in a temp dir that mirrors the repo layout (.pi/away-sandbox.json
// with repoRoot = dirname(manifest)/..). This keeps the integration test
// hermetic: it does not depend on the real Makora provider or the C2
// lane-extension.ts existing yet.
function buildSyntheticManifest(dir: string, laneExtPath: string, providerExtPath: string): string {
  // dir = repoRoot; manifest goes to dir/.pi/away-sandbox.json so repoRoot derivation matches bootstrap.
  const piDir = join(dir, ".pi");
  mkdirSync(piDir, { recursive: true });
  const manifestPath = join(piDir, "away-sandbox.json");
  // Copy the real manifest then override model_registry to use faux + the temp
  // lane extension + provider source paths.
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  manifest.model_registry = {
    faux: { provider: "faux", model: "faux-1", thinking: "max", provider_source: providerExtPath },
  };
  manifest.extensions = { lane_extension: laneExtPath };
  // All lanes use the faux model.
  for (const laneId of Object.keys(manifest.lanes)) {
    manifest.lanes[laneId].model = "faux";
  }
  // The synthetic manifest lives in a temp repo (repoRoot = temp dir), so every
  // repo-relative path in the real manifest would resolve against the temp dir
  // and be missing. Point the critical closure inputs at their ABSOLUTE real
  // paths so the closure resolves: the wrapper (exec_path_override) + the
  // pi-fabric install (pi_fabric_path). pi_path / bwrap_path / makora are
  // already absolute in the real manifest. We are testing the rpc settlement
  // path here, not the sandbox, so pinExecPath:false skips the execPath pin.
  manifest.exec_path_override = WRAPPER_PATH;
  manifest.pinned_versions.pi_fabric_path = join(REPO, ".pi", "npm", "node_modules", "pi-fabric");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifestPath;
}

// A noop lane extension stub (C2 not yet built). It just exports a default
// function so pi loads it without error; it does not register anything.
function writeNoopLaneExtension(dir: string): string {
  const p = join(dir, "lane-extension.mjs");
  writeFileSync(
    p,
    `// C1 placeholder lane extension (noop). C2 replaces this.\nexport default function () {}\n`,
  );
  return p;
}

describe("launcher.ts — real prompt/event settlement with a fake provider", () => {
  // This integration test spawns real pi. Skip if pi is not on PATH.
  const PI = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")).pinned_versions.pi_path;
  let piOk = false;
  try {
    piOk = existsSync(PI);
  } catch {
    piOk = false;
  }

  const repo = mkdtempSync(join(tmpdir(), "c1-int-"));
  const controlCwd = mkdtempSync(join(tmpdir(), "c1-ctrl-"));
  let manifestPath: string;
  let laneExtPath: string;
  let providerExtPath: string;

  before(() => {
    laneExtPath = writeNoopLaneExtension(repo);
    providerExtPath = writeFakeProviderFixture(repo);
    manifestPath = buildSyntheticManifest(repo, laneExtPath, providerExtPath);
  });

  after(() => {
    // Do NOT delete (no-delete rule); leave the temp dirs. We only clean the
    // control cwd fabric.json by overwriting it. (Temp dirs are outside the repo.)
  });

  test(
    "a prompt over rpc settles with agent_settled and the deterministic A3_OK reply",
    { skip: !piOk },
    async () => {
      const l = launch({
        manifestPath,
        profileId: "writer",
        controlCwd,
        // The integration test does NOT pin process.execPath to the sandbox
        // wrapper (we're testing the rpc settlement path, not the sandbox). So
        // disable the execPath pin for this run.
        pinExecPath: false,
      });

      const events: RpcEvent[] = [];
      const settled = l.run(async () => {
        const response = await l.request({
          type: "prompt",
          id: "req_1",
          message: "Reply with exactly: A3_OK",
        });
        assert.deepEqual(
          { type: response.type, id: response.id, command: response.command, success: response.success },
          { type: "response", id: "req_1", command: "prompt", success: true },
        );
        for await (const ev of l.events()) {
          events.push(ev);
          if (ev.type === "agent_settled") break;
        }
      });

      // Timeout: if pi doesn't settle in 30s, fail.
      const result = await Promise.race([
        settled,
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error("pi did not settle in 30s")), 30000),
        ),
      ]);

      assert.ok(
        events.some((e) => e.type === "agent_settled"),
        "expected an agent_settled event",
      );
      // The deterministic reply text arrives as message_update events carrying
      // an `assistantMessageEvent` (text_delta -> .delta, text_end -> .content),
      // and as the final assistant message_end -> message.content[0].text.
      const streamed: string[] = [];
      for (const e of events) {
        if (e.type === "message_update" && e.assistantMessageEvent) {
          const ame = e.assistantMessageEvent as Record<string, unknown>;
          if (ame.type === "text_delta" && typeof ame.delta === "string") streamed.push(ame.delta);
          if (ame.type === "text_end" && typeof ame.content === "string")
            streamed.push(ame.content);
        }
        if (e.type === "message_end" && e.message) {
          const msg = e.message as {
            role?: string;
            content?: Array<{ type?: string; text?: string }>;
          };
          if (msg.role === "assistant" && Array.isArray(msg.content)) {
            for (const part of msg.content) {
              if (part.type === "text" && typeof part.text === "string") streamed.push(part.text);
            }
          }
        }
      }
      const combined = streamed.join("");
      // The fake provider emits a single text_delta "A3_OK".
      assert.ok(
        combined.includes("A3_OK"),
        `expected "A3_OK" in streamed text, got: ${JSON.stringify(combined)}`,
      );
      l.markUsed();
    },
  );
});
