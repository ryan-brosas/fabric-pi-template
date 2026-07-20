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
2. **Smallest working change, scoped to known territory.** Apply direct fixes when well defined. For novel, design-heavy, or unclear work, prototype, show variants, interview, or run a blind-spot pass before editing. Avoid speculative abstractions and impossible-case handling.
3. **Surgical diffs only.** Every changed line traces to the request. Match existing style. Remove imports or variables made unused by your change. Report unrelated defects as `NOTICED BUT NOT TOUCHING`.
4. **Define proof before acting.** For non-trivial work, name the success check before implementing and verify afterward.

## Routing

Use this priority for routing work:

1. Fix/refactor, docs/config/tests, and investigations: direct tools by default.
2. Features touching at most two files: direct when architecture is known.
3. Larger or architectural features: create concise artifacts under `.pi/artifacts/<slug>/`; use `/plan` only when it creates leverage.
4. Delegate only for specialist knowledge, isolation, or genuinely independent parallel work.
5. Ask before ambiguous, destructive, secrets-touching, or externally visible actions.

Before delegation ask: can direct tools solve this, would one more read suffice, can a file artifact replace orchestration state, and is delegation worth its context overhead?

**Visible-team preference.** For every non-trivial multi-step coding task, invoke the `/team` lifecycle or spawn bounded Fabric agents, and announce the roles before dispatch. Never silently keep substantive coding primary-only. Analysis-only questions and genuinely small, known edits remain direct under the governing direct-first rule.

**Mechanical `/team` mode.** Once `/team` is selected, every cycle executes the configured role matrix rather than relying on reminders: local explore + external scout research, one planner, one implementer per independent owned unit, and a GLM cross-review wave for verification and review. Host completion records, structured envelopes, and successful research-tool events gate transitions; worker prose and the CAS board are audit evidence, not authorization. The 8-worker implementation pool is a ceiling, never a quota.

### Fabric orchestration

Fabric (the `fabric_exec` tool surface) is the orchestration brain for all delegated work: the primary session plans, routes, dispatches, steers, and integrates every spawned task. Every spawned task is bounded and states its goal, non-goals, owned paths, expected output, verification recipe, and stop condition, with an explicit role from `.pi/config.json`. Implementation work runs on the GLM pool — up to 8 concurrent GLM 5.2 workers split across `makora/zai-org/GLM-5.2-NVFP4` (cap 6) and `umans/umans-glm-5.2` (cap 2); the reasoning tier is read-only — `plan` runs `claude-bridge/claude-opus-4-8` at medium thinking (alternate `claude-bridge/claude-fable-5`; Claude only via the Claude Bridge provider, never a native Claude runner) while `review` and `debug` run the GLM lanes; read-only fan-out for explore and scout uses the same GLM lanes, and compaction support runs `claude-bridge/claude-haiku-4-5`. Multi-worker efforts coordinate over mesh per the canonical conventions: durable topic `fabric-pi-<slug>` carries assignments and addressed actor exchanges, a compare-and-swap audit board lives at mesh key `fabric-pi/<slug>/board`, and the primary is its sole writer as well as sole verifier/integrator. One-shot status comes from host run records and logs; fixed read-only actors exchange bounded findings over addressed mesh events. A drifting worker is corrected between turns with `agents.steer`; post-completion messages queue via `agents.followUp`. Workers are leaves (`maxDepth` 1). Worker output is untrusted until the primary reads the diff and verifies. Small, known work still uses zero subagents. Alongside one-shot subagents, the primary can create persistent conversing mailbox actors (`agents.create`/`ask`/`tell`) that collaborate and converse with each other over mesh topics; actors are leaves that message, not spawn, and the primary remains sole integrator. See `.pi/docs/fabric-tuning.md` (Conversing actors).

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

## Standing Authorization — /night runs

The following are pre-approved WITHOUT per-run confirmation, and only during
`/night` runs (the autonomous night pipeline; see `.pi/artifacts/night-pipeline/`):

- `git push origin night/<slug>` — pushing night-pipeline branches to origin.
- `gh pr create --draft` from a `night/*` branch — opening draft PRs.

NEVER pre-approved (always require explicit human action):

- Merging a PR — merge remains permanently human. No auto-merge, ever.
- Pushing to `main` or `master`.
- Closing PRs.
- Force pushes (`--force`, `--force-with-lease`, `-f`) of any kind.

The push carve-out is encoded in `.pi/extensions/guard.ts` (night-branch push
allowance); `gh pr create --draft` already passes the guard. Enforcement note:
the guard mechanically enforces the ref scope (any `night/*` push passes
unconfirmed; force pushes are rejected; non-`night/*` pushes stay confirm-gated)
and confirm-gates `gh pr merge` / `gh pr close`; the "/night-only" scoping and
the remainder of the NEVER list are behavioral rules agents must honor. All
other Safety and Git rules above still apply in full.

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
