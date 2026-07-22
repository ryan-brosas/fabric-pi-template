import { detectLanguages, LANG_DIAGNOSTICS, runLanguages } from "./lang-runners.js";
import { runFallowAnalysis, FALLOW_UNAVAILABLE_MESSAGE } from "./fallow.js";
import { runAislopAnalysis } from "./aislop.js";
import type {
  DiagnosticBlockMeta,
  DiagnosticsDetails,
  ResolvedDiagnosticsParams,
} from "./types.js";

// Re-export the meta and details types so the main plugin can use them
export type { DiagnosticBlockMeta, DiagnosticsDetails } from "./types.js";

/** Full diagnostics result returned by the orchestrator. */
export interface FullDiagnosticsResult {
  text: string;
  details: DiagnosticsDetails;
}

export async function runFullDiagnostics(
  cwd: string,
  params: ResolvedDiagnosticsParams,
  signal?: AbortSignal,
): Promise<FullDiagnosticsResult> {
  const projectRoot = cwd;
  const detectedLanguages = detectLanguages(projectRoot);
  const blocks: { text: string; meta: DiagnosticBlockMeta }[] = [];

  // Language-specific diagnostics
  const langResults = await runLanguages(projectRoot, {
    languages: params.languages,
    file: params.file,
    signal,
  });
  blocks.push(...langResults);

  // Fallow (code quality) — only for TS/JS projects, scoped by params
  if (params.includeFallow) {
    const fallow = await runFallowAnalysis(projectRoot, params.scope, params.changedSince, signal);
    if (fallow) blocks.push(fallow);
  }

  // aislop (AI slop detection)
  if (params.includeAislop) {
    const aislop = await runAislopAnalysis(projectRoot, signal);
    if (aislop) blocks.push(aislop);
  }

  const textBlocks = blocks.map((b) => b.text).filter(Boolean);
  const detailsBase: DiagnosticsDetails = {
    cwd,
    projectRoot,
    scope: params.scope,
    blocks: blocks.map((b) => b.meta),
    detectedLanguages,
  };

  if (textBlocks.length === 0) {
    const detected = LANG_DIAGNOSTICS.filter((r) => r.detect(projectRoot));
    const parts: string[] = [];
    if (detected.length === 0) {
      parts.push(
        "No supported project detected. Diagnostics support: TypeScript (tsconfig.json), Rust (Cargo.toml), Go (go.mod), Python (pyproject.toml / setup.py).",
      );
    } else {
      parts.push(
        "All diagnostics passed cleanly:\n" +
          detected.map((r) => `  - ${r.label}: no errors`).join("\n"),
      );
    }
    // If Fallow was requested but unavailable, mention it
    if (
      params.includeFallow &&
      detectedLanguages.includes("typescript") &&
      !blocks.some((b) => b.meta.id === "fallow")
    ) {
      parts.push(`Fallow (code quality): ${FALLOW_UNAVAILABLE_MESSAGE}`);
    }
    return { text: parts.join("\n\n"), details: detailsBase };
  }

  return {
    text: textBlocks.join("\n\n"),
    details: detailsBase,
  };
}
