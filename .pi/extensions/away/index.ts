// Trusted operator adapter for the canonical away controller.
// Ordinary /supervise remains a prompt template; this extension registers no
// command named supervise.

import { randomBytes } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import {
  runAwayController,
  type AwayControllerRequest,
  type AwayControllerResult,
} from "../../away-runtime/controller.ts";

const READY_TOOL = "away_supervisor_ready";
const ENTRY_KIND = "away-run";
const STATUS_KEY = "away-run";
const INTERNAL_PREFIX = "/supervise --away-controller ";
const TOKEN = /^[A-Za-z0-9_-]{1,128}$/;

export interface ParsedSuperviseAway {
  objective: string | undefined;
}

export interface AwayExtensionDependencies {
  runController: (
    request: AwayControllerRequest,
  ) => Promise<AwayControllerResult | Record<string, unknown>>;
  supervisorReady?: (
    branch: unknown[],
    token: string,
    context: ExtensionContext,
  ) => boolean;
  makeToken?: () => string;
}

interface PendingAway {
  token: string;
  repoRoot: string;
  objective: string | undefined;
  running: boolean;
}

/** Match only the recorded interactive/RPC grammar; reject multiline/control input. */
export function parseSuperviseAwayInput(text: string): ParsedSuperviseAway | null {
  if (typeof text !== "string" || /[\u0000\r\n]/.test(text)) return null;
  const match = text.match(/^\/supervise\s+--away(?:\s+(.*))?$/);
  if (!match) return null;
  const objective = match[1]?.trim();
  return { objective: objective || undefined };
}

function userText(message: unknown): string | undefined {
  if (!message || typeof message !== "object") return undefined;
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;
  const parts = content
    .filter((part): part is { type: "text"; text: string } =>
      Boolean(part && typeof part === "object" && (part as { type?: unknown }).type === "text" &&
        typeof (part as { text?: unknown }).text === "string"),
    )
    .map((part) => part.text);
  return parts.join("");
}

function toolResultText(message: unknown): string | undefined {
  if (!message || typeof message !== "object") return undefined;
  const record = message as Record<string, unknown>;
  if (record.role !== "toolResult" || record.toolName !== "fabric_exec" || record.isError === true) {
    return undefined;
  }
  if (!Array.isArray(record.content)) return undefined;
  const text = record.content
    .filter((part): part is { type: "text"; text: string } =>
      Boolean(part && typeof part === "object" && (part as { type?: unknown }).type === "text" &&
        typeof (part as { text?: unknown }).text === "string"),
    )
    .map((part) => part.text)
    .join("");
  return text || undefined;
}

interface SupervisorReadyEvidence {
  actorId: string;
  requestId: string;
}

function readyValue(value: unknown): SupervisorReadyEvidence | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const actor = record.actor;
  const health = record.health;
  if (
    record.outcome !== "READY" ||
    !actor ||
    typeof actor !== "object" ||
    typeof (actor as { id?: unknown }).id !== "string" ||
    !TOKEN.test((actor as { id: string }).id) ||
    !Array.isArray(record.actions) ||
    !record.actions.includes("health-acknowledged") ||
    !health ||
    typeof health !== "object" ||
    (health as { action?: unknown }).action !== "silent" ||
    (health as { kind?: unknown }).kind !== "health-ack" ||
    typeof (health as { requestId?: unknown }).requestId !== "string" ||
    !TOKEN.test((health as { requestId: string }).requestId)
  ) {
    return undefined;
  }
  return {
    actorId: (actor as { id: string }).id,
    requestId: (health as { requestId: string }).requestId,
  };
}

function supervisorReadyEvidence(
  branch: unknown[],
  token: string,
): SupervisorReadyEvidence | undefined {
  if (!TOKEN.test(token) || !Array.isArray(branch)) return undefined;
  const expectedMode = "Invocation mode: `--away-controller`";
  const expectedNonce = `Internal nonce: \`${token}\``;
  let requestIndex = -1;
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const entry = branch[index];
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const text = record.type === "message" ? userText(record.message) : undefined;
    if (text?.includes(expectedMode) && text.includes(expectedNonce)) {
      requestIndex = index;
      break;
    }
  }
  if (requestIndex < 0) return undefined;
  for (let index = requestIndex + 1; index < branch.length; index += 1) {
    const entry = branch[index];
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (record.type !== "message") continue;
    const text = toolResultText(record.message);
    if (!text) continue;
    try {
      return readyValue(JSON.parse(text));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Accept only JSON evidence from the canonical expanded reconciliation turn. */
export function hasSupervisorReadyEvidence(branch: unknown[], token: string): boolean {
  return supervisorReadyEvidence(branch, token) !== undefined;
}

function sameStrings(value: unknown, expected: string[]): boolean {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return false;
  return JSON.stringify([...value].sort()) === JSON.stringify([...expected].sort());
}

function readBoundedRegular(path: string, root: string, limit: number): string | undefined {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit) return undefined;
    const realRoot = realpathSync(root);
    const realPath = realpathSync(path);
    if (realPath !== realRoot && !realPath.startsWith(realRoot + sep)) return undefined;
    return readFileSync(realPath, "utf8");
  } catch {
    return undefined;
  }
}

function canonicalInstructions(repoRoot: string): string | undefined {
  const prompt = readBoundedRegular(join(repoRoot, ".pi", "prompts", "supervise.md"), repoRoot, 1 << 20);
  if (!prompt) return undefined;
  const heading = "## Supervisor Instructions (custom — embed verbatim)";
  const section = prompt.indexOf(heading);
  const start = prompt.indexOf("```", section);
  const end = prompt.indexOf("```", start + 3);
  if (section < 0 || start < 0 || end < 0) return undefined;
  return prompt.slice(start + 3, end).trim();
}

/** Verify the host-managed actor record and nonce-bound actor transcript. */
export function hasCanonicalSupervisorRegistry(
  repoRoot: string,
  sessionId: string,
  actorId: string,
  requestId: string,
): boolean {
  if (![sessionId, actorId, requestId].every((value) => TOKEN.test(value))) return false;
  const actorsRoot = join(repoRoot, ".pi", "fabric", "mesh", "actors");
  const registryPath = join(actorsRoot, sessionId, "actors.json");
  const raw = readBoundedRegular(registryPath, repoRoot, 16 << 20);
  const instructions = canonicalInstructions(repoRoot);
  if (!raw || !instructions) return false;
  let registry: unknown;
  try {
    registry = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) return false;
  const actors = (registry as { actors?: unknown }).actors;
  if (!Array.isArray(actors)) return false;
  const matches = actors.filter((value) =>
    Boolean(value && typeof value === "object" && (value as { id?: unknown }).id === actorId),
  );
  if (matches.length !== 1) return false;
  const actor = matches[0] as Record<string, unknown>;
  if (
    actor.name !== "supervisor" ||
    actor.instructions !== instructions ||
    actor.status !== "idle" ||
    actor.delivery !== "steer" ||
    actor.responseMode !== "directive" ||
    actor.triggerTurn !== true ||
    actor.coalesce !== true ||
    actor.runner !== "pi" ||
    actor.model !== "openai-codex/gpt-5.6-sol" ||
    actor.thinking !== "max" ||
    actor.extensions !== false ||
    actor.validWhile !== undefined ||
    !sameStrings(actor.events, ["agent_settled", "tool_error"]) ||
    !sameStrings(actor.topics, []) ||
    !sameStrings(actor.tools, ["read", "grep", "find", "ls"]) ||
    typeof actor.sessionFile !== "string"
  ) {
    return false;
  }
  const expectedSessionFile = join(actorsRoot, sessionId, actorId, "session.jsonl");
  if (actor.sessionFile !== expectedSessionFile) return false;
  const transcript = readBoundedRegular(expectedSessionFile, repoRoot, 16 << 20);
  return Boolean(
    transcript &&
    transcript.includes("health-check") &&
    transcript.includes("health-ack") &&
    transcript.includes(requestId),
  );
}

function isRootProcess(): boolean {
  const depth = process.env.PI_FABRIC_DEPTH;
  if (depth && depth !== "0") return false;
  return !process.env.PI_FABRIC_PARENT_RUN && !process.env.PI_FABRIC_ACTOR_ID;
}

function safeString(value: unknown, limit = 2048): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, limit);
}

function safeResult(value: unknown): Record<string, unknown> {
  const invalid = {
    kind: "blocked",
    message: "canonical controller returned an invalid result",
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid;
  const source = value as Record<string, unknown>;
  if (source.kind === "completed") {
    const cardId = safeString(source.cardId, 32);
    const slug = safeString(source.slug, 128);
    const candidateOid = safeString(source.candidateOid, 64);
    const fingerprint = safeString(source.fingerprint, 64);
    if (
      !cardId || !/^RM-\d{3,}$/.test(cardId) ||
      !slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
      !candidateOid || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(candidateOid) ||
      !fingerprint || !/^[0-9a-f]{64}$/.test(fingerprint)
    ) {
      return invalid;
    }
    return { kind: "completed", cardId, slug, candidateOid, fingerprint };
  }
  if (source.kind === "no-work") {
    const reason = safeString(source.reason);
    return reason ? { kind: "no-work", reason } : invalid;
  }
  if (source.kind === "blocked") {
    const message = safeString(source.message);
    return message ? { kind: "blocked", message } : invalid;
  }
  return invalid;
}

function resultText(result: Record<string, unknown>): string {
  if (result.kind === "completed") return "Away controller completed the verified candidate lifecycle.";
  if (result.kind === "no-work") return String(result.reason ?? "No eligible away work was found.");
  return `Away controller blocked: ${String(result.message ?? "unknown failure")}`;
}

function activate(pi: ExtensionAPI): void {
  const tools = pi.getActiveTools();
  if (!tools.includes(READY_TOOL)) pi.setActiveTools([...tools, READY_TOOL]);
}

function deactivate(pi: ExtensionAPI): void {
  pi.setActiveTools(pi.getActiveTools().filter((name) => name !== READY_TOOL));
}

/** Dependency-injected factory keeps the command split and evidence gate testable. */
export function createAwayExtension(dependencies: AwayExtensionDependencies) {
  const supervisorReady = dependencies.supervisorReady ??
    ((branch: unknown[], token: string, context: ExtensionContext) => {
      const evidence = supervisorReadyEvidence(branch, token);
      if (!evidence) return false;
      return hasCanonicalSupervisorRegistry(
        context.cwd,
        context.sessionManager.getSessionId(),
        evidence.actorId,
        evidence.requestId,
      );
    });
  const makeToken = dependencies.makeToken ?? (() => randomBytes(24).toString("base64url"));

  return function awayExtension(pi: ExtensionAPI): void {
    let pending: PendingAway | undefined;

    const clearUnacknowledged = (context: ExtensionContext, message: string): void => {
      if (!pending || pending.running) return;
      const result = { kind: "blocked", message };
      pi.appendEntry(ENTRY_KIND, result);
      pending = undefined;
      deactivate(pi);
      if (context.hasUI) context.ui.setStatus(STATUS_KEY, undefined);
    };

    pi.registerTool({
      name: READY_TOOL,
      label: "Start verified away controller",
      description: "Internal nonce-gated continuation after canonical supervisor reconciliation",
      parameters: {
        type: "object",
        properties: { token: { type: "string", minLength: 1, maxLength: 128 } },
        required: ["token"],
        additionalProperties: false,
      },
      async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
        const current = pending;
        const token = (params as { token?: unknown }).token;
        if (
          !current ||
          current.running ||
          typeof token !== "string" ||
          token !== current.token ||
          !TOKEN.test(token)
        ) {
          throw new Error("Away controller token is missing, stale, or invalid.");
        }
        if (!supervisorReady(ctx.sessionManager.getBranch(), current.token, ctx)) {
          throw new Error("Canonical supervisor READY evidence is missing or invalid.");
        }
        current.running = true;
        if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, "away: running");
        try {
          const raw = await dependencies.runController({
            repoRoot: current.repoRoot,
            supplementalObjective: current.objective,
          });
          const result = safeResult(raw);
          pi.appendEntry(ENTRY_KIND, result);
          return {
            content: [{ type: "text" as const, text: resultText(result) }],
            details: result,
            terminate: true,
          };
        } finally {
          pending = undefined;
          deactivate(pi);
          if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
        }
      },
    });
    deactivate(pi);

    pi.on("input", (event, ctx) => {
      if (event.source === "extension" || event.streamingBehavior || !ctx.isIdle()) {
        return { action: "continue" };
      }
      const parsed = parseSuperviseAwayInput(event.text);
      if (!parsed) return { action: "continue" };
      if (!ctx.isProjectTrusted() || !isRootProcess()) {
        const result = { kind: "blocked", message: "Away mode requires a trusted root Pi process." };
        pi.appendEntry(ENTRY_KIND, result);
        if (ctx.hasUI) ctx.ui.notify(result.message, "warning");
        return { action: "handled" };
      }
      if (pending) {
        if (ctx.hasUI) ctx.ui.notify("An away request is already pending.", "warning");
        return { action: "handled" };
      }
      if (parsed.objective && parsed.objective.length > 4096) {
        const result = { kind: "blocked", message: "Away objective exceeds 4096 characters." };
        pi.appendEntry(ENTRY_KIND, result);
        if (ctx.hasUI) ctx.ui.notify(result.message, "warning");
        return { action: "handled" };
      }
      const token = makeToken();
      if (!TOKEN.test(token)) {
        throw new Error("Away controller generated an invalid reconciliation token.");
      }
      pending = { token, repoRoot: ctx.cwd, objective: parsed.objective, running: false };
      activate(pi);
      return { action: "transform", text: INTERNAL_PREFIX + token };
    });

    pi.on("agent_settled", (_event, ctx) => {
      clearUnacknowledged(
        ctx,
        "Supervisor reconciliation settled without canonical READY continuation.",
      );
    });

    pi.on("session_shutdown", () => {
      pending = undefined;
      deactivate(pi);
    });
  };
}

export default createAwayExtension({ runController: runAwayController });
