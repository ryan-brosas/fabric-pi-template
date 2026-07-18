import { resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const CONVENTIONAL_RE = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9._/-]+\))?!?: .+/;
const FABRIC_TOOL_NAMES = new Set(["fabric_exec"]);

function isFabricTool(toolName: string): boolean {
  return FABRIC_TOOL_NAMES.has(toolName) || toolName.startsWith("fabric_");
}
const secretPatterns = [/\.env(?:\..*)?$/i, /\.(?:key|pem)$/i, /credentials/i, /password/i, /secret/i, /token/i];
const hardDeny = [
  /(?:^|[;&|]\s*)rm\s/i,
  /\brm\s+-rf\b/i,
  /\bsudo\b/i,
  /npm\s+run\s+db:reset/i,
  /git\s+add\s+(?:\.|-A)(?:\s|$)/i,
  /--no-verify\b/i,
  /(?:^|[;&|])\s*(?:curl|wget)\s.*\|\s*(?:ba)?sh\b/i,
];
const confirmPatterns = [
  /git\s+(?:checkout|clean|commit|merge|push|rebase|reset)\b/i,
  /npm\s+publish\b/i,
  /npm\s+run\s+db:push\b/i,
];

function pathArg(event: { input: Record<string, unknown> }): string {
  return String(event.input.path ?? event.input.filePath ?? "");
}

export default function guard(pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    // Fabric owns authorization, capture, state, mesh, and nested execution for
    // its native tools. Keep project-level file/shell policy out of that seam.
    if (isFabricTool(event.toolName)) return;

    if (["read", "write", "edit"].includes(event.toolName)) {
      const raw = pathArg(event);
      if (!raw) return;
      const normalized = resolve(ctx.cwd, raw);
      const envExample = /\.env\.example$/i.test(normalized);
      if (!envExample && secretPatterns.some((pattern) => pattern.test(normalized))) {
        return { block: true, reason: `Blocked access to secret-bearing path: ${raw}` };
      }
      const cwd = resolve(ctx.cwd);
      if (!normalized.startsWith(`${cwd}/`) && normalized !== cwd) {
        if (!ctx.hasUI) return { block: true, reason: "External-directory access blocked without interactive confirmation" };
        const ok = await ctx.ui.confirm("External path", `Allow ${event.toolName} outside the project?\n${normalized}`);
        if (!ok) return { block: true, reason: "External-directory access declined" };
      }
      return;
    }

    if (event.toolName !== "bash") return;
    const command = String(event.input.command ?? "");
    const denied = hardDeny.find((pattern) => pattern.test(command));
    if (denied) return { block: true, reason: `Blocked by project safety policy: ${command}` };

    const commit = command.match(/git\s+commit\b/);
    if (commit) {
      const msg = command.match(/(?:-m|--message=?)\s*"([^"]*)"/)?.[1]
        ?? command.match(/(?:-m|--message=?)\s*'([^']*)'/)?.[1]
        ?? command.match(/(?:-m|--message=?)\s+(\S+)/)?.[1];
      if (!msg || !CONVENTIONAL_RE.test(msg)) {
        return { block: true, reason: "Commit message must use Conventional Commits: type(scope): subject" };
      }
    }

    if (confirmPatterns.some((pattern) => pattern.test(command))) {
      if (!ctx.hasUI) return { block: true, reason: "Confirmation-required command blocked without interactive UI" };
      const ok = await ctx.ui.confirm("Confirm command", command);
      if (!ok) return { block: true, reason: "Command declined by operator" };
    }
  });
}