/**
 * Diagnostics Plugin
 *
 * Registers a `diagnostics` tool for running language-specific compile/lint
 * checks (TypeScript, Rust, Go, Python). Auto-injects diagnostics after
 * write/edit tool calls so the AI gets immediate post-edit feedback.
 *
 * Usage:
 *   /diagnostics                        — full project diagnostics (auto-detected languages)
 *   /diagnostics scope=changed           — git-diff-scoped diagnostics
 *   /diagnostics languages=["typescript"] — only tsc
 *   /diagnostics file=src/main.ts        — diagnostics for file's language
 *   /diagnostics includeFallow=false     — skip Fallow code quality checks
 *   /diagnostics includeAislop=false     — skip aislop AI slop detection
 *
 * Heavily inspired by pi's diagnostics extension, adapted to opencode's
 * plugin SDK with `tool()` helper and event hooks.
 */

import { type Plugin, tool } from "@opencode-ai/plugin";
import { resolveParams } from "./diagnostics/params.js";
import { runFullDiagnostics } from "./diagnostics/run.js";
import {
  shouldSkipAuto,
  touchDebounce,
  activeRunnersForFile,
  runAutoInject,
} from "./diagnostics/auto-inject.js";

export const DiagnosticsPlugin: Plugin = async ({ directory, worktree }) => {
  // The project root for diagnostics. Prefer worktree (the VCS root)
  // since language runners (tsc, cargo check) need the project root.
  const projectRoot = worktree || directory;

  return {
    tool: {
      diagnostics: tool({
        description:
          "Run code diagnostics on the current project. Auto-detects TypeScript (tsc), Rust (cargo check), Go (go vet), and Python (ruff/mypy). Scope with languages=[typescript] or file=path/to/file.ts.",
        args: {
          scope: tool.schema
            .enum(["full", "changed"])
            .optional()
            .describe('Use "changed" to scope diagnostics to git diff (default: full)'),
          languages: tool.schema
            .array(tool.schema.string())
            .optional()
            .describe("Filter by language: typescript, rust, go, python"),
          includeFallow: tool.schema
            .boolean()
            .optional()
            .describe("Run Fallow for TS/JS projects (default: true when tsconfig.json exists)"),
          includeAislop: tool.schema
            .boolean()
            .optional()
            .describe(
              "Run aislop AI slop detection (default: true unless PI_DIAGNOSTICS_SKIP_AISLOP or PI_AISLOP_AUTO is set)",
            ),
          file: tool.schema
            .string()
            .optional()
            .describe("Run diagnostics for the file's language only"),
        },
        async execute(args, ctx) {
          const resolved = resolveParams(args as Record<string, unknown>, projectRoot);
          const { text } = await runFullDiagnostics(ctx.directory, resolved, ctx.abort);
          return { output: text };
        },
      }),
    },

    "tool.execute.after": async (
      input: {
        tool?: string;
        args?: { filePath?: string; [key: string]: unknown };
      },
      output: { output?: string },
    ) => {
      if (input.tool !== "write" && input.tool !== "edit") return;
      const filePath = input.args?.filePath;
      if (!filePath || typeof filePath !== "string") return;
      if (shouldSkipAuto(filePath)) return;

      touchDebounce();

      try {
        const runners = activeRunnersForFile(projectRoot, filePath);
        if (runners.size === 0) return;

        const blocks = await runAutoInject(projectRoot, filePath);
        const text = blocks
          .map((b) => b.text)
          .filter(Boolean)
          .join("\n\n");
        if (!text) return;

        const label = Array.from(runners).join(", ");
        output.output = (output.output || "") + `\n\n--- Diagnostics (${label}) ---\n${text}`;
      } catch {
        // Auto-inject is non-critical; never block the original tool
      }
    },
  };
};

export default DiagnosticsPlugin;
