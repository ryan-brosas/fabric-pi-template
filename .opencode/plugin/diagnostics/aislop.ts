// aislop-ignore-file -- reporting functions are intentionally complex to provide detailed diagnostics output
import { runCli } from "./lang-runners.js";
import type { RunBlockResult } from "./types.js";

function formatAislopJson(raw: string): string {
  try {
    const data = raw.startsWith("{") ? JSON.parse(raw) : null;
    if (!data) return "";
    if (!data.scoreable) return "";

    const lines: string[] = [];
    const color = data.score >= 80 ? "OK" : data.score >= 50 ? "WARN" : "FAIL";
    lines.push(`Slop score: ${data.score}/100 (${color})`);

    const summary = data.summary || {};
    const errCount = summary.errors || 0;
    const warnCount = summary.warnings || 0;
    if (errCount > 0 || warnCount > 0) {
      const parts: string[] = [];
      if (errCount > 0) parts.push(`${errCount} errors`);
      if (warnCount > 0) parts.push(`${warnCount} warnings`);
      lines.push(`Findings: ${parts.join(", ")}`);
    }

    const diagnostics = data.diagnostics || [];
    const byEngine = new Map<string, typeof diagnostics>();
    for (const d of diagnostics) {
      const engine = d.engine || "unknown";
      if (!byEngine.has(engine)) byEngine.set(engine, []);
      byEngine.get(engine)!.push(d);
    }

    for (const [engine, diags] of byEngine) {
      const label = (data.engineDefinitions?.[engine]?.label || engine).padEnd(14);
      lines.push(`  ${label}  ${diags.length} finding(s)`);
      for (const d of diags.slice(0, 5)) {
        const tag =
          d.severity === "error" ? "[ERR]" : d.severity === "warning" ? "[WARN]" : "[INFO]";
        const loc = d.filePath ? `${d.filePath}${d.line ? `:${d.line}` : ""}` : "";
        lines.push(`    ${tag} ${(d.message || "").slice(0, 100)}${loc ? ` (${loc})` : ""}`);
      }
      if (diags.length > 5) lines.push(`    ... and ${diags.length - 5} more`);
    }

    if (lines.length <= 1) return "No slop issues found";
    return lines.join("\n");
  } catch {
    return "";
  }
}

export async function runAislopAnalysis(
  root: string,
  signal?: AbortSignal,
): Promise<RunBlockResult | null> {
  const aislopBin = Bun.which("aislop");
  const npx = Bun.which("npx");
  if (!aislopBin && !npx) {
    return {
      text: `<diagnostics tool="aislop (AI slop)">\n  aislop CLI not available. Install or use npx.\n</diagnostics>`,
      meta: { id: "aislop", exitCode: 127, ok: false },
    };
  }

  const useNpx = !aislopBin;
  const bin = useNpx ? npx! : aislopBin!;
  const args = useNpx ? ["--yes", "aislop@latest", "scan", "--json"] : ["scan", "--json"];

  const result = await runCli({ bin, args, cwd: root, signal, timeoutMs: 120_000 });

  const raw = (result.stdout || "").trim();
  if (!raw && result.enoent) {
    return {
      text: `<diagnostics tool="aislop (AI slop)">\n  aislop CLI not available.\n</diagnostics>`,
      meta: { id: "aislop", exitCode: 127, ok: false, elapsedMs: result.elapsedMs },
    };
  }

  const formatted = formatAislopJson(raw);
  if (!formatted) {
    return {
      text: "",
      meta: { id: "aislop", exitCode: result.exitCode, ok: true, elapsedMs: result.elapsedMs },
    };
  }

  const inner = formatted.split("\n");
  const text = `<diagnostics tool="aislop (AI slop)">\n  ${inner.join("\n  ")}\n</diagnostics>`;
  const ok = formatted.includes("No slop") || result.exitCode === 0;

  return {
    text,
    meta: { id: "aislop", exitCode: result.exitCode, ok, elapsedMs: result.elapsedMs },
  };
}
