import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
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
} = {}) {
  let input: InputHandler | undefined;
  let settled: EventHandler | undefined;
  const commands = new Set<string>();
  const tools = new Map<string, ToolDefinition>();
  const activeTools = new Set<string>(["fabric_exec"]);
  const entries: Array<{ kind: string; data: unknown }> = [];
  const calls: Record<string, unknown>[] = [];
  const api = {
    on(event: string, handler: EventHandler) {
      if (event === "input") input = handler as InputHandler;
      if (event === "agent_settled") settled = handler;
    },
    registerCommand(name: string) { commands.add(name); },
    registerTool(definition: ToolDefinition & { name: string }) { tools.set(definition.name, definition); },
    getActiveTools() { return [...activeTools]; },
    setActiveTools(names: string[]) {
      activeTools.clear();
      for (const name of names) activeTools.add(name);
    },
    appendEntry(kind: string, data: unknown) { entries.push({ kind, data }); },
  };
  createAwayExtension({
    makeToken: () => "nonce-1",
    supervisorReady: () => options.evidence ?? true,
    runController: async (request) => {
      calls.push(request as Record<string, unknown>);
      return options.result ?? {
        kind: "completed",
        cardId: "RM-001",
        slug: "fixture-card",
        candidateOid: "b".repeat(40),
        fingerprint: "c".repeat(64),
      };
    },
  })(api as never);
  const ctx = {
    cwd: "/repo",
    isIdle: () => options.idle ?? true,
    isProjectTrusted: () => true,
    sessionManager: { getBranch: () => [], getSessionId: () => "session-1" },
    hasUI: false,
    ui: { notify() {}, setStatus() {} },
  };
  return {
    get input() { return input; },
    get settled() { return settled; },
    commands, tools, activeTools, entries, calls, ctx,
  };
}

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
      actor: { id: "actor-1" },
      actions: ["instructions-reapplied", "health-acknowledged"],
      health: { action: "silent", kind: "health-ack", requestId: "health-1" },
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
    assert.equal(hasCanonicalSupervisorRegistry(root, sessionId, actorId, "health-1"), true);
    writeFileSync(
      registryPath,
      JSON.stringify({ format: 1, actors: [{ ...actor, tools: [...actor.tools, "edit"] }] }),
    );
    assert.equal(hasCanonicalSupervisorRegistry(root, sessionId, actorId, "health-1"), false);
  });
});