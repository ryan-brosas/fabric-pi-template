import { isAbsolute, join, relative, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  CONFIG_DIR_NAME,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  truncateHead,
} from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import {
  createAutoGate,
  resolveExecutable,
  resolveParams,
  runDiagnostics,
  type DiagnosticBlock,
} from "./diagnostics/core.ts";

const LANGUAGES = ["typescript", "rust", "go", "python"] as const;

function truncate(text: string) {
  const result = truncateHead(text, {
    maxBytes: DEFAULT_MAX_BYTES,
    maxLines: DEFAULT_MAX_LINES,
  });
  return {
    text: result.truncated
      ? `${result.content}\n\n[Diagnostics output truncated to Pi limits.]`
      : result.content,
    truncated: result.truncated,
  };
}

function metadata(blocks: DiagnosticBlock[]) {
  return blocks.map(({ id, label, ok, skipped, code, elapsedMs }) => ({
    id,
    label,
    ok,
    skipped,
    code,
    elapsedMs,
  }));
}

export default function diagnostics(pi: ExtensionAPI) {
  const autoGate = createAutoGate();
  const exec = (
    command: string,
    args: string[],
    options: { cwd: string; signal?: AbortSignal; timeout: number },
  ) => pi.exec(command, args, options);
  const binaryResolver = (cwd: string) => {
    const toolRoot = join(cwd, CONFIG_DIR_NAME, "runtime", "diagnostics-tools");
    const extraBinDirs = [join(toolRoot, "node_modules", ".bin"), join(toolRoot, "python", "bin")];
    return (name: string, envName?: string) =>
      resolveExecutable(name, cwd, envName, process.env, extraBinDirs);
  };

  pi.registerTool({
    name: "diagnostics",
    label: "Diagnostics",
    description:
      "Run installed TypeScript, Rust, Go, Python, Fallow, and aislop diagnostics. Supports full/changed Fallow scope and never downloads missing tools. Output is truncated to Pi limits.",
    promptSnippet: "Run installed project diagnostics without downloading missing tools",
    parameters: Type.Object({
      scope: Type.Optional(
        StringEnum(["full", "changed"] as const, {
          description: "Fallow analysis scope; defaults to full.",
        }),
      ),
      changedSince: Type.Optional(
        Type.String({ description: "Git reference used by Fallow; defaults to main." }),
      ),
      languages: Type.Optional(
        Type.Array(StringEnum(LANGUAGES), {
          description: "Restrict language runners.",
        }),
      ),
      includeFallow: Type.Optional(
        Type.Boolean({ description: "Run installed Fallow; defaults on for TypeScript projects." }),
      ),
      includeAislop: Type.Optional(
        Type.Boolean({
          description: "Run installed aislop unless disabled by environment policy.",
        }),
      ),
      file: Type.Optional(
        Type.String({ description: "Restrict language runners by file extension." }),
      ),
    }),
    async execute(_id, args, signal, _update, ctx) {
      const params = resolveParams(args, ctx.cwd);
      const result = await runDiagnostics(ctx.cwd, params, exec, signal, {
        resolveBinary: binaryResolver(ctx.cwd),
      });
      const rendered = truncate(result.text);
      return {
        content: [{ type: "text", text: rendered.text }],
        details: {
          cwd: ctx.cwd,
          scope: result.scope,
          detectedLanguages: result.detectedLanguages,
          blocks: metadata(result.blocks),
          truncated: rendered.truncated,
        },
      };
    },
  });

  pi.on("tool_result", async (event, ctx) => {
    if (event.isError || !["write", "edit"].includes(event.toolName)) return;
    const input = event.input as Record<string, unknown>;
    const file = String(input.path ?? input.filePath ?? "").trim();
    if (!file) return;
    const absoluteFile = resolve(ctx.cwd, file);
    const projectRelative = relative(ctx.cwd, absoluteFile);
    if (
      projectRelative === ".." ||
      projectRelative.startsWith("../") ||
      projectRelative.startsWith("..\\") ||
      isAbsolute(projectRelative)
    )
      return;
    if (!autoGate.claim(file)) return;

    if (
      [".js", ".jsx", ".ts", ".tsx", ".cjs", ".mjs", ".mts"].some((extension) =>
        file.toLowerCase().endsWith(extension),
      )
    ) {
      try {
        const format = await pi.exec("npx", ["--no-install", "oxfmt", absoluteFile], {
          cwd: ctx.cwd,
          signal: ctx.signal,
          timeout: 120000,
        });
        if (format.code !== 0) console.warn(`diagnostics: oxfmt exited ${format.code} for ${file}`);
      } catch (error) {
        if (ctx.signal?.aborted) return;
        console.warn(
          `diagnostics: oxfmt invocation failed for ${file}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    try {
      const params = resolveParams({ file, includeFallow: false, includeAislop: false }, ctx.cwd);
      const result = await runDiagnostics(ctx.cwd, params, exec, ctx.signal, {
        resolveBinary: binaryResolver(ctx.cwd),
      });
      if (!result.blocks.length) return;
      const rendered = truncate(result.text);
      return {
        content: [
          ...event.content,
          { type: "text" as const, text: `\n--- Diagnostics ---\n${rendered.text}` },
        ],
        details: {
          ...(event.details as Record<string, unknown> | undefined),
          diagnostics: {
            scope: result.scope,
            detectedLanguages: result.detectedLanguages,
            blocks: metadata(result.blocks),
            truncated: rendered.truncated,
          },
        },
      };
    } catch (error) {
      if (ctx.signal?.aborted || (error instanceof Error && error.name === "AbortError")) return;
      console.warn(
        `diagnostics: post-edit diagnostics failed for ${file}:`,
        error instanceof Error ? error.message : error,
      );
    }
  });
}
