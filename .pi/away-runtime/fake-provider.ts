// D1 — Hermetic sandbox integration: deterministic fake provider + fake clock.
//
// `writeFakeProvider` writes a `-e` extension that registers a deterministic
// "faux" provider whose `streamSimple` emits a SCRIPTED sequence of responses
// (fabric_exec tool_calls + text) based on the conversation turn. The provider
// is the ONLY non-deterministic source faked here (plan step 2: "fake only
// provider output and clock"). The clock is faked via a fixed timestamp
// (`new Date(0)`) on every assistant message, so receipts/events are
// deterministic across runs.
//
// The FakeStream is an inline minimal AssistantMessageEventStream (no
// `@earendil-works/pi-ai` import) so the extension is self-contained and
// resolves under any cwd. The event shapes (start / text_* / toolcall_* /
// done) match what pi's provider-composer consumes.

import { writeFileSync } from "node:fs";
import { join } from "node:path";

export type Turn = { type: "fabric_exec"; code: string } | { type: "text"; text: string };

/** A fabric_exec turn: the model calls fabric_exec with the given code. */
export function fabricExecTurn(code: string): Turn {
  return { type: "fabric_exec", code };
}

/** A text turn: the model emits plain text (ends the turn without a tool call). */
export function textTurn(text: string): Turn {
  return { type: "text", text };
}

/**
 * Write the fake-provider extension to `<dir>/fake-provider.mjs` and return its
 * absolute path. The provider emits `turns[assistantMessageCount]` per turn
 * (clamped to the last turn), so a multi-turn script (e.g. fabric_exec work in
 * turn 0, fabric_exec attest in turn 1, text "DONE" in turn 2) drives the
 * writer end-to-end.
 */
export function writeFakeProvider(dir: string, turns: Turn[]): string {
  const p = join(dir, "fake-provider.mjs");
  // Embed the turns as a JS array literal. JSON.stringify each turn's string
  // fields so the .mjs is valid JS regardless of quotes/newlines in the code.
  const turnsLiteral = `[${turns
    .map((t) =>
      t.type === "fabric_exec"
        ? `{type:"fabric_exec",code:${JSON.stringify(t.code)}}`
        : `{type:"text",text:${JSON.stringify(t.text)}}`,
    )
    .join(",")}]`;

  writeFileSync(
    p,
    `// D1 deterministic fake provider (auto-generated). Fake clock = fixed timestamp.
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

const TURNS = ${turnsLiteral};
let call = 0;

function buildMessage(turn) {
  const ts = new Date(0).toISOString(); // fake clock: deterministic timestamp
  const base = { api: "faux", provider: "faux", model: "faux-1", usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: {} }, stopReason: "stop", timestamp: ts };
  if (turn.type === "text") {
    return { role: "assistant", content: [{ type: "text", text: turn.text }], ...base };
  }
  // fabric_exec tool call. arguments MUST be an OBJECT (the parsed args), not
  // a JSON string — Fabric validates the arguments against the tool's schema
  // (root: must be object).
  return { role: "assistant", content: [{ type: "toolCall", id: "call_" + (++call), name: "fabric_exec", arguments: { code: turn.code } }], ...base };
}

// Stream the message with progressive partials (mirrors the proven b19 probe).
function streamDeterministic(stream, message) {
  const partial = { ...message, content: [] };
  stream.push({ type: "start", partial: { ...partial, content: [] } });
  for (let i = 0; i < message.content.length; i++) {
    const b = message.content[i];
    if (b.type === "text") {
      partial.content = [...partial.content, { type: "text", text: "" }];
      stream.push({ type: "text_start", contentIndex: i, partial: { ...partial, content: [...partial.content] } });
      partial.content[i] = { type: "text", text: b.text };
      stream.push({ type: "text_end", contentIndex: i, content: b.text, partial: { ...partial, content: [...partial.content] } });
    } else {
      partial.content = [...partial.content, { type: "toolCall", id: b.id, name: b.name, arguments: {} }];
      stream.push({ type: "toolcall_start", contentIndex: i, id: b.id, toolName: b.name, partial: { ...partial, content: [...partial.content] } });
      partial.content[i] = { ...b };
      stream.push({ type: "toolcall_end", contentIndex: i, toolCall: b, partial: { ...partial, content: [...partial.content] } });
    }
  }
  stream.push({ type: "done", reason: "stop", message });
  stream.end(message);
}

export default function (pi) {
  pi.registerProvider("faux", {
    name: "Faux",
    baseUrl: "http://localhost:0",
    apiKey: "faux-no-key",
    api: "faux",
    streamSimple: (_model, context, _options) => {
      const stream = new FakeStream();
      setImmediate(() => {
        const msgs = (context && context.messages) || [];
        const assistantCount = msgs.filter((m) => m && m.role === "assistant").length;
        const turn = TURNS[Math.min(assistantCount, TURNS.length - 1)];
        streamDeterministic(stream, buildMessage(turn));
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
  return p;
}
