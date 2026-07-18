import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const RUNNER = resolve(dirname(fileURLToPath(import.meta.url)), "../tools/quality/run-pack.mjs");
const COMMIT_RE =
  /\bgit(\s+(?:-C|-c|--git-dir|--work-tree|--namespace)(?:=\S+|\s+\S+)|\s+-\S+)*\s+commit\b/;

function runPack(args: string[], cwd: string): Promise<{ code: number; out: string }> {
  return new Promise((done) => {
    execFile("node", [RUNNER, ...args], { cwd, timeout: 10000 }, (err, stdout, stderr) => {
      // timeout: fail open, never wedge a session
      if (err && (err as { killed?: boolean }).killed) return done({ code: 0, out: "" });
      const status = err ? (err as { code?: number | string }).code : 0;
      const code = typeof status === "number" ? status : err ? 1 : 0;
      done({ code, out: `${stdout ?? ""}${stderr ?? ""}`.trim() });
    });
  });
}

export default function qualityGate(pi: ExtensionAPI) {
  pi.on("tool_result", async (event) => {
    if ((event.toolName !== "edit" && event.toolName !== "write") || event.isError) return;
    const path = String(event.input.path ?? "");
    if (!path) return;
    const { code, out } = await runPack([path], process.cwd());
    if (code !== 0 && out) {
      event.content.push({
        type: "text",
        text: `quality-pack findings (fix before reporting done):\n${out}`,
      });
    }
  });

  pi.on("tool_call", async (event) => {
    if (event.toolName !== "bash") return;
    const command = String(event.input.command ?? "");
    if (!COMMIT_RE.test(command)) return;
    const { code, out } = await runPack(["--staged"], process.cwd());
    if (code !== 0) {
      return {
        block: true,
        reason: `quality-pack: staged files fail deterministic checks:\n${out}`,
      };
    }
  });
}
