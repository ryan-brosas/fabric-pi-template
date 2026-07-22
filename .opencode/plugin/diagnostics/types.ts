/** Diagnostics plugin shared types */

export type DiagnosticsScope = "full" | "changed";

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  elapsedMs: number;
  killed?: boolean;
  enoent?: boolean;
}

export interface RunBlockResult {
  text: string;
  meta: {
    id: string;
    exitCode: number | null;
    ok: boolean;
    elapsedMs?: number;
  };
}

export interface ResolvedDiagnosticsParams {
  scope: DiagnosticsScope;
  changedSince: string;
  languages?: string[];
  includeFallow: boolean;
  includeAislop: boolean;
  file?: string;
}

export interface DiagnosticBlockMeta {
  id: string;
  exitCode: number | null;
  ok: boolean;
  elapsedMs?: number;
}

export interface DiagnosticsDetails {
  cwd: string;
  projectRoot: string;
  scope: DiagnosticsScope;
  blocks: DiagnosticBlockMeta[];
  detectedLanguages: string[];
}
