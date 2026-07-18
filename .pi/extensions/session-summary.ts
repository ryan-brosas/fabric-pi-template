import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

interface Summary {
  intent: string;
  state: "exploring" | "implementing" | "verifying" | "done" | "unknown";
  read: Map<string, string>;
  modified: Map<string, string>;
  created: Set<string>;
  decisions: Array<{ what: string; rationale: string }>;
  next: string[];
}

const fresh = (): Summary => ({ intent: "", state: "unknown", read: new Map(), modified: new Map(), created: new Set(), decisions: [], next: [] });

function normalized(path: string, cwd: string): string {
  const absolute = isAbsolute(path) ? path : resolve(cwd, path);
  const local = relative(cwd, absolute);
  return local.startsWith("..") ? absolute : local;
}

function parse(raw: string): Summary {
  const out = fresh();
  for (const line of raw.split("\n")) {
    const kind = line.slice(0, 1); const value = line.slice(3).trim(); if (!value) continue;
    const [left, right = ""] = value.split(" | ", 2);
    if (kind === "I") out.intent = value;
    else if (kind === "S" && ["exploring", "implementing", "verifying", "done", "unknown"].includes(value)) out.state = value as Summary["state"];
    else if (kind === "R") out.read.set(left, right);
    else if (kind === "M") out.modified.set(left, right || "Modified");
    else if (kind === "C") out.created.add(value);
    else if (kind === "D") out.decisions.push({ what: left, rationale: right });
    else if (kind === "N") out.next.push(value);
  }
  return out;
}

function serialize(s: Summary): string {
  return [
    `I: ${s.intent}`, `S: ${s.state}`,
    ...[...s.created].slice(-10).map((p) => `C: ${p}`),
    ...[...s.modified].slice(-20).map(([p, d]) => `M: ${p} | ${d}`),
    ...[...s.read].slice(-30).map(([p, d]) => `R: ${p}${d ? ` | ${d}` : ""}`),
    ...s.decisions.slice(-10).map((d) => `D: ${d.what}${d.rationale ? ` | ${d.rationale}` : ""}`),
    ...s.next.slice(-8).map((n) => `N: ${n}`),
  ].join("\n");
}

function format(s: Summary): string {
  const lines = [`intent: ${s.intent || "unknown"}`, `state: ${s.state}`];
  if (s.created.size || s.modified.size || s.read.size) {
    lines.push("", "== files ==");
    for (const p of [...s.created].slice(-10)) lines.push(`created: ${p}`);
    for (const [p, d] of [...s.modified].slice(-20)) lines.push(`modified: ${p} — ${d}`);
    for (const [p, d] of [...s.read].slice(-12)) lines.push(`read: ${p}${d ? ` — ${d}` : ""}`);
  }
  if (s.decisions.length) {
    lines.push("", "== decisions ==", ...s.decisions.slice(-10).map((d) => `- ${d.what}${d.rationale ? ` | ${d.rationale}` : ""}`));
  }
  if (s.next.length) lines.push("", "== next ==", ...s.next.slice(-8).map((n) => `- ${n}`));
  const result = lines.join("\n");
  return result.length > 2400 ? `${result.slice(0, 2350)}\n... summary truncated` : result;
}

export default function sessionSummary(pi: ExtensionAPI) {
  let summary = fresh();
  let summaryPath = "";
  const save = () => {
    if (!summaryPath) return;
    mkdirSync(dirname(summaryPath), { recursive: true });
    writeFileSync(summaryPath, serialize(summary), "utf8");
  };

  pi.on("session_start", (_event, ctx) => {
    summaryPath = resolve(ctx.cwd, ".pi/state/session-summary.md");
    summary = existsSync(summaryPath) ? parse(readFileSync(summaryPath, "utf8")) : fresh();
  });

  pi.on("input", (event) => {
    if (event.source !== "extension" && !summary.intent && !event.text.startsWith("/") && event.text.trim().length > 10) {
      summary.intent = event.text.trim().replace(/\s+/g, " ").slice(0, 240);
      save();
    }
    return { action: "continue" };
  });

  pi.on("tool_call", (event, ctx) => {
    if (!["read", "edit", "write"].includes(event.toolName)) return;
    const raw = String(event.input.path ?? event.input.filePath ?? "").trim(); if (!raw) return;
    const path = normalized(raw, ctx.cwd);
    if (event.toolName === "read") summary.read.set(path, "");
    else if (event.toolName === "edit") summary.modified.set(path, "Edited");
    else {
      const absolute = isAbsolute(raw) ? raw : resolve(ctx.cwd, raw);
      if (!existsSync(absolute)) summary.created.add(path);
      summary.modified.set(path, "Written or created");
    }
    save();
  });

  pi.on("before_agent_start", (event) => {
    if (!summary.intent && !summary.modified.size && !summary.decisions.length && !summary.next.length) return;
    return { systemPrompt: `${event.systemPrompt}\n\n<session_summary>\n${format(summary)}\n</session_summary>` };
  });

  pi.on("session_before_compact", () => { save(); });
  pi.on("session_shutdown", () => { save(); });

  pi.registerTool({
    name: "session_summary_update",
    label: "Session Summary",
    description: "Update durable session state, decisions, and next steps used across compaction and reload.",
    parameters: Type.Object({
      state: Type.Optional(Type.String()),
      decision: Type.Optional(Type.String()),
      rationale: Type.Optional(Type.String()),
      nextStep: Type.Optional(Type.String()),
      readPath: Type.Optional(Type.String()),
      readFinding: Type.Optional(Type.String()),
    }),
    async execute(_id, args, _signal, _update, ctx) {
      if (args.state && ["exploring", "implementing", "verifying", "done", "unknown"].includes(args.state)) summary.state = args.state as Summary["state"];
      if (args.decision) summary.decisions.push({ what: args.decision, rationale: args.rationale ?? "" });
      if (args.nextStep) summary.next.push(args.nextStep);
      if (args.readPath) summary.read.set(normalized(args.readPath, ctx.cwd), args.readFinding ?? "");
      save();
      return { content: [{ type: "text", text: format(summary) }], details: { path: summaryPath } };
    },
  });
}