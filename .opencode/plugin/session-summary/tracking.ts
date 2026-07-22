
import { MAX_READS, MAX_MODIFIED, MAX_CREATED, MAX_DECISIONS, MAX_NEXT_STEPS, type SessionSummaryData } from "./types.js";

export function enforceLimits(summary: SessionSummaryData): void {
  if (summary.files.read.size > MAX_READS) {
    const entries = [...summary.files.read.entries()];
    summary.files.read = new Map(entries.slice(entries.length - MAX_READS));
  }
  if (summary.files.modified.size > MAX_MODIFIED) {
    const entries = [...summary.files.modified.entries()];
    summary.files.modified = new Map(entries.slice(entries.length - MAX_MODIFIED));
  }
  if (summary.files.created.size > MAX_CREATED) {
    summary.files.created = new Set([...summary.files.created].slice(-MAX_CREATED));
  }
  if (summary.decisions.length > MAX_DECISIONS) {
    summary.decisions = summary.decisions.slice(-MAX_DECISIONS);
  }
  if (summary.nextSteps.length > MAX_NEXT_STEPS) {
    summary.nextSteps = summary.nextSteps.slice(-MAX_NEXT_STEPS);
  }
}

export function addRead(summary: SessionSummaryData, filePath: string, reason = ""): void {
  if (summary.files.read.has(filePath) && !reason) return;
  summary.files.read.delete(filePath);
  summary.files.read.set(filePath, reason);
}

export function addModified(summary: SessionSummaryData, filePath: string, detail: string): void {
  summary.files.modified.set(filePath, detail);
  summary.files.created.delete(filePath);
}

export function addDecision(summary: SessionSummaryData, what: string, rationale: string): void {
  summary.decisions.push({ what, rationale });
}

export function addCreated(summary: SessionSummaryData, filePath: string): void {
  summary.files.created.add(filePath);
}
