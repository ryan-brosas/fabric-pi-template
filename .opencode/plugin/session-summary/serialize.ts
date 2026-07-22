import { MAX_SUMMARY_CHARS, type SessionSummaryData } from "./types.js";
import path from "node:path";

/**
 * Extract a short change description from edit tool args.
 */
export function extractEditDetail(args: Record<string, unknown>): string {
  const oldStr = String(args.oldString ?? "").trim();
  const newStr = String(args.newString ?? "").trim();
  if (!oldStr || !newStr) return "Modified";

  if (oldStr.length > newStr.length * 3) return "Truncated/reduced content";
  if (newStr.length > oldStr.length * 3) return "Expanded content";
  const oldLine = oldStr.split("\n")[0]?.trim() ?? "";
  const newLine = newStr.split("\n")[0]?.trim() ?? "";
  if (oldLine && newLine && oldLine !== newLine) {
    const maxLen = 60;
    const shortOld = oldLine.length > maxLen ? `${oldLine.slice(0, maxLen)}…` : oldLine;
    const shortNew = newLine.length > maxLen ? `${newLine.slice(0, maxLen)}…` : newLine;
    return `"${shortOld}" → "${shortNew}"`;
  }
  return "Modified";
}

/**
 * Normalize file path: strip leading ./ and cwd prefix.
 */
export function normalizePath(filePath: string, cwd: string): string {
  let normalized = filePath.startsWith("./") ? filePath.slice(2) : filePath;

  // Strip path:line or path:start-end suffix.
  normalized = normalized.replace(/:\d+(-\d+)?$/, "");

  if (path.isAbsolute(normalized)) {
    const relative = path.relative(cwd, normalized);
    if (!relative.startsWith("..")) return relative;
    return normalized;
  }
  return normalized;
}

/**
 * Format the summary for context injection (compact markdown).
 */
export function formatSummary(s: SessionSummaryData): string {
  const lines: string[] = [`intent: ${s.intent}`, `state: ${s.state}`, ""];

  const fileParts: string[] = [];

  if (s.files.created.size > 0) {
    fileParts.push(`created: ${[...s.files.created].map((p) => `\`${p}\``).join(", ")}`);
  }

  if (s.files.modified.size > 0) {
    for (const [p, detail] of s.files.modified) {
      fileParts.push(`modified: \`${p}\` — ${detail}`);
    }
  }

  if (s.files.read.size > 0) {
    const readsWithReason = [...s.files.read.entries()].filter(([, r]) => r.length > 0);
    if (readsWithReason.length > 0) {
      for (const [p, reason] of readsWithReason) {
        fileParts.push(`read: \`${p}\` — ${reason}`);
      }
    }
    const extraReads = s.files.read.size - readsWithReason.length;
    if (extraReads > 0) {
      fileParts.push(`read: ${extraReads} more files (no specific notes)`);
    }
  }

  if (fileParts.length > 0) {
    lines.push("== files ==");
    lines.push(...fileParts);
    lines.push("");
  }

  if (s.decisions.length > 0) {
    lines.push("== decisions ==");
    for (const d of s.decisions) {
      const maxWhat = 120;
      const what = d.what.length > maxWhat ? `${d.what.slice(0, maxWhat)}…` : d.what;
      const maxRat = 200;
      const rationale =
        d.rationale.length > maxRat ? `${d.rationale.slice(0, maxRat)}…` : d.rationale;
      lines.push(`- ${what} | ${rationale}`);
    }
    lines.push("");
  }

  if (s.nextSteps.length > 0) {
    lines.push("== next ==");
    for (const step of s.nextSteps) {
      lines.push(`- ${step}`);
    }
    lines.push("");
  }

  let result = lines.join("\n").trim();

  if (result.length > MAX_SUMMARY_CHARS) {
    result = result.slice(0, MAX_SUMMARY_CHARS);
    const lastNewline = result.lastIndexOf("\n");
    if (lastNewline > 0) result = result.slice(0, lastNewline);
    result += "\n… (summary truncated)";
  }

  return result;
}

/**
 * Serialize summary to compact line-based format for disk persistence.
 */
export function serializeSummary(s: SessionSummaryData): string {
  const lines: string[] = [];
  lines.push(`I: ${s.intent}`);
  lines.push(`S: ${s.state}`);

  for (const p of s.files.created) {
    lines.push(`C: ${p}`);
  }
  for (const [p, d] of s.files.modified) {
    const detail = d.replace(/\n/g, " ");
    if (detail) {
      lines.push(`M: ${p} | ${detail}`);
    } else {
      lines.push(`M: ${p}`);
    }
  }
  for (const [p, r] of s.files.read) {
    const reason = r.replace(/\n/g, " ");
    if (reason) {
      lines.push(`R: ${p} | ${reason}`);
    } else {
      lines.push(`R: ${p}`);
    }
  }
  for (const d of s.decisions) {
    const what = d.what.replace(/\n/g, " ");
    const rat = d.rationale.replace(/\n/g, " ");
    if (rat) {
      lines.push(`D: ${what} | ${rat}`);
    } else {
      lines.push(`D: ${what}`);
    }
  }
  for (const step of s.nextSteps) {
    lines.push(`N: ${step}`);
  }

  return lines.join("\n");
}

/**
 * Parse the serialized format back into a SessionSummaryData.
 */
export function deserializeSummary(text: string): SessionSummaryData {
  const summary: SessionSummaryData = {
    intent: "",
    state: "unknown",
    files: { modified: new Map(), created: new Set(), read: new Map() },
    decisions: [],
    nextSteps: [],
  };

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 3) continue;

    const prefix = trimmed[0];
    const content = trimmed.slice(2).trim();
    if (!content) continue;

    switch (prefix) {
      case "I":
        summary.intent = content;
        break;
      case "S":
        if (["exploring", "implementing", "verifying", "done", "unknown"].includes(content)) {
          summary.state = content as SessionSummaryData["state"];
        }
        break;
      case "C":
        summary.files.created.add(content);
        break;
      case "M": {
        const pipeIdx = content.indexOf(" | ");
        if (pipeIdx > 0) {
          summary.files.modified.set(content.slice(0, pipeIdx), content.slice(pipeIdx + 3).trim());
        } else {
          summary.files.modified.set(content, "Modified");
        }
        break;
      }
      case "R": {
        const pipeIdx = content.indexOf(" | ");
        if (pipeIdx > 0) {
          summary.files.read.set(content.slice(0, pipeIdx), content.slice(pipeIdx + 3).trim());
        } else {
          summary.files.read.set(content, "");
        }
        break;
      }
      case "D": {
        const pipeIdx = content.indexOf(" | ");
        if (pipeIdx > 0) {
          summary.decisions.push({
            what: content.slice(0, pipeIdx),
            rationale: content.slice(pipeIdx + 3).trim(),
          });
        } else {
          summary.decisions.push({ what: content, rationale: "" });
        }
        break;
      }
      case "N":
        summary.nextSteps.push(content);
        break;
    }
  }

  return summary;
}
