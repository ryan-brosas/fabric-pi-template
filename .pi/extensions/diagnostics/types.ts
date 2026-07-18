export type DiagnosticsScope = "full" | "changed";
export type Language = "typescript" | "rust" | "go" | "python";

export interface ResolvedDiagnosticsParams {
  scope: DiagnosticsScope;
  changedSince: string;
  languages?: Language[];
  includeFallow: boolean;
  includeAislop: boolean;
  file?: string;
}

export interface RunnerPlan {
  id: string;
  label: string;
  command?: string;
  args: string[];
  formatter: "plain" | "fallow-health" | "fallow-dead" | "fallow-changed" | "aislop";
  unavailableReason?: string;
}

export interface ExecResult {
  stdout?: string;
  stderr?: string;
  code: number | null;
  killed?: boolean;
}

export type ExecRunner = (
  command: string,
  args: string[],
  options: { cwd: string; signal?: AbortSignal; timeout: number },
) => Promise<ExecResult>;

export interface DiagnosticBlock {
  id: string;
  label: string;
  ok: boolean;
  skipped: boolean;
  code: number | null;
  elapsedMs: number;
  text: string;
}

export interface DiagnosticsResult {
  text: string;
  blocks: DiagnosticBlock[];
  detectedLanguages: Language[];
  scope: DiagnosticsScope;
}

export type Exists = (path: string) => boolean;
export type ResolveBinary = (name: string, envName?: string) => string | undefined;
