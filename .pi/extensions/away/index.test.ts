import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createAwayExtension,
  hasCanonicalSupervisorRegistry,
  hasSupervisorReadyEvidence,
  parseSuperviseAwayInput,
} from "./index.ts";

type InputEvent = {
  text: string;
  source: "interactive" | "rpc" | "extension";
  streamingBehavior?: "steer" | "followUp";
};
type InputHandler = (event: InputEvent, ctx: any) => Promise<any> | any;
type EventHandler = (event: unknown, ctx: any) => Promise<any> | any;
type ToolDefinition = { execute: (...args: any[]) => Promise<any> };

function harness(options: {
  evidence?: boolean;
  idle?: boolean;
  result?: Record<string, unknown>;
  controllerError?: Error;
} = {}) {
  let input: InputHandler | undefined;
  let settled: EventHandler | undefined;
  let sessionStart: EventHandler | undefined;
  let sessionShutdown: EventHandler | undefined;
  let runtimeBound = false;
  const commands = new Set<string>();
  const tools = new Map<string, ToolDefinition>();
  const activeTools = new Set<string>(["fabric_exec"]);
  const entries: Array<{ kind: string; data: unknown }> = [];
  const calls: Record<string, unknown>[] = [];
  const api = {
    on(event: string, handler: EventHandler) {
      if (event === "input") input = handler as InputHandler;
      if (event === "agent_settled") settled = handler;
      if (event === "session_start") sessionStart = handler;
      if (event === "session_shutdown") sessionShutdown = handler;
    },
    registerCommand(name: string) { commands.add(name); },
    registerTool(definition: ToolDefinition & { name: string }) { tools.set(definition.name, definition); },
    getActiveTools() {
      if (!runtimeBound) throw new Error("Extension runtime not initialized. Action methods cannot be called during extension loading.");
      return [...activeTools];
    },
    setActiveTools(names: string[]) {
      if (!runtimeBound) throw new Error("Extension runtime not initialized. Action methods cannot be called during extension loading.");
      activeTools.clear();
      for (const name of names) activeTools.add(name);
    },
    appendEntry(kind: string, data: unknown) { entries.push({ kind, data }); },
  };
  const ctx = {
    cwd: "/repo",
    isIdle: () => options.idle ?? true,
    isProjectTrusted: () => true,
    sessionManager: { getBranch: () => [], getSessionId: () => "session-1" },
    hasUI: false,
    ui: { notify() {}, setStatus() {} },
  };
  createAwayExtension({
    makeToken: () => "nonce-1",
    supervisorReady: () => options.evidence ?? true,
    runController: async (request) => {
      calls.push(request as Record<string, unknown>);
      if (options.controllerError) throw options.controllerError;
      return options.result ?? {
        kind: "completed",
        cardId: "RM-001",
        slug: "fixture-card",
        candidateOid: "b".repeat(40),
        fingerprint: "c".repeat(64),
      };
    },
  })(api as never);
  runtimeBound = true;
  sessionStart?.({}, ctx);
  return {
    get input() { return input; },
    get settled() { return settled; },
    get sessionStart() { return sessionStart; },
    get sessionShutdown() { return sessionShutdown; },
    bind() { runtimeBound = true; },
    unbind() { runtimeBound = false; },
    commands, tools, activeTools, entries, calls, ctx,
  };
}

describe("extension loading lifecycle", () => {
  it("the shipped default binds only the production controller root", () => {
    const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    assert.match(source, /import \{ runProductionAwayController \} from "\.\.\/\.\.\/away-runtime\/production-host\.ts"/);
    assert.match(source, /export default createAwayExtension\(\{ runController: runProductionAwayController \}\)/);
    assert.doesNotMatch(source, /runController: runAwayController/);
  });

  it("factory does not call bound actions before session_start", () => {
    assert.doesNotThrow(() => harness());
  });
});

describe("away pending state transitions", () => {
  const READY = "away_supervisor_ready";

  it("session_start clears pending and the READY tool for every startup/reload/new/resume/fork reason without fabricating a blocked entry", async () => {
    for (const reason of ["startup", "reload", "new", "resume", "fork"] as const) {
      const h = harness();
      assert.deepEqual(
        await h.input!({ text: "/supervise --away objective", source: "interactive" }, h.ctx),
        { action: "transform", text: "/supervise --away-controller nonce-1" },
      );
      assert.equal(h.activeTools.has(READY), true);
      await h.sessionStart!({ reason }, h.ctx);
      assert.equal(h.activeTools.has(READY), false, `${reason}: READY tool inactive`);
      assert.equal(h.entries.length, 0, `${reason}: no blocked entry fabricated`);
      assert.equal(h.calls.length, 0, `${reason}: controller not called`);
      assert.deepEqual(
        await h.input!({ text: "/supervise --away again", source: "interactive" }, h.ctx),
        { action: "transform", text: "/supervise --away-controller nonce-1" },
        `${reason}: pending cleared`,
      );
    }
  });

  it("session_shutdown cleanup clears pending without invoking bound action methods after unbinding", async () => {
    const h = harness();
    await h.input!({ text: "/supervise --away objective", source: "interactive" }, h.ctx);
    assert.equal(h.activeTools.has(READY), true);
    h.unbind();
    assert.doesNotThrow(() => h.sessionShutdown!({ reason: "quit" }, h.ctx));
    h.bind();
    assert.deepEqual(
      await h.input!({ text: "/supervise --away again", source: "interactive" }, h.ctx),
      { action: "transform", text: "/supervise --away-controller nonce-1" },
      "pending cleared after shutdown",
    );
    assert.equal(h.calls.length, 0);
  });

  it("a settled supervisor turn clears pending and the READY tool with a blocked entry", async () => {
    const h = harness();
    await h.input!({ text: "/supervise --away objective", source: "interactive" }, h.ctx);
    assert.equal(h.activeTools.has(READY), true);
    await h.settled!({}, h.ctx);
    assert.equal(h.activeTools.has(READY), false);
    assert.equal((h.entries.at(-1)?.data as { kind?: string }).kind, "blocked");
    assert.equal(h.calls.length, 0);
    assert.deepEqual(
      await h.input!({ text: "/supervise --away again", source: "interactive" }, h.ctx),
      { action: "transform", text: "/supervise --away-controller nonce-1" },
    );
  });

  it("a controller throw clears pending and the READY tool", async () => {
    const h = harness({ controllerError: new Error("controller boom") });
    await h.input!({ text: "/supervise --away objective", source: "interactive" }, h.ctx);
    assert.equal(h.activeTools.has(READY), true);
    await assert.rejects(
      h.tools.get(READY)!.execute("call-1", { token: "nonce-1" }, undefined, undefined, h.ctx),
      /controller boom/,
    );
    assert.equal(h.calls.length, 1, "controller was invoked once before throwing");
    assert.equal(h.activeTools.has(READY), false);
    assert.deepEqual(
      await h.input!({ text: "/supervise --away again", source: "interactive" }, h.ctx),
      { action: "transform", text: "/supervise --away-controller nonce-1" },
    );
  });

  it("a wrong token clears pending and the READY tool before the controller runs", async () => {
    const h = harness({ evidence: true });
    await h.input!({ text: "/supervise --away objective", source: "interactive" }, h.ctx);
    assert.equal(h.activeTools.has(READY), true);
    await assert.rejects(
      h.tools.get(READY)!.execute("call-1", { token: "wrong" }, undefined, undefined, h.ctx),
      /token/i,
    );
    assert.equal(h.calls.length, 0, "controller not called for a wrong token");
    assert.equal(h.activeTools.has(READY), false);
    assert.deepEqual(
      await h.input!({ text: "/supervise --away again", source: "interactive" }, h.ctx),
      { action: "transform", text: "/supervise --away-controller nonce-1" },
    );
  });

  it("preserves the READY tool while a valid request stays pending after a missing-evidence attempt", async () => {
    const h = harness({ evidence: false });
    await h.input!({ text: "/supervise --away objective", source: "interactive" }, h.ctx);
    assert.equal(h.activeTools.has(READY), true);
    await assert.rejects(
      h.tools.get(READY)!.execute("call-1", { token: "nonce-1" }, undefined, undefined, h.ctx),
      /supervisor/i,
    );
    assert.equal(h.calls.length, 0);
    assert.equal(h.activeTools.has(READY), true, "READY stays active while the request is still pending");
    assert.deepEqual(
      await h.input!({ text: "/supervise --away other", source: "interactive" }, h.ctx),
      { action: "handled" },
      "the pending request is still armed",
    );
  });
});

describe("/supervise --away input hook", () => {
  it("matches only the exact grammar and treats flags as supplemental objective text", () => {
    assert.deepEqual(parseSuperviseAwayInput("/supervise --away"), { objective: undefined });
    assert.deepEqual(parseSuperviseAwayInput("/supervise  --away tighten sandbox"), { objective: "tighten sandbox" });
    assert.deepEqual(parseSuperviseAwayInput("/supervise --away --dry-run tighten sandbox"), { objective: "--dry-run tighten sandbox" });
    for (const text of ["/supervise", "/supervise --awayish", " /supervise --away", "/supervise --away\nsecond"]) {
      assert.equal(parseSuperviseAwayInput(text), null);
    }
  });

  it("transforms exact idle interactive/RPC input into canonical supervisor reconciliation", async () => {
    for (const source of ["interactive", "rpc"] as const) {
      const h = harness();
      assert.deepEqual(
        await h.input!({ text: "/supervise --away improve parser", source }, h.ctx),
        { action: "transform", text: "/supervise --away-controller nonce-1" },
      );
      assert.equal(h.calls.length, 0, "controller waits for supervisor-ready evidence");
      assert.equal(h.commands.has("supervise"), false);
      assert.equal(h.activeTools.has("away_supervisor_ready"), true);
    }
  });

  it("passes normal, malformed, extension-injected, and streaming input while idle", async () => {
    const h = harness();
    for (const event of [
      { text: "/supervise", source: "interactive" },
      { text: "/supervise --awayish", source: "interactive" },
      { text: "/supervise --away x", source: "extension" },
      { text: "/supervise --away x", source: "interactive", streamingBehavior: "steer" },
    ] as InputEvent[]) {
      assert.deepEqual(await h.input!(event, h.ctx), { action: "continue" });
    }
    assert.equal(h.calls.length, 0);
    assert.equal(h.commands.has("supervise"), false);
  });

  it("passes an exact non-idle RPC request without arming away mode", async () => {
    const h = harness({ idle: false });
    assert.deepEqual(
      await h.input!({ text: "/supervise --away x", source: "rpc" }, h.ctx),
      { action: "continue" },
    );
    assert.equal(h.activeTools.has("away_supervisor_ready"), false);
  });

  it("bounds the objective before retaining pending state", async () => {
    const h = harness();
    const result = await h.input!(
      { text: `/supervise --away ${"x".repeat(4097)}`, source: "interactive" },
      h.ctx,
    );
    assert.deepEqual(result, { action: "handled" });
    assert.equal(h.activeTools.has("away_supervisor_ready"), false);
    assert.equal(h.entries.length, 1);
  });

  it("starts the canonical controller only after supervisor evidence", async () => {
    const h = harness({ evidence: true });
    await h.input!({ text: "/supervise --away supplemental objective", source: "interactive" }, h.ctx);
    const result = await h.tools.get("away_supervisor_ready")!.execute(
      "call-1", { token: "nonce-1" }, undefined, undefined, h.ctx,
    );
    assert.deepEqual(h.calls, [{ repoRoot: "/repo", supplementalObjective: "supplemental objective" }]);
    assert.match(String(result.content[0].text), /completed/i);
    assert.equal(h.activeTools.has("away_supervisor_ready"), false);
    assert.equal(h.entries.length, 1);
  });

  it("downgrades malformed completed controller output to blocked", async () => {
    const h = harness({ evidence: true, result: { kind: "completed" } });
    await h.input!({ text: "/supervise --away x", source: "interactive" }, h.ctx);
    const result = await h.tools.get("away_supervisor_ready")!.execute(
      "call-1", { token: "nonce-1" }, undefined, undefined, h.ctx,
    );
    assert.equal(result.details.kind, "blocked");
    assert.match(String(result.content[0].text), /blocked/i);
  });

  it("blocks wrong tokens or missing supervisor evidence before controller start", async () => {
    const wrong = harness({ evidence: true });
    await wrong.input!({ text: "/supervise --away x", source: "interactive" }, wrong.ctx);
    await assert.rejects(
      wrong.tools.get("away_supervisor_ready")!.execute("call-1", { token: "wrong" }, undefined, undefined, wrong.ctx),
      /token/i,
    );
    assert.equal(wrong.calls.length, 0);

    const missing = harness({ evidence: false });
    await missing.input!({ text: "/supervise --away x", source: "interactive" }, missing.ctx);
    await assert.rejects(
      missing.tools.get("away_supervisor_ready")!.execute("call-2", { token: "nonce-1" }, undefined, undefined, missing.ctx),
      /supervisor/i,
    );
    assert.equal(missing.calls.length, 0);
  });

  it("clears an unacknowledged pending request when the supervisor turn settles", async () => {
    const h = harness();
    assert.deepEqual(
      await h.input!({ text: "/supervise --away first", source: "interactive" }, h.ctx),
      { action: "transform", text: "/supervise --away-controller nonce-1" },
    );
    assert.ok(h.settled);
    await h.settled!({}, h.ctx);
    assert.equal(h.activeTools.has("away_supervisor_ready"), false);
    assert.equal((h.entries.at(-1)?.data as { kind?: string }).kind, "blocked");
    assert.deepEqual(
      await h.input!({ text: "/supervise --away second", source: "interactive" }, h.ctx),
      { action: "transform", text: "/supervise --away-controller nonce-1" },
    );
  });
});

describe("supervisor-ready evidence", () => {
  it("accepts only a host fabric result after the expanded internal request", () => {
    const token = "nonce-1";
    const ready = {
      outcome: "READY",
      sessionId: "session-1",
      actor: { id: "actor-1" },
      actions: ["instructions-reapplied", "health-acknowledged"],
      health: {
        action: "silent",
        kind: "health-ack",
        protocol: "proactive-supervisor/v1",
        requestId: "health-1",
        sessionId: "session-1",
        actorId: "actor-1",
        queueItemId: "queue-1",
      },
    };
    const user = {
      type: "message",
      message: {
        role: "user",
        content: `# /supervise\n\nInvocation mode: \`--away-controller\`\nInternal nonce: \`${token}\``,
      },
    };
    const raw = {
      type: "message",
      message: { role: "user", content: `/supervise --away-controller ${token}` },
    };
    const tool = {
      type: "message",
      message: {
        role: "toolResult", toolName: "fabric_exec", isError: false,
        content: [{ type: "text", text: JSON.stringify(ready) }],
      },
    };
    assert.equal(hasSupervisorReadyEvidence([user, tool], token), true);
    assert.equal(hasSupervisorReadyEvidence([raw, tool], token), false);
    assert.equal(hasSupervisorReadyEvidence([user, tool], "other"), false);
    assert.equal(hasSupervisorReadyEvidence([user, { ...tool, message: { ...tool.message, isError: true } }], token), false);
    assert.equal(
      hasSupervisorReadyEvidence([user, {
        ...tool,
        message: { ...tool.message, content: [{ type: "text", text: JSON.stringify({ ...ready, outcome: "BLOCKED" }) }] },
      }], token),
      false,
    );
  });

  it("requires the host registry actor to match the canonical read-only supervisor", () => {
    const root = mkdtempSync(join(tmpdir(), "away-supervisor-registry-"));
    const sessionId = "session-1";
    const actorId = "actor-1";
    const registryDir = join(root, ".pi", "fabric", "mesh", "actors", sessionId);
    const actorDir = join(registryDir, actorId);
    mkdirSync(join(root, ".pi", "prompts"), { recursive: true });
    mkdirSync(actorDir, { recursive: true });
    const instructions = "canonical supervisor instructions";
    writeFileSync(
      join(root, ".pi", "prompts", "supervise.md"),
      `## Supervisor Instructions (custom — embed verbatim)\n\n\`\`\`\n${instructions}\n\`\`\`\n`,
    );
    const actor = {
      id: actorId,
      name: "supervisor",
      instructions,
      status: "idle",
      events: ["agent_settled", "tool_error"],
      topics: [],
      delivery: "steer",
      responseMode: "directive",
      triggerTurn: true,
      coalesce: true,
      runner: "pi",
      model: "openai-codex/gpt-5.6-sol",
      thinking: "max",
      tools: ["read", "grep", "find", "ls"],
      extensions: false,
      sessionFile: join(actorDir, "session.jsonl"),
    };
    writeFileSync(
      actor.sessionFile,
      [
        JSON.stringify({ role: "user", content: "health-check health-1" }),
        JSON.stringify({ role: "assistant", content: "health-ack health-1" }),
      ].join("\n") + "\n",
    );
    const registryPath = join(registryDir, "actors.json");
    writeFileSync(registryPath, JSON.stringify({ format: 1, actors: [actor] }));
    assert.equal(hasCanonicalSupervisorRegistry(root, sessionId, actorId, "health-1", "queue-1"), false);
    writeFileSync(
      registryPath,
      JSON.stringify({ format: 1, actors: [{ ...actor, tools: [...actor.tools, "edit"] }] }),
    );
    assert.equal(hasCanonicalSupervisorRegistry(root, sessionId, actorId, "health-1", "queue-1"), false);
  });

  it("rejects role-only session-v3 decoy correlation records", () => {
    const root = mkdtempSync(join(tmpdir(), "away-supervisor-decoy-"));
    const sessionId = "session-1";
    const actorId = "actor-1";
    const requestId = "health-1";
    const registryDir = join(root, ".pi", "fabric", "mesh", "actors", sessionId);
    const actorDir = join(registryDir, actorId);
    mkdirSync(join(root, ".pi", "prompts"), { recursive: true });
    mkdirSync(actorDir, { recursive: true });
    const instructions = "canonical supervisor instructions";
    writeFileSync(
      join(root, ".pi", "prompts", "supervise.md"),
      `## Supervisor Instructions (custom — embed verbatim)\n\n\`\`\`\n${instructions}\n\`\`\`\n`,
    );
    const sessionFile = join(actorDir, "session.jsonl");
    writeFileSync(
      sessionFile,
      [
        JSON.stringify({ role: "user", content: `health-check ${requestId}` }),
        JSON.stringify({ role: "assistant", content: `health-ack ${requestId}` }),
      ].join("\n") + "\n",
    );
    writeFileSync(join(registryDir, "actors.json"), JSON.stringify({
      format: 1,
      actors: [{
        id: actorId,
        name: "supervisor",
        instructions,
        status: "idle",
        events: ["agent_settled", "tool_error"],
        topics: [],
        delivery: "steer",
        responseMode: "directive",
        triggerTurn: true,
        coalesce: true,
        runner: "pi",
        model: "openai-codex/gpt-5.6-sol",
        thinking: "max",
        tools: ["read", "grep", "find", "ls"],
        extensions: false,
        sessionFile,
      }],
    }));
    assert.equal(hasCanonicalSupervisorRegistry(root, sessionId, actorId, requestId, "queue-1"), false);
  });

  it("validates one exact session-v3 direct health correlation and rejects structural decoys", () => {
    const sessionId = "session-1";
    const actorId = "actor-1";
    const requestId = "health-1";
    const queueItemId = "queue-1";
    const instructions = "canonical supervisor instructions";
    const requestText = JSON.stringify({
      source: "direct",
      payload: {
        message: "Acknowledge persistent supervisor liveness without inspecting the repository.",
        data: {
          protocol: "proactive-supervisor/v1",
          kind: "health-check",
          requestId,
          sessionId,
          actorId,
        },
      },
      id: queueItemId,
    }, null, 2);
    const directText = `Fabric actor message from direct:\n\n${requestText}`;
    const ack = {
      action: "silent",
      data: {
        protocol: "proactive-supervisor/v1",
        kind: "health-ack",
        requestId,
        sessionId,
        actorId,
        queueItemId,
      },
    };
    const records = () => [
      { type: "session", version: 3, id: "actor-session-1", timestamp: "2026-07-23T00:00:00.000Z", cwd: "/repo" },
      { type: "message", id: "request-entry", parentId: null, timestamp: "2026-07-23T00:00:01.000Z", message: { role: "user", content: directText } },
      {
        type: "message",
        id: "ack-entry",
        parentId: "request-entry",
        timestamp: "2026-07-23T00:00:02.000Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: JSON.stringify(ack) }],
          provider: "openai-codex",
          model: "gpt-5.6-sol",
          usage: {},
          stopReason: "stop",
        },
      },
    ];
    const check = (sessionRecords: unknown[] | string, ids = { sessionId, actorId, requestId, queueItemId }): boolean => {
      const root = mkdtempSync(join(tmpdir(), "away-supervisor-v3-"));
      const registryDir = join(root, ".pi", "fabric", "mesh", "actors", sessionId);
      const actorDir = join(registryDir, actorId);
      mkdirSync(join(root, ".pi", "prompts"), { recursive: true });
      mkdirSync(actorDir, { recursive: true });
      writeFileSync(
        join(root, ".pi", "prompts", "supervise.md"),
        `## Supervisor Instructions (custom — embed verbatim)\n\n\`\`\`\n${instructions}\n\`\`\`\n`,
      );
      const sessionFile = join(actorDir, "session.jsonl");
      const transcript = typeof sessionRecords === "string"
        ? sessionRecords
        : sessionRecords.map((record) => JSON.stringify(record)).join("\n") + "\n";
      writeFileSync(sessionFile, transcript);
      writeFileSync(join(registryDir, "actors.json"), JSON.stringify({
        format: 1,
        actors: [{
          id: actorId,
          name: "supervisor",
          instructions,
          status: "idle",
          events: ["agent_settled", "tool_error"],
          topics: [],
          delivery: "steer",
          responseMode: "directive",
          triggerTurn: true,
          coalesce: true,
          runner: "pi",
          model: "openai-codex/gpt-5.6-sol",
          thinking: "max",
          tools: ["read", "grep", "find", "ls"],
          extensions: false,
          sessionFile,
        }],
      }));
      return hasCanonicalSupervisorRegistry(root, ids.sessionId, ids.actorId, ids.requestId, ids.queueItemId);
    };

    assert.equal(check(records()), true, "exact direct request and descendant silent ack");

    const cases: Array<[string, () => unknown[] | string]> = [
      ["malformed line", () => records().map((record) => JSON.stringify(record)).join("\n") + "\n{"],
      ["duplicate ids", () => { const value = records(); (value[2] as any).id = "request-entry"; return value; }],
      ["missing parent", () => { const value = records(); (value[2] as any).parentId = "missing"; return value; }],
      ["cycle or forward parent", () => { const value = records(); (value[1] as any).parentId = "ack-entry"; return value; }],
      ["disconnected second root", () => { const value = records(); (value[2] as any).parentId = null; return value; }],
      ["ack before request", () => { const value = records(); return [value[0], value[2], value[1]]; }],
      ["wrong user role", () => { const value = records(); (value[1] as any).message.role = "assistant"; return value; }],
      ["wrong direct source", () => { const value = records(); (value[1] as any).message.content = directText.replace('"source": "direct"', '"source": "host:input"'); return value; }],
      ["wrong session", () => { const value = records(); const parsed = JSON.parse((value[2] as any).message.content[0].text); parsed.data.sessionId = "session-2"; (value[2] as any).message.content[0].text = JSON.stringify(parsed); return value; }],
      ["wrong request", () => { const value = records(); const parsed = JSON.parse((value[2] as any).message.content[0].text); parsed.data.requestId = "health-2"; (value[2] as any).message.content[0].text = JSON.stringify(parsed); return value; }],
      ["wrong actor", () => { const value = records(); const parsed = JSON.parse((value[2] as any).message.content[0].text); parsed.data.actorId = "actor-2"; (value[2] as any).message.content[0].text = JSON.stringify(parsed); return value; }],
      ["wrong queue item", () => { const value = records(); const parsed = JSON.parse((value[2] as any).message.content[0].text); parsed.data.queueItemId = "queue-2"; (value[2] as any).message.content[0].text = JSON.stringify(parsed); return value; }],
      ["assistant prose", () => { const value = records(); (value[2] as any).message.content[0].text += " extra"; return value; }],
      ["duplicate ack", () => { const value = records(); value.push({ ...(structuredClone(value[2]) as any), id: "ack-entry-2" }); return value; }],
      ["duplicate request", () => { const value = records(); value.push({ ...(structuredClone(value[1]) as any), id: "request-entry-2", parentId: "ack-entry" }); return value; }],
      ["tool-result substring decoy", () => { const value = records(); (value[2] as any).message.role = "toolResult"; (value[2] as any).message.toolName = "fabric_exec"; return value; }],
      ["oversized transcript", () => "x".repeat((1 << 20) + 1)],
    ];
    for (const [name, make] of cases) assert.equal(check(make()), false, name);
    assert.equal(check(records(), { sessionId, actorId, requestId: "health-stale", queueItemId }), false, "stale request nonce");
  });
});