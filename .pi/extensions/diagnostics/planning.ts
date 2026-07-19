import { accessSync, constants, existsSync } from "node:fs";
import { delimiter, extname, isAbsolute, join, resolve } from "node:path";
import type {
  Exists,
  Language,
  ResolvedDiagnosticsParams,
  ResolveBinary,
  RunnerPlan,
} from "./types.ts";

const LANGUAGE_ORDER: Language[] = ["typescript", "rust", "go", "python"];
const LANGUAGE_EXTENSIONS: Record<Language, string[]> = {
  typescript: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"],
  rust: [".rs"],
  go: [".go"],
  python: [".py", ".pyi"],
};

export const AUTO_CONFIG_FILES = new Set([
  "package.json",
  "tsconfig.json",
  "jsconfig.json",
  ".eslintrc",
  ".eslintrc.json",
  ".eslintrc.js",
  ".prettierrc",
  "bun.lock",
  "bun.lockb",
  "pnpm-lock.yaml",
  "yarn.lock",
  "package-lock.json",
  "Cargo.toml",
  "Cargo.lock",
  "go.mod",
  "go.sum",
  "pyproject.toml",
  "setup.py",
  "setup.cfg",
  "requirements.txt",
  "Pipfile",
]);

export const AUTO_EXTENSIONS = new Set(Object.values(LANGUAGE_EXTENSIONS).flat());

function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && LANGUAGE_ORDER.includes(value as Language);
}

export function detectLanguages(root: string, exists: Exists = existsSync): Language[] {
  return LANGUAGE_ORDER.filter((language) => {
    if (language === "typescript") return exists(join(root, "tsconfig.json"));
    if (language === "rust") return exists(join(root, "Cargo.toml"));
    if (language === "go") return exists(join(root, "go.mod"));
    return ["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", "Pipfile"].some((file) =>
      exists(join(root, file)),
    );
  });
}

export function resolveParams(
  raw: Record<string, unknown>,
  root: string,
  env: NodeJS.ProcessEnv = process.env,
  exists: Exists = existsSync,
): ResolvedDiagnosticsParams {
  const scope = raw.scope === "changed" ? "changed" : "full";
  const changedSince =
    typeof raw.changedSince === "string" && raw.changedSince.trim()
      ? raw.changedSince.trim()
      : env.PI_DIAGNOSTICS_CHANGED_SINCE?.trim() || "main";
  const languageFilter = Array.isArray(raw.languages) ? raw.languages.filter(isLanguage) : undefined;
  const languages = languageFilter?.length ? languageFilter : undefined;
  const includeFallow =
    typeof raw.includeFallow === "boolean"
      ? raw.includeFallow
      : exists(join(root, "tsconfig.json"));
  const includeAislop =
    typeof raw.includeAislop === "boolean"
      ? raw.includeAislop
      : env.PI_DIAGNOSTICS_SKIP_AISLOP !== "true" && env.PI_AISLOP_AUTO !== "true";
  const file = typeof raw.file === "string" && raw.file.trim() ? raw.file.trim() : undefined;
  return { scope, changedSince, languages, includeFallow, includeAislop, file };
}

function canExecute(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveExecutable(
  name: string,
  root: string,
  envName?: string,
  env: NodeJS.ProcessEnv = process.env,
  extraBinDirs: string[] = [],
): string | undefined {
  const requested = (envName ? env[envName]?.trim() : undefined) || name;
  if (isAbsolute(requested) || requested.includes("/") || requested.includes("\\")) {
    const candidate = isAbsolute(requested) ? requested : resolve(root, requested);
    return canExecute(candidate) ? candidate : undefined;
  }
  const local = join(root, "node_modules", ".bin", requested);
  if (canExecute(local)) return local;
  for (const dir of extraBinDirs) {
    const candidate = join(dir, requested);
    if (canExecute(candidate)) return candidate;
  }
  for (const dir of (env.PATH || "").split(delimiter).filter(Boolean)) {
    const candidate = join(dir, requested);
    if (canExecute(candidate)) return candidate;
  }
  return undefined;
}

function languageAllowed(language: Language, params: ResolvedDiagnosticsParams): boolean {
  if (params.languages?.length && !params.languages.includes(language)) return false;
  return !params.file || LANGUAGE_EXTENSIONS[language].includes(extname(params.file).toLowerCase());
}

function languagePlan(language: Language, binary: ResolveBinary): RunnerPlan {
  if (language === "typescript") {
    const command = binary("tsc");
    return {
      id: language,
      label: "TypeScript (tsc)",
      command,
      args: ["--noEmit", "--pretty", "false"],
      formatter: "plain",
      unavailableReason: command ? undefined : "tsc is not installed locally or on PATH",
    };
  }
  if (language === "rust") {
    const command = binary("cargo");
    return {
      id: language,
      label: "Rust (cargo check)",
      command,
      args: ["check", "--quiet"],
      formatter: "plain",
      unavailableReason: command ? undefined : "cargo is not installed on PATH",
    };
  }
  if (language === "go") {
    const command = binary("go");
    return {
      id: language,
      label: "Go (go vet)",
      command,
      args: ["vet", "./..."],
      formatter: "plain",
      unavailableReason: command ? undefined : "go is not installed on PATH",
    };
  }
  const ruff = binary("ruff");
  const mypy = ruff ? undefined : binary("mypy");
  return {
    id: language,
    label: ruff ? "Python (ruff)" : "Python (mypy)",
    command: ruff ?? mypy,
    args: ruff ? ["check", "."] : ["."],
    formatter: "plain",
    unavailableReason: ruff || mypy ? undefined : "neither ruff nor mypy is installed on PATH",
  };
}

function fallowPlans(params: ResolvedDiagnosticsParams, command?: string): RunnerPlan[] {
  const unavailableReason = command
    ? undefined
    : "fallow is not installed; safe mode never downloads it";
  if (params.scope === "changed") {
    return [
      {
        id: "fallow-changed",
        label: "Fallow (changed files)",
        command,
        args: ["--format", "json", "--quiet", "--changed-since", params.changedSince],
        formatter: "fallow-changed",
        unavailableReason,
      },
    ];
  }
  return [
    {
      id: "fallow-health",
      label: "Fallow (health)",
      command,
      args: ["health", "--format", "json", "--quiet", "--score", "--hotspots", "--targets"],
      formatter: "fallow-health",
      unavailableReason,
    },
    {
      id: "fallow-dead-code",
      label: "Fallow (dead code)",
      command,
      args: ["dead-code", "--format", "json", "--quiet"],
      formatter: "fallow-dead",
      unavailableReason,
    },
  ];
}

export function buildPlans(
  root: string,
  params: ResolvedDiagnosticsParams,
  options: { exists?: Exists; resolveBinary?: ResolveBinary } = {},
): { plans: RunnerPlan[]; detectedLanguages: Language[] } {
  const exists = options.exists ?? existsSync;
  const binary =
    options.resolveBinary ?? ((name, envName) => resolveExecutable(name, root, envName));
  const detectedLanguages = detectLanguages(root, exists);
  const plans = detectedLanguages
    .filter((language) => languageAllowed(language, params))
    .map((language) => languagePlan(language, binary));
  if (params.includeFallow && detectedLanguages.includes("typescript"))
    plans.push(...fallowPlans(params, binary("fallow", "FALLOW_BIN")));
  if (params.includeAislop) {
    const command = binary("aislop", "AISLOP_BIN");
    plans.push({
      id: "aislop",
      label: "aislop (AI slop)",
      command,
      args: ["scan", "--json"],
      formatter: "aislop",
      unavailableReason: command
        ? undefined
        : "aislop is not installed; safe mode never downloads it",
    });
  }
  return { plans, detectedLanguages };
}

export function isAutoConfigFile(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  return AUTO_CONFIG_FILES.has(normalized.slice(normalized.lastIndexOf("/") + 1));
}

export function createAutoGate(now: () => number = Date.now, debounceMs = 15000) {
  let lastRunAt = Number.NEGATIVE_INFINITY;
  return {
    claim(filePath: string): boolean {
      if (isAutoConfigFile(filePath) || !AUTO_EXTENSIONS.has(extname(filePath).toLowerCase()))
        return false;
      const current = now();
      if (current - lastRunAt < debounceMs) return false;
      lastRunAt = current;
      return true;
    },
  };
}
