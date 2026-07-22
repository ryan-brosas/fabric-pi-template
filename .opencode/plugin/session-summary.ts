/**
 * Session Summary Plugin — Structured Persistent Context
 *
 * Maintains a structured, incrementally-updated session summary that survives
 * DCP compression cycles ("anchored iterative summarization"). Tracks:
 *
 * 1. File artifact trail — which files were read, modified, or created
 * 2. Decisions — what was decided and why (rationale + alternatives)
 * 3. Session intent and state — what we're doing and where we are
 * 4. Continuation — next steps to resume work without re-fetching
 *
 * On each system.transform, the summary is injected into context.
 * On compaction, the summary is persisted to disk so it survives the cycle.
 *
 * Persistence: .opencode/state/session-summary.md
 * Hooks: tool.execute.before, experimental.chat.system.transform, experimental.session.compacting
 *
 * Inspired by: https://factory.ai/news/evaluating-compression
 */
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "@opencode-ai/plugin";
import { normalizePath, extractEditDetail, formatSummary } from "./session-summary/serialize.js";
import { enforceLimits, addRead, addModified, addCreated } from "./session-summary/tracking.js";
import { loadSummary, saveSummary } from "./session-summary/persist.js";

export const SessionSummaryPlugin: Plugin = async ({ client, directory }) => {
  const cwd = process.cwd();
  const stateDir = path.join(directory, ".opencode", "state");
  const summaryPath = path.join(stateDir, "session-summary.md");

  // Load persisted summary (survives compaction)
  const summary = loadSummary(summaryPath);

  // Helper to log
  const log = async (message: string, level: "info" | "warn" = "info") => {
    try {
      await client.app.log({
        body: { service: "session-summary", level, message },
      });
    } catch {
      /* Best-effort */
    }
  };

  // Attempt to guess intent from the first user message we see
  let intentGuessed = summary.intent.length > 0;

  return {
    "tool.execute.before": async (input, output) => {
      const tool = input.tool?.toLowerCase() ?? "";
      const args = (output.args as Record<string, unknown>) ?? {};
      const filePath = String(args.filePath ?? args.path ?? "").trim();

      if (!filePath) return;

      const normalized = normalizePath(filePath, cwd);

      switch (tool) {
        case "read":
          addRead(summary, normalized);
          break;
        case "edit":
          addModified(summary, normalized, extractEditDetail(args));
          break;
        case "write": {
          const absolutePath = path.isAbsolute(normalized)
            ? normalized
            : path.join(cwd, normalized);
          if (!fs.existsSync(absolutePath)) {
            addCreated(summary, normalized);
          }
          addModified(summary, normalized, "Written/created");
          break;
        }
        case "grep":
        case "glob":
          // Search tools — not tracking individual files
          break;
      }
    },

    "experimental.chat.system.transform": async (_input, output) => {
      const hasContent =
        summary.intent ||
        summary.files.modified.size > 0 ||
        summary.files.created.size > 0 ||
        summary.decisions.length > 0;

      if (!hasContent) return;

      const formatted = formatSummary(summary);
      output.system.push(`\n<session_summary>\n${formatted}\n</session_summary>`);
    },

    "experimental.session.compacting": async (_input, output) => {
      enforceLimits(summary);
      saveSummary(summaryPath, summary);
      await log("Session summary persisted for compaction");

      const existingPrompt = output.prompt ?? "";
      output.prompt = `${existingPrompt}

<session_summary_anchor>
The session artifact trail is tracked in .opencode/state/session-summary.md.
Preserve all file paths, decisions, and next steps noted there.
Include the updated summary in your compression output.
</session_summary_anchor>`;
    },

    event: async (input: unknown) => {
      const ev = (input as { event?: { type?: string; properties?: Record<string, unknown> } })
        ?.event;
      if (!ev?.type) return;

      // Capture session intent from first substantive user message
      if (!intentGuessed && ev.type === "message.updated") {
        const props = ev.properties as Record<string, unknown> | undefined;
        const content = props?.content as string | undefined;
        if (content && content.length > 10 && content.length < 500) {
          summary.intent = content.slice(0, 200);
          intentGuessed = true;
        }
      }

      // Decisions are tracked via file writes to .opencode/artifacts/MEMORY.md (user or agent)
    },
  };
};

export default SessionSummaryPlugin;
