import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

import { createAwayExtension, parseSuperviseAwayInput } from "./index.ts";

type InputEvent = {
  text: string;
  source: "interactive" | "rpc" | "extension";
  streamingBehavior?: "steer" | "followUp";
};
type InputResult = { action: "continue" | "handled" | "transform"; text?: string };
type TestContext = ReturnType<typeof makeContext>;
type InputHandler = (event: InputEvent, context: TestContext) => Promise<InputResult> | InputResult;
type LifecycleHandler = (event: unknown, context: TestContext) => Promise<unknown> | unknown;

function makeContext(options: { idle?: boolean; trusted?: boolean } = {}) {
  const notifications: Array<{ message: string; kind: string | undefined }> = [];
  const statuses: Array<{ key: string; value: string | undefined }> = [];
  return {
    cwd: "/repo",
    isIdle: () => options.idle ?? true,
    isProjectTrusted: () => options.trusted ?? true,
    sessionManager: {
      getBranch: () => [{ actor: { name: "supervisor", status: "stopped" } }],
      getSessionId: () => "session-with-stopped-supervisor",
    },
    hasUI: true,
    ui: {
      notify(message: string, kind?: string) { notifications.push({ message, kind }); },
      setStatus(key: string, value: string | undefined) { statuses.push({ key, value }); },
    },
    notifications,
    statuses,
  };
}

function harness(options: {
  idle?: boolean;
  trusted?: boolean;
  result?: Record<string, unknown>;
  controllerError?: Error;
  runController?: (request: Record<string, unknown>) => Promise<Record<string, unknown>>;
} = {}) {
  let input: InputHandler | undefined;
  let sessionStart: LifecycleHandler | undefined;
  let sessionShutdown: LifecycleHandler | undefined;
  let runtimeBound = false;
  let registeredTools = 0;
  const entries: Array<{ kind: string; data: unknown }> = [];
  const calls: Record<string, unknown>[] = [];
  const context = makeContext(options);
  const api = {
    on(event: string, handler: unknown) {
      if (event === "input") input = handler as InputHandler;
      if (event === "session_start") sessionStart = handler as LifecycleHandler;
      if (event === "session_shutdown") sessionShutdown = handler as LifecycleHandler;
    },
    registerCommand() { throw new Error("away extension must not register a command"); },
    registerTool() { registeredTools += 1; },
    getActiveTools() {
      if (!runtimeBound) throw new Error("extension action called during loading");
      return ["fabric_exec"];
    },
    setActiveTools() {
      if (!runtimeBound) throw new Error("extension action called during loading");
    },
    appendEntry(kind: string, data: unknown) { entries.push({ kind, data }); },
  };
  createAwayExtension({
    runController: async (request) => {
      calls.push(request as Record<string, unknown>);
      if (options.runController) return options.runController(request as Record<string, unknown>);
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
  sessionStart?.({ reason: "startup" }, context);
  return {
    get input() { return input; },
    get sessionStart() { return sessionStart; },
    get sessionShutdown() { return sessionShutdown; },
    get registeredTools() { return registeredTools; },
    entries,
    calls,
    context,
  };
}

describe("extension loading lifecycle", () => {
  it("binds the direct senior controller without the superseded supervisor gate", () => {
    const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    assert.match(source, /import \{ runSeniorAwayController \} from "\.\.\/\.\.\/away-runtime\/supervise-away\.ts"/);
    assert.match(source, /export default createAwayExtension\(\{ runController: runSeniorAwayController \}\)/);
    assert.doesNotMatch(source, /away_supervisor_ready|--away-controller|supervisorReady/);
  });

  it("does not call bound actions or register a model-callable continuation tool", () => {
    const h = harness();
    assert.equal(h.registeredTools, 0);
  });
});

describe("/supervise --away input boundary", () => {
  it("matches only the exact grammar and treats following text as the selected objective", () => {
    assert.deepEqual(parseSuperviseAwayInput("/supervise --away"), { objective: undefined });
    assert.deepEqual(parseSuperviseAwayInput("/supervise  --away tighten sandbox"), { objective: "tighten sandbox" });
    assert.deepEqual(parseSuperviseAwayInput("/supervise --away --dry-run"), { objective: "--dry-run" });
    for (const text of ["/supervise", "/supervise away", "/supervise --awayish", " /supervise --away", "/supervise --away\nsecond"]) {
      assert.equal(parseSuperviseAwayInput(text), null);
    }
  });

  it("starts the direct senior controller even when the session supervisor is stopped", async () => {
    for (const source of ["interactive", "rpc"] as const) {
      const h = harness();
      assert.deepEqual(
        await h.input!({ text: "/supervise --away improve parser", source }, h.context),
        { action: "handled" },
      );
      assert.deepEqual(h.calls, [{ repoRoot: "/repo", objective: "improve parser" }]);
      assert.equal(h.registeredTools, 0);
      assert.equal((h.entries.at(-1)?.data as { kind?: string }).kind, "completed");
    }
  });

  it("passes ordinary, malformed, extension-injected, streaming, and non-idle input", async () => {
    const h = harness();
    for (const event of [
      { text: "/supervise", source: "interactive" },
      { text: "/supervise away", source: "interactive" },
      { text: "/supervise --away x", source: "extension" },
      { text: "/supervise --away x", source: "interactive", streamingBehavior: "steer" },
    ] as InputEvent[]) {
      assert.deepEqual(await h.input!(event, h.context), { action: "continue" });
    }
    const busy = harness({ idle: false });
    assert.deepEqual(
      await busy.input!({ text: "/supervise --away x", source: "rpc" }, busy.context),
      { action: "continue" },
    );
    assert.equal(h.calls.length + busy.calls.length, 0);
  });

  it("blocks untrusted roots and oversized objectives before controller construction", async () => {
    const untrusted = harness({ trusted: false });
    assert.deepEqual(
      await untrusted.input!({ text: "/supervise --away", source: "interactive" }, untrusted.context),
      { action: "handled" },
    );
    assert.equal(untrusted.calls.length, 0);
    assert.deepEqual(untrusted.entries.at(-1)?.data, {
      kind: "blocked",
      message: "Away mode requires a trusted root Pi process.",
    });

    const oversized = harness();
    assert.deepEqual(
      await oversized.input!({ text: `/supervise --away ${"x".repeat(4097)}`, source: "interactive" }, oversized.context),
      { action: "handled" },
    );
    assert.equal(oversized.calls.length, 0);
    assert.equal((oversized.entries.at(-1)?.data as { kind?: string }).kind, "blocked");
  });

  it("retains a sanitized blocked result for controller failures and allows a later retry", async () => {
    const h = harness({ controllerError: new Error("controller\nboom") });
    assert.deepEqual(
      await h.input!({ text: "/supervise --away objective", source: "interactive" }, h.context),
      { action: "handled" },
    );
    assert.deepEqual(h.entries.at(-1), {
      kind: "away-run",
      data: { kind: "blocked", message: "Away controller failed: controller boom" },
    });
    await h.input!({ text: "/supervise --away retry", source: "interactive" }, h.context);
    assert.equal(h.calls.length, 2);
  });

  it("preserves validated maintenance completion evidence", async () => {
    const h = harness({ result: {
      kind: "completed",
      cardId: "MT-a1b2c3d4e5f6",
      slug: "maintenance-a1b2c3d4e5f6",
      candidateOid: "b".repeat(40),
      fingerprint: "c".repeat(64),
    } });
    await h.input!({ text: "/supervise --away improve routing", source: "interactive" }, h.context);
    assert.equal((h.entries.at(-1)?.data as { kind?: string }).kind, "completed");
    assert.equal((h.entries.at(-1)?.data as { cardId?: string }).cardId, "MT-a1b2c3d4e5f6");
  });

  it("downgrades malformed terminal output to blocked evidence", async () => {
    const h = harness({ result: { kind: "completed" } });
    await h.input!({ text: "/supervise --away", source: "interactive" }, h.context);
    assert.deepEqual(h.entries.at(-1)?.data, {
      kind: "blocked",
      message: "canonical controller returned an invalid result",
    });
  });

  it("admits only one direct controller invocation at a time", async () => {
    let release: ((value: Record<string, unknown>) => void) | undefined;
    const held = new Promise<Record<string, unknown>>((resolve) => { release = resolve; });
    const h = harness({ runController: async () => held });
    const first = h.input!({ text: "/supervise --away first", source: "interactive" }, h.context);
    assert.equal(h.calls.length, 1);
    assert.deepEqual(
      await h.input!({ text: "/supervise --away second", source: "interactive" }, h.context),
      { action: "handled" },
    );
    assert.equal(h.calls.length, 1);
    release!({ kind: "no-work", reason: "fixture complete" });
    assert.deepEqual(await first, { action: "handled" });
  });

  it("clears UI status on settlement and session shutdown", async () => {
    const h = harness({ result: { kind: "no-work", reason: "nothing eligible" } });
    await h.input!({ text: "/supervise --away", source: "interactive" }, h.context);
    assert.deepEqual(h.context.statuses.slice(-2), [
      { key: "away-run", value: "away: running" },
      { key: "away-run", value: undefined },
    ]);
    await h.sessionShutdown!({ reason: "quit" }, h.context);
    assert.deepEqual(h.context.statuses.at(-1), { key: "away-run", value: undefined });
  });
});