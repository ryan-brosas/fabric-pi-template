import { createHash, randomBytes } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  writeSync,
} from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve, sep } from "node:path";

import {
  deriveGitFacts,
  driveReservedLifecycle,
  parseRoadmap,
  reconcileAwayRun,
  reserveNext,
  selectAwayRoadmapCard,
  validateReadyPacket,
  validateRuntimeClosures,
  withRepositoryLease,
  type AwayCandidateObservation,
  type AwayCandidateRequest,
  type AwayControllerRequest,
  type AwayControllerResult,
  type AwayEffectHost,
  type AwayLifecycleCompleted,
  type AwayLifecycleHost,
  type AwayLifecycleInvocation,
  type AwayLifecycleObservation,
  type AwayLifecyclePhase,
  type AwayNamespaceState,
  type ReconciledAwayRun,
  type ReserveResult,
} from "./controller.ts";
import { openLedger, type Ledger, type LedgerRecord } from "./ledger.ts";
import { listExtensionReceipts } from "./attestation.ts";
import { loadManifest } from "./bootstrap.ts";
import {
  createOrObserveCandidateCommit,
  deriveAwayBranch,
  observeRemoteBranch,
  publishDedicatedBranch,
} from "./git-broker.ts";
import { createOrGetDraftPullRequest, observeDraftPullRequest } from "./github-broker.ts";
import { launch as launchLane } from "./launcher.ts";
import { isBlockingRpcUiRequest, type RpcEvent, type RpcRecord } from "./rpc.ts";
import { assertVerifierReceiptSafe, verify, type VerifierReceipt } from "./verifier.ts";

const REPOSITORY_ID = /^repo-[0-9a-f]{64}$/;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const CARD_ID = /^RM-\d{3,}$/;
const SLUG = /^(?=.{1,64}$)[a-z0-9]+(?:-[a-z0-9]+)*$/;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const HASH = /^[0-9a-f]{64}$/;
const MAX_EVENTS = 4096;
const MAX_ASSISTANT_TEXT = 64 * 1024;
const PHASE_PROFILE = { create: "writer", ship: "writer", verify: "verifier" } as const;
const PROTECTED_PREFIXES = [
  ".pi/away-runtime/", ".pi/extensions/", ".pi/npm/", ".pi/fabric/",
  ".pi/git/", ".pi/sessions/", ".pi/prompts/",
];
const PROTECTED_PATHS = new Set([
  ".pi/away-sandbox.json", ".pi/fabric.json", ".pi/settings.json", "AGENTS.md",
]);

export interface ProductionHostIdentity {
  repoRoot: string;
  stateRoot: string;
  manifestPath: string;
  repositoryId: string;
  runId: string;
  cardId: string;
  slug: string;
  baseOid: string;
}

export interface RetainedPaths {
  repositoryRoot: string;
  runRoot: string;
  workspace: string;
  control: string;
  staging: string;
  attestations: string;
  receipts: string;
}

export type PathKind = "missing" | "file" | "directory" | "symlink" | "other";

export interface RetainedWorkspaceDependencies {
  pathKind(path: string): PathKind;
  realpath(path: string): string;
  mkdir(path: string): void;
  symbolicHead(cwd: string): string | null;
  git(cwd: string, args: string[]): string;
}

export interface LifecycleLauncher {
  readonly closureHash: string;
  request(command: RpcRecord): Promise<RpcRecord>;
  send(command: RpcRecord): void;
  events(): AsyncIterable<RpcEvent>;
  run(callback: (send: (command: RpcRecord) => void) => Promise<void>): Promise<void>;
}

export interface LifecycleRpcOptions {
  launcher: LifecycleLauncher;
  requestId: string;
  prompt: string;
  timeoutMs: number;
  afterSettlement?: (
    assistantText: string,
    request: (command: RpcRecord) => Promise<RpcRecord>,
  ) => Promise<void>;
}

export interface LifecycleRpcResult {
  response: RpcRecord;
  settled: true;
  assistantText: string;
  events: number;
}

export interface PhaseCandidate { path: string; hash: string }

export interface PhaseEvidence {
  schema: "away-phase-evidence/1";
  phase: AwayLifecyclePhase;
  profileId: "writer" | "verifier";
  command: string;
  promptDigest: string;
  repositoryId: string;
  runId: string;
  cardId: string;
  slug: string;
  baseOid: string;
  settlementReceipt: {
    path: string;
    hash: string;
    outcome: "completed" | "failed" | "aborted";
    wrapperFsynced: boolean;
  };
  namespaceState: AwayNamespaceState;
  candidates?: PhaseCandidate[];
  verifiedOid?: string;
  fingerprint?: string;
  repositoryWritesAfterFingerprint?: number;
  claims?: string[];
}

export interface PhaseEvidenceExpectation {
  phase: AwayLifecyclePhase;
  command: string;
  promptDigest: string;
  identity: ProductionHostIdentity;
  expectedOid?: string;
}

export interface BuildLifecyclePromptOptions {
  phase: AwayLifecyclePhase;
  command: string;
  canonicalTemplate: Buffer;
  identity: ProductionHostIdentity;
  expectedOid?: string;
  parentAwayDepth?: number;
}

export interface ProductionHostDependencies extends Partial<RetainedWorkspaceDependencies> {
  launch?(options: {
    manifestPath: string;
    profileId: "writer" | "verifier";
    controlCwd: string;
    processEnv: Record<string, string | undefined>;
  }): LifecycleLauncher;
  readFile?(path: string): Buffer;
  writeReceipt?(path: string, evidence: PhaseEvidence): void;
  listReceipts?(attestations: string): string[];
  createCandidate?(request: {
    repoRoot: string;
    baseOid: string;
    branch: string;
    runId: string;
    cardId: string;
    paths: string[];
    hashes: Record<string, string>;
  }): { oid: string };
  verifyCandidate?(oid: string): { receiptPath: string; receiptBytes: Buffer };
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function requireAbsolute(path: string, label: string): string {
  if (!isAbsolute(path)) throw new Error("production host: " + label + " must be absolute");
  return resolve(path);
}

function requireIdentity(identity: ProductionHostIdentity): void {
  requireAbsolute(identity.repoRoot, "repo root");
  requireAbsolute(identity.stateRoot, "state root");
  requireAbsolute(identity.manifestPath, "manifest path");
  if (!REPOSITORY_ID.test(identity.repositoryId)) throw new Error("production host: invalid repository id");
  if (!RUN_ID.test(identity.runId)) throw new Error("production host: invalid run id");
  if (!CARD_ID.test(identity.cardId)) throw new Error("production host: invalid card id");
  if (!SLUG.test(identity.slug)) throw new Error("production host: invalid slug");
  if (!OID.test(identity.baseOid)) throw new Error("production host: invalid base OID");
}

export function deriveRetainedPaths(stateRoot: string, repositoryId: string, runId: string): RetainedPaths {
  const root = requireAbsolute(stateRoot, "state root");
  if (!REPOSITORY_ID.test(repositoryId)) throw new Error("production host: invalid repository id");
  if (!RUN_ID.test(runId)) throw new Error("production host: invalid run id");
  const repositoryRoot = join(root, "repositories", repositoryId);
  const runRoot = join(repositoryRoot, "runs", runId);
  return {
    repositoryRoot,
    runRoot,
    workspace: join(runRoot, "workspace"),
    control: join(runRoot, "control"),
    staging: join(runRoot, "staging"),
    attestations: join(runRoot, "attestations"),
    receipts: join(runRoot, "receipts"),
  };
}

function defaultPathKind(path: string): PathKind {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) return "symlink";
    if (stat.isDirectory()) return "directory";
    return stat.isFile() ? "file" : "other";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    throw error;
  }
}

function defaultGit(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  }).replace(/[\r\n]+$/, "");
}

const DEFAULT_WORKSPACE_DEPS: RetainedWorkspaceDependencies = {
  pathKind: defaultPathKind,
  realpath: (path) => realpathSync(path),
  mkdir: (path) => mkdirSync(path, { recursive: true }),
  symbolicHead(cwd) {
    const result = spawnSync("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], {
      cwd,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.error) throw new Error("production host: symbolic-ref probe failed: " + result.error.message);
    if (result.status === 1) return null;
    if (result.status !== 0) throw new Error("production host: symbolic-ref probe failed");
    const branch = (result.stdout ?? "").replace(/[\r\n]+$/, "");
    if (branch.length === 0) throw new Error("production host: symbolic-ref returned an empty branch");
    return branch;
  },
  git: defaultGit,
};

export function ensureRetainedWorkspace(
  identity: ProductionHostIdentity,
  paths: RetainedPaths,
  deps: RetainedWorkspaceDependencies = DEFAULT_WORKSPACE_DEPS,
): { kind: "created" | "observed"; path: string; baseOid: string } {
  requireIdentity(identity);
  const expected = deriveRetainedPaths(identity.stateRoot, identity.repositoryId, identity.runId);
  if (paths.workspace !== expected.workspace || paths.runRoot !== expected.runRoot) {
    throw new Error("production host: retained path identity mismatch");
  }
  if (paths.workspace !== paths.runRoot && !paths.workspace.startsWith(paths.runRoot + sep)) {
    throw new Error("production host: workspace escaped retained root");
  }

  const initialKind = deps.pathKind(paths.workspace);
  let kind: "created" | "observed";
  if (initialKind === "missing") {
    deps.mkdir(paths.runRoot);
    deps.git(identity.repoRoot, ["worktree", "add", "--detach", paths.workspace, identity.baseOid]);
    kind = "created";
  } else {
    if (initialKind === "symlink") throw new Error("production host: workspace symlink rejected");
    if (initialKind !== "directory") throw new Error("production host: workspace is not a directory");
    kind = "observed";
  }

  if (deps.realpath(paths.workspace) !== paths.workspace) {
    throw new Error("production host: workspace canonical path mismatch");
  }
  const top = deps.git(paths.workspace, ["rev-parse", "--show-toplevel"]);
  if (deps.realpath(top) !== paths.workspace) throw new Error("production host: workspace is not the worktree root");
  const head = deps.git(paths.workspace, ["rev-parse", "HEAD"]);
  if (head !== identity.baseOid) throw new Error("production host: workspace base mismatch");
  if (deps.symbolicHead(paths.workspace) !== null) {
    throw new Error("production host: workspace must remain detached");
  }
  if (deps.git(paths.workspace, ["status", "--porcelain=v1", "-z"]).length !== 0) {
    throw new Error("production host: workspace must be clean");
  }
  return { kind, path: paths.workspace, baseOid: head };
}

function timeoutAfter<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(new Error("production host: " + label + " timeout")), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolvePromise(value); },
      (error) => { clearTimeout(timer); rejectPromise(error); },
    );
  });
}

function eventText(event: RpcEvent): string {
  if (event.type !== "message_end" || !event.message || typeof event.message !== "object") return "";
  const message = event.message as { role?: string; content?: Array<{ type?: string; text?: string }> };
  if (message.role !== "assistant" || !Array.isArray(message.content)) return "";
  return message.content
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("");
}

export async function runLifecycleRpc(options: LifecycleRpcOptions): Promise<LifecycleRpcResult> {
  if (!RUN_ID.test(options.requestId) || options.requestId.length > 128) {
    throw new Error("production host: invalid lifecycle RPC request id");
  }
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 600_000) {
    throw new Error("production host: invalid lifecycle RPC timeout");
  }
  if (Buffer.byteLength(options.prompt, "utf8") > 1024 * 1024) {
    throw new Error("production host: lifecycle prompt exceeds limit");
  }

  let response: RpcRecord | undefined;
  let settled = false;
  let events = 0;
  let assistantText = "";
  try {
    await options.launcher.run(async () => {
      const pending = options.launcher.request({ type: "prompt", id: options.requestId, message: options.prompt });
      const iterator = options.launcher.events()[Symbol.asyncIterator]();
      while (!settled) {
        const next = await timeoutAfter(iterator.next(), options.timeoutMs, "lifecycle settlement");
        if (next.done) throw new Error("production host: RPC stream ended before agent_settled");
        const event = next.value;
        events += 1;
        if (events > MAX_EVENTS) throw new Error("production host: lifecycle event limit exceeded");
        if (isBlockingRpcUiRequest(event)) {
          throw new Error("production host: unsupported UI dialogue");
        }
        assistantText += eventText(event);
        if (Buffer.byteLength(assistantText, "utf8") > MAX_ASSISTANT_TEXT) {
          throw new Error("production host: assistant output exceeds limit");
        }
        if (event.type === "agent_settled") settled = true;
      }
      response = await timeoutAfter(pending, options.timeoutMs, "prompt response");
      if (options.afterSettlement) {
        await timeoutAfter(
          options.afterSettlement(assistantText, (command) => options.launcher.request(command)),
          options.timeoutMs,
          "phase settlement",
        );
      }
    });
  } catch (error) {
    if (error instanceof Error && /timeout/i.test(error.message)) {
      try { options.launcher.send({ type: "abort", id: options.requestId }); } catch {}
    }
    throw error;
  }

  if (!response || response.type !== "response" || response.id !== options.requestId) {
    throw new Error("production host: prompt response id mismatch");
  }
  if (response.command !== "prompt" || response.success !== true) {
    throw new Error("production host: prompt response was not successful");
  }
  return { response, settled: true, assistantText, events };
}

function commandArguments(phase: AwayLifecyclePhase, command: string): string {
  const prefix = "/" + phase + " ";
  if (!command.startsWith(prefix)) throw new Error("production host: lifecycle command/phase mismatch");
  const args = command.slice(prefix.length);
  if (args.length === 0 || args.length > 4096 || /[\u0000-\u001f\u007f]/.test(args)) {
    throw new Error("production host: invalid lifecycle command arguments");
  }
  return args;
}

export function buildLifecyclePrompt(options: BuildLifecyclePromptOptions): {
  profileId: "writer" | "verifier";
  prompt: string;
  digest: string;
} {
  requireIdentity(options.identity);
  if ((options.parentAwayDepth ?? 0) !== 0) throw new Error("production host: recursive parent away entry rejected");
  if (options.canonicalTemplate.length === 0 || options.canonicalTemplate.length > 1024 * 1024) {
    throw new Error("production host: canonical prompt size invalid");
  }
  const args = commandArguments(options.phase, options.command);
  if (options.phase === "verify") {
    if (!options.expectedOid || !OID.test(options.expectedOid)) {
      throw new Error("production host: verify prompt requires an exact candidate OID");
    }
  } else if (options.expectedOid !== undefined) {
    throw new Error("production host: only verify may bind an expected OID");
  }
  const canonical = options.canonicalTemplate.toString("utf8").replaceAll("$ARGUMENTS", args);
  const control = JSON.stringify({
    schema: "away-lifecycle-control/1",
    phase: options.phase,
    profileId: PHASE_PROFILE[options.phase],
    command: options.command,
    repositoryId: options.identity.repositoryId,
    runId: options.identity.runId,
    cardId: options.identity.cardId,
    slug: options.identity.slug,
    baseOid: options.identity.baseOid,
    expectedOid: options.expectedOid ?? null,
    policy: {
      discoveryLevel: "deep", cleanIsolatedWorkspace: "proceed", commit: "deny",
      push: "deny", publication: "deny", merge: "deny", unexpectedDialogue: "block",
    },
    terminalResponse: {
      onlyJson: true,
      schema: "away-phase-proposal/1",
      phase: options.phase,
      candidates: "exact staged repository-relative path and sha256 pairs; empty for verify",
    },
  });
  const prompt = canonical + "\n\n---\nAWAY_HOST_CONTROL=" + control + "\n";
  return { profileId: PHASE_PROFILE[options.phase], prompt, digest: sha256(prompt) };
}

function validateCandidate(candidate: PhaseCandidate): void {
  if (!candidate || typeof candidate.path !== "string" || typeof candidate.hash !== "string") {
    throw new Error("production host: malformed phase evidence candidate");
  }
  const parts = candidate.path.split("/");
  if (
    candidate.path.startsWith("/") || candidate.path.includes("\\") || /[\u0000\r\n]/.test(candidate.path) ||
    parts.some((part) => part === "" || part === "." || part === "..") || !HASH.test(candidate.hash)
  ) throw new Error("production host: invalid phase evidence candidate");
  if (PROTECTED_PATHS.has(candidate.path) || PROTECTED_PREFIXES.some((prefix) => candidate.path.startsWith(prefix))) {
    throw new Error("production host: protected phase evidence candidate");
  }
}

export function validatePhaseEvidence(evidence: PhaseEvidence, expected: PhaseEvidenceExpectation): void {
  requireIdentity(expected.identity);
  if (!evidence || evidence.schema !== "away-phase-evidence/1") throw new Error("production host: phase evidence schema mismatch");
  if (evidence.phase !== expected.phase || evidence.profileId !== PHASE_PROFILE[expected.phase] || evidence.command !== expected.command) {
    throw new Error("production host: phase evidence phase/profile/command mismatch");
  }
  if (evidence.promptDigest !== expected.promptDigest || !HASH.test(evidence.promptDigest)) {
    throw new Error("production host: phase evidence prompt digest mismatch");
  }
  const id = expected.identity;
  if (
    evidence.repositoryId !== id.repositoryId || evidence.runId !== id.runId || evidence.cardId !== id.cardId ||
    evidence.slug !== id.slug || evidence.baseOid !== id.baseOid
  ) throw new Error("production host: phase evidence identity mismatch");
  const receipt = evidence.settlementReceipt;
  if (!receipt || !isAbsolute(receipt.path) || !HASH.test(receipt.hash) || receipt.outcome !== "completed" || !receipt.wrapperFsynced) {
    throw new Error("production host: phase evidence settlement receipt invalid");
  }
  if (evidence.claims && evidence.claims.length > 0) throw new Error("production host: completion claim is not phase evidence");
  if (evidence.namespaceState !== "established") throw new Error("production host: phase evidence namespace is not established");
  const candidates = evidence.candidates ?? [];
  if (candidates.length > 256) throw new Error("production host: phase evidence candidate limit exceeded");
  const seen = new Set<string>();
  for (const candidate of candidates) {
    validateCandidate(candidate);
    if (seen.has(candidate.path)) throw new Error("production host: duplicate phase evidence candidate");
    seen.add(candidate.path);
  }
  if (expected.phase === "verify") {
    if (!expected.expectedOid || evidence.verifiedOid !== expected.expectedOid || !OID.test(evidence.verifiedOid)) {
      throw new Error("production host: phase evidence verified OID mismatch");
    }
    if (!HASH.test(evidence.fingerprint ?? "") || evidence.repositoryWritesAfterFingerprint !== 0) {
      throw new Error("production host: phase evidence fingerprint freshness invalid");
    }
  } else if (evidence.verifiedOid !== undefined || evidence.fingerprint !== undefined) {
    throw new Error("production host: non-verify phase evidence contains verification fields");
  }
}

interface PhaseProposal {
  schema: "away-phase-proposal/1";
  phase: AwayLifecyclePhase;
  candidates: PhaseCandidate[];
}

function parsePhaseProposal(text: string, phase: AwayLifecyclePhase, slug: string): PhaseProposal {
  if (Buffer.byteLength(text, "utf8") > MAX_ASSISTANT_TEXT) {
    throw new Error("production host: phase proposal exceeds limit");
  }
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("production host: completion prose without a phase receipt"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("production host: malformed phase proposal");
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join("\0") !== "candidates\0phase\0schema") {
    throw new Error("production host: unexpected phase proposal keys");
  }
  if (record.schema !== "away-phase-proposal/1" || record.phase !== phase || !Array.isArray(record.candidates)) {
    throw new Error("production host: phase proposal identity mismatch");
  }
  const candidates = record.candidates as PhaseCandidate[];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (Object.keys(candidate as object).sort().join("\0") !== "hash\0path") {
      throw new Error("production host: malformed phase proposal candidate keys");
    }
    validateCandidate(candidate);
    if (seen.has(candidate.path)) throw new Error("production host: duplicate phase proposal candidate");
    seen.add(candidate.path);
  }
  if (phase === "create") {
    const root = ".pi/artifacts/" + slug + "/";
    if (!seen.has(root + "PLAN.md") || !seen.has(root + "TODO.md")) {
      throw new Error("production host: create proposal lacks namespace sentinels");
    }
  } else if (phase === "ship" && candidates.length === 0) {
    throw new Error("production host: ship proposal has no candidate paths");
  } else if (phase === "verify" && candidates.length !== 0) {
    throw new Error("production host: verify proposal must not contain writes");
  }
  return { schema: "away-phase-proposal/1", phase, candidates };
}

function requirePromptResponse(response: RpcRecord, id: string): void {
  if (
    response.type !== "response" || response.id !== id ||
    response.command !== "prompt" || response.success !== true
  ) throw new Error("production host: settlement response mismatch");
}

function writerSettlement(
  path: string,
  profileId: "writer",
  closureHash: string,
  readFile: (path: string) => Buffer,
): PhaseEvidence["settlementReceipt"] {
  const bytes = readFile(path);
  if (bytes.length === 0 || bytes.length > 1024 * 1024) throw new Error("production host: settlement receipt size invalid");
  let value: unknown;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { throw new Error("production host: malformed settlement receipt"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("production host: malformed settlement receipt");
  const receipt = value as Record<string, unknown>;
  if (
    receipt.schema !== "away-extension-receipt/1" || receipt.profileId !== profileId ||
    receipt.laneId !== profileId || receipt.closureHash !== closureHash ||
    receipt.outcome !== "completed" || receipt.wrapperFsynced !== true
  ) throw new Error("production host: settlement receipt evidence mismatch");
  return { path, hash: sha256(bytes), outcome: "completed", wrapperFsynced: true };
}

function verifierSettlement(
  expectedOid: string,
  result: { receiptPath: string; receiptBytes: Buffer },
): { receipt: PhaseEvidence["settlementReceipt"]; fingerprint: string } {
  if (!isAbsolute(result.receiptPath) || result.receiptBytes.length === 0 || result.receiptBytes.length > 1024 * 1024) {
    throw new Error("production host: verifier receipt path or size invalid");
  }
  let value: unknown;
  try { value = JSON.parse(result.receiptBytes.toString("utf8")); } catch { throw new Error("production host: malformed verifier receipt"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("production host: malformed verifier receipt");
  const receipt = value as VerifierReceipt;
  assertVerifierReceiptSafe(receipt);
  if (
    receipt.oid !== expectedOid || receipt.outcome !== "completed" ||
    receipt.manifestMatch !== true || receipt.exitStatus !== 0 || receipt.exitSignal !== null ||
    !HASH.test(receipt.preManifest) || receipt.preManifest !== receipt.postManifest
  ) throw new Error("production host: verifier receipt evidence mismatch");
  return {
    receipt: {
      path: result.receiptPath,
      hash: sha256(result.receiptBytes),
      outcome: "completed",
      wrapperFsynced: true,
    },
    fingerprint: receipt.preManifest,
  };
}

function writeDurablePhaseReceipt(path: string, evidence: PhaseEvidence): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  const bytes = Buffer.from(JSON.stringify(evidence), "utf8");
  const fd = openSync(path, "wx", 0o600);
  try {
    writeSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

const PHASE_EVIDENCE_KEYS = new Set([
  "schema", "phase", "profileId", "command", "promptDigest", "repositoryId", "runId",
  "cardId", "slug", "baseOid", "settlementReceipt", "namespaceState", "candidates",
  "verifiedOid", "fingerprint", "repositoryWritesAfterFingerprint", "claims",
]);

function parseStoredPhaseEvidence(bytes: Buffer): PhaseEvidence {
  if (bytes.length === 0 || bytes.length > 1024 * 1024) {
    throw new Error("production host: stored phase receipt size invalid");
  }
  let value: unknown;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { throw new Error("production host: malformed stored phase receipt"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("production host: malformed stored phase receipt");
  }
  for (const key of Object.keys(value)) {
    if (!PHASE_EVIDENCE_KEYS.has(key)) throw new Error("production host: unexpected stored phase receipt key");
  }
  return value as PhaseEvidence;
}

function canonicalPhaseCommand(phase: AwayLifecyclePhase, identity: ProductionHostIdentity): string {
  if (phase === "create") return "/create " + identity.slug + " --from .pi/ROADMAP.md#" + identity.cardId;
  return "/" + phase + " " + identity.slug;
}

function revalidateStoredSettlement(
  phase: AwayLifecyclePhase,
  stored: PhaseEvidence,
  readFile: (path: string) => Buffer,
): void {
  const bytes = readFile(stored.settlementReceipt.path);
  if (sha256(bytes) !== stored.settlementReceipt.hash) {
    throw new Error("production host: stored settlement receipt hash drift");
  }
  if (phase === "verify") {
    if (!stored.verifiedOid) throw new Error("production host: stored verify OID missing");
    const verified = verifierSettlement(stored.verifiedOid, {
      receiptPath: stored.settlementReceipt.path,
      receiptBytes: bytes,
    });
    if (verified.fingerprint !== stored.fingerprint) {
      throw new Error("production host: stored verifier fingerprint drift");
    }
    return;
  }
  let value: unknown;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { throw new Error("production host: malformed stored settlement receipt"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("production host: malformed stored settlement receipt");
  }
  const closureHash = (value as Record<string, unknown>).closureHash;
  if (typeof closureHash !== "string" || !HASH.test(closureHash)) {
    throw new Error("production host: stored settlement closure hash invalid");
  }
  writerSettlement(stored.settlementReceipt.path, "writer", closureHash, readFile);
}

function validateFixedPolicy(request: AwayLifecycleInvocation): void {
  const expected: ReadonlyArray<[string, string]> = [
    ["discovery-level", "deep"],
    ["clean-isolated-workspace", "proceed"],
    ["agent-commit", "deny"],
    ["agent-push", "deny"],
    ["agent-publication", "deny"],
    ["agent-merge", "deny"],
  ];
  for (const [question, answer] of expected) {
    if (request.answerPolicy(question) !== answer) {
      throw new Error("production host: fixed policy answer mismatch for " + question);
    }
  }
}

function observeRetainedWorkspace(
  identity: ProductionHostIdentity,
  paths: RetainedPaths,
  deps: RetainedWorkspaceDependencies,
  candidates: readonly PhaseCandidate[],
): void {
  if (deps.pathKind(paths.workspace) !== "directory" || deps.realpath(paths.workspace) !== paths.workspace) {
    throw new Error("production host: retained workspace is missing or replaced");
  }
  if (deps.realpath(deps.git(paths.workspace, ["rev-parse", "--show-toplevel"])) !== paths.workspace) {
    throw new Error("production host: retained workspace root drift");
  }
  if (deps.git(paths.workspace, ["rev-parse", "HEAD"]) !== identity.baseOid) {
    throw new Error("production host: retained workspace HEAD drift");
  }
  if (deps.symbolicHead(paths.workspace) !== null) {
    throw new Error("production host: retained workspace attached to a branch");
  }
  const actual: string[] = [];
  for (const record of deps.git(paths.workspace, ["status", "--porcelain=v1", "-z"]).split("\0")) {
    if (record.length === 0) continue;
    if (record.length < 4 || record[2] !== " " || /[RC]/.test(record.slice(0, 2))) {
      throw new Error("production host: unsupported retained workspace status record");
    }
    const path = record.slice(3);
    validateCandidate({ path, hash: "0".repeat(64) });
    actual.push(path);
  }
  const expected = [...new Set(candidates.map((candidate) => candidate.path))].sort();
  actual.sort();
  if (actual.join("\0") !== expected.join("\0")) {
    throw new Error("production host: retained workspace path drift");
  }
}

function workspaceDeps(deps: ProductionHostDependencies): RetainedWorkspaceDependencies {
  return {
    pathKind: deps.pathKind ?? DEFAULT_WORKSPACE_DEPS.pathKind,
    realpath: deps.realpath ?? DEFAULT_WORKSPACE_DEPS.realpath,
    mkdir: deps.mkdir ?? DEFAULT_WORKSPACE_DEPS.mkdir,
    symbolicHead: deps.symbolicHead ?? DEFAULT_WORKSPACE_DEPS.symbolicHead,
    git: deps.git ?? DEFAULT_WORKSPACE_DEPS.git,
  };
}

export function createProductionHost(
  identity: ProductionHostIdentity,
  dependencies: ProductionHostDependencies = {},
): AwayLifecycleHost {
  requireIdentity(identity);
  const paths = deriveRetainedPaths(identity.stateRoot, identity.repositoryId, identity.runId);
  const deps = workspaceDeps(dependencies);
  const readFile = dependencies.readFile ?? ((path: string) => readFileSync(path));
  const listReceipts = dependencies.listReceipts ?? listExtensionReceipts;
  const launch = dependencies.launch ?? ((options) => launchLane(options));
  const writeReceipt = dependencies.writeReceipt ?? writeDurablePhaseReceipt;
  const createCandidate = dependencies.createCandidate ?? createOrObserveCandidateCommit;
  const evidence = new Map<AwayLifecyclePhase, PhaseEvidence>();
  let evidenceLoaded = false;
  let workspaceInitialized = false;

  const allCandidates = (): PhaseCandidate[] => {
    const current = new Map<string, PhaseCandidate>();
    for (const phase of ["create", "ship"] as const) {
      for (const candidate of evidence.get(phase)?.candidates ?? []) current.set(candidate.path, candidate);
    }
    return [...current.values()].sort((left, right) => left.path.localeCompare(right.path));
  };

const loadEvidence = (): void => {
    if (evidenceLoaded) return;
    let gap = false;
    for (const phase of ["create", "ship", "verify"] as const) {
      const path = join(paths.receipts, phase + ".json");
      const kind = deps.pathKind(path);
      if (kind === "missing") {
        gap = true;
        continue;
      }
      if (kind !== "file") throw new Error("production host: stored phase receipt is not a regular file");
      if (gap) throw new Error("production host: stored phase receipt ordering gap");
      const stored = parseStoredPhaseEvidence(readFile(path));
      const command = canonicalPhaseCommand(phase, identity);
      if (stored.command !== command) throw new Error("production host: stored phase command mismatch");
      const built = buildLifecyclePrompt({
        phase,
        command,
        canonicalTemplate: readFile(join(identity.repoRoot, ".pi", "prompts", phase + ".md")),
        identity,
        expectedOid: phase === "verify" ? stored.verifiedOid : undefined,
      });
      validatePhaseEvidence(stored, {
        phase,
        command,
        promptDigest: built.digest,
        identity,
        expectedOid: phase === "verify" ? stored.verifiedOid : undefined,
      });
      revalidateStoredSettlement(phase, stored, readFile);
      evidence.set(phase, stored);
    }
    if (evidence.size > 0) {
      observeRetainedWorkspace(identity, paths, deps, allCandidates());
      workspaceInitialized = true;
    }
    evidenceLoaded = true;
  };

  const observeWorkspace = (): void => {
    if (!workspaceInitialized) {
      ensureRetainedWorkspace(identity, paths, deps);
      workspaceInitialized = true;
      return;
    }
    observeRetainedWorkspace(identity, paths, deps, allCandidates());
  };

  const namespaceState = (slug: string): AwayNamespaceState => {
    loadEvidence();
    if (slug !== identity.slug) throw new Error("production host: namespace slug identity mismatch");
    const root = join(paths.workspace, ".pi", "artifacts", slug);
    const planKind = deps.pathKind(join(root, "PLAN.md"));
    const todoKind = deps.pathKind(join(root, "TODO.md"));
    if ((planKind !== "missing" && planKind !== "file") || (todoKind !== "missing" && todoKind !== "file")) {
      throw new Error("production host: namespace sentinel is not a regular file");
    }
    const plan = planKind === "file";
    const todo = todoKind === "file";
    if (plan && todo) return "established";
    if (plan || todo) return "partial";
    return "absent";
  };

  return {
    namespaceState,

    async invoke(request: AwayLifecycleInvocation): Promise<AwayLifecycleObservation> {
      if (request.slug !== identity.slug) throw new Error("production host: lifecycle slug identity mismatch");
      validateFixedPolicy(request);
      loadEvidence();
      const stored = evidence.get(request.phase);
      if (stored) {
        if (stored.command !== request.command || (request.phase === "verify" && stored.verifiedOid !== request.expectedOid)) {
          throw new Error("production host: stored phase invocation mismatch");
        }
        observeWorkspace();
        return {
          phase: stored.phase,
          command: stored.command,
          status: "completed",
          terminalClaim: stored.phase === "verify" ? "verified" : "none",
          verifiedOid: stored.verifiedOid,
          fingerprint: stored.fingerprint,
          repositoryWritesAfterFingerprint: stored.repositoryWritesAfterFingerprint,
        };
      }
      observeWorkspace();
      const built = buildLifecyclePrompt({
        phase: request.phase,
        command: request.command,
        canonicalTemplate: readFile(join(identity.repoRoot, ".pi", "prompts", request.phase + ".md")),
        identity,
        expectedOid: request.expectedOid,
      });
      for (const directory of [paths.control, paths.staging, paths.attestations, paths.receipts]) {
        deps.mkdir(directory);
      }
      const profileId = built.profileId;
      let proposal: PhaseProposal;
      let settlementReceipt: PhaseEvidence["settlementReceipt"];
      let verifiedOid: string | undefined;
      let fingerprint: string | undefined;
      let repositoryWritesAfterFingerprint: number | undefined;

      if (request.phase === "verify") {
        if (!request.expectedOid || !OID.test(request.expectedOid)) {
          throw new Error("production host: verify expected OID missing or invalid");
        }
        if (!dependencies.verifyCandidate) throw new Error("production host: verifier adapter is not configured");
        proposal = { schema: "away-phase-proposal/1", phase: "verify", candidates: [] };
        const verification = verifierSettlement(
          request.expectedOid,
          dependencies.verifyCandidate(request.expectedOid),
        );
        settlementReceipt = verification.receipt;
        verifiedOid = request.expectedOid;
        fingerprint = verification.fingerprint;
        repositoryWritesAfterFingerprint = 0;
      } else {
        const before = new Set(listReceipts(paths.attestations));
        const launcher = launch({
          manifestPath: identity.manifestPath,
          profileId,
          controlCwd: paths.control,
          processEnv: {
            ...process.env,
            PI_AWAY_LANE: profileId,
            PI_AWAY_MANIFEST: identity.manifestPath,
            PI_AWAY_STAGING_ROOT: paths.staging,
            PI_AWAY_ATTEST_DIR: paths.attestations,
            PI_AWAY_REPO_ROOT: paths.workspace,
          },
        });
        let writerProposal: PhaseProposal | undefined;
        await runLifecycleRpc({
          launcher,
          requestId: "phase-" + request.phase,
          prompt: built.prompt,
          timeoutMs: 600_000,
          afterSettlement: async (assistantText, correlatedRequest) => {
            writerProposal = parsePhaseProposal(assistantText, request.phase, identity.slug);
            const payload = Buffer.from(JSON.stringify({
              schema: "away-settlement/1",
              candidates: writerProposal.candidates,
            }), "utf8").toString("base64url");
            const settlementId = "settle-" + request.phase;
            const response = await correlatedRequest({
              type: "prompt",
              id: settlementId,
              message: "/away-settle " + payload,
            });
            requirePromptResponse(response, settlementId);
          },
        });
        if (!writerProposal) throw new Error("production host: phase proposal missing after settlement");
        proposal = writerProposal;
        const added = listReceipts(paths.attestations).filter((path) => !before.has(path));
        if (added.length !== 1) throw new Error("production host: expected one exact new settlement receipt");
        settlementReceipt = writerSettlement(added[0], "writer", launcher.closureHash, readFile);
      }

      const phaseEvidence: PhaseEvidence = {
        schema: "away-phase-evidence/1",
        phase: request.phase,
        profileId,
        command: request.command,
        promptDigest: built.digest,
        repositoryId: identity.repositoryId,
        runId: identity.runId,
        cardId: identity.cardId,
        slug: identity.slug,
        baseOid: identity.baseOid,
        settlementReceipt,
        namespaceState: namespaceState(identity.slug),
        candidates: proposal.candidates,
        verifiedOid,
        fingerprint,
        repositoryWritesAfterFingerprint,
      };
      validatePhaseEvidence(phaseEvidence, {
        phase: request.phase,
        command: request.command,
        promptDigest: built.digest,
        identity,
        expectedOid: request.expectedOid,
      });
      writeReceipt(join(paths.receipts, request.phase + ".json"), phaseEvidence);
      evidence.set(request.phase, phaseEvidence);
      return {
        phase: request.phase,
        command: request.command,
        status: "completed",
        terminalClaim: request.phase === "verify" ? "verified" : "none",
        verifiedOid,
        fingerprint,
        repositoryWritesAfterFingerprint,
      };
    },

    async createOrObserveCandidate(request: AwayCandidateRequest): Promise<AwayCandidateObservation> {
      loadEvidence();
      if (
        request.runId !== identity.runId || request.cardId !== identity.cardId ||
        request.slug !== identity.slug || request.baseOid !== identity.baseOid
      ) throw new Error("production host: candidate request identity mismatch");
      if (!evidence.has("create") || !evidence.has("ship")) {
        throw new Error("production host: candidate requested before settled create and ship evidence");
      }
      observeWorkspace();
      const candidates = allCandidates();
      const hashes = Object.fromEntries(candidates.map((candidate) => [candidate.path, candidate.hash]));
      const result = createCandidate({
        repoRoot: paths.workspace,
        baseOid: identity.baseOid,
        branch: deriveAwayBranch(identity.cardId, identity.runId),
        runId: identity.runId,
        cardId: identity.cardId,
        paths: candidates.map((candidate) => candidate.path),
        hashes,
      });
      if (!OID.test(result.oid) || result.oid === identity.baseOid) {
        throw new Error("production host: candidate broker returned an invalid OID");
      }
      return {
        oid: result.oid,
        baseOid: identity.baseOid,
        clean: true,
        hostObserved: true,
        paths: candidates.map((candidate) => candidate.path),
        hashes,
      };
    },
  };
}

export type ProductionSelection =
  | { kind: "no-work"; reason: string }
  | {
      kind: "reserved";
      reservation: Extract<ReserveResult, { kind: "reserved" }>;
      ledger: Ledger;
    };

export interface ProductionControllerDependencies {
  select(request: AwayControllerRequest): Promise<ProductionSelection>;
  hostFactory(selection: Extract<ProductionSelection, { kind: "reserved" }>): AwayLifecycleHost;
  effectHostFactory(
    selection: Extract<ProductionSelection, { kind: "reserved" }>,
    lifecycle: AwayLifecycleCompleted,
  ): AwayEffectHost;
  reconcile?(options: {
    ledger: Ledger;
    reservation: Extract<ReserveResult, { kind: "reserved" }>["record"];
    host: AwayEffectHost;
    now(): number;
  }): Promise<ReconciledAwayRun>;
  now(): number;
}

function defaultStateRoot(): string {
  const xdg = process.env.XDG_STATE_HOME;
  const parent = xdg && xdg.length > 0 ? requireAbsolute(xdg, "XDG state root") : join(homedir(), ".local", "state");
  return join(parent, "pi-away");
}

function latestUnfinished(records: LedgerRecord[], repositoryId: string): LedgerRecord[] {
  const latest = new Map<string, LedgerRecord>();
  for (const record of records) {
    if (record.repositoryId === repositoryId) latest.set(record.runId, record);
  }
  return [...latest.values()].filter((record) =>
    record.status !== "completed" && record.status !== "blocked" && record.status !== "aborted"
  );
}

async function defaultSelect(request: AwayControllerRequest): Promise<ProductionSelection> {
  const repoRoot = requireAbsolute(request.repoRoot, "repo root");
  const manifestPath = join(repoRoot, ".pi", "away-sandbox.json");
  validateReadyPacket(repoRoot);
  const closureHashes = validateRuntimeClosures(manifestPath);
  const git = deriveGitFacts(repoRoot);
  const stateRoot = defaultStateRoot();
  const repositoryRoot = join(stateRoot, "repositories", git.repositoryId);
  const ledgerRoot = join(repositoryRoot, "ledger");
  const readRecords = (): LedgerRecord[] => openLedger(ledgerRoot).replay().records;
  const records = existsSync(ledgerRoot)
    ? await withRepositoryLease(ledgerRoot + ".lock", readRecords)
    : [];
  const unfinished = latestUnfinished(records, git.repositoryId);
  if (unfinished.length > 1) throw new Error("production host: multiple unfinished reservations");

  const roadmapPath = join(repoRoot, ".pi", "ROADMAP.md");
  const roadmapBytes = readFileSync(roadmapPath);
  const roadmapHash = sha256(roadmapBytes);
  const roadmap = parseRoadmap(roadmapBytes.toString("utf8"));
  if (unfinished.length === 1) {
    const latest = unfinished[0];
    const runRecords = records.filter((record) => record.runId === latest.runId);
    const reservation = runRecords[0];
    if (!reservation || reservation.status !== "reserved") {
      throw new Error("production host: unfinished run lacks its reservation record");
    }
    if (
      reservation.repositoryId !== git.repositoryId || reservation.baseOid !== git.baseOid ||
      reservation.sourceHash !== roadmapHash
    ) throw new Error("production host: unfinished reservation identity drift");
    const card = roadmap.cards.find((candidate) => candidate.id === reservation.cardId);
    if (!card || card.candidateSlug !== reservation.slug) {
      throw new Error("production host: unfinished reservation card drift");
    }
    return {
      kind: "reserved",
      reservation: { kind: "reserved", card, record: reservation, roadmapHash, closureHashes },
      ledger: openLedger(ledgerRoot),
    };
  }

  const priorReservations = records
    .filter((record) => record.status === "reserved")
    .map((record) => ({
      repositoryId: record.repositoryId,
      cardId: record.cardId,
      sourceHash: record.sourceHash,
    }));
  const card = selectAwayRoadmapCard(roadmapBytes.toString("utf8"), {
    repositoryId: git.repositoryId,
    namespaceRoot: join(repoRoot, ".pi", "artifacts"),
    exists: existsSync,
    ledgerReservations: priorReservations,
  });
  if (!card) {
    if (sha256(readFileSync(roadmapPath)) !== roadmapHash) {
      throw new Error("production host: roadmap drift before no-work");
    }
    return { kind: "no-work", reason: "no eligible away roadmap card" };
  }

  const reserved = await reserveNext({
    repoRoot,
    ledgerRoot,
    manifestPath,
    runId: "run-" + randomBytes(16).toString("hex"),
    timestamp: Date.now(),
  });
  if (reserved.kind === "no-work") return { kind: "no-work", reason: reserved.reason };
  return { kind: "reserved", reservation: reserved, ledger: openLedger(ledgerRoot) };
}

const PRODUCTION_CHECK_SCRIPT = String.raw`
const { spawnSync } = require("node:child_process");
const { lstatSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const files = [];
const walk = (directory) => {
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) walk(path);
    else if (/\.(?:[cm]?js|[cm]?ts)$/.test(name)) files.push(path);
  }
};
walk("/src");
if (files.length === 0) process.exit(1);
for (const file of files) {
  const checked = spawnSync(process.execPath, ["--experimental-strip-types", "--check", "--", file], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (checked.status !== 0) {
    process.stderr.write((checked.stderr || checked.stdout || "syntax check failed") + "\n");
    process.exit(1);
  }
}
`;

function productionIdentity(
  request: AwayControllerRequest,
  selection: Extract<ProductionSelection, { kind: "reserved" }>,
): ProductionHostIdentity {
  const record = selection.reservation.record;
  return {
    repoRoot: requireAbsolute(request.repoRoot, "repo root"),
    stateRoot: defaultStateRoot(),
    manifestPath: join(requireAbsolute(request.repoRoot, "repo root"), ".pi", "away-sandbox.json"),
    repositoryId: record.repositoryId,
    runId: record.runId,
    cardId: record.cardId,
    slug: selection.reservation.card.candidateSlug,
    baseOid: record.baseOid,
  };
}

function storedPhaseEvidence(
  identity: ProductionHostIdentity,
  paths: RetainedPaths,
  phase: AwayLifecyclePhase,
): PhaseEvidence {
  const stored = parseStoredPhaseEvidence(readFileSync(join(paths.receipts, phase + ".json")));
  const command = canonicalPhaseCommand(phase, identity);
  const built = buildLifecyclePrompt({
    phase,
    command,
    canonicalTemplate: readFileSync(join(identity.repoRoot, ".pi", "prompts", phase + ".md")),
    identity,
    expectedOid: phase === "verify" ? stored.verifiedOid : undefined,
  });
  validatePhaseEvidence(stored, {
    phase,
    command,
    promptDigest: built.digest,
    identity,
    expectedOid: phase === "verify" ? stored.verifiedOid : undefined,
  });
  const receiptPath = resolve(stored.settlementReceipt.path);
  if (receiptPath !== paths.runRoot && !receiptPath.startsWith(paths.runRoot + sep)) {
    throw new Error("production host: settlement receipt escaped retained run root");
  }
  revalidateStoredSettlement(phase, stored, (path) => readFileSync(path));
  return stored;
}

function storedCandidates(identity: ProductionHostIdentity, paths: RetainedPaths): PhaseCandidate[] {
  const candidates = new Map<string, PhaseCandidate>();
  for (const phase of ["create", "ship"] as const) {
    for (const candidate of storedPhaseEvidence(identity, paths, phase).candidates ?? []) {
      const existing = candidates.get(candidate.path);
      if (existing && existing.hash !== candidate.hash) {
        throw new Error("production host: candidate hash drift across stored phases");
      }
      candidates.set(candidate.path, candidate);
    }
  }
  return [...candidates.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function githubRepository(repoRoot: string): string {
  const raw = defaultGit(repoRoot, ["config", "--get", "remote.origin.url"]);
  let repository: string | undefined;
  if (raw.startsWith("https://")) {
    const url = new URL(raw);
    if (
      url.protocol === "https:" && url.hostname === "github.com" &&
      url.username === "" && url.password === "" && url.search === "" && url.hash === ""
    ) repository = url.pathname.replace(/^\//, "").replace(/\.git$/, "");
  } else {
    const match = /^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/.exec(raw);
    repository = match?.[1];
  }
  if (!repository || !/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(repository)) {
    throw new Error("production host: origin is not an allowlisted GitHub repository");
  }
  return repository;
}

export function verifyProductionCommit(options: {
  oid: string;
  repoPath: string;
  runRoot: string;
  manifestPath: string;
}): { receiptPath: string; receiptBytes: Buffer } {
  const { manifest } = loadManifest(options.manifestPath);
  const commandBinary = process.execPath;
  const result = verify({
    oid: options.oid,
    repoPath: options.repoPath,
    commandId: "production-syntax",
    catalog: {
      "production-syntax": {
        id: "production-syntax",
        binary: commandBinary,
        argv: ["--eval", PRODUCTION_CHECK_SCRIPT],
        cwd: "/scratch",
      },
    },
    limits: manifest.limits,
    workRoot: join(options.runRoot, "verification", options.oid),
    commandBinary,
    bwrapPath: manifest.pinned_versions.bwrap_path,
    attestDir: join(options.runRoot, "verification-attestations"),
  });
  if (result.receipt.outcome !== "completed") {
    throw new Error("production host: exact-OID verifier did not complete successfully");
  }
  return { receiptPath: result.receiptPath, receiptBytes: readFileSync(result.receiptPath) };
}

function verifyProductionCandidate(identity: ProductionHostIdentity, paths: RetainedPaths, oid: string): {
  receiptPath: string;
  receiptBytes: Buffer;
} {
  return verifyProductionCommit({
    oid,
    repoPath: paths.workspace,
    runRoot: paths.runRoot,
    manifestPath: identity.manifestPath,
  });
}

function createProductionEffectHost(
  identity: ProductionHostIdentity,
  lifecycle: AwayLifecycleCompleted,
): AwayEffectHost {
  const paths = deriveRetainedPaths(identity.stateRoot, identity.repositoryId, identity.runId);
  const candidates = storedCandidates(identity, paths);
  const hashes = Object.fromEntries(candidates.map((candidate) => [candidate.path, candidate.hash]));
  const branch = deriveAwayBranch(identity.cardId, identity.runId);
  const repository = githubRepository(paths.workspace);
  const pullRequest = {
    repository,
    hostname: "github.com",
    base: "main",
    head: branch,
    expectedHeadOid: lifecycle.candidateOid,
    title: identity.cardId + " away candidate",
    body: "Automated away candidate for " + identity.cardId + ".\n\nRun: " + identity.runId,
  };
  const observeCandidate = (): { oid: string } => {
    observeRetainedWorkspace(identity, paths, DEFAULT_WORKSPACE_DEPS, candidates);
    const commit = createOrObserveCandidateCommit({
      repoRoot: paths.workspace,
      baseOid: identity.baseOid,
      branch,
      runId: identity.runId,
      cardId: identity.cardId,
      paths: candidates.map((candidate) => candidate.path),
      hashes,
    });
    if (commit.oid !== lifecycle.candidateOid) {
      throw new Error("production host: stored candidate commit drift");
    }
    return { oid: commit.oid };
  };
  const verification = (oid: string) => {
    if (oid !== lifecycle.candidateOid) throw new Error("production host: effect verifier OID mismatch");
    const stored = storedPhaseEvidence(identity, paths, "verify");
    if (stored.verifiedOid !== oid || stored.fingerprint !== lifecycle.fingerprint) {
      throw new Error("production host: effect verifier evidence drift");
    }
    return {
      oid,
      receiptHash: stored.settlementReceipt.hash,
      fingerprint: stored.fingerprint,
      fresh: true,
    };
  };
  return {
    async ensureWorkspace() {
      observeRetainedWorkspace(identity, paths, DEFAULT_WORKSPACE_DEPS, candidates);
    },
    async ensureCandidate() {
      return observeCandidate();
    },
    async ensureCommit(candidateOid) {
      if (candidateOid !== lifecycle.candidateOid) {
        throw new Error("production host: effect candidate OID mismatch");
      }
      return observeCandidate();
    },
    async ensureVerification(commitOid) {
      return verification(commitOid);
    },
    async observeRemote(commitOid) {
      const observed = observeRemoteBranch({
        repoRoot: paths.workspace,
        remote: "origin",
        branch,
        expectedOid: commitOid,
      });
      return observed.kind === "absent"
        ? { kind: "absent" }
        : observed.kind === "match"
          ? { kind: "match", oid: observed.oid }
          : { kind: "divergent", oid: observed.oid };
    },
    async publish(commitOid) {
      publishDedicatedBranch({ repoRoot: paths.workspace, remote: "origin", branch, oid: commitOid });
    },
    async observePullRequest() {
      return observeDraftPullRequest({ ...pullRequest, requestId: identity.runId + ":observe" });
    },
    async createOrGetDraftPullRequest(requestId) {
      const pull = await createOrGetDraftPullRequest({ ...pullRequest, requestId });
      return { kind: "match", pullRequestId: pull.pullRequestId, requestId: pull.requestId };
    },
  };
}

function defaultProductionDependencies(request: AwayControllerRequest): ProductionControllerDependencies {
  return {
    select: defaultSelect,
    hostFactory(selection) {
      const identity = productionIdentity(request, selection);
      const paths = deriveRetainedPaths(identity.stateRoot, identity.repositoryId, identity.runId);
      return createProductionHost(identity, {
        verifyCandidate: (oid) => verifyProductionCandidate(identity, paths, oid),
      });
    },
    effectHostFactory(selection, lifecycle) {
      return createProductionEffectHost(productionIdentity(request, selection), lifecycle);
    },
    now: Date.now,
  };
}

/** Public production mapping: lifecycle success is never terminal by itself. */
export async function runProductionAwayController(
  request: AwayControllerRequest,
  dependencies?: ProductionControllerDependencies,
): Promise<AwayControllerResult> {
  try {
    const activeDependencies = dependencies ?? defaultProductionDependencies(request);
    const selection = await activeDependencies.select(request);
    if (selection.kind === "no-work") return selection;
    const host = activeDependencies.hostFactory(selection);
    const lifecycle = await driveReservedLifecycle(
      selection.reservation,
      { supplementalObjective: request.supplementalObjective },
      host,
    );
    const effectHost = activeDependencies.effectHostFactory(selection, lifecycle);
    const terminal = await (activeDependencies.reconcile ?? reconcileAwayRun)({
      ledger: selection.ledger,
      reservation: selection.reservation.record,
      host: effectHost,
      now: activeDependencies.now,
    });
    if (terminal.commitOid !== lifecycle.candidateOid || terminal.remoteOid !== lifecycle.candidateOid) {
      throw new Error("production host: terminal effect evidence does not match lifecycle candidate");
    }
    return lifecycle;
  } catch (error) {
    return {
      kind: "blocked",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}