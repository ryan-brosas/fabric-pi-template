import path from "node:path";
import { EXT_TO_RUNNERS, runLanguages } from "./lang-runners.js";
import type { RunBlockResult } from "./types.js";

const CONFIG_FILES = new Set([
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

let lastRunTimestamp = 0;
export const DEBOUNCE_MS = 15_000;

export function touchDebounce(): void {
  lastRunTimestamp = Date.now();
}

/** Check whether to skip auto-diagnostics for a file path. */
export function shouldSkipAuto(filePath: string): boolean {
  const basename = path.basename(filePath);
  if (CONFIG_FILES.has(basename)) return true;
  const now = Date.now();
  if (now - lastRunTimestamp < DEBOUNCE_MS) return true;
  return false;
}

/** Return active runners that apply to the given file. */
export function activeRunnersForFile(root: string, filePath: string): Set<string> {
  const ext = path.extname(filePath).toLowerCase();
  const matching = EXT_TO_RUNNERS.get(ext);
  if (!matching?.length) return new Set();
  return new Set(matching.filter((r) => r.detect(root)).map((r) => r.name));
}

/**
 * Run auto-diagnostics after a file edit.
 * Only runs language runners whose extensions match the edited file.
 */
export async function runAutoInject(
  root: string,
  filePath: string,
  signal?: AbortSignal,
): Promise<RunBlockResult[]> {
  const blocks: RunBlockResult[] = [];
  const langResults = await runLanguages(root, { file: filePath, signal });
  blocks.push(...langResults.filter((b) => b.text));
  return blocks;
}
