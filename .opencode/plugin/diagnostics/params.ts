import fs from "node:fs";
import path from "node:path";
import type { DiagnosticsScope, ResolvedDiagnosticsParams } from "./types.js";

function hasTsProject(root: string): boolean {
  return fs.existsSync(path.join(root, "tsconfig.json"));
}

function defaultIncludeAislop(): boolean {
  if (process.env.PI_DIAGNOSTICS_SKIP_AISLOP === "true") return false;
  if (process.env.PI_AISLOP_AUTO === "true") return false;
  return true;
}

function defaultChangedSince(): string {
  return process.env.PI_DIAGNOSTICS_CHANGED_SINCE || "main";
}

/** Resolve raw tool parameters into typed params with defaults. */
export function resolveParams(
  raw: Record<string, unknown>,
  projectRoot?: string,
): ResolvedDiagnosticsParams {
  const scope = (raw.scope as DiagnosticsScope | undefined) || "full";
  const changedSince =
    typeof raw.changedSince === "string" && raw.changedSince.trim()
      ? raw.changedSince.trim()
      : defaultChangedSince();
  const languages = Array.isArray(raw.languages)
    ? raw.languages.filter((x): x is string => typeof x === "string")
    : undefined;

  // Default includeFallow to true when tsconfig.json exists (TS/JS project)
  const root = projectRoot || process.cwd();
  const rawFallow = raw.includeFallow;
  const includeFallow = typeof rawFallow === "boolean" ? rawFallow : hasTsProject(root);

  const rawAislop = raw.includeAislop;
  const includeAislop = typeof rawAislop === "boolean" ? rawAislop : defaultIncludeAislop();

  const file = typeof raw.file === "string" && raw.file.trim() ? raw.file.trim() : undefined;
  return { scope, changedSince, languages, includeFallow, includeAislop, file };
}
