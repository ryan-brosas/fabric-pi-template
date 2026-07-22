/**
 * Guard Plugin — Agent Safety & Convention Enforcement
 *
 * Ported from pikit's extensions/guard.ts.
 *
 * 1. Pipe-to-shell blocker: rejects `curl … | bash` / `wget … | bash` patterns.
 * 2. Conventional Commits: rejects `git commit` with non-compliant messages.
 */

import type { Plugin } from "@opencode-ai/plugin";

const CONVENTIONAL_RE =
	/^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9._/-]+\))?!?: .+/;

export const GuardPlugin: Plugin = async () => {
	return {
		"tool.execute.before": async (input, output) => {
			if (input.tool !== "bash") return;

			const cmd: string = (output.args as Record<string, unknown>)?.command ?? "";

			if (/(?:^|[;&|])\s*(?:curl|wget)\s.*\|\s*(?:ba)?sh/i.test(cmd)) {
				throw new Error(
					"Blocked: detected pipe-to-shell pattern (curl/wget | bash). Download first, inspect, then run.",
				);
			}

			const commitMatch = cmd.match(/git\s+commit\s/);
			if (!commitMatch) return;

			const msgMatch =
				cmd.match(/(?:-m|--message=?)\s*"([^"]*)"/) ??
				cmd.match(/(?:-m|--message=?)\s*'([^']*)'/) ??
				cmd.match(/(?:-m|--message=?)\s+(\S+)/);

			const msg = msgMatch?.[1];

			if (!msg) {
				throw new Error(
					'Blocked: git commit missing -m message. Use: git commit -m "type(scope): subject"',
				);
			}

			if (!CONVENTIONAL_RE.test(msg)) {
				throw new Error(
					[
						"Blocked: commit message is not Conventional Commits compliant.",
						`Got: ${msg}`,
						"Expected: <type>(scope): <subject>",
						"Types: feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert",
					].join("\n"),
				);
			}
		},
	};
};

export default GuardPlugin;
