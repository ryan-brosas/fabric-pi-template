// Trusted operator adapter for the canonical direct-root away controller.
// Ordinary /supervise remains a prompt template; this extension registers no
// command named supervise.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import type {
  AwayControllerRequest,
  AwayControllerResult,
} from "../../away-runtime/controller.ts";
import { runSeniorAwayController } from "../../away-runtime/supervise-away.ts";

const ENTRY_KIND = "away-run";
const STATUS_KEY = "away-run";

export interface ParsedSuperviseAway {
  objective: string | undefined;
}

export interface AwayExtensionDependencies {
  runController: (
    request: AwayControllerRequest,
  ) => Promise<AwayControllerResult | Record<string, unknown>>;
}

/** Match only the recorded interactive/RPC grammar; reject multiline/control input. */
export function parseSuperviseAwayInput(text: string): ParsedSuperviseAway | null {
  if (typeof text !== "string" || /[\u0000\r\n]/.test(text)) return null;
  const match = text.match(/^\/supervise\s+--away(?:\s+(.*))?$/);
  if (!match) return null;
  const objective = match[1]?.trim();
  return { objective: objective || undefined };
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
      !cardId || !/^(?:RM-\d{3,}|MT-[0-9a-f]{12})$/.test(cardId) ||
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

/** The input boundary is the operator authorization; ADR-018 does not require an advisory actor. */
export function createAwayExtension(dependencies: AwayExtensionDependencies) {
  return function awayExtension(pi: ExtensionAPI): void {
    let running = false;

    const record = (
      result: Record<string, unknown>,
      context: ExtensionContext,
    ): void => {
      pi.appendEntry(ENTRY_KIND, result);
      if (context.hasUI) {
        context.ui.notify(resultText(result), result.kind === "blocked" ? "warning" : "info");
      }
    };

    pi.on("session_start", (_event, context) => {
      running = false;
      if (context.hasUI) context.ui.setStatus(STATUS_KEY, undefined);
    });

    pi.on("input", async (event, context) => {
      if (event.source === "extension" || event.streamingBehavior || !context.isIdle()) {
        return { action: "continue" };
      }
      const parsed = parseSuperviseAwayInput(event.text);
      if (!parsed) return { action: "continue" };
      if (!context.isProjectTrusted() || !isRootProcess()) {
        record({ kind: "blocked", message: "Away mode requires a trusted root Pi process." }, context);
        return { action: "handled" };
      }
      if (running) {
        if (context.hasUI) context.ui.notify("An away request is already running.", "warning");
        return { action: "handled" };
      }
      if (parsed.objective && parsed.objective.length > 4096) {
        record({ kind: "blocked", message: "Away objective exceeds 4096 characters." }, context);
        return { action: "handled" };
      }

      running = true;
      if (context.hasUI) context.ui.setStatus(STATUS_KEY, "away: running");
      try {
        const raw = await dependencies.runController({
          repoRoot: context.cwd,
          objective: parsed.objective,
        });
        record(safeResult(raw), context);
      } catch (error) {
        const reason = safeString(error instanceof Error ? error.message : undefined) ?? "unknown failure";
        record({ kind: "blocked", message: `Away controller failed: ${reason}` }, context);
      } finally {
        running = false;
        if (context.hasUI) context.ui.setStatus(STATUS_KEY, undefined);
      }
      return { action: "handled" };
    });

    pi.on("session_shutdown", (_event, context) => {
      running = false;
      if (context.hasUI) context.ui.setStatus(STATUS_KEY, undefined);
    });
  };
}

export default createAwayExtension({ runController: runSeniorAwayController });