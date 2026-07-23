// auto-prewalk — a project-local Pi extension that arms Fabric trajectory
// handoffs automatically, so Sol does the frontier (exploration + first real
// mutation) and Makora finishes implementation without a manual
// `/fabric prewalk`.
//
// The stock `/fabric prewalk` claim builds executor args WITHOUT extensions/
// tools, so the Makora executor inherits `extensions:false` and fails to
// resolve. This extension instead injects an explicit `agents.handoff(...)`
// call with the full correct dispatch shape (`extensions:true`, exact writable
// allowlist, `thinking:"max"`) directly into mutation-bearing `fabric_exec`
// programs. The explicit handoff takes precedence over Fabric's auto-claim,
// so there is no duplicate; the boundary executor runs with the right args.
//
// Testable surface: `parseAutoPrewalkSettings` and `instrumentFabricProgram`
// are pure functions (no `pi` needed). The default export wires the hooks.
//
// Run: node --experimental-strip-types --test .pi/extensions/auto-prewalk/index.test.ts

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const CONFIG_DIR_NAME = ".pi";
const FABRIC_CONFIG = "fabric.json";
const FABRIC_EXEC_TOOL = "fabric_exec";
const STATUS_KEY = "auto-prewalk";
const EXECUTOR_TOOLS = ["read", "grep", "find", "ls", "edit", "write"] as const;
const EXECUTOR_NAME = "Automatic prewalk executor";

export type AutoPrewalkSettings =
  | { kind: "enabled"; model: string }
  | { kind: "disabled" };

export interface AutoPrewalkHandoff {
  model: string;
  task: string;
}

// Matches the Fabric prewalk mutation triggers: pi.edit, pi.write, schema.commit.
const EXPLICIT_HANDOFF = /agents\s*\.\s*handoff\s*\(/;
const MUTATION_EDIT_WRITE = /\bpi\s*\.\s*(?:edit|write)\s*\(/;
const MUTATION_SCHEMA_COMMIT = /\bschema\s*\.\s*commit\s*\(/;

/** Parse raw `.pi/fabric.json` text into an auto-prewalk settings decision. */
export function parseAutoPrewalkSettings(raw: string): AutoPrewalkSettings {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "disabled" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { kind: "disabled" };
  }
  const prewalk = (parsed as Record<string, unknown>).prewalk;
  if (typeof prewalk !== "object" || prewalk === null || Array.isArray(prewalk)) {
    return { kind: "disabled" };
  }
  const auto = (prewalk as Record<string, unknown>).auto;
  const model = (prewalk as Record<string, unknown>).model;
  if (auto !== true) return { kind: "disabled" };
  if (typeof model !== "string" || !model.includes("/")) return { kind: "disabled" };
  return { kind: "enabled", model };
}

/**
 * Return a `fabric_exec` program that schedules exactly one explicit
 * `agents.handoff(...)` after the first successful monitored mutation, with
 * the full executor dispatch shape. Read-only programs and programs that
 * already schedule an explicit handoff are returned unchanged.
 */
export function instrumentFabricProgram(code: string, settings: AutoPrewalkHandoff): string {
  if (typeof code !== "string" || code.length === 0) return code;
  // Do not duplicate an explicit handoff the author already scheduled.
  if (EXPLICIT_HANDOFF.test(code)) return code;
  // Read-only programs never trigger a handoff.
  if (!MUTATION_EDIT_WRITE.test(code) && !MUTATION_SCHEMA_COMMIT.test(code)) {
    return code;
  }
  const handoffArgs = JSON.stringify({
    model: settings.model,
    task: settings.task,
    name: EXECUTOR_NAME,
    thinking: "max",
    extensions: true,
    recursive: false,
    tools: [...EXECUTOR_TOOLS],
  });
  // A prologue that wraps the mutation-bearing core tools so the first
  // successful mutation schedules exactly one deferred trajectory handoff.
  // `pi`/`schema` are function parameters, so reassigning them shadows the
  // originals; the Proxy forwards every other property transparently.
  const prologue = [
    "let __apScheduled = false;",
    `const __apHandoffArgs = ${handoffArgs};`,
    "const __apWrap = (fn) => async (...args) => {",
    "  const r = await fn(...args);",
    "  if (!__apScheduled) { __apScheduled = true; await agents.handoff(__apHandoffArgs); }",
    "  return r;",
    "};",
    "pi = new Proxy(pi, { get(t, p, r) { const v = Reflect.get(t, p, r); if ((p === 'edit' || p === 'write') && typeof v === 'function') return __apWrap(v); return v; } });",
    "schema = new Proxy(schema, { get(t, p, r) { const v = Reflect.get(t, p, r); if (p === 'commit' && typeof v === 'function') return __apWrap(v); return v; } });",
  ].join("\n");
  return `${prologue}\n${code}`;
}

/** Fabric workers carry PI_FABRIC_DEPTH; the main session is depth 0. */
function fabricDepth(): number {
  return Number(process.env.PI_FABRIC_DEPTH ?? "0") || 0;
}

function isInteractiveTask(text: string): boolean {
  if (text.length === 0) return false;
  if (text.startsWith("/")) return false;
  return true;
}

/**
 * Read the project-local Fabric config and decide whether auto-prewalk is on.
 * Reads the raw file (not Fabric's normalized config) so the custom `auto`
 * field, which `normalizeFabricConfig` strips, is visible.
 */
function loadSettings(cwd: string): AutoPrewalkSettings {
  const configPath = join(cwd, CONFIG_DIR_NAME, FABRIC_CONFIG);
  if (!existsSync(configPath)) return { kind: "disabled" };
  try {
    return parseAutoPrewalkSettings(readFileSync(configPath, "utf8"));
  } catch {
    return { kind: "disabled" };
  }
}

function setStatus(ctx: { hasUI?: boolean; ui: { setStatus: (key: string, value: string | undefined) => void } }, settings: AutoPrewalkSettings): void {
  if (!ctx.hasUI) return;
  ctx.ui.setStatus(STATUS_KEY, settings.kind === "enabled" ? `auto-prewalk → ${settings.model}` : undefined);
}

export default function autoPrewalk(pi: ExtensionAPI): void {
  let settings: AutoPrewalkSettings = { kind: "disabled" };
  let currentTask: string | undefined;

  pi.on("session_start", (_event, ctx) => {
    currentTask = undefined;
    settings = loadSettings(ctx.cwd);
    setStatus(ctx, settings);
  });

  // Capture the next interactive (typed/RPC) user task as the handoff task.
  // Skip extension-injected messages, mid-stream steer/followUp, and commands.
  pi.on("input", (event) => {
    if (event.source === "extension") return { action: "continue" };
    if (event.streamingBehavior) return { action: "continue" };
    if (typeof event.text === "string" && isInteractiveTask(event.text)) {
      currentTask = event.text;
    }
    return { action: "continue" };
  });

  // Instrument mutation-bearing fabric_exec programs in the main session only.
  // Workers (PI_FABRIC_DEPTH > 0) run their own fabric_exec under full code mode
  // and must not re-handoff (recursion). `event.input` is mutable before run.
  pi.on("tool_call", (event) => {
    if (settings.kind !== "enabled") return;
    if (fabricDepth() > 0) return;
    if (event.toolName !== FABRIC_EXEC_TOOL) return;
    const input = event.input as Record<string, unknown> | undefined;
    if (!input || typeof input.code !== "string") return;
    const instrumented = instrumentFabricProgram(input.code, {
      model: settings.model,
      task: currentTask ?? "",
    });
    if (instrumented !== input.code) {
      input.code = instrumented;
    }
  });

  // Clear the captured task when the agent settles so it does not leak into the
  // next user task. Keep the persistent armed status visible.
  pi.on("agent_settled", (_event, ctx) => {
    currentTask = undefined;
    setStatus(ctx, settings);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    currentTask = undefined;
    if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
  });
}