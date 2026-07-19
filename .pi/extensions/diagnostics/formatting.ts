import type { DiagnosticBlock, ExecResult, ExecRunner, RunnerPlan } from "./types.ts";

function escapeDiagnosticText(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function array(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function issueCount(data: any, fallback = 0): number {
  const value = data?.total_issues ?? data?.summary?.total_issues ?? data?.result?.total_issues;
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function unrecognized(tool: string, raw: string): { text: string; findings: boolean } {
  return {
    text: `Unrecognized ${tool} output; refusing to report a clean result.\n${raw}`,
    findings: true,
  };
}

function formatFallow(
  raw: string,
  formatter: RunnerPlan["formatter"],
): { text: string; findings: boolean } {
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    return unrecognized("Fallow", raw);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return unrecognized("Fallow", raw);

  if (formatter === "fallow-changed") {
    const issues = array(data.issues ?? data.result?.issues);
    const total = issueCount(data, issues.length);
    const recognized =
      "total_issues" in data || "issues" in data || data.result?.issues !== undefined;
    if (!recognized) return unrecognized("Fallow changed-analysis", raw);
    if (!total) return { text: "No issues detected in changed files.", findings: false };
    const lines = [`Fallow changed analysis: ${total} issue(s)`];
    for (const issue of issues.slice(0, 20)) {
      const location = issue.file ? `${issue.file}${issue.line ? `:${issue.line}` : ""}` : "";
      lines.push(
        `${issue.severity === "error" ? "[ERR]" : "[WARN]"} ${issue.message ?? ""}${location ? ` (${location})` : ""}`,
      );
    }
    if (issues.length > 20) lines.push(`... and ${issues.length - 20} more`);
    return { text: lines.join("\n"), findings: true };
  }

  if (formatter === "fallow-health") {
    const hotspots = array(data.hotspots ?? data.result?.hotspots);
    const targets = array(data.targets ?? data.result?.targets);
    const score = data.score ?? data.result?.score;
    const recognized =
      data.kind === "health" || score != null || hotspots.length > 0 || targets.length > 0;
    if (!recognized) return unrecognized("Fallow health", raw);
    const lines: string[] = [];
    if (score != null) lines.push(`Health score: ${score}/100`);
    for (const hotspot of hotspots.slice(0, 10))
      lines.push(
        `Hotspot: ${hotspot.file ?? hotspot.path ?? "unknown"} (complexity: ${hotspot.complexity ?? "?"})`,
      );
    for (const target of targets.slice(0, 10))
      lines.push(`Refactor target: ${target.file ?? target.path ?? "unknown"}`);
    return {
      text: lines.join("\n") || "No health issues found.",
      findings: hotspots.length + targets.length > 0,
    };
  }

  const keys = [
    "unused_files",
    "unused_exports",
    "unused_types",
    "unused_dependencies",
    "unused_dev_dependencies",
    "unused_enum_members",
    "unused_class_members",
    "unresolved_imports",
    "unlisted_dependencies",
    "duplicate_exports",
    "circular_dependencies",
    "re_export_cycles",
    "boundary_violations",
    "stale_suppressions",
  ];
  const legacyFiles = array(data.unusedFiles ?? data.result?.unusedFiles ?? data.files);
  const categorized = keys.flatMap((key) => array(data[key]).map((finding) => ({ key, finding })));
  const total = issueCount(data, categorized.length || legacyFiles.length) || categorized.length + legacyFiles.length;
  const recognized =
    data.kind === "dead-code" ||
    "total_issues" in data ||
    categorized.length > 0 ||
    legacyFiles.length > 0;
  if (!recognized) return unrecognized("Fallow dead-code", raw);
  if (!total) return { text: "No dead code detected.", findings: false };
  const lines = [`Fallow dead-code: ${total} issue(s)`];
  for (const { key, finding } of categorized.slice(0, 15)) {
    const detail =
      typeof finding === "string"
        ? finding
        : (finding.path ??
          finding.file ??
          finding.name ??
          finding.export_name ??
          JSON.stringify(finding));
    lines.push(`${key}: ${detail}`);
  }
  if (!categorized.length) {
    for (const file of legacyFiles.slice(0, 15))
      lines.push(
        typeof file === "string"
          ? file
          : (file.file ?? file.path ?? file.name ?? JSON.stringify(file)),
      );
  }
  const shown = categorized.length || legacyFiles.length;
  if (shown > 15) lines.push(`... and ${shown - 15} more shown categories`);
  return { text: lines.join("\n"), findings: true };
}

function formatAislop(raw: string): { text: string; findings: boolean } {
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    return unrecognized("aislop", raw);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return unrecognized("aislop", raw);
  if (data.scoreable === false) return { text: "No scoreable slop findings.", findings: false };
  if (data.scoreable !== true) return unrecognized("aislop", raw);
  const diagnostics = array(data.diagnostics);
  const lines = [`Slop score: ${data.score ?? "?"}/100`];
  for (const finding of diagnostics.slice(0, 20)) {
    const location = finding.filePath
      ? `${finding.filePath}${finding.line ? `:${finding.line}` : ""}`
      : "";
    lines.push(
      `[${String(finding.severity ?? "info").toUpperCase()}] ${String(finding.message ?? "").slice(0, 120)}${location ? ` (${location})` : ""}`,
    );
  }
  if (diagnostics.length > 20) lines.push(`... and ${diagnostics.length - 20} more`);
  return { text: lines.join("\n"), findings: diagnostics.length > 0 };
}

function abortError(signal?: AbortSignal): Error {
  const reason = signal?.reason;
  return reason instanceof Error
    ? reason
    : Object.assign(new Error("Diagnostics cancelled"), { name: "AbortError" });
}

function skipped(plan: RunnerPlan, reason: string, elapsedMs = 0): DiagnosticBlock {
  return block(plan, false, true, null, reason, elapsedMs);
}

function block(
  plan: RunnerPlan,
  ok: boolean,
  skippedValue: boolean,
  code: number | null,
  body: string,
  elapsedMs: number,
): DiagnosticBlock {
  const status = skippedValue ? "skip" : ok ? "pass" : "fail";
  return {
    id: plan.id,
    label: plan.label,
    ok,
    skipped: skippedValue,
    code,
    elapsedMs,
    text: `<diagnostics tool="${plan.label}" status="${status}">\n${body
      .split("\n")
      .map((line) => `  ${escapeDiagnosticText(line)}`)
      .join("\n")}\n</diagnostics>`,
  };
}

export async function executePlan(
  plan: RunnerPlan,
  root: string,
  exec: ExecRunner,
  signal?: AbortSignal,
): Promise<DiagnosticBlock> {
  const started = Date.now();
  if (!plan.command) return skipped(plan, plan.unavailableReason || "runner unavailable");
  if (signal?.aborted) throw abortError(signal);

  let result: ExecResult;
  try {
    result = await exec(plan.command, plan.args, { cwd: root, signal, timeout: 120000 });
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError"))
      throw abortError(signal);
    return skipped(
      plan,
      error instanceof Error ? error.message : String(error),
      Date.now() - started,
    );
  }
  if (signal?.aborted) throw abortError(signal);
  if (result.killed)
    return block(
      plan,
      false,
      false,
      result.code,
      "runner was killed or timed out",
      Date.now() - started,
    );

  const raw = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  let formatted = { text: raw, findings: false };
  if (raw && plan.formatter.startsWith("fallow")) formatted = formatFallow(raw, plan.formatter);
  else if (raw && plan.formatter === "aislop") formatted = formatAislop(raw);
  const ok = result.code === 0 && !formatted.findings;
  const body = formatted.text || (ok ? "clean" : `exited with code ${result.code ?? "unknown"}`);
  return block(plan, ok, false, result.code, body, Date.now() - started);
}
