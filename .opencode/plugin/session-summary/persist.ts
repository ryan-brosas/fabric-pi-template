
import fs from "node:fs";
import path from "node:path";
import type { SessionSummaryData } from "./types.js";
import { deserializeSummary, serializeSummary } from "./serialize.js";

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function loadSummary(filePath: string): SessionSummaryData {
  try {
    if (fs.existsSync(filePath)) {
      const text = fs.readFileSync(filePath, "utf-8").trim();
      if (text) return deserializeSummary(text);
    }
  } catch {
    /* Corrupted or missing — start fresh */
  }
  return {
    intent: "",
    state: "unknown",
    files: { modified: new Map(), created: new Set(), read: new Map() },
    decisions: [],
    nextSteps: [],
  };
}

export function saveSummary(filePath: string, summary: SessionSummaryData): void {
  try {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, serializeSummary(summary), "utf-8");
  } catch {
    /* Non-fatal — summary is best-effort */
  }
}
