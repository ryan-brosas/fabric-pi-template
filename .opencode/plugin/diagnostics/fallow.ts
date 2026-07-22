import fs from "node:fs";
import path from "node:path";
import { runCli } from "./lang-runners.js";
import type { RunBlockResult, DiagnosticsScope } from "./types.js";

export const FALLOW_UNAVAILABLE_MESSAGE =
  "Fallow CLI not available. Install `fallow` (npm i -g @fallow-cli) or set FALLOW_BIN.";

function buildFallowArgs(
  command: "check-changed" | "health" | "dead-code",
  changedSince: string,
): string[] {
  if (command === "check-changed") {
    return ["--format", "json", "--quiet", "--changed-since", changedSince];
  }
  if (command === "health") {
    return [
      "health",
      "--format",
      "json",
      "--quiet",
      "--changed-since",
      changedSince,
      "--score",
      "--hotspots",
      "--targets",
    ];
  }
  // dead-code
  return ["dead-code", "--format", "json", "--quiet", "--changed-since", changedSince];
}

async function execFallow(
  root: string,
  args: string[],
  signal?: AbortSignal,
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  elapsedMs: number;
  unavailable: boolean;
}> {
  const configured = process.env.FALLOW_BIN;

  const tryRun = async (bin: string, runArgs: string[]) => {
    const result = await runCli({ bin, args: runArgs, cwd: root, signal, timeoutMs: 120_000 });
    return {
      stdout: (result.stdout || "").trim(),
      stderr: (result.stderr || "").trim(),
      exitCode: result.exitCode,
      elapsedMs: result.elapsedMs,
      enoent: result.enoent,
    };
  };

  if (configured) {
    const r = await tryRun(configured, args);
    return { ...r, unavailable: false };
  }

  const local = Bun.which("fallow");
  if (local) {
    const r = await tryRun(local, args);
    if (!r.enoent && r.exitCode !== 127) {
      return { ...r, unavailable: false };
    }
  }

  const npx = Bun.which("npx");
  if (!npx) {
    return { stdout: "", stderr: "", exitCode: null, elapsedMs: 0, unavailable: true };
  }

  const r = await tryRun(npx, ["--yes", "fallow", ...args]);
  return { ...r, unavailable: false };
}

function formatFallowOutput(
  command: "check-changed" | "health" | "dead-code",
  stdout: string,
): string {
  if (!stdout) return "";
  try {
    const data = JSON.parse(stdout);
    const lines: string[] = [];

    if (command === "check-changed") {
      const issues = data.issues || data.result?.issues || [];
      if (issues.length === 0) return "No issues detected in changed files.";
      lines.push(`Fallow check-changed: ${issues.length} issue(s) in changed files`);
      for (const issue of issues.slice(0, 20)) {
        const loc = issue.file ? `${issue.file}${issue.line ? `:${issue.line}` : ""}` : "";
        lines.push(
          `  ${issue.severity === "error" ? "[ERR]" : "[WARN]"} ${issue.message || ""}${loc ? ` (${loc})` : ""}`,
        );
      }
      if (issues.length > 20) lines.push(`  ... and ${issues.length - 20} more`);
    } else if (command === "health") {
      const score = data.score ?? data.result?.score;
      if (score != null) lines.push(`Health score: ${score}/100`);
      const hotspots = data.hotspots || data.result?.hotspots || [];
      for (const h of hotspots.slice(0, 10)) {
        lines.push(`  Hotspot: ${h.file || h.path} (complexity: ${h.complexity ?? "?"})`);
      }
      const targets = data.targets || data.result?.targets || [];
      for (const t of targets.slice(0, 10)) {
        lines.push(`  Refactor target: ${t.file || t.path}`);
      }
      if (!lines.length) return "No health issues found.";
    } else {
      // dead-code
      const files = data.unusedFiles || data.result?.unusedFiles || data.files || [];
      if (files.length === 0) return "No dead code detected.";
      lines.push(`Fallow dead-code: ${files.length} unused file(s)`);
      for (const f of files.slice(0, 15)) {
        lines.push(
          `  ${typeof f === "string" ? f : f.file || f.path || f.name || JSON.stringify(f)}`,
        );
      }
      if (files.length > 15) lines.push(`  ... and ${files.length - 15} more`);
    }

    return lines.join("\n");
  } catch {
    // Fallback: return raw JSON truncated
    return stdout.length > 2000 ? stdout.slice(0, 2000) + "\n... (truncated)" : stdout;
  }
}

export async function runFallowAnalysis(
  root: string,
  scope: DiagnosticsScope,
  changedSince: string,
  signal?: AbortSignal,
): Promise<RunBlockResult | null> {
  if (!fs.existsSync(path.join(root, "tsconfig.json"))) return null;

  const parts: string[] = [];
  let totalElapsed = 0;
  let exitCode: number | null = 0;
  let sawUnavailable = false;

  if (scope === "changed") {
    const r = await execFallow(root, buildFallowArgs("check-changed", changedSince), signal);
    if (r.unavailable) sawUnavailable = true;
    else if (r.stdout) parts.push(formatFallowOutput("check-changed", r.stdout));
    totalElapsed += r.elapsedMs;
    exitCode = r.exitCode;
  } else {
    const health = await execFallow(root, buildFallowArgs("health", changedSince), signal);
    if (health.unavailable) sawUnavailable = true;
    else if (health.stdout) parts.push(formatFallowOutput("health", health.stdout));
    totalElapsed += health.elapsedMs;
    exitCode = health.exitCode;

    const dead = await execFallow(root, buildFallowArgs("dead-code", changedSince), signal);
    if (dead.unavailable) sawUnavailable = true;
    else if (dead.stdout) parts.push(formatFallowOutput("dead-code", dead.stdout));
    totalElapsed += dead.elapsedMs;
    if (dead.exitCode != null && dead.exitCode !== 0) exitCode = dead.exitCode;
  }

  if (parts.length === 0 && sawUnavailable) {
    return {
      text: `<diagnostics tool="Fallow (code quality)">\n  ${FALLOW_UNAVAILABLE_MESSAGE}\n</diagnostics>`,
      meta: { id: "fallow", exitCode: 127, ok: false, elapsedMs: totalElapsed },
    };
  }

  if (parts.length === 0) {
    return {
      text: "",
      meta: { id: "fallow", exitCode: 0, ok: true, elapsedMs: totalElapsed },
    };
  }

  const inner = [...parts, "", "  Tip: run `npx fallow` for the full suite."].join("\n");
  const text = `<diagnostics tool="Fallow (code quality)">\n  ${inner.replace(/\n/g, "\n  ")}\n</diagnostics>`;

  const hasFindings =
    /unused file|high-complexity|refactoring target|total_issues=[1-9]|verdict=fail/i.test(inner);
  return {
    text,
    meta: { id: "fallow", exitCode, ok: !hasFindings, elapsedMs: totalElapsed },
  };
}
