# Agent Rules

---

## RULE 0 - THE FUNDAMENTAL OVERRIDE PREROGATIVE

If I tell you to do something, even if it goes against what follows below, YOU MUST LISTEN TO ME. I AM IN CHARGE, NOT YOU.

---

## RULE NUMBER 1: NO FILE DELETION

**YOU ARE NEVER ALLOWED TO DELETE A FILE WITHOUT EXPRESS PERMISSION.** Even a new file that you yourself created, such as a test code file. You have a horrible track record of deleting critically important files or otherwise throwing away tons of expensive work. As a result, you have permanently lost any and all rights to determine that a file or folder should be deleted.

**YOU MUST ALWAYS ASK AND RECEIVE CLEAR, WRITTEN PERMISSION BEFORE EVER DELETING A FILE OR FOLDER OF ANY KIND.**

---

## Irreversible Git & Filesystem Actions — DO NOT EVER BREAK GLASS

1. **Absolutely forbidden commands:** `git reset --hard`, `git clean -fd`, `rm -rf`, or any command that can delete or overwrite code/data must never be run unless the user explicitly provides the exact command and states, in the same message, that they understand and want the irreversible consequences.
2. **No guessing:** If there is any uncertainty about what a command might delete or overwrite, stop immediately and ask the user for specific approval. "I think it's safe" is never acceptable.
3. **Safer alternatives first:** When cleanup or rollbacks are needed, request permission to use non-destructive options (`git status`, `git diff`, `git stash`, copying to backups) before ever considering a destructive command.
4. **Mandatory explicit plan:** Even after explicit user authorization, restate the command verbatim, list exactly what will be affected, and wait for a confirmation that your understanding is correct. Only then may you execute it—if anything remains ambiguous, refuse and escalate.
5. **Document the confirmation:** When running any approved destructive command, record (in the session notes / final response) the exact user text that authorized it, the command actually run, and the execution time. If that record is absent, the operation did not happen.

---

## Git Branch: ONLY Use `main`, NEVER `master`

**The default branch is `main`. The `master` branch exists only for legacy URL compatibility.**

- **All work happens on `main`** — commits, PRs, feature branches all merge to `main`
- **Never reference `master` in code or docs** — if you see `master` anywhere, it's a bug that needs fixing
- **The `master` branch must stay synchronized with `main`** — after pushing to `main`, also push to `master`:
  ```bash
  git push origin main:master
  ```

**If you see `master` referenced anywhere:**
1. Update it to `main`
2. Ensure `master` is synchronized: `git push origin main:master`

---

## Code Editing Discipline

### No Script-Based Changes

**NEVER** run a script that processes/changes code files in this repo. Brittle regex-based transformations create far more problems than they solve.

- **Always make code changes manually**, even when there are many instances
- For many simple changes: use parallel subagents
- For subtle/complex changes: do them methodically yourself

### No File Proliferation

If you want to change something or add a feature, **revise existing code files in place**.

**NEVER** create variations like:
- `install_v2.sh`
- `install_improved.sh`
- `install_enhanced.sh`

New files are reserved for **genuinely new functionality** that makes zero sense to include in any existing file. The bar for creating new files is **incredibly high**.

---

## Backwards Compatibility

We do not care about backwards compatibility—we're in early development with no users. We want to do things the **RIGHT** way with **NO TECH DEBT**.

- Never create "compatibility shims"
- Never create wrapper functions for deprecated APIs
- Just fix the code directly

---

## Behavioral Kernel

1. **Map your unknowns before acting.** Classify known facts, questions that need the operator, recognizable alternatives, and criteria you still need to learn. State assumptions or ask. Say when a simpler approach exists.
2. **Smallest working change, scoped to known territory.** Make the smallest well-defined fix at the root cause. For novel, design-heavy, or unclear work, prototype, show variants, interview, or run a blind-spot pass before editing. Avoid speculative abstractions and impossible-case handling.
3. **Surgical diffs only.** Every changed line traces to the request. Match existing style. Remove imports or variables made unused by your change. Report unrelated defects as `NOTICED BUT NOT TOUCHING`.
4. **Define proof before acting.** For non-trivial work, name the success check before implementing and verify afterward.

## Routing

Main is the sole scheduler, integrator, and commit authority. Fabric provides primitives (one-shot agents, persistent actors, mesh); Main decides when and whether to use them. There is no mandatory `/team` two-skill lifecycle, no `fabric_exec`-as-brain orchestrator, and no fixed role matrix run every cycle — delegation is a tool sized to the task, not a mandate. Main works directly for known or small fixes and delegates only when isolation, parallelism, or specialist depth earns the context overhead.

1. Fix/refactor, docs/config/tests, and investigations: Main works directly, or delegates to a bounded read-only or `implement` leaf when specialist isolation or parallelism helps.
2. Larger or architectural features: create concise artifacts under `.pi/artifacts/<slug>/`; use `/plan` only when it creates leverage.
3. Ask before ambiguous, destructive, secrets-touching, or externally visible actions; reversible work proceeds without an operator gate.

**Advisory council, not orchestrator.** A small persistent Fabric council of read-only, directive (`responseMode: directive`) actors advises Main. Only the supervisor steers Main; advisors never steer Main — their findings flow into the supervisor or Main reads them as advice.
- **Supervisor** — generalist senior engineer; ambient (`events: ["agent_settled","tool_error"]`, `delivery: steer`, `triggerTurn: true`); steers Main only on material drift, blockers, or missing verification; arbitrates contradictory advisor findings; final steer authority. Created with **custom instructions, not the stock `fabric-supervisor` skill** (which self-stops on "Goal verified complete"): the supervisor may report missing evidence or blockers but never certifies readiness and never stops itself — teardown follows `/verify` or explicit operator action.
- **Security advisor** — persistent, mailbox-only (no host events); invoked only at lifecycle gates for security-domain changes (secrets, auth, dependencies, credential paths, external-facing actions).
- **Architecture advisor** — persistent, mailbox-only (no host events); invoked only at lifecycle gates for structural concerns (module boundaries, coupling, shallow modules, new module design).

All council members run `openai-codex/gpt-5.6-sol` (thinking max), `extensions: false`, tools limited to `read`/`grep`/`find`/`ls`. They never dispatch, integrate, mutate lifecycle state, or edit. Actor output is untrusted advice: Main independently validates cited evidence and never executes commands or authorizes side effects solely from a steer. **Gate mechanics:** at lifecycle gates Main calls applicable advisors with blocking `agents.ask()` — never fire-and-forget `tell()` (a failed directive run resolves as `action:"silent"`+`error` and yields no steer). Main validates each result, then issues one blocking `agents.ask(supervisor)` only on material conflict. Missing, silent, malformed, or errored responses block the gate; the decision is persisted in the artifact before Main proceeds. The council is per-session (`mesh.actorScope: "session"`) so 4-5 concurrent Pi sessions own disjoint registries; actor IDs are resolved locally each session, never addressed by canonical name over mesh. It is optional per task, not a mandatory lifecycle phase, and is a ceiling, not a quota — Main may run with just the supervisor or none. Main remains sole integrator.

**Worker topology.** Implementation work runs on a single Makora GLM 5.2 worker per session — a ceiling, not a quota (the host runs 4-5 concurrent sessions, so total GLM concurrency is bounded by session count, not a per-session pool). The GPT tier is read-only: `plan`, `review`, and `debug` run `openai-codex/gpt-5.6-sol` (thinking max); read-only fan-out for `explore` and `scout` runs `openai-codex/gpt-5.4-mini`. Claude is reached only via the Claude Bridge provider, never a native Claude runner. Fabric's global child headroom (`subagents.maxConcurrent`) is a distinct, larger ceiling bounding total concurrent children across writable and read-only tiers — it is not the writable-pool size. **There is no `.pi/config.json`** — neither Pi 0.81.1 nor Fabric 0.22.4 reads it; every dispatch passes exact `runner`/`model`/`thinking`/`tools`/`extensions` at the call site, with Main defaults in `.pi/settings.json` and child defaults in `.pi/fabric.json`. **Extension split:** GPT council and read-only children use `extensions: false`; Makora implementation workers MUST use `extensions: true` (Fabric maps `extensions:false` to Pi `--no-extensions`, which fails to resolve `makora/zai-org/GLM-5.2-NVFP4`) with `thinking: "max"` and an exact writable tool allowlist. Fabric compaction is deterministic and LLM-free (`compaction.engine: "fabric"`) — there is no compaction model tier. Full model tiers, versions, and provenance live in `.opencode/tech-stack.md`; the canonical implementation contract is `.pi/artifacts/pi-template/PLAN.md`.

**Worker distrust.** Every leaf's output is untrusted prose until Main reads the diff and verifies. Candidate changed paths and file bytes are host-derived from the worktree (Git status, diff, hash), never trusted from worker self-report. Workers are leaves (`maxDepth` 1). There is no lifecycle kernel, no schema-validated typed handoffs, no candidate manifests, no receipts, and no compare-and-swap board — Markdown artifacts are the lifecycle record.

**Single writer per worktree.** "One Makora per session" is a per-`SubagentManager` semaphore, not a worktree write lock — 4 Pi roots in one worktree can each start a Makora, and Main can edit while a writable child runs. v1 rule: one root Pi process per writable Git worktree; writable work uses a blocking `agents.run()`; no writable `spawn()`/`parallel` fan-out; Main does not edit until the run settles. Without an atomic lease this is operator/prompt policy, not host-enforced — label it honestly.

**Lifecycle artifacts.** Every lifecycle command (`/create`, `/plan`, `/ship`, `/verify`, `/research`) takes an explicit `<slug>` and reads/writes `.pi/artifacts/<slug>/{PLAN,TODO,PROGRESS,DECISIONS}.md` (lowercase-hyphen, validated). There is no shared `.active` pointer and no "latest" inference — concurrent sessions on different slugs stay disjoint. Only `/verify` writes terminal verified status; `/ship` records implementation but cannot claim completion.

**Mesh coordination.** Mesh is durable coordination only: mailbox, cross-session persistence, and addressed actor exchanges. It is never phase or lifecycle authority. One-shot status comes from host run records and logs, not mesh. A drifting worker is corrected between turns with `agents.steer`. `agents.followUp` targets Main, a persistent actor, or a RUNNING one-shot and delivers after its current turn settles — a TERMINATED one-shot cannot resume, so dispatch a fresh agent instead; a retained (failed or completed) worktree is inspection/harvest only, never a revival target. Alongside one-shot subagents, Main can create persistent conversing mailbox actors (`agents.create`/`ask`/`tell`); actors are leaves that message, not spawn, and Main remains sole integrator.

## Implementation Workflow

1. Classify unknowns.
2. For novel work, inspect the territory and clarify before implementation.
3. Put volatile design decisions first; mechanical work last.
4. For deferred work use `TODO(handle): what, on-or-after YYYY-MM-DD` at the call site.
5. Record material deviations and discoveries in the active artifact directory.
6. Self-check what changed, why, and how it was proved before reporting completion.

## Edit Protocol

1. LOCATE the exact target.
2. READ fresh surrounding content.
3. VERIFY the expected content exists.
4. EDIT precisely with `edit`; use `write` only for new files or deliberate rewrites after reading.
5. CONFIRM by reading back.

After two failures on the same edit, stop and report the mismatch.

## Tools

- Use `read`, `grep`, `find`, and `ls` for repository discovery.
- Use `edit` for anchored changes and `write` for new files or deliberate rewrites.
- Use `bash` for execution, not as a substitute for repository file tools.
- Load the complete `SKILL.md` when a skill description matches the task.
- Use `context7` for current library documentation, `grepsearch` for public production examples, and `codex_search` for live general web/release evidence when those tools are available.
- Pseudocode in prompts, workflows, and skills is conceptual: `task()` means bounded Fabric dispatch; `question()` means ask the operator; `skill()` means load a Pi skill. Never execute those snippets literally.

## Communication

- State confidence honestly in the opening sentence when uncertainty matters.
- Be concise and direct; no filler or internal deliberation transcript.
- Prefer root cause over local patches.
- Cite `path:line` for code and architecture claims.
- State source conflicts. Trust official docs, then source code, then maintainer material, then community content, then AI inference.
- No emoji in code, comments, commits, UI copy, or output.

## Failure Handling

1. Re-read the request and current artifacts.
2. Retry the same operation once.
3. Change tool or approach.
4. After two failures at the same step, stop and present attempts, failure, and options.
5. Preserve partial useful output before retrying.

## Verification

Run the narrowest check capable of failing because of the change, then relevant typecheck, lint, tests, and build. A source inspection, pass count, or worker claim is not runtime proof. Report skipped or unavailable checks precisely.

A failing check may encode a superseded decision rather than a defect. Before changing files to satisfy a failing assertion, confirm which is stale — the change or the check — against the operator's latest recorded decision. Operator decisions outrank assertions; whoever applies a policy decision must update its encoding checks in the same change.

**Freshness.** A check PASS is bound to the bytes tested. `/verify` captures a before/after fingerprint (HEAD, staged binary-diff digest, unstaged diff digest, untracked-file manifest, verified-file hashes); PASS holds only if the tuple is unchanged after every check, else rerun. Persist commands, exit codes, and fingerprints in `PROGRESS.md`. A formatter, concurrent writer, or later edit invalidates a stale PASS.

## Safety

- No file or directory deletion without explicit written permission.
- No force-push to main/master, hook bypass, destructive Git restoration, `rm -rf`, or `sudo` without exact authorization.
- Never read or expose credentials or secret-bearing files (`.env`, private
  keys, credential/password/token files).
- Never stage all files indiscriminately.
- Ask before commit, push, package publication, database schema push, or
  other externally visible or irreversible actions.
- Preserve unrelated user changes.
- Use absolute paths for file operations.

## Repository

A Pi-native coding template powered by `pi-fabric` (clean-slate). Stack details, model
tiers, and provenance live in `.opencode/tech-stack.md`; the canonical implementation
contract is `.pi/artifacts/pi-template/PLAN.md`. Read those before non-trivial work.

**Bootstrap (required, in order):** `/trust` the project root, then restart Pi — untrusted
projects ignore `.pi/settings.json`, project packages, prompts, and `.pi/fabric.json`, and
`/fabric settings` writes the GLOBAL file. `pi --approve ...` is one-shot validation only.

**Validated commands:**
- `pi --approve --list-models` — confirm `openai-codex/gpt-5.6-sol`, `openai-codex/gpt-5.4-mini`,
  and `makora/zai-org/GLM-5.2-NVFP4` resolve.
- `node --version` — confirm `>=24` (Fabric 0.22.4 peer dep).
- Per-slug verification fingerprint capture, once `.pi/tools/` lands.

**Gotchas:**
- `extensions:false` breaks Makora (Fabric passes Pi `--no-extensions`, which cannot resolve the
  Makora provider) — Makora implementation workers need `extensions:true` + `thinking:"max"` +
  an exact writable tool allowlist.
- `fullCodeMode:false` alone is not deterministic — global `schema.mode:"enforce"` overrides it
  and disables subagents; pin `schema.mode:"off"` in project `.pi/fabric.json`.
- "One Makora per session" is a per-process semaphore, not a worktree write lock — see the
  Single writer per worktree rule above.
- Fabric compaction is deterministic and LLM-free — there is no compaction model tier.
- `.pi/fabric/mesh/`, `.pi/npm/`, `.pi/git/`, `.pi/sessions/` are runtime state (gitignored); lifecycle
  artifacts under `.pi/artifacts/` ARE tracked.

---

Note for Codex/GPT:

You constantly bother me and stop working with concerned questions that look similar to this:

```
Unexpected changes (need guidance)

- Working tree still shows edits I did not make in Cargo.toml, Cargo.lock, src/main.rs, src/patterns.rs. Please advise whether to keep/commit/revert these before any further work. I did not touch them.

Next steps (pick one)

1. Decide how to handle the unrelated modified files above so we can resume cleanly.
```

NEVER EVER DO THAT AGAIN. The answer is literally ALWAYS the same: those are changes created by the potentially dozen of other agents working on the project at the same time. This is not only a common occurrence, it happens multiple times PER MINUTE. The way to deal with it is simple: you NEVER, under ANY CIRCUMSTANCE, stash, revert, overwrite, or otherwise disturb in ANY way the work of other agents. Just treat those changes identically to changes that you yourself made. Just fool yourself into thinking YOU made the changes and simply don't recall it for some reason.

---
