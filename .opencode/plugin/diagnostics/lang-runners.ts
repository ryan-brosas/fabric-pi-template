// aislop-ignore-file -- runner entries are intentionally structurally similar for consistent language registration
import fs from "node:fs";
import path from "node:path";
import type { CliResult, RunBlockResult } from "./types.js";

export interface DiagnosticRunner {
  name: string;
  label: string;
  extensions: string[];
  detect(root: string): boolean;
  resolve(root: string): { bin: string; args: string[] } | null;
}

export async function runCli(opts: {
  bin: string;
  args: string[];
  cwd: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<CliResult> {
  const start = performance.now();
  const proc = Bun.spawn([opts.bin, ...opts.args], {
    cwd: opts.cwd,
    signal: opts.signal,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const timeout = opts.timeoutMs ?? 60_000;
  const timer = setTimeout(() => {
    try {
      proc.kill();
    } catch {
      /* already dead */
    }
  }, timeout);

  try {
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;
    const elapsedMs = Math.round(performance.now() - start);
    return { stdout, stderr, exitCode, elapsedMs };
  } catch (err: unknown) {
    const elapsedMs = Math.round(performance.now() - start);
    if ((err as Error)?.name === "AbortError") {
      return { stdout: "", stderr: "", exitCode: null, elapsedMs, killed: true };
    }
    return { stdout: "", stderr: "", exitCode: null, elapsedMs, enoent: true };
  } finally {
    clearTimeout(timer);
  }
}

function nodeBin(root: string, name: string): string {
  return path.join(root, "node_modules", ".bin", name);
}

function resolveRunner(binName: string, args: string[]): { bin: string; args: string[] } | null {
  const bin = Bun.which(binName);
  if (!bin) return null;
  return { bin, args };
}

export const LANG_DIAGNOSTICS: DiagnosticRunner[] = [
  {
    name: "typescript",
    label: "TypeScript (tsc)",
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"],
    detect(root) {
      return fs.existsSync(path.join(root, "tsconfig.json"));
    },
    resolve(root) {
      const localTsc = nodeBin(root, "tsc");
      if (fs.existsSync(localTsc)) {
        return { bin: localTsc, args: ["--noEmit", "--pretty", "false"] };
      }
      // Fallback to npx
      return { bin: "npx", args: ["--yes", "tsc", "--noEmit", "--pretty", "false"] };
    },
  },
  {
    name: "rust",
    label: "Rust (cargo check)",
    extensions: [".rs"],
    detect(root) {
      return fs.existsSync(path.join(root, "Cargo.toml"));
    },
    resolve() {
      return resolveRunner("cargo", ["check", "--quiet"]);
    },
  },
  {
    name: "go",
    label: "Go (go vet)",
    extensions: [".go"],
    detect(root) {
      return fs.existsSync(path.join(root, "go.mod"));
    },
    resolve() {
      return resolveRunner("go", ["vet", "./..."]);
    },
  },
  {
    name: "python",
    label: "Python (ruff)",
    extensions: [".py", ".pyi"],
    detect(root) {
      return (
        fs.existsSync(path.join(root, "pyproject.toml")) ||
        fs.existsSync(path.join(root, "setup.py")) ||
        fs.existsSync(path.join(root, "setup.cfg")) ||
        fs.existsSync(path.join(root, "requirements.txt")) ||
        fs.existsSync(path.join(root, "Pipfile"))
      );
    },
    resolve() {
      const ruff = Bun.which("ruff");
      if (ruff) return { bin: ruff, args: ["check", "."] };
      const mypy = Bun.which("mypy");
      if (mypy) return { bin: mypy, args: ["."] };
      return null;
    },
  },
];

export const EXT_TO_RUNNERS = new Map<string, DiagnosticRunner[]>();
for (const runner of LANG_DIAGNOSTICS) {
  for (const ext of runner.extensions) {
    const list = EXT_TO_RUNNERS.get(ext) || [];
    list.push(runner);
    EXT_TO_RUNNERS.set(ext, list);
  }
}

export function detectLanguages(root: string): string[] {
  return LANG_DIAGNOSTICS.filter((r) => r.detect(root)).map((r) => r.name);
}

export function selectRunners(
  root: string,
  languages?: string[],
  file?: string,
): DiagnosticRunner[] {
  let runners = LANG_DIAGNOSTICS.filter((r) => r.detect(root));

  if (languages?.length) {
    const set = new Set(languages);
    runners = runners.filter((r) => set.has(r.name));
  }

  if (file) {
    const ext = path.extname(file).toLowerCase();
    const byExt = EXT_TO_RUNNERS.get(ext) || [];
    const names = new Set(byExt.map((r) => r.name));
    runners = runners.filter((r) => names.has(r.name));
  }

  return runners;
}

export async function runOne(
  runner: DiagnosticRunner,
  root: string,
  signal?: AbortSignal,
): Promise<RunBlockResult | null> {
  const cmd = runner.resolve(root);
  if (!cmd) return null;

  const result = await runCli({
    bin: cmd.bin,
    args: cmd.args,
    cwd: root,
    signal,
  });

  if (result.enoent) return null;
  if (result.killed) return null;

  // Merge stdout + stderr; trim non-empty lines
  const output = (result.stderr || result.stdout || "").trim();
  if (!output) {
    return {
      text: "",
      meta: {
        id: runner.name,
        exitCode: result.exitCode,
        ok: result.exitCode === 0,
        elapsedMs: result.elapsedMs,
      },
    };
  }

  const lines = output.split("\n");
  const text = [
    `<diagnostics tool="${runner.label}">`,
    ...lines.map((l) => `  ${l}`),
    "</diagnostics>",
  ].join("\n");

  return {
    text,
    meta: {
      id: runner.name,
      exitCode: result.exitCode,
      ok: result.exitCode === 0,
      elapsedMs: result.elapsedMs,
    },
  };
}

export async function runLanguages(
  root: string,
  options: {
    languages?: string[];
    file?: string;
    signal?: AbortSignal;
  },
): Promise<RunBlockResult[]> {
  const runners = selectRunners(root, options.languages, options.file);
  const results = await Promise.all(runners.map((r) => runOne(r, root, options.signal)));
  return results.filter((r): r is RunBlockResult => r !== null);
}
