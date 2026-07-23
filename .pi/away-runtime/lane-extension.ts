// C2 — Lane extension: registers uniquely-named `away_*` tools the model reaches
// via `fabric_exec` (captured under `fullCodeMode:true`). Per-lane firewall:
// only the lane's `host_call_refs` subset is registered here; ordinary
// write/shell/agent/compaction/schema refs are NEVER exposed (the A2 wrapper's
// ref-filter denies them at the IPC boundary as a second layer). Every argument
// is validated against the profile + reservation. Writes are staged + atomic
// with an in-flight mutation barrier (reuse B3 staging.ts). Attestation fsyncs
// terminal evidence before Fabric receives success (attestation.ts), and
// requires the wrapper to have fsynced its receipt first (sandbox settled).
//
// Testable surface: `createLaneExtension(ctx)` builds the tool definitions
// bound to a context (no `pi` needed). The default export wires them into a
// real `pi` via env-provided context (used when loaded as a `-e` extension).
//
// Run: node --experimental-strip-types --test .pi/away-runtime/lane-extension.test.ts

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { loadManifest, type Manifest, type LaneProfile } from "./bootstrap.ts";
import { resolveSourceView, isProtected, normalizeRelative } from "./dispatch.ts";
import {
  reserveStagingPath,
  stageWrite,
  commitStaged,
  discardStaged,
  WriterToken,
  type Reservation,
} from "./staging.ts";
import { resolveClosure } from "./closure.ts";
import { PINNED_CHILD_SOURCE_DIGEST } from "./executor-wrapper.mjs";
import {
  buildTerminalReceipt,
  readWrapperReceipt,
  writeTerminalAttestation,
  type LaneOutcome,
} from "./attestation.ts";

export interface LaneExtensionContext {
  manifestPath: string;
  laneId: string;
  /** Inert staging root (never the repository). */
  stagingRoot: string;
  /** Where the wrapper + extension fsync terminal evidence. */
  attestDir: string;
  /** Repository root for the read-only source view + commit destinations. */
  repoRoot: string;
  /** Optional command catalog for away_run_verify (C3 forward ref). */
  commandCatalog?: ReadonlySet<string>;
}

export interface ToolResult {
  content: { type: "text"; text: string }[];
  details?: Record<string, unknown>;
}

export interface RegisteredTool {
  name: string;
  description: string;
  /** JSON-Schema-ish parameter shape (execute does the real validation). */
  parameters: object;
  /** pi.registerTool passes (toolCallId, params, signal, onUpdate, ctx); only params is used. */
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<ToolResult>;
}

export interface ExtensionState {
  tools: RegisteredTool[];
  token: WriterToken;
  allowlist: Set<string>;
  lane: LaneProfile;
  manifest: Manifest;
  manifestHash: string;
  closureHash: string;
  reservations: Map<string, Reservation>;
  /** Release the writer token (controller, post-settlement). */
  release(): void;
  /** Whether the lane has produced its terminal attestation. */
  isAttested(): boolean;
}

const OUTCOMES: ReadonlySet<LaneOutcome> = new Set(["completed", "failed", "aborted"]);

function requireString(params: Record<string, unknown>, key: string): string {
  const v = params[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`away-extension: argument ${key} must be a non-empty string`);
  }
  return v;
}

function validateParams(params: Record<string, unknown>, allowed: ReadonlySet<string>): void {
  for (const k of Object.keys(params)) {
    if (!allowed.has(k)) {
      throw new Error(`away-extension: unexpected argument: ${k}`);
    }
  }
}

function sha256File(p: string): string {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

function rejectIfProtected(rel: string, manifest: Manifest): void {
  const r = normalizeRelative(rel);
  if (isProtected(r, manifest.protected_paths, manifest.runtime_protected_paths)) {
    throw new Error(`away-extension: protected path rejected: ${r}`);
  }
}

// ---- read tools ---------------------------------------------------------------

function makeAwayRead(ctx: LaneExtensionContext, manifest: Manifest): RegisteredTool {
  return {
    name: "away_read",
    description: "Read a file from the read-only source view. Protected paths are rejected.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
      additionalProperties: false,
    },
    async execute(_toolCallId, params) {
      validateParams(params, new Set(["path"]));
      const p = requireString(params, "path");
      const sv = resolveSourceView(
        ctx.repoRoot,
        p,
        manifest.protected_paths,
        manifest.runtime_protected_paths,
      );
      const content = readFileSync(sv.abs, "utf8");
      return {
        content: [{ type: "text", text: content }],
        details: { path: sv.rel, bytes: Buffer.byteLength(content) },
      };
    },
  };
}

function makeAwayList(ctx: LaneExtensionContext, manifest: Manifest): RegisteredTool {
  return {
    name: "away_list",
    description: "List entries in a directory of the read-only source view.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      additionalProperties: false,
    },
    async execute(_toolCallId, params) {
      validateParams(params, new Set(["path"]));
      const p = typeof params.path === "string" && params.path.length > 0 ? params.path : ".";
      const sv = resolveSourceView(
        ctx.repoRoot,
        p,
        manifest.protected_paths,
        manifest.runtime_protected_paths,
      );
      const entries = readdirSync(sv.abs);
      return {
        content: [{ type: "text", text: entries.join("\n") }],
        details: { path: sv.rel, count: entries.length },
      };
    },
  };
}

function makeAwaySearch(ctx: LaneExtensionContext, manifest: Manifest): RegisteredTool {
  return {
    name: "away_search",
    description: "Bounded regex search over the read-only source view.",
    parameters: {
      type: "object",
      properties: { pattern: { type: "string" }, path: { type: "string" } },
      required: ["pattern"],
      additionalProperties: false,
    },
    async execute(_toolCallId, params) {
      validateParams(params, new Set(["pattern", "path"]));
      const pattern = requireString(params, "pattern");
      const rootRel = typeof params.path === "string" && params.path.length > 0 ? params.path : ".";
      const sv = resolveSourceView(
        ctx.repoRoot,
        rootRel,
        manifest.protected_paths,
        manifest.runtime_protected_paths,
      );
      const re = new RegExp(pattern);
      const maxFiles = manifest.limits.max_file_count || 1024;
      const matches: { path: string; line: number; text: string }[] = [];
      let visited = 0;
      const walk = (dir: string): void => {
        if (visited >= maxFiles || matches.length >= 100) return;
        let names: string[];
        try {
          names = readdirSync(dir);
        } catch {
          return;
        }
        for (const n of names) {
          if (visited >= maxFiles || matches.length >= 100) return;
          const full = join(dir, n);
          let st: ReturnType<typeof statSync>;
          try {
            st = statSync(full);
          } catch {
            continue;
          }
          if (st.isDirectory()) {
            walk(full);
          } else if (st.isFile()) {
            visited += 1;
            let text: string;
            try {
              text = readFileSync(full, "utf8");
            } catch {
              continue;
            }
            const lines = text.split("\n");
            for (let i = 0; i < lines.length; i++) {
              if (re.test(lines[i])) {
                matches.push({
                  path: full.slice(sv.abs.length + 1),
                  line: i + 1,
                  text: lines[i].slice(0, 200),
                });
                if (matches.length >= 100) return;
              }
            }
          }
        }
      };
      walk(sv.abs);
      return {
        content: [{ type: "text", text: JSON.stringify(matches) }],
        details: { count: matches.length, truncated: matches.length >= 100, filesVisited: visited },
      };
    },
  };
}

// ---- write tools --------------------------------------------------------------

function makeAwayStageWrite(
  ctx: LaneExtensionContext,
  manifest: Manifest,
  token: WriterToken,
  reservations: Map<string, Reservation>,
): RegisteredTool {
  return {
    name: "away_stage_write",
    description: "Atomically stage a write to an exact reserved file under the inert staging root.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
      additionalProperties: false,
    },
    async execute(_toolCallId, params) {
      validateParams(params, new Set(["path", "content"]));
      const rel = requireString(params, "path");
      const content = requireString(params, "content");
      rejectIfProtected(rel, manifest);
      token.beginWrite();
      try {
        const reservation = reserveStagingPath(rel, ctx.stagingRoot);
        const staged = stageWrite(reservation, content);
        reservations.set(rel, reservation);
        const hash = sha256File(staged);
        return {
          content: [{ type: "text", text: `staged: ${rel}` }],
          details: { path: rel, stagedHash: hash },
        };
      } finally {
        token.endWrite();
      }
    },
  };
}

function makeAwayCommitStaged(
  ctx: LaneExtensionContext,
  manifest: Manifest,
  token: WriterToken,
  reservations: Map<string, Reservation>,
): RegisteredTool {
  return {
    name: "away_commit_staged",
    description:
      "Move a staged file to its real destination. Blocked until the writer token is released (settlement).",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
      additionalProperties: false,
    },
    async execute(_toolCallId, params) {
      validateParams(params, new Set(["path"]));
      const rel = requireString(params, "path");
      rejectIfProtected(rel, manifest);
      const reservation = reservations.get(rel);
      if (!reservation) throw new Error(`away-extension: nothing staged for: ${rel}`);
      const destAbs = join(ctx.repoRoot, rel);
      commitStaged(token, reservation, destAbs);
      return {
        content: [{ type: "text", text: `committed: ${rel}` }],
        details: { path: rel, destHash: sha256File(destAbs) },
      };
    },
  };
}

function makeAwayDiscardStaged(
  token: WriterToken,
  reservations: Map<string, Reservation>,
): RegisteredTool {
  return {
    name: "away_discard_staged",
    description: "Discard a staged scratch file. Blocked until the writer token is released.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
      additionalProperties: false,
    },
    async execute(_toolCallId, params) {
      validateParams(params, new Set(["path"]));
      const rel = requireString(params, "path");
      const reservation = reservations.get(rel);
      if (!reservation) throw new Error(`away-extension: nothing staged for: ${rel}`);
      discardStaged(token, reservation);
      reservations.delete(rel);
      return {
        content: [{ type: "text", text: `discarded: ${rel}` }],
      };
    },
  };
}

// ---- execute tools ------------------------------------------------------------

function makeAwayRunVerify(ctx: LaneExtensionContext): RegisteredTool {
  return {
    name: "away_run_verify",
    description:
      "Run a cataloged verification command by ID. Model-supplied argv is rejected; execution is bounded by the C3 verifier sandbox.",
    parameters: {
      type: "object",
      properties: { commandId: { type: "string" } },
      required: ["commandId"],
      additionalProperties: false,
    },
    async execute(_toolCallId, params) {
      validateParams(params, new Set(["commandId"]));
      const commandId = requireString(params, "commandId");
      if (ctx.commandCatalog && !ctx.commandCatalog.has(commandId)) {
        throw new Error(`away-extension: unknown command: ${commandId}`);
      }
      // Execution deferred to C3 (verifier.ts + command-catalog.ts): the model
      // may only name a command ID; the host binds OID, manifests, limits, and
      // exit result into the verifier receipt.
      return {
        content: [{ type: "text", text: `accepted: ${commandId}` }],
        details: { commandId, status: "accepted", deferredTo: "c3-verifier" },
      };
    },
  };
}

function makeAwayAttest(
  ctx: LaneExtensionContext,
  manifest: Manifest,
  manifestHash: string,
  closureHash: string,
  token: WriterToken,
  attestedRef: { value: boolean },
): RegisteredTool {
  return {
    name: "away_attest",
    description:
      "Fsync terminal evidence (profile/closure/resource hashes, limits, outcome) and declare lane settlement. Requires the wrapper to have fsynced first; rejects while bridge work is in flight or the lane already attested.",
    parameters: {
      type: "object",
      properties: { outcome: { type: "string" } },
      required: ["outcome"],
      additionalProperties: false,
    },
    async execute(_toolCallId, params) {
      validateParams(params, new Set(["outcome"]));
      const outcomeRaw = params.outcome;
      if (typeof outcomeRaw !== "string" || !OUTCOMES.has(outcomeRaw as LaneOutcome)) {
        throw new Error(`away-extension: invalid outcome: ${String(outcomeRaw)}`);
      }
      const outcome = outcomeRaw as LaneOutcome;
      if (attestedRef.value) {
        throw new Error("away-extension: attest blocked: already attested (stale nonce)");
      }
      if (token.inFlight > 0) {
        throw new Error("away-extension: attest blocked: bridge work in flight");
      }
      if (!token.released) {
        throw new Error("away-extension: attest blocked: writer token held");
      }
      const wrapper = readWrapperReceipt(ctx.attestDir, ctx.laneId);
      if (!wrapper) {
        throw new Error(
          "away-extension: attest blocked: wrapper has not fsynced terminal evidence (sandbox active)",
        );
      }
      const receipt = buildTerminalReceipt({
        profileId: ctx.laneId,
        laneId: ctx.laneId,
        manifestHash,
        closureHash,
        childSourceDigest: PINNED_CHILD_SOURCE_DIGEST,
        limits: manifest.limits as Record<string, number>,
        outcome,
        wrapperReceiptPath: wrapper.path,
        wrapperFsynced: wrapper.receipt.fsynced === true,
      });
      const res = writeTerminalAttestation(ctx.attestDir, receipt);
      attestedRef.value = true;
      return {
        content: [{ type: "text", text: `attested: ${res.path}` }],
        details: { path: res.path, outcome },
      };
    },
  };
}

// ---- factory ------------------------------------------------------------------

export function createLaneExtension(ctx: LaneExtensionContext): ExtensionState {
  const { manifest, hash: manifestHash } = loadManifest(ctx.manifestPath);
  const lane = manifest.lanes[ctx.laneId];
  if (!lane) throw new Error(`away-extension: unknown lane: ${ctx.laneId}`);
  const allowlist = new Set(lane.host_call_refs);
  const token = new WriterToken();
  const reservations = new Map<string, Reservation>();
  const attestedRef = { value: false };
  const closureHash = resolveClosure(ctx.manifestPath, ctx.laneId, { requireAll: false }).hash;

  const tools: RegisteredTool[] = [];
  if (allowlist.has("away_read")) tools.push(makeAwayRead(ctx, manifest));
  if (allowlist.has("away_list")) tools.push(makeAwayList(ctx, manifest));
  if (allowlist.has("away_search")) tools.push(makeAwaySearch(ctx, manifest));
  if (allowlist.has("away_stage_write"))
    tools.push(makeAwayStageWrite(ctx, manifest, token, reservations));
  if (allowlist.has("away_commit_staged"))
    tools.push(makeAwayCommitStaged(ctx, manifest, token, reservations));
  if (allowlist.has("away_discard_staged")) tools.push(makeAwayDiscardStaged(token, reservations));
  if (allowlist.has("away_run_verify")) tools.push(makeAwayRunVerify(ctx));
  if (allowlist.has("away_attest"))
    tools.push(makeAwayAttest(ctx, manifest, manifestHash, closureHash, token, attestedRef));

  return {
    tools,
    token,
    allowlist,
    lane,
    manifest,
    manifestHash,
    closureHash,
    reservations,
    release: () => token.release(),
    isAttested: () => attestedRef.value,
  };
}

// ---- pi extension entrypoint (loaded via `-e`; reads env context) --------------

function contextFromEnv(): LaneExtensionContext {
  const laneId = process.env.PI_AWAY_LANE;
  const manifestPath = process.env.PI_AWAY_MANIFEST;
  const stagingRoot = process.env.PI_AWAY_STAGING_ROOT;
  const attestDir = process.env.PI_AWAY_ATTEST_DIR;
  const repoRoot = process.env.PI_AWAY_REPO_ROOT;
  if (!laneId || !manifestPath || !stagingRoot || !attestDir || !repoRoot) {
    throw new Error(
      "away-extension: missing PI_AWAY_{LANE,MANIFEST,STAGING_ROOT,ATTEST_DIR,REPO_ROOT} env",
    );
  }
  return { laneId, manifestPath, stagingRoot, attestDir, repoRoot };
}

export default function registerAwayLane(pi: {
  registerTool: (def: {
    name: string;
    description: string;
    parameters: object;
    execute: RegisteredTool["execute"];
  }) => void;
}): ExtensionState {
  const ctx = contextFromEnv();
  const state = createLaneExtension(ctx);
  for (const tool of state.tools) {
    pi.registerTool({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      execute: tool.execute,
    });
  }
  return state;
}
