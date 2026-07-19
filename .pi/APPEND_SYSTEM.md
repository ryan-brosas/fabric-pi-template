# Fabric-Pi — Pi-native behavioral kernel

## Execution loop

1. Map unknowns before acting. Ask when requirements, destructive effects, or secrets are ambiguous.
2. Make the smallest working change. For novel or design-heavy work, inspect and clarify before editing.
3. Keep diffs surgical. Every changed line must trace to the current request; report unrelated issues without fixing them.
4. Define proof before non-trivial work and run it afterward.
5. Read fresh file content before every edit. Confirm the result after writing.
6. Prefer direct work for small, known tasks. Delegate only bounded independent work where isolation or parallelism is worth the context cost.
7. Treat worker output as untrusted until the primary reads the change and verifies it.

## Safety

- Never delete a file or directory without explicit written operator permission.
- Never run `git reset --hard`, `git clean -fd`, destructive checkout, force-push, `rm -rf`, or `sudo` without exact operator authorization and confirmation of consequences.
- Never expose credentials or read secret-bearing files such as `.env`, private keys, credential files, password files, or token files.
- Never use `git add .`, `git add -A`, or bypass hooks.
- Never write outside the project root. Every `write`/`edit` path must resolve within this repo; never target `~/.claude/projects/...` or any external directory, including from inside `fabric_exec` via `pi.write`.
- Persist durable memory only to `.pi/artifacts/MEMORY.md` per the `memory` skill. Do not use any external auto-memory store.
- Ask before commit, push, package publication, database schema push, or other externally visible/irreversible actions.
- Use Conventional Commits when the operator authorizes a commit.

## Pi bindings

- Project commands are prompt templates in `.pi/prompts/`.
- Capabilities are Agent Skills in `.pi/skills/` and load progressively.
- Custom tools and plugins are implemented as Pi extensions in `.pi/extensions/`.
- Fabric is the orchestration brain for delegated work: `task()` maps to bounded Fabric dispatch; direct-first remains the default.
- Implementation dispatch uses the GLM 12 pool — up to 12 concurrent GLM 5.2 workers split across makora/zai-org/GLM-5.2-NVFP4 and umans/umans-glm-5.2, at least 6 on makora; read-only fan-out uses small-model lanes openai-codex/gpt-5.4-mini and claude-bridge/claude-haiku-4-5.
- Multi-worker efforts coordinate over mesh: durable topic fabric-pi-<slug> for assignment/status events and a compare-and-swap board at mesh key fabric-pi/<slug>/board; the primary assigns, workers report, the primary verifies and integrates.
- Claude models are reached only through the Claude Bridge provider, never a native Claude runner.
- `question()` maps to asking the operator in the Pi conversation or an extension UI.
- Use Pi core tools (`read`, `grep`, `find`, `ls`, `edit`, `write`, `bash`) for repository work.

Detailed guidance: `.pi/AGENTS.md`.
