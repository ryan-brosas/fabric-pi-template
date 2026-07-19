import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const keywords: Record<string, string[]> = {
  coding: [
    "code",
    "bug",
    "repo",
    "refactor",
    "test",
    "implement",
    "fix",
    "function",
    "api",
    "add",
    "update",
    "remove",
  ],
  research: ["research", "compare", "find", "latest", "sources", "analyze", "look up"],
  writing: ["write", "rewrite", "draft", "email", "memo", "blog", "copy", "tone"],
  review: ["review", "audit", "critique", "inspect", "evaluate", "assess"],
  planning: ["plan", "roadmap", "strategy", "framework", "outline"],
  analysis: ["analyze", "explain", "break down", "diagnose", "root cause"],
};

function detectTask(prompt: string): string {
  const lower = prompt.toLowerCase();
  const [task, hits] = Object.entries(keywords)
    .map(([name, terms]) => [name, terms.filter((term) => lower.includes(term)).length] as const)
    .sort((a, b) => b[1] - a[1])[0]!;
  return hits > 0 ? task : "analysis";
}

function upgradePrompt(original: string): string {
  const normalized = original.trim().replace(/\s+/g, " ");
  if (normalized.length < 15 || normalized.split(" ").length < 3) return original;
  if (normalized.includes("Objective:") && normalized.includes("Context:")) return original;
  const task = detectTask(normalized);
  const intensity = /careful|deep|thorough|critical|production/i.test(normalized)
    ? "Deep"
    : ["coding", "research", "review"].includes(task)
      ? "Standard"
      : "Light";
  const toolRule =
    task === "coding"
      ? "Inspect relevant files and dependencies first; validate narrowly before broadening scope."
      : task === "research"
        ? "Retrieve reliable evidence before concluding; do not guess checkable facts."
        : task === "review"
          ? "Read enough context to understand intent; separate confirmed defects from plausible risks."
          : "Use tools or additional context only when they materially improve correctness.";
  return `Objective:\n- Complete this task: ${normalized}\n- Optimize for a correct, useful result rather than a merely plausible one.\n\nContext:\n- Preserve the operator\u0027s intent and constraints.\n- Surface key assumptions when required information is missing.\n\nWork Style:\n- Task type: ${task}\n- Effort level: ${intensity}\n- Understand the problem broadly enough to avoid narrow mistakes, then go deep where risk is highest.\n- Review non-trivial work once with fresh eyes before finalizing.\n\nTool Rules:\n- ${toolRule}\n\nOutput Contract:\n- Return a clear, practical result matched to the task without unnecessary verbosity.\n\nVerification:\n- Check correctness, completeness, and relevant edge cases.\n\nDone Criteria:\n- Stop only when the task, requested format, and verification boundary are satisfied.`;
}

// Ideation skills (grill-me, grill-with-docs, brainstorming) run as turn-by-turn
// operator dialogue. Rewriting those turns into a "Complete this task" coding
// objective reframes the conversation and pushes the model to run tools instead
// of interviewing, so the upgrade is skipped while an ideation session is active.
const IDEATION_RE =
  /\b(grill|brainstorm|ideat|stress[-\s]?test|poke\s+holes|devil\u0027?s?\s+advocate)/i;

function isIdeation(text: string): boolean {
  return IDEATION_RE.test(text);
}

function assistantTurnText(message: { role?: string; content?: unknown } | undefined): string {
  if (!message || message.role !== "assistant") return "";
  const content = message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (b) =>
          !!b &&
          (b as { type?: string }).type === "text" &&
          typeof (b as { text?: unknown }).text === "string",
      )
      .map((b) => (b as { text: string }).text)
      .join(" ");
  }
  return "";
}

// Mid-interview: the previous assistant turn (the current leaf, since the new
// user input is not yet appended) ends with a question. The reply is part of an
// ongoing dialogue, not a fresh task. Self-correcting: once the assistant stops
// asking questions and does work, upgrades resume.
function inInterview(ctx: {
  sessionManager?: {
    getLeafEntry?: () =>
      | { type?: string; message?: { role?: string; content?: unknown } }
      | undefined;
  };
}): boolean {
  try {
    const leaf = ctx.sessionManager?.getLeafEntry?.();
    if (!leaf || leaf.type !== "message") return false;
    return assistantTurnText(leaf.message).trim().endsWith("?");
  } catch {
    return false;
  }
}

export default function promptLeverage(pi: ExtensionAPI) {
  pi.on("input", async (event, ctx) => {
    if (event.source === "extension" || event.text.startsWith("/")) return { action: "continue" };
    if (isIdeation(event.text) || inInterview(ctx)) return { action: "continue" };
    const upgraded = upgradePrompt(event.text);
    if (upgraded === event.text) return { action: "continue" };
    if (ctx.hasUI) ctx.ui.notify("Prompt upgraded", "info");
    return { action: "transform", text: upgraded, images: event.images };
  });
}
