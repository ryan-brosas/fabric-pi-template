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
const SUPERVISOR_PROTOCOL = "proactive-supervisor/v1";
const LIVENESS_MESSAGE = "Acknowledge persistent supervisor liveness without inspecting the repository.";
const TRANSCRIPT_LIMIT = 1 << 20;

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sameKeySet(value: Record<string, unknown>, keys: string[]): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function hasKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

interface SupervisorReadyEvidence {
  actorId: string;
  requestId: string;
  sessionId: string;
  queueItemId: string;
}

function readyValue(value: unknown): SupervisorReadyEvidence | undefined {
  if (!isPlainObject(value)) return undefined;
  const record = value;
  const actor = record.actor;
  const health = record.health;
  if (
    record.outcome !== "READY" ||
    !isPlainObject(actor) ||
    typeof actor.id !== "string" ||
    !TOKEN.test(actor.id) ||
    !Array.isArray(record.actions) ||
    !record.actions.includes("health-acknowledged") ||
    !isPlainObject(health) ||
    !sameKeySet(health, ["action", "kind", "protocol", "requestId", "sessionId", "actorId", "queueItemId"]) ||
    health.action !== "silent" ||
    health.kind !== "health-ack" ||
    health.protocol !== SUPERVISOR_PROTOCOL ||
    typeof health.requestId !== "string" ||
    !TOKEN.test(health.requestId) ||
    typeof health.sessionId !== "string" ||
    !TOKEN.test(health.sessionId) ||
    record.sessionId !== health.sessionId ||
    typeof health.actorId !== "string" ||
    !TOKEN.test(health.actorId) ||
    health.actorId !== actor.id ||
    typeof health.queueItemId !== "string" ||
    !TOKEN.test(health.queueItemId)
  ) {
    return undefined;
  }
  return {
    actorId: actor.id,
    requestId: health.requestId,
    sessionId: health.sessionId,
    queueItemId: health.queueItemId,
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

function directEnvelopeText(requestId: string, sessionId: string, actorId: string, queueItemId: string): string {
  const data = { protocol: SUPERVISOR_PROTOCOL, kind: "health-check", requestId, sessionId, actorId };
  const envelope = { source: "direct", payload: { message: LIVENESS_MESSAGE, data }, id: queueItemId };
  return `Fabric actor message from direct:\n\n${JSON.stringify(envelope, null, 2)}`;
}

function parseHealthAck(
  text: string,
  requestId: string,
  sessionId: string,
  actorId: string,
  queueItemId: string,
): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return false;
  }
  if (!isPlainObject(parsed) || !sameKeySet(parsed, ["action", "data"]) || parsed.action !== "silent") {
    return false;
  }
  const data = parsed.data;
  if (
    !isPlainObject(data) ||
    !sameKeySet(data, ["protocol", "kind", "requestId", "sessionId", "actorId", "queueItemId"])
  ) {
    return false;
  }
  return (
    data.protocol === SUPERVISOR_PROTOCOL &&
    data.kind === "health-ack" &&
    data.requestId === requestId &&
    data.sessionId === sessionId &&
    data.actorId === actorId &&
    data.queueItemId === queueItemId
  );
}

interface TranscriptEntry {
  id: string;
  parentId: string | undefined;
  role: string | undefined;
  content: string | undefined;
}

/** Bounded structural validation of the nonce-bound actor session-v3 transcript. */
function validateSupervisorTranscript(
  transcript: string,
  sessionId: string,
  actorId: string,
  requestId: string,
  queueItemId: string,
): boolean {
  if (![sessionId, actorId, requestId, queueItemId].every((value) => TOKEN.test(value))) return false;
  const body = transcript.endsWith("\n") ? transcript.slice(0, -1) : transcript;
  if (body.length === 0) return false;
  const lines = body.split("\n");
  if (lines.some((line) => line.length === 0)) return false;
  const entries: TranscriptEntry[] = [];
  const indexById = new Map<string, number>();
  for (let index = 0; index < lines.length; index += 1) {
    let entry: unknown;
    try {
      entry = JSON.parse(lines[index]);
    } catch {
      return false;
    }
    if (!isPlainObject(entry)) return false;
    if (index === 0) {
      if (!sameKeySet(entry, ["type", "version", "id", "timestamp", "cwd"])) return false;
      if (entry.type !== "session" || entry.version !== 3) return false;
      if (typeof entry.id !== "string" || entry.id.length === 0) return false;
      if (typeof entry.timestamp !== "string" || entry.timestamp.length === 0) return false;
      if (typeof entry.cwd !== "string" || entry.cwd.length === 0) return false;
      continue;
    }
    if (!hasKeys(entry, ["type", "id", "parentId", "timestamp"])) return false;
    if (typeof entry.type !== "string" || entry.type.length === 0) return false;
    if (typeof entry.id !== "string" || entry.id.length === 0) return false;
    if (typeof entry.timestamp !== "string" || entry.timestamp.length === 0) return false;
    if (indexById.has(entry.id)) return false;
    const parentId = entry.parentId;
    if (entries.length === 0) {
      if (parentId !== null) return false;
    } else {
      if (typeof parentId !== "string" || parentId.length === 0) return false;
      if (indexById.get(parentId) === undefined) return false;
    }
    indexById.set(entry.id, entries.length);
    let role: string | undefined;
    let content: string | undefined;
    if (Object.prototype.hasOwnProperty.call(entry, "message")) {
      if (entry.type !== "message") return false;
      const message = entry.message;
      if (!isPlainObject(message) || typeof message.role !== "string") return false;
      role = message.role;
      content = userText(message);
    }
    entries.push({ id: entry.id, parentId: typeof parentId === "string" ? parentId : undefined, role, content });
  }
  const expectedRequest = directEnvelopeText(requestId, sessionId, actorId, queueItemId);
  const requests = entries.filter((entry) => entry.role === "user" && entry.content === expectedRequest);
  if (requests.length !== 1) return false;
  const request = requests[0];
  let acks = 0;
  for (const entry of entries) {
    if (entry.role !== "assistant" || entry.content === undefined) continue;
    let current: TranscriptEntry = entry;
    while (current.parentId !== undefined) {
      if (current.parentId === request.id) {
        if (parseHealthAck(entry.content, requestId, sessionId, actorId, queueItemId)) acks += 1;
        break;
      }
      const parentIndex = indexById.get(current.parentId);
      if (parentIndex === undefined) break;
      current = entries[parentIndex];
    }
  }
  return acks === 1;
}

/** Verify the host-managed actor record and nonce-bound actor transcript. */
export function hasCanonicalSupervisorRegistry(
  repoRoot: string,
  sessionId: string,
  actorId: string,
  requestId: string,
  queueItemId: string,
): boolean {
  if (![sessionId, actorId, requestId, queueItemId].every((value) => TOKEN.test(value))) return false;
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
  if (!isPlainObject(registry)) return false;
  const actors = registry.actors;
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
  const transcript = readBoundedRegular(expectedSessionFile, repoRoot, TRANSCRIPT_LIMIT);
  return Boolean(transcript && validateSupervisorTranscript(transcript, sessionId, actorId, requestId, queueItemId));
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
      if (evidence.sessionId !== context.sessionManager.getSessionId()) return false;
      return hasCanonicalSupervisorRegistry(
        context.cwd,
        evidence.sessionId,
        evidence.actorId,
        evidence.requestId,
        evidence.queueItemId,
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
        if (!current || current.running) {
          throw new Error("Away controller token is missing, stale, or invalid.");
        }
        if (typeof token !== "string" || token !== current.token || !TOKEN.test(token)) {
          pending = undefined;
          deactivate(pi);
          if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
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

    pi.on("session_start", (_event, ctx) => {
      pending = undefined;
      deactivate(pi);
      if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
    });

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

    pi.on("session_shutdown", (_event, ctx) => {
      pending = undefined;
      if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
    });
  };
}

export default createAwayExtension({ runController: runAwayController });
