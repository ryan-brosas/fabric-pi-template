// Trusted direct-root adapter for interactive and continuous /supervise --away runs.
// The retained host owns reservation, replay, verification, and draft-PR effects.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertReceiptSafe,
  listExtensionReceipts,
  readWrapperReceipt,
  type TerminalReceipt,
} from "./attestation.ts";
import { loadManifest, type Manifest } from "./bootstrap.ts";
import { resolveClosure, verifyClosure } from "./closure.ts";
import { isProtected, normalizeRelative, resolveSourceView } from "./dispatch.ts";
import { launch, type Launcher } from "./launcher.ts";
import {
  withRepositoryLease,
  type AwayControllerRequest,
  type AwayControllerResult,
} from "./controller.ts";
import {
  AWAY_SETTLEMENT_SCHEMA,
  type SettlementCandidate,
} from "./lane-extension.ts";

const WRITER_LANE = "writer";
const OBJECTIVE_LIMIT = 4_096;
const STANDING_MAINTENANCE_OBJECTIVE =
  "Continuously maintain and improve this repository as a senior engineer. " +
  "For this cycle, select one bounded, high-confidence improvement grounded in repository evidence; " +
  "prioritize correctness, simplicity, reliability, verification, and documentation consistency. " +
  "Use bounded read-only small agents for exploration and review when useful, and one serial writer only when needed.";

const DIRECT_SENIOR_PROTECTED_PATHS = new Set([
  "AGENTS.md",
  ".pi/ROADMAP.md",
  ".pi/settings.json",
  ".pi/fabric.json",
  ".pi/away-sandbox.json",
  ".pi/state.md",
  ".pi/user.md",
  ".pi/memory.md",
  ".pi/tech-stack.md",
]);
const DIRECT_SENIOR_PROTECTED_PREFIXES = [
  ".git/",
  ".pi/npm/",
  ".pi/fabric/",
  ".pi/git/",
  ".pi/sessions/",
];

/** Direct-root work publishes a draft only, but cannot modify authority, intent, state, or secrets. */
export function isDirectSeniorCandidateProtected(path: string): boolean {
  let normalized: string;
  try {
    normalized = normalizeRelative(path);
  } catch {
    return true;
  }
  if (normalized !== path || DIRECT_SENIOR_PROTECTED_PATHS.has(normalized)) return true;
  if (DIRECT_SENIOR_PROTECTED_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return true;
  const segments = normalized.toLowerCase().split("/");
  return segments.some((segment) =>
    segment === ".env" || segment.startsWith(".env.") ||
    /^(?:credentials?|passwords?|secrets?|tokens?)(?:\.[^.]+)?$/.test(segment) ||
    /(?:^|[-_.])(?:auth|access|refresh|api)[-_]?(?:token|key)(?:[-_.]|$)/.test(segment) ||
    /^(?:id_rsa|id_ed25519)$/.test(segment) ||
    /\.(?:key|pem|p12|pfx)$/.test(segment)
  );
}

export interface WorkflowCommandRequest {
  packetReady: boolean;
  slug: string;
  cardId?: string;
  workId?: string;
  outcome: string;
  runGc?: boolean;
  auditPatterns?: string[];
}

export type WorkflowCommands =
  | { kind: "needs-init"; commands: [string]; requiresOperator: true }
  | { kind: "ready"; commands: string[]; requiresOperator: false };

export function buildWorkflowCommands(request: WorkflowCommandRequest): WorkflowCommands {
  if (!request.packetReady) {
    return { kind: "needs-init", commands: ["/init --deep"], requiresOperator: true };
  }

  if (Boolean(request.cardId) === Boolean(request.workId)) {
    throw new Error("workflow requires exactly one roadmap card or maintenance work identity");
  }
  const workId = request.cardId ?? request.workId!;
  const topic = JSON.stringify(
    "Research implementation risks and established project patterns for " +
      workId + ": " + request.outcome,
  );
  const commands: string[] = [];
  if (request.cardId) {
    const source = ".pi/ROADMAP.md#" + request.cardId;
    commands.push("/workflow " + request.slug + " --from " + source);
    if (request.runGc) commands.push("/gc");
    commands.push("/create " + request.slug + " --from " + source);
  } else {
    const rawObjective = JSON.stringify(request.outcome);
    commands.push("/workflow " + request.slug + " --objective " + rawObjective);
    if (request.runGc) commands.push("/gc");
    commands.push("/create " + request.slug + " " + rawObjective);
  }
  commands.push(
    "/research " + request.slug + " " + topic + " --thorough",
    "/plan " + request.slug,
    "/ship " + request.slug,
  );
  for (const pattern of request.auditPatterns ?? []) commands.push("/audit " + pattern);
  commands.push("/verify " + request.slug + " all --full");
  return { kind: "ready", commands, requiresOperator: false };
}

export interface RootPiLaunchRequest {
  repoRoot: string;
  sessionDir: string;
  sessionFile?: string;
  piPath?: string;
}

export function resolveRootPiBinary(
  explicit: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv,
): string {
  const inherited = argv[1] && isAbsolute(argv[1]) && basename(argv[1]) === "cli.js"
    ? argv[1]
    : undefined;
  const candidate = explicit ?? env.PI_AWAY_PI_BINARY ?? inherited;
  if (!candidate || !isAbsolute(candidate)) {
    throw new Error(
      "senior root requires an absolute current Pi binary via piPath, PI_AWAY_PI_BINARY, or the active Pi CLI",
    );
  }
  const canonical = realpathSync(candidate);
  const metadata = lstatSync(canonical);
  if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o111) === 0) {
    throw new Error("senior root Pi binary is not an executable regular file");
  }
  return canonical;
}

export function createRootPiLaunchSpec(request: RootPiLaunchRequest): {
  cwd: string;
  argv: string[];
} {
  const argv = [
    request.piPath ?? "pi",
    "--approve",
    "--mode",
    "rpc",
    "--provider",
    "openai-codex",
    "--model",
    "gpt-5.6-sol",
    "--thinking",
    "max",
    "--session-dir",
    request.sessionDir,
    "--name",
    "away-senior-engineer",
  ];
  if (request.sessionFile) argv.push("--session", request.sessionFile);
  return { cwd: request.repoRoot, argv };
}

export interface TopLevelWorkflowRequest {
  commands: string[];
  startIndex: number;
  prompt: (command: string) => Promise<{ assistantText: string }>;
  checkpoint: (nextIndex: number) => void | Promise<void>;
}

export type TopLevelWorkflowResult =
  | { kind: "completed"; nextIndex: number; assistantText: string | null }
  | { kind: "blocked"; nextIndex: number; message: string };

export async function runTopLevelWorkflow(
  request: TopLevelWorkflowRequest,
): Promise<TopLevelWorkflowResult> {
  let assistantText: string | null = null;
  for (let index = request.startIndex; index < request.commands.length; index += 1) {
    try {
      const result = await request.prompt(request.commands[index]);
      assistantText = result.assistantText;
      await request.checkpoint(index + 1);
    } catch (error) {
      return {
        kind: "blocked",
        nextIndex: index,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return { kind: "completed", nextIndex: request.commands.length, assistantText };
}

interface RootRpcProcess {
  stdin: { write(chunk: Buffer): boolean; end(): void };
  stdout: { on(event: "data" | "end", listener: (chunk?: Buffer) => void): void };
  stderr: { on(event: "data", listener: (chunk: Buffer) => void): void };
  kill(signal?: NodeJS.Signals): boolean;
}

export interface RootPiWorkflowRequest {
  launch: { cwd: string; argv: string[] };
  commands: string[];
  startIndex: number;
  timeoutMs: number;
  checkpoint: (nextIndex: number, sessionFile: string) => void | Promise<void>;
  validateSettlement?: (command: string, assistantText: string | null, nextIndex: number) =>
    void | Promise<void>;
  spawnProcess?: (
    executable: string,
    args: string[],
    options: { cwd: string; env: NodeJS.ProcessEnv; stdio: ["pipe", "pipe", "pipe"] },
  ) => RootRpcProcess;
}

export type RootPiWorkflowResult =
  | {
      kind: "completed";
      nextIndex: number;
      assistantText: string | null;
      sessionFile: string;
    }
  | { kind: "blocked"; nextIndex: number; message: string };

export function isExpectedProjectPromptCommand(
  entry: Record<string, unknown>, name: string, cwd: string,
): boolean {
  if (entry.name !== name || entry.source !== "prompt") return false;
  const sourceInfo = entry.sourceInfo;
  if (sourceInfo === undefined) return entry.location === "project";
  if (!sourceInfo || typeof sourceInfo !== "object" || Array.isArray(sourceInfo)) return false;
  const info = sourceInfo as Record<string, unknown>;
  if (info.scope !== "project" || typeof info.path !== "string") return false;
  return resolve(info.path) === resolve(cwd, ".pi", "prompts", name + ".md");
}

/** Run real lifecycle slash commands in one ordinary, persistent root Pi RPC session. */
export async function runRootPiWorkflow(
  request: RootPiWorkflowRequest,
): Promise<RootPiWorkflowResult> {
  const { RpcDispatcher, isBlockingRpcUiRequest, serializeCommand } = await import("./rpc.ts");
  const { spawn } = await import("node:child_process");
  const spawnProcess = request.spawnProcess ?? ((executable, args, options) =>
    spawn(executable, args, options) as unknown as RootRpcProcess
  );
  let process: RootRpcProcess | undefined;
  let activeIndex = request.startIndex;
  let stderr = "";
  try {
    if (!request.launch.argv.length) throw new Error("root RPC launch argv is empty");
    process = spawnProcess(
      request.launch.argv[0],
      request.launch.argv.slice(1),
      { cwd: request.launch.cwd, env: globalThis.process.env, stdio: ["pipe", "pipe", "pipe"] },
    );
    if (!process || typeof process.stdin?.write !== "function") {
      throw new Error("root RPC process did not expose piped stdio");
    }

    const dispatcher = new RpcDispatcher({ maxRecordBytes: 8 * 1024 * 1024 });
    let fatalReject: (error: Error) => void = () => {};
    const fatal = new Promise<never>((_resolve, reject) => { fatalReject = reject; });
    let settleResolve: (() => void) | undefined;
    let settleReject: ((error: Error) => void) | undefined;
    process.stdout.on("data", (chunk) => dispatcher.push(chunk ?? Buffer.alloc(0)));
    process.stdout.on("end", () => dispatcher.end());
    process.stderr.on("data", (chunk) => {
      if (stderr.length < 16_384) stderr += chunk.toString("utf8").slice(0, 16_384 - stderr.length);
    });
    dispatcher.on("wrongId", () => fatalReject(new Error("root RPC returned a wrong response id")));
    dispatcher.on("end", () => fatalReject(new Error("root RPC exited before completion")));
    dispatcher.on("event", (event) => {
      if (isBlockingRpcUiRequest(event)) {
        const error = new Error("root RPC requested unsupported operator dialogue");
        settleReject?.(error);
        fatalReject(error);
      } else if (event.type === "agent_settled") {
        settleResolve?.();
      }
    });

    let sequence = 0;
    const rpc = async (body: Record<string, unknown>): Promise<Record<string, unknown>> => {
      const id = "root-" + (++sequence).toString(10);
      const response = dispatcher.registerPending(id);
      process!.stdin.write(serializeCommand({ id, ...body }));
      const record = await withTimeout(
        Promise.race([response, fatal]),
        request.timeoutMs,
        "root RPC command timed out",
      );
      if (record.type !== "response" || record.id !== id || record.success !== true) {
        throw new Error("root RPC command response was not successful");
      }
      return record as Record<string, unknown>;
    };

    const catalog = await rpc({ type: "get_commands" });
    const catalogData = catalog.data as { commands?: Array<Record<string, unknown>> } | undefined;
    const commands = catalogData?.commands ?? [];
    for (const name of ["workflow", "create", "research", "plan", "ship", "verify"]) {
      if (!commands.some((entry) =>
        isExpectedProjectPromptCommand(entry, name, request.launch.cwd)
      )) {
        throw new Error("root RPC missing project prompt command: " + name);
      }
    }

    let assistantText: string | null = null;
    let sessionFile = "";
    if (activeIndex >= request.commands.length) {
      const assistant = await rpc({ type: "get_last_assistant_text" });
      const assistantData = assistant.data as { text?: unknown } | undefined;
      assistantText = typeof assistantData?.text === "string" ? assistantData.text : null;
      const state = await rpc({ type: "get_state" });
      const stateData = state.data as { sessionFile?: unknown } | undefined;
      if (typeof stateData?.sessionFile !== "string" || !isAbsolute(stateData.sessionFile)) {
        throw new Error("root RPC did not report an absolute persistent session file");
      }
      sessionFile = stateData.sessionFile;
    }
    for (; activeIndex < request.commands.length; activeIndex += 1) {
      const settled = new Promise<void>((resolve, reject) => {
        settleResolve = resolve;
        settleReject = reject;
      });
      await rpc({ type: "prompt", message: request.commands[activeIndex] });
      await withTimeout(
        Promise.race([settled, fatal]),
        request.timeoutMs,
        "root RPC prompt settlement timed out",
      );
      settleResolve = undefined;
      settleReject = undefined;

      const assistant = await rpc({ type: "get_last_assistant_text" });
      const assistantData = assistant.data as { text?: unknown } | undefined;
      assistantText = typeof assistantData?.text === "string" ? assistantData.text : null;
      await request.validateSettlement?.(
        request.commands[activeIndex], assistantText, activeIndex + 1,
      );
      const state = await rpc({ type: "get_state" });
      const stateData = state.data as { sessionFile?: unknown } | undefined;
      if (typeof stateData?.sessionFile !== "string" || !isAbsolute(stateData.sessionFile)) {
        throw new Error("root RPC did not report an absolute persistent session file");
      }
      sessionFile = stateData.sessionFile;
      await request.checkpoint(activeIndex + 1, sessionFile);
    }
    return {
      kind: "completed",
      nextIndex: request.commands.length,
      assistantText,
      sessionFile,
    };
  } catch (error) {
    const detail = stderr.trim() ? " (stderr: " + stderr.trim() + ")" : "";
    return {
      kind: "blocked",
      nextIndex: activeIndex,
      message: (error instanceof Error ? error.message : String(error)) + detail,
    };
  } finally {
    try { process?.stdin.end(); } catch {}
    try { process?.kill("SIGTERM"); } catch {}
  }
}

export interface AwayRunRequest {
  repoRoot: string;
  objective?: string;
  supplementalObjective?: string;
  dryRun: boolean;
}

export interface ResolvedAwayRunRequest extends AwayRunRequest {
  objective: string;
  cardId?: string;
  slug?: string;
  cardOutcome?: string;
}

export interface AwayRoadmapCard {
  cardId: string;
  slug: string;
  objective: string;
}

export type AwayRunResult =
  | {
      kind: "completed";
      runId: string;
      changedPaths: string[];
      objective?: string;
      cardId?: string;
      branch?: string;
      pullRequestUrl?: string;
      slug?: string;
      candidateOid?: string;
      fingerprint?: string;
    }
  | { kind: "dry-run"; objective: string; cardId?: string; slug?: string }
  | { kind: "no-work"; message: string }
  | { kind: "blocked"; message: string; runId?: string };

export interface AwayControllerDependencies {
  env?: Record<string, string | undefined>;
  readRoadmap?: (repoRoot: string) => string;
  isCompleted?: (repoRoot: string, work: AwayRoadmapCard) => boolean;
  execute?: (request: ResolvedAwayRunRequest) => Promise<AwayRunResult>;
}

interface ParsedCard {
  cardId: string;
  number: number;
  fields: Map<string, string>;
}

function readyCards(markdown: string): ParsedCard[] {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => /^## Ready\s*$/.test(line));
  if (start < 0) return [];
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^## (?!#)/.test(lines[index])) {
      end = index;
      break;
    }
  }

  const cards: ParsedCard[] = [];
  let card: ParsedCard | undefined;
  let activeField: string | undefined;
  for (const line of lines.slice(start + 1, end)) {
    const heading = line.match(/^###\s+(RM-(\d+))\s+[—-]\s+.+$/);
    if (heading) {
      card = { cardId: heading[1], number: Number(heading[2]), fields: new Map() };
      cards.push(card);
      activeField = undefined;
      continue;
    }
    if (/^###\s+/.test(line)) {
      card = undefined;
      activeField = undefined;
      continue;
    }
    if (!card) continue;
    const field = line.match(/^-\s+([^:]+):\s*(.*)$/);
    if (field) {
      activeField = field[1].trim().toLowerCase();
      card.fields.set(activeField, field[2].trim());
      continue;
    }
    if (activeField && /^\s+\S/.test(line)) {
      card.fields.set(
        activeField,
        [card.fields.get(activeField) ?? "", line.trim()].filter(Boolean).join(" "),
      );
    } else if (line.trim()) {
      activeField = undefined;
    }
  }
  return cards;
}

/** Lowest Ready card with explicit away authority and no open decisions. */
export function selectAwayRoadmapCard(
  markdown: string,
  excludedCardIds: ReadonlySet<string> = new Set(),
): AwayRoadmapCard | null {
  const cards = readyCards(markdown)
    .filter((card) => !excludedCardIds.has(card.cardId))
    .filter((card) => card.fields.get("autonomy")?.toLowerCase() === "away-ok")
    .filter((card) => card.fields.get("open decisions")?.toLowerCase() === "none")
    .map((card) => ({
      ...card,
      slug: card.fields.get("candidate slug") ?? "",
      objective: card.fields.get("outcome") ?? "",
    }))
    .filter((card) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(card.slug))
    .filter((card) => card.objective.length > 0)
    .sort((left, right) => left.number - right.number || left.cardId.localeCompare(right.cardId));
  return cards.length
    ? { cardId: cards[0].cardId, slug: cards[0].slug, objective: cards[0].objective }
    : null;
}

function childMarker(env: Record<string, string | undefined>): string | undefined {
  const depth = env.PI_FABRIC_DEPTH;
  if (depth && depth !== "0") return "PI_FABRIC_DEPTH";
  if (env.PI_FABRIC_PARENT_RUN) return "PI_FABRIC_PARENT_RUN";
  if (env.PI_FABRIC_ACTOR_ID) return "PI_FABRIC_ACTOR_ID";
  return undefined;
}

function objective(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error("away controller: objective is empty");
  if (normalized.length > OBJECTIVE_LIMIT) {
    throw new Error(`away controller: objective exceeds ${OBJECTIVE_LIMIT} characters`);
  }
  if (normalized.includes("\0")) throw new Error("away controller: objective contains NUL");
  return normalized;
}

export function deriveMaintenanceWorkIdentity(
  head: string, standingObjective: string,
): { cardId: string; slug: string } {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(head)) {
    throw new Error("away controller: repository HEAD is malformed");
  }
  const cycle = createHash("sha256")
    .update(head + "\0" + objective(standingObjective))
    .digest("hex")
    .slice(0, 12);
  return { cardId: "MT-" + cycle, slug: "maintenance-" + cycle };
}

export type MaintenanceSelection =
  | { schema: "maintenance-selection/1"; kind: "selected"; objective: string; acceptance: string }
  | { schema: "maintenance-selection/1"; kind: "no-change"; reason: string };

const MAINTENANCE_SELECTION_PREFIX = "MAINTENANCE_SELECTION: ";

function boundedSelectionText(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`maintenance selection ${field} is not a string`);
  }
  const normalized = value.trim();
  if (normalized.length < 20 || normalized.length > 1_800) {
    throw new Error(`maintenance selection ${field} is outside bounds`);
  }
  if (/[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error(`maintenance selection ${field} contains a control character`);
  }
  return normalized;
}

function exactSelectionKeys(value: Record<string, unknown>, expected: string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

/** Parse one strict, bounded Sol-to-host maintenance decision from assistant output. */
export function parseMaintenanceSelection(assistantText: string): MaintenanceSelection {
  const lines = assistantText.split(/\r?\n/);
  const matches = lines.filter((line) => line.startsWith(MAINTENANCE_SELECTION_PREFIX));
  if (matches.length !== 1) {
    throw new Error("maintenance selection must contain exactly one protocol record");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(matches[0].slice(MAINTENANCE_SELECTION_PREFIX.length));
  } catch {
    throw new Error("maintenance selection protocol record is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("maintenance selection protocol record is not an object");
  }
  const value = parsed as Record<string, unknown>;
  if (value.schema !== "maintenance-selection/1") {
    throw new Error("maintenance selection schema is invalid");
  }
  if (value.kind === "selected") {
    if (!exactSelectionKeys(value, ["schema", "kind", "objective", "acceptance"])) {
      throw new Error("maintenance selection selected keys are invalid");
    }
    return {
      schema: "maintenance-selection/1",
      kind: "selected",
      objective: boundedSelectionText(value.objective, "objective"),
      acceptance: boundedSelectionText(value.acceptance, "acceptance"),
    };
  }
  if (value.kind === "no-change") {
    if (!exactSelectionKeys(value, ["schema", "kind", "reason"])) {
      throw new Error("maintenance selection no-change keys are invalid");
    }
    return {
      schema: "maintenance-selection/1",
      kind: "no-change",
      reason: boundedSelectionText(value.reason, "reason"),
    };
  }
  throw new Error("maintenance selection kind is invalid");
}

interface SeniorCompletion {
  schema: "senior-away-completion/1";
  cardId: string;
  slug: string;
  changedPaths: string[];
  branch: string;
  pullRequestUrl: string;
  candidateOid: string;
  fingerprint: string;
  outcomeHash: string;
}

interface SeniorIdle {
  schema: "senior-away-idle/1";
  cardId: string;
  slug: string;
  outcomeHash: string;
  reason: string;
}

interface StoredMaintenanceSelection {
  schema: "senior-away-selection/1";
  cardId: string;
  slug: string;
  outcomeHash: string;
  selection: MaintenanceSelection;
}

async function writeFsyncedJsonExclusive(path: string, value: unknown): Promise<void> {
  const { closeSync, fsyncSync, linkSync, openSync, unlinkSync, writeSync } =
    await import("node:fs");
  const parent = dirname(path);
  const temporary = join(parent, `.away-evidence-${process.pid}-${randomBytes(8).toString("hex")}`);
  const bytes = Buffer.from(JSON.stringify(value) + "\n", "utf8");
  let fd = openSync(temporary, "wx", 0o600);
  try {
    let offset = 0;
    while (offset < bytes.length) {
      const written = writeSync(fd, bytes, offset, bytes.length - offset);
      if (written <= 0) throw new Error("Senior away evidence write made no progress.");
      offset += written;
    }
    fsyncSync(fd);
    closeSync(fd);
    fd = -1;
    linkSync(temporary, path);
    const parentFd = openSync(parent, "r");
    try {
      fsyncSync(parentFd);
    } finally {
      closeSync(parentFd);
    }
  } finally {
    if (fd >= 0) closeSync(fd);
    try {
      unlinkSync(temporary);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

function readSeniorIdle(path: string, cardId: string): SeniorIdle | null {
  if (!existsSync(path)) return null;
  try {
    const metadata = lstatSync(path);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 16_384) return null;
    const value = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    if (
      !exactSelectionKeys(value, ["schema", "cardId", "slug", "outcomeHash", "reason"]) ||
      value.schema !== "senior-away-idle/1" || value.cardId !== cardId ||
      typeof value.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug) ||
      typeof value.outcomeHash !== "string" || !/^[0-9a-f]{64}$/.test(value.outcomeHash)
    ) return null;
    return {
      schema: "senior-away-idle/1",
      cardId,
      slug: value.slug,
      outcomeHash: value.outcomeHash,
      reason: boundedSelectionText(value.reason, "reason"),
    };
  } catch {
    return null;
  }
}

function readStoredMaintenanceSelection(
  path: string, cardId: string, slug: string, outcomeHash: string,
): MaintenanceSelection | null {
  if (!existsSync(path)) return null;
  try {
    const metadata = lstatSync(path);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 16_384) return null;
    const value = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    if (
      !exactSelectionKeys(value, ["schema", "cardId", "slug", "outcomeHash", "selection"]) ||
      value.schema !== "senior-away-selection/1" || value.cardId !== cardId ||
      value.slug !== slug || value.outcomeHash !== outcomeHash
    ) return null;
    return parseMaintenanceSelection(
      MAINTENANCE_SELECTION_PREFIX + JSON.stringify(value.selection),
    );
  } catch {
    return null;
  }
}

function readSeniorCompletion(path: string, cardId: string): SeniorCompletion | null {
  if (!existsSync(path)) return null;
  try {
    const metadata = lstatSync(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) return null;
    const value = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    if (
      value.schema !== "senior-away-completion/1" || value.cardId !== cardId ||
      !Array.isArray(value.changedPaths) || value.changedPaths.length < 1 || value.changedPaths.length > 256 ||
      !value.changedPaths.every((item) => typeof item === "string" && normalizeRelative(item) === item) ||
      new Set(value.changedPaths).size !== value.changedPaths.length ||
      typeof value.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug) ||
      typeof value.candidateOid !== "string" || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value.candidateOid) ||
      typeof value.fingerprint !== "string" || !/^[0-9a-f]{64}$/.test(value.fingerprint) ||
      typeof value.outcomeHash !== "string" || !/^[0-9a-f]{64}$/.test(value.outcomeHash) ||
      typeof value.branch !== "string" ||
      !/^pi-away[/](?:rm-\d{3,}|mt-[0-9a-f]{12})-[0-9a-f]{8}$/.test(value.branch) ||
      typeof value.pullRequestUrl !== "string" || !/^https:[/][/]github[.]com[/]/.test(value.pullRequestUrl)
    ) return null;
    return value as unknown as SeniorCompletion;
  } catch {
    return null;
  }
}

function validSeniorCompletion(repoRoot: string, card: AwayRoadmapCard): boolean {
  const root = seniorRunRoot(repoRoot, card.cardId);
  const outcomeHash = createHash("sha256").update(card.objective).digest("hex");
  const completion = readSeniorCompletion(join(root, "completion.json"), card.cardId);
  if (completion !== null && completion.slug === card.slug && completion.outcomeHash === outcomeHash) {
    return true;
  }
  const idle = readSeniorIdle(join(root, "idle.json"), card.cardId);
  return idle !== null && idle.slug === card.slug && idle.outcomeHash === outcomeHash;
}

export async function runAwayOnce(
  request: AwayRunRequest,
  dependencies: AwayControllerDependencies = {},
): Promise<AwayRunResult> {
  const env = dependencies.env ?? process.env;
  const marker = childMarker(env);
  if (marker) {
    return {
      kind: "blocked",
      message: `Away mode may run only in the root process (found ${marker}).`,
    };
  }
  const readRoadmap =
    dependencies.readRoadmap ??
    ((repoRoot: string) => readFileSync(join(repoRoot, ".pi", "ROADMAP.md"), "utf8"));
  const execute = dependencies.execute ?? executeSeniorWorkflowAway;
  const isCompleted = dependencies.isCompleted ?? validSeniorCompletion;

  try {
    const repoRoot = realpathSync(request.repoRoot);
    if (!lstatSync(repoRoot).isDirectory()) throw new Error("away controller: invalid repository root");
    const explicit = request.objective?.trim();
    const roadmap = explicit ? "" : readRoadmap(repoRoot);
    const excluded = new Set<string>();
    let card = explicit ? null : selectAwayRoadmapCard(roadmap, excluded);
    while (card && isCompleted(repoRoot, card)) {
      excluded.add(card.cardId);
      card = selectAwayRoadmapCard(roadmap, excluded);
    }

    let maintenance = false;
    if (!card) {
      maintenance = true;
      const maintenanceObjective = objective(explicit ?? STANDING_MAINTENANCE_OBJECTIVE);
      const head = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      }).trim();
      const identity = deriveMaintenanceWorkIdentity(head, maintenanceObjective);
      card = { ...identity, objective: maintenanceObjective };
      if (isCompleted(repoRoot, card)) {
        return {
          kind: "no-work",
          message: "Maintenance is current for this HEAD; continuous polling remains active.",
        };
      }
    }

    const supplemental = request.supplementalObjective?.trim();
    const selectedObjective = maintenance ? card.objective : [
      card.objective,
      supplemental ? "Supplemental operator context: " + supplemental : "",
    ].filter(Boolean).join("\n");
    const resolved: ResolvedAwayRunRequest = {
      ...request,
      repoRoot,
      objective: objective(selectedObjective),
      cardId: card.cardId,
      slug: card.slug,
      cardOutcome: maintenance ? undefined : card.objective,
    };
    if (request.dryRun) {
      return {
        kind: "dry-run",
        objective: resolved.objective,
        cardId: resolved.cardId,
        slug: resolved.slug,
      };
    }
    const result = dependencies.execute
      ? await execute(resolved)
      : await withRepositoryLease(
          repositoryLockPath(repoRoot),
          () => execute(resolved),
        );
    return result.kind === "completed"
      ? {
          ...result,
          objective: resolved.objective,
          cardId: resolved.cardId ?? result.cardId,
        }
      : result;
  } catch (error) {
    return { kind: "blocked", message: error instanceof Error ? error.message : String(error) };
  }
}

export async function runSeniorAwayController(
  request: AwayControllerRequest,
  dependencies: { runOnce?: (request: AwayRunRequest) => Promise<AwayRunResult> } = {},
): Promise<AwayControllerResult> {
  const result = await (dependencies.runOnce ?? runAwayOnce)({
    repoRoot: request.repoRoot,
    objective: request.objective,
    supplementalObjective: request.supplementalObjective,
    dryRun: false,
  });
  if (result.kind === "no-work") return { kind: "no-work", reason: result.message };
  if (result.kind === "blocked") return { kind: "blocked", message: result.message };
  if (result.kind === "dry-run") return { kind: "blocked", message: "Senior controller returned dry-run unexpectedly." };
  if (
    !result.cardId || !result.slug || !result.candidateOid || !result.fingerprint ||
    !/^(?:RM-\d{3,}|MT-[0-9a-f]{12})$/.test(result.cardId) ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result.slug) ||
    !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(result.candidateOid) ||
    !/^[0-9a-f]{64}$/.test(result.fingerprint)
  ) {
    return { kind: "blocked", message: "Senior controller completion evidence is malformed." };
  }
  return {
    kind: "completed",
    cardId: result.cardId,
    slug: result.slug,
    candidateOid: result.candidateOid,
    fingerprint: result.fingerprint,
  };
}

export interface ContinuousSeniorServiceOptions {
  repoRoot: string;
  signal?: AbortSignal;
  idleDelayMs?: number;
  blockedDelayMs?: number;
  maximumBlockedDelayMs?: number;
  completedDelayMs?: number;
  maxCycles?: number;
  runOnce?: (request: AwayRunRequest) => Promise<AwayRunResult>;
  wait?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  report?: (result: AwayRunResult) => void | Promise<void>;
}

function abortableWait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, milliseconds);
    function done(): void {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

/** Poll forever with bounded backoff; every cycle re-observes durable state before mutation. */
export async function runContinuousSeniorService(
  options: ContinuousSeniorServiceOptions,
): Promise<void> {
  const runOnce = options.runOnce ?? ((request) => runAwayOnce(request));
  const wait = options.wait ?? abortableWait;
  const report = options.report ?? ((result) => {
    globalThis.process.stdout.write(JSON.stringify({ timestamp: Date.now(), ...result }) + "\n");
  });
  const idleDelay = options.idleDelayMs ?? 5 * 60 * 1000;
  const firstBlockedDelay = options.blockedDelayMs ?? 30 * 1000;
  const maximumBlockedDelay = options.maximumBlockedDelayMs ?? 60 * 60 * 1000;
  const completedDelay = options.completedDelayMs ?? 1000;
  let blockedDelay = firstBlockedDelay;
  let cycles = 0;
  while (!options.signal?.aborted && (options.maxCycles === undefined || cycles < options.maxCycles)) {
    const result = await runOnce({ repoRoot: options.repoRoot, dryRun: false });
    await report(result);
    cycles += 1;
    let delay: number;
    if (result.kind === "blocked") {
      delay = blockedDelay;
      blockedDelay = Math.min(maximumBlockedDelay, blockedDelay * 2);
    } else {
      blockedDelay = firstBlockedDelay;
      delay = result.kind === "completed" ? completedDelay : idleDelay;
    }
    if (!options.signal?.aborted && (options.maxCycles === undefined || cycles < options.maxCycles)) {
      await wait(delay, options.signal);
    }
  }
}

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function seniorRunId(repoRoot: string, cardId: string): string {
  return "run-" + createHash("sha256").update(repoRoot + "\0" + cardId).digest("hex").slice(0, 24);
}

function seniorRunRoot(repoRoot: string, cardId: string): string {
  return join(stateDirectory(), "pi-away", "senior-runs", seniorRunId(repoRoot, cardId));
}

function stateDirectory(): string {
  const state = process.env.XDG_STATE_HOME || join(homedir(), ".local", "state");
  if (!isAbsolute(state)) throw new Error("away controller: XDG_STATE_HOME must be absolute");
  return state;
}

function repositoryLockPath(repoRoot: string): string {
  const repositoryKey = createHash("sha256").update(repoRoot).digest("hex");
  return join(stateDirectory(), "pi-away", "locks", `${repositoryKey}.lock`);
}

function makeRunDirs(): {
  runId: string;
  control: string;
  staging: string;
  attest: string;
} {
  const runId = `away-${Date.now().toString(36)}-${randomBytes(6).toString("hex")}`;
  const root = join(stateDirectory(), "pi-away", "runs", runId);
  const control = join(root, "control");
  const staging = join(root, "staging");
  const attest = join(root, "attest");
  for (const path of [root, control, staging, attest]) {
    mkdirSync(path, { recursive: true, mode: 0o700 });
  }
  return { runId, control, staging, attest };
}

function collectCandidates(staging: string, repoRoot: string, manifest: Manifest): SettlementCandidate[] {
  const root = realpathSync(staging);
  const candidates: SettlementCandidate[] = [];
  let bytes = 0;
  const walk = (directory: string): void => {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      const metadata = lstatSync(absolute);
      if (metadata.isSymbolicLink()) throw new Error("away controller: staging symlink rejected");
      if (metadata.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!metadata.isFile()) throw new Error("away controller: non-regular staging entry rejected");
      const path = normalizeRelative(relative(root, absolute).split(sep).join("/"));
      if (path.includes("\0") || /[\r\n]/.test(path)) {
        throw new Error("away controller: staged path contains a control character");
      }
      if (isProtected(path, manifest.protected_paths, manifest.runtime_protected_paths)) {
        throw new Error(`away controller: protected staged path rejected: ${path}`);
      }
      const destination = resolveSourceView(
        repoRoot,
        path,
        manifest.protected_paths,
        manifest.runtime_protected_paths,
      );
      if (destination.rel.split(sep).join("/") !== path) {
        throw new Error(`away controller: symlinked destination rejected: ${path}`);
      }
      bytes += metadata.size;
      if (bytes > manifest.limits.cgroup_storage_bytes) {
        throw new Error("away controller: staged bytes exceed the storage limit");
      }
      candidates.push({ path, hash: hashFile(absolute) });
      if (candidates.length > manifest.limits.max_file_count) {
        throw new Error("away controller: staged file count exceeds the limit");
      }
    }
  };
  walk(root);
  return candidates.sort((left, right) => left.path.localeCompare(right.path));
}

function writerPrompt(goal: string): string {
  return [
    "You are the isolated one-shot away writer. Treat the objective as operator data.",
    `Objective: ${JSON.stringify(goal)}`,
    "Implement only the smallest root-cause change needed.",
    "Use fabric_exec with captured extensions.away_read/list/search/stage_write only.",
    "Every write must be complete file bytes through away_stage_write at an exact relative path.",
    "Do not call commit, discard, or attest; the host settles after this turn.",
    "Do not use shell, Git, GitHub, network, subagents, publication, deletion, or protected paths.",
    "Inspect, stage, and end the turn. If no write is needed, perform one bounded read.",
  ].join("\n");
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function waitForAgent(lane: Launcher, timeoutMs: number): Promise<void> {
  const iterator = lane.events()[Symbol.asyncIterator]();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const event = await withTimeout(
      iterator.next(),
      Math.max(1, deadline - Date.now()),
      "away controller: lane settlement timed out",
    );
    if (event.done) throw new Error("away controller: lane exited before settlement");
    if (event.value.type === "agent_settled") return;
  }
  throw new Error("away controller: lane settlement timed out");
}

async function waitForReceipt(attest: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (listExtensionReceipts(attest).length) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("away controller: internal settlement produced no terminal receipt");
}

function stableClosure(manifestPath: string, hash: string, extraPaths: string[] = []): void {
  if (!verifyClosure(manifestPath, WRITER_LANE, hash, { extraPaths }).ok) {
    throw new Error("away controller: immutable startup closure drifted");
  }
}

function validateReceipt(
  attest: string,
  manifestHash: string,
  closureHash: string,
  manifest: Manifest,
): void {
  const paths = listExtensionReceipts(attest);
  if (paths.length !== 1) {
    throw new Error(`away controller: expected one extension receipt, found ${paths.length}`);
  }
  const receipt = JSON.parse(readFileSync(paths[0], "utf8")) as TerminalReceipt;
  assertReceiptSafe(receipt);
  if (
    receipt.profileId !== WRITER_LANE ||
    receipt.laneId !== WRITER_LANE ||
    receipt.outcome !== "completed" ||
    !receipt.wrapperFsynced
  ) {
    throw new Error("away controller: terminal receipt is not a completed writer result");
  }
  if (receipt.manifestHash !== manifestHash || receipt.closureHash !== closureHash) {
    throw new Error("away controller: terminal receipt hash mismatch");
  }
  for (const [key, value] of Object.entries(manifest.limits)) {
    if (receipt.limits[key] !== value) {
      throw new Error(`away controller: terminal receipt limit mismatch: ${key}`);
    }
  }
  if (!receipt.wrapperReceiptPath || !existsSync(receipt.wrapperReceiptPath)) {
    throw new Error("away controller: wrapper receipt is missing");
  }
  if (!readWrapperReceipt(attest, WRITER_LANE)) {
    throw new Error("away controller: no valid writer wrapper receipt");
  }
}

function verifyCommitted(candidates: SettlementCandidate[], repoRoot: string, manifest: Manifest): void {
  for (const candidate of candidates) {
    const destination = resolveSourceView(
      repoRoot,
      candidate.path,
      manifest.protected_paths,
      manifest.runtime_protected_paths,
    );
    if (
      destination.rel.split(sep).join("/") !== candidate.path ||
      !lstatSync(destination.abs).isFile() ||
      hashFile(destination.abs) !== candidate.hash
    ) {
      throw new Error(`away controller: committed candidate mismatch: ${candidate.path}`);
    }
  }
}

export async function executeSeniorWorkflowAway(
  request: ResolvedAwayRunRequest,
  options: {
    runId?: string;
    stateRoot?: string;
    timeoutMs?: number;
    piPath?: string;
    env?: NodeJS.ProcessEnv;
    processArgv?: readonly string[];
    runWorkflow?: typeof runRootPiWorkflow;
  } = {},
): Promise<AwayRunResult> {
  if (!request.cardId || !request.slug) {
    return { kind: "blocked", message: "Direct senior workflow requires one selected work identity and slug." };
  }
  const runId = options.runId ?? seniorRunId(request.repoRoot, request.cardId);
  const runWorkflow = options.runWorkflow ?? runRootPiWorkflow;
  const root = options.stateRoot ?? seniorRunRoot(request.repoRoot, request.cardId);
  const workspace = join(root, "workspace");
  const sessions = join(root, "sessions");
  const cursorPath = join(root, "workflow-cursor.jsonl");
  const completionPath = join(root, "completion.json");
  const idlePath = join(root, "idle.json");
  const selectionPath = join(root, "selection.json");
  const reservationPath = join(root, "reservation.json");
  const maintenance = request.cardId.startsWith("MT-");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const rootMetadata = lstatSync(root);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    return { kind: "blocked", runId, message: "Retained senior workflow root is unsafe." };
  }
  mkdirSync(sessions, { recursive: true, mode: 0o700 });
  const sessionsMetadata = lstatSync(sessions);
  if (!sessionsMetadata.isDirectory() || sessionsMetadata.isSymbolicLink()) {
    return { kind: "blocked", runId, message: "Retained senior session directory is unsafe." };
  }
  const outcomeHash = createHash("sha256").update(request.cardOutcome ?? request.objective).digest("hex");
  const persistIdle = (reason: string) => writeFsyncedJsonExclusive(idlePath, {
    schema: "senior-away-idle/1",
    cardId: request.cardId,
    slug: request.slug,
    outcomeHash,
    reason,
  } satisfies SeniorIdle);
  const reservation = { runId, cardId: request.cardId, slug: request.slug, outcomeHash };
  if (existsSync(reservationPath)) {
    const reservationMetadata = lstatSync(reservationPath);
    if (!reservationMetadata.isFile() || reservationMetadata.isSymbolicLink()) {
      return { kind: "blocked", runId, message: "Retained senior reservation path is unsafe." };
    }
    const observed = JSON.parse(readFileSync(reservationPath, "utf8"));
    if (JSON.stringify(observed) !== JSON.stringify(reservation)) {
      return { kind: "blocked", runId, message: "Retained senior workflow reservation drifted." };
    }
  } else {
    const { closeSync, fsyncSync, openSync, writeSync } = await import("node:fs");
    const fd = openSync(reservationPath, "wx", 0o600);
    try {
      writeSync(fd, JSON.stringify(reservation) + "\n");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }
  if (existsSync(completionPath)) {
    const completion = readSeniorCompletion(completionPath, request.cardId);
    if (!completion || completion.slug !== request.slug || completion.outcomeHash !== outcomeHash) {
      return { kind: "blocked", runId, message: "Retained senior workflow completion evidence is malformed." };
    }
    return {
      kind: "completed", runId, cardId: completion.cardId, slug: completion.slug,
      changedPaths: completion.changedPaths, branch: completion.branch,
      pullRequestUrl: completion.pullRequestUrl, candidateOid: completion.candidateOid,
      fingerprint: completion.fingerprint,
    };
  }
  if (existsSync(idlePath)) {
    const idle = readSeniorIdle(idlePath, request.cardId);
    if (!idle || idle.slug !== request.slug || idle.outcomeHash !== outcomeHash) {
      return { kind: "blocked", runId, message: "Retained senior workflow idle evidence is malformed." };
    }
    return { kind: "no-work", message: idle.reason };
  }

  const { execFileSync } = await import("node:child_process");
  const git = (cwd: string, args: string[]): string => execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  const basePath = join(root, "base-oid");
  let baseOid: string;
  if (existsSync(basePath)) {
    const baseMetadata = lstatSync(basePath);
    if (!baseMetadata.isFile() || baseMetadata.isSymbolicLink()) {
      return { kind: "blocked", message: "Retained senior workflow base path is unsafe.", runId };
    }
    baseOid = readFileSync(basePath, "utf8").trim();
    if (!/^[0-9a-f]{40,64}$/.test(baseOid)) {
      return { kind: "blocked", message: "Retained senior workflow base OID is malformed.", runId };
    }
  } else {
    baseOid = git(request.repoRoot, ["rev-parse", "HEAD"]);
    const { closeSync, fsyncSync, openSync, writeSync } = await import("node:fs");
    const baseFd = openSync(basePath, "wx", 0o600);
    try {
      writeSync(baseFd, baseOid + "\n");
      fsyncSync(baseFd);
    } finally {
      closeSync(baseFd);
    }
  }
  if (maintenance) {
    const expected = deriveMaintenanceWorkIdentity(baseOid, request.objective);
    if (expected.cardId !== request.cardId || expected.slug !== request.slug) {
      return {
        kind: "blocked",
        runId,
        message: "Maintenance identity does not match the selected base; retry on the current HEAD.",
      };
    }
  }
  if (!existsSync(workspace)) {
    git(request.repoRoot, ["worktree", "add", "--detach", "--no-checkout", workspace, baseOid]);
    git(workspace, ["checkout", "--detach", baseOid]);
  } else {
    if (realpathSync(git(workspace, ["rev-parse", "--show-toplevel"])) !== realpathSync(workspace)) {
      return { kind: "blocked", message: "Retained senior workflow path is not the expected worktree.", runId };
    }
    const mergeBase = git(workspace, ["merge-base", baseOid, "HEAD"]);
    if (mergeBase !== baseOid) {
      return { kind: "blocked", message: "Retained senior workflow worktree diverged from its selected base.", runId };
    }
  }

  const { validateReadyPacket } = await import("./controller.ts");
  let packetReady = true;
  try { validateReadyPacket(workspace); } catch { packetReady = false; }
  let maintenanceSelection: MaintenanceSelection | undefined;
  if (maintenance && existsSync(selectionPath)) {
    maintenanceSelection = readStoredMaintenanceSelection(
      selectionPath, request.cardId, request.slug, outcomeHash,
    ) ?? undefined;
    if (!maintenanceSelection) {
      return { kind: "blocked", runId, message: "Retained maintenance selection evidence is malformed." };
    }
  }
  if (maintenanceSelection?.kind === "no-change") {
    await persistIdle(maintenanceSelection.reason);
    return { kind: "no-work", message: maintenanceSelection.reason };
  }
  const selectedObjective = maintenanceSelection?.kind === "selected"
    ? objective(
        maintenanceSelection.objective +
        "\nAcceptance evidence: " + maintenanceSelection.acceptance,
      )
    : request.objective;
  let workflow = buildWorkflowCommands({
    packetReady,
    slug: request.slug,
    ...(maintenance ? { workId: request.cardId } : { cardId: request.cardId }),
    outcome: selectedObjective,
    runGc: packetReady,
  });

  const validSessionFile = (value: unknown): value is string => {
    if (typeof value !== "string" || !isAbsolute(value) || !existsSync(value)) return false;
    const fromSessions = relative(sessions, value);
    if (fromSessions === ".." || fromSessions.startsWith(".." + sep) || isAbsolute(fromSessions)) return false;
    const metadata = lstatSync(value);
    return metadata.isFile() && !metadata.isSymbolicLink();
  };
  let startIndex = 0;
  let sessionFile: string | undefined;
  if (existsSync(cursorPath)) {
    const cursorMetadata = lstatSync(cursorPath);
    if (!cursorMetadata.isFile() || cursorMetadata.isSymbolicLink()) {
      return { kind: "blocked", message: "Retained senior workflow cursor path is unsafe.", runId };
    }
    const lines = readFileSync(cursorPath, "utf8").split(/\r?\n/).filter(Boolean);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        const cursor = JSON.parse(lines[index]) as Record<string, unknown>;
        if (
          cursor.schema !== "senior-away-cursor/1" || cursor.cardId !== request.cardId ||
          !Number.isSafeInteger(cursor.nextIndex) || (cursor.nextIndex as number) < 0 ||
          !validSessionFile(cursor.sessionFile)
        ) continue;
        startIndex = Math.min(cursor.nextIndex as number, workflow.commands.length);
        sessionFile = cursor.sessionFile;
        break;
      } catch {
        continue;
      }
    }
  }

  const timeoutMs = options.timeoutMs ?? 60 * 60 * 1000;
  const checkpoint = async (nextIndex: number, settledSessionFile: string): Promise<void> => {
    if (!validSessionFile(settledSessionFile)) {
      throw new Error("Root Pi reported a session file outside the retained session directory.");
    }
    const { closeSync, fsyncSync, openSync, writeSync } = await import("node:fs");
    const fd = openSync(cursorPath, "a", 0o600);
    try {
      writeSync(fd, JSON.stringify({
        schema: "senior-away-cursor/1", cardId: request.cardId,
        nextIndex, sessionFile: settledSessionFile,
      }) + "\n");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  };

  const makeLaunchSpec = (resume?: string) => createRootPiLaunchSpec({
    repoRoot: workspace,
    sessionDir: sessions,
    sessionFile: resume,
    piPath: resolveRootPiBinary(options.piPath, options.env, options.processArgv),
  });

  if (maintenance && packetReady && !maintenanceSelection) {
    if (startIndex > 1) {
      return { kind: "blocked", runId, message: "Maintenance lifecycle advanced without durable selection evidence." };
    }
    const policyHead = git(workspace, ["rev-parse", "HEAD"]);
    const policyStatus = git(workspace, ["status", "--porcelain=v1", "--untracked-files=all"]);
    if (policyHead !== baseOid || policyStatus !== "") {
      return { kind: "blocked", runId, message: "Maintenance policy requires a clean exact-base workspace." };
    }
    const policy = await runWorkflow({
      launch: makeLaunchSpec(sessionFile),
      commands: [workflow.commands[0]],
      startIndex: Math.min(startIndex, 1),
      timeoutMs,
      validateSettlement(_command, assistantText) {
        parseMaintenanceSelection(assistantText ?? "");
      },
      checkpoint,
    });
    if (policy.kind === "blocked") return { ...policy, runId };
    if (
      git(workspace, ["rev-parse", "HEAD"]) !== policyHead ||
      git(workspace, ["status", "--porcelain=v1", "--untracked-files=all"]) !== policyStatus
    ) {
      return { kind: "blocked", runId, message: "Maintenance policy turn mutated repository state." };
    }
    try {
      maintenanceSelection = parseMaintenanceSelection(policy.assistantText ?? "");
    } catch (error) {
      return {
        kind: "blocked",
        runId,
        message: error instanceof Error ? error.message : String(error),
      };
    }
    await writeFsyncedJsonExclusive(selectionPath, {
      schema: "senior-away-selection/1",
      cardId: request.cardId,
      slug: request.slug,
      outcomeHash,
      selection: maintenanceSelection,
    } satisfies StoredMaintenanceSelection);
    if (maintenanceSelection.kind === "no-change") {
      await persistIdle(maintenanceSelection.reason);
      return { kind: "no-work", message: maintenanceSelection.reason };
    }
    const boundedObjective = objective(
      maintenanceSelection.objective +
      "\nAcceptance evidence: " + maintenanceSelection.acceptance,
    );
    workflow = buildWorkflowCommands({
      packetReady,
      slug: request.slug,
      workId: request.cardId,
      outcome: boundedObjective,
      runGc: packetReady,
    });
    startIndex = 1;
    sessionFile = policy.sessionFile;
  } else if (maintenanceSelection && startIndex < 1) {
    return { kind: "blocked", runId, message: "Maintenance selection is missing its fsynced policy cursor." };
  }

  const launchSpec = makeLaunchSpec(sessionFile);
  const result = await runWorkflow({
    launch: launchSpec,
    commands: workflow.commands,
    startIndex,
    timeoutMs,
    validateSettlement(command, assistantText) {
      if (command.startsWith("/workflow ") && !/\bREADY FOR \/create\b/.test(assistantText ?? "")) {
        throw new Error("Workflow policy prompt did not authorize the create phase.");
      }
      if (command.startsWith("/create ")) {
        for (const name of ["PLAN.md", "TODO.md"]) {
          const sentinel = join(workspace, ".pi", "artifacts", request.slug!, name);
          if (!existsSync(sentinel)) throw new Error("Create did not establish " + name + ".");
          const metadata = lstatSync(sentinel);
          if (!metadata.isFile() || metadata.isSymbolicLink()) {
            throw new Error("Create produced an unsafe namespace sentinel: " + name);
          }
        }
      }
    },
    checkpoint,
  });
  if (result.kind === "blocked") return { ...result, runId };
  if (workflow.requiresOperator) {
    return {
      kind: "blocked",
      runId,
      message: "Initialization preview is ready; operator confirmation and context reload are required before autonomous work.",
    };
  }
  if (!result.assistantText || !/^\s*(?:#+\s*)?Result\s*:\s*VERIFIED\b/im.test(result.assistantText)) {
    return { kind: "blocked", runId, message: "Lifecycle verification did not produce an unambiguous VERIFIED result." };
  }
  const changedPaths = [...new Set([
    ...git(workspace, ["diff", "--name-only", "-z", baseOid]).split("\0").filter(Boolean),
    ...git(workspace, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean),
  ])].sort();
  if (!changedPaths.length) {
    return { kind: "blocked", runId, message: "Verified lifecycle produced no candidate paths." };
  }
  const manifestPath = join(request.repoRoot, ".pi", "away-sandbox.json");
  const { manifest } = loadManifest(manifestPath);
  const hashes: Record<string, string> = {};
  for (const candidatePath of changedPaths) {
    const normalized = normalizeRelative(candidatePath);
    if (normalized !== candidatePath || isDirectSeniorCandidateProtected(normalized)) {
      return { kind: "blocked", runId, message: "Candidate path is protected or malformed: " + candidatePath };
    }
    const absolute = join(workspace, normalized);
    if (!existsSync(absolute) || !lstatSync(absolute).isFile()) {
      return { kind: "blocked", runId, message: "Candidate path is not a regular file: " + candidatePath };
    }
    hashes[normalized] = hashFile(absolute);
  }

  const { createOrObserveCandidateCommit, deriveAwayBranch, publishDedicatedBranch } =
    await import("./git-broker.ts");
  const { createOrGetDraftPullRequest } = await import("./github-broker.ts");
  const { githubRepository, verifyProductionCommit } = await import("./production-host.ts");
  const branch = deriveAwayBranch(request.cardId, runId);
  const candidate = createOrObserveCandidateCommit({
    repoRoot: workspace,
    baseOid,
    branch,
    runId,
    cardId: request.cardId,
    paths: changedPaths,
    hashes,
  });
  const verification = verifyProductionCommit({
    oid: candidate.oid, repoPath: workspace, runRoot: root, manifestPath,
  });
  const fingerprint = createHash("sha256").update(verification.receiptBytes).digest("hex");
  publishDedicatedBranch({ repoRoot: workspace, remote: "origin", branch, oid: candidate.oid });
  const pull = await createOrGetDraftPullRequest({
    repository: githubRepository(workspace),
    hostname: "github.com",
    base: "main",
    head: branch,
    expectedHeadOid: candidate.oid,
    title: request.cardId + " away candidate",
    body: "Automated senior-engineer away candidate for " + request.cardId + ".\n\nRun: " + runId,
    requestId: runId + ":draft",
  });
  const completion: SeniorCompletion = {
    schema: "senior-away-completion/1",
    cardId: request.cardId,
    changedPaths,
    branch,
    pullRequestUrl: pull.url,
    candidateOid: candidate.oid,
    fingerprint,
    outcomeHash,
    slug: request.slug,
  };
  const { closeSync, fsyncSync, openSync, writeSync } = await import("node:fs");
  const completionFd = openSync(completionPath, "wx", 0o600);
  try {
    writeSync(completionFd, JSON.stringify(completion) + "\n");
    fsyncSync(completionFd);
  } finally {
    closeSync(completionFd);
  }
  return {
    kind: "completed", runId, changedPaths, cardId: request.cardId, slug: request.slug,
    branch, pullRequestUrl: pull.url, candidateOid: candidate.oid, fingerprint,
  };
}

export async function executeConfinedAway(
  request: ResolvedAwayRunRequest,
): Promise<AwayRunResult> {
  const repoRoot = realpathSync(request.repoRoot);
  if (!lstatSync(repoRoot).isDirectory()) throw new Error("away controller: invalid repository root");
  const manifestPath = realpathSync(join(repoRoot, ".pi", "away-sandbox.json"));
  const { manifest, hash: manifestHash } = loadManifest(manifestPath);
  const adapterPath = realpathSync(fileURLToPath(import.meta.url));
  const extensionPath = realpathSync(join(repoRoot, ".pi", "extensions", "away", "index.ts"));
  const reservationControllerPath = realpathSync(
    join(repoRoot, ".pi", "away-runtime", "controller.ts"),
  );
  const extraPaths = [adapterPath, extensionPath, reservationControllerPath];
  const base = resolveClosure(manifestPath, WRITER_LANE, { requireAll: true });
  const control = resolveClosure(manifestPath, WRITER_LANE, {
    requireAll: true,
    extraPaths,
  });
  const dirs = makeRunDirs();

  try {
    return await withRepositoryLease(repositoryLockPath(repoRoot), async () => {
      stableClosure(manifestPath, base.hash);
      stableClosure(manifestPath, control.hash, extraPaths);
      const lane = launch({
      manifestPath,
      profileId: WRITER_LANE,
      controlCwd: dirs.control,
      pinExecPath: true,
      processEnv: {
        ...process.env,
        PI_AWAY_LANE: WRITER_LANE,
        PI_AWAY_MANIFEST: manifestPath,
        PI_AWAY_STAGING_ROOT: dirs.staging,
        PI_AWAY_ATTEST_DIR: dirs.attest,
        PI_AWAY_REPO_ROOT: repoRoot,
        PI_AWAY_INNER_GUEST: realpathSync(
          join(repoRoot, ".pi", "away-runtime", "inner-guest.mjs"),
        ),
      },
    });
    if (lane.closureHash !== base.hash) {
      throw new Error("away controller: launcher closure mismatch");
    }

    let candidates: SettlementCandidate[] = [];
    const timeout = manifest.limits.executor_timeout_ms;
    await lane.run(async (send) => {
      send({ type: "prompt", id: `${dirs.runId}-write`, message: writerPrompt(request.objective) });
      try {
        await waitForAgent(lane, timeout);
      } catch (error) {
        try {
          send({ type: "abort", id: `${dirs.runId}-abort` });
        } catch {}
        throw error;
      }
      stableClosure(manifestPath, base.hash);
      stableClosure(manifestPath, control.hash, extraPaths);
      candidates = collectCandidates(dirs.staging, repoRoot, manifest);
      if (!readWrapperReceipt(dirs.attest, WRITER_LANE)) {
        throw new Error("away controller: writer turn produced no fsynced wrapper receipt");
      }
      const payload = Buffer.from(
        JSON.stringify({ schema: AWAY_SETTLEMENT_SCHEMA, candidates }),
        "utf8",
      ).toString("base64url");
      send({
        type: "prompt",
        id: `${dirs.runId}-settle`,
        message: `/away-settle ${payload}`,
      });
      await waitForReceipt(dirs.attest, timeout);
    });

    stableClosure(manifestPath, base.hash);
    stableClosure(manifestPath, control.hash, extraPaths);
    validateReceipt(dirs.attest, manifestHash, base.hash, manifest);
    verifyCommitted(candidates, repoRoot, manifest);
    return {
        kind: "completed",
        runId: dirs.runId,
        changedPaths: candidates.map((candidate) => candidate.path),
      };
    });
  } catch (error) {
    return {
      kind: "blocked",
      runId: dirs.runId,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

if (
  globalThis.process.argv[1] &&
  realpathSync(globalThis.process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  const requestedRoot = globalThis.process.argv[2];
  if (!requestedRoot || !isAbsolute(requestedRoot)) {
    globalThis.process.stderr.write("usage: supervise-away.ts /absolute/repository/root\n");
    globalThis.process.exitCode = 2;
  } else {
    const repoRoot = realpathSync(requestedRoot);
    if (!lstatSync(repoRoot).isDirectory()) {
      throw new Error("senior service: repository root is not a directory");
    }
    const cancellation = new AbortController();
    globalThis.process.once("SIGINT", () => cancellation.abort());
    globalThis.process.once("SIGTERM", () => cancellation.abort());
    void runContinuousSeniorService({ repoRoot, signal: cancellation.signal }).catch((error) => {
      globalThis.process.stderr.write(
        "senior service failed: " + (error instanceof Error ? error.message : String(error)) + "\n",
      );
      globalThis.process.exitCode = 1;
    });
  }
}