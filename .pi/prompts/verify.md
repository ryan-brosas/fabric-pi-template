---
description: Verify implementation completeness, correctness, and coherence
argument-hint: "<slug> [path|all] [--quick] [--full] [--fix]"
---

# Verify: $ARGUMENTS

Check implementation against the plan before declaring completion. `/verify` is the sole command allowed to declare terminal verified status, and it does so only in its response/session transcript — never as a repository write after the final fingerprint.

## Validate Slug

`<slug>` is required and must match `^(?=.{1,64}$)[a-z0-9]+(?:-[a-z0-9]+)*$`. Reject empty, absolute, slash-containing, dot-segment, uppercase, leading/trailing-hyphen, or double-hyphen values before any filesystem access. Lifecycle state is confined to `.pi/artifacts/<slug>/{PLAN,TODO,PROGRESS,DECISIONS}.md`. Project memory (`.pi/memory.md`) is an optional separate surface: reads for context are allowed, and `/verify` may append one distilled non-sensitive finding before the final fingerprint only — never lifecycle state, and never secrets, credentials, PII, raw tool output, per-slug status, or final verification results (see ADR-007).

## Validate Ready Packet

After the slug passes validation, and before any namespace, memory, or lifecycle access, verify the project is fully initialized. The Pi-native init packet is six files:

- `AGENTS.md`
- `.pi/tech-stack.md`
- `.pi/ROADMAP.md`
- `.pi/state.md`
- `.pi/user.md`
- `.pi/memory.md`

Read `.pi/state.md` frontmatter and verify all of the following:

1. All six packet files exist.
2. `schema_version: 1` is present.
3. `initialization_status: ready` (not `partial`).
4. `context_reload_required: false` (if `true`, `AGENTS.md` changed since the last init — instruct the operator to run `/reload` then `/init --refresh` before proceeding).
5. `agents_boilerplate_sha256` matches the SHA-256 of the managed AGENTS boilerplate region (between the `<!-- pi:init:boilerplate:start -->` and `<!-- pi:init:boilerplate:end -->` markers).

If any check fails, **stop**. Do not access memory or lifecycle state. Report which packet gate failed and instruct the operator to run `/init` (fresh) or `/init --refresh` (established). A `partial` or reload-required state means the packet is not ready and `/verify` must fail closed.

## Validate Namespace

Verify the namespace is **established** (both `PLAN.md` AND `TODO.md` exist in `.pi/artifacts/<slug>/`):

- **Established** (both exist): proceed.
- **Partial** (only one of `PLAN.md`/`TODO.md` exists): stop — the namespace is partially initialized from an interrupted `/create`. Block for operator recovery; do not adopt, overwrite, delete, or `mkdir`. Report which sentinel file is missing.
- **Absent** (neither exists): stop — tell the operator to run `/create <slug>` first. `/verify` never creates a namespace.

## Load Skills

Load the full `SKILL.md` for any skill whose description matches the current task before starting work:

- `verification-before-completion` — define the success check before implementing and verify after.

## Parse Arguments

| Argument      | Default  | Description                                    |
| ------------- | -------- | ---------------------------------------------- |
| `<slug>`      | required | The feature slug to verify                     |
| `[path\|all]` | `all`    | The path or keyword to verify                  |
| `--quick`     | false    | Gates only, skip coherence check               |
| `--full`      | false    | Force full verification mode (non-incremental) |
| `--fix`       | false    | Auto-fix lint/format issues first              |

There is no verification cache. Every `/verify` run captures a fresh fingerprint; nothing is skipped based on a prior run.

## Determine Input Type

| Input Type | Detection           | Action                     |
| ---------- | ------------------- | -------------------------- |
| Path       | File/directory path | Verify that specific path  |
| `all`      | Keyword             | Verify all in-progress work |

## Before You Verify

- **Be certain**: Only flag issues you can verify with tools
- **Don't invent problems**: If an edge case isn't in the plan, don't flag it
- **Run the gates**: Build, test, lint, typecheck are non-negotiable
- **Detect the toolchain**: Look for `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, `Makefile`, etc. and use the project's own check commands

## Phase 0: Capture Fingerprint

A check PASS is bound to the bytes tested. Capture a before/after fingerprint tuple. PASS holds only if the tuple is unchanged after every check; otherwise rerun.

Capture the initial fingerprint:

```bash
echo "HEAD=$(git rev-parse HEAD)"
echo "staged=$(git diff --cached --binary | shasum -a 256 | cut -d' ' -f1)"
echo "unstaged=$(git diff --binary | shasum -a 256 | cut -d' ' -f1)"
echo "untracked=$(git ls-files --others --exclude-standard -z | sort -z | shasum -a 256 | cut -d' ' -f1)"
git diff --check
```

Also record hashes of all verified files (the prompt, contract, spec, and status files touched by this work). Any difference after a check invalidates the run.

If `--fix` is provided, run the project's auto-fix command (e.g., `npm run lint:fix`, `ruff check --fix`, `cargo clippy --fix`) **first**, as a pre-verification mutation. Then capture a fresh baseline fingerprint before running any gates. A fix is a mutation, not a gate; it restarts the baseline.

Candidate evidence (commands, exit codes, pending status) may be recorded in `.pi/artifacts/<slug>/PROGRESS.md` **before** the final fingerprint. No repository write occurs after the final fingerprint — a post-fingerprint write invalidates the PASS it records.

## Phase 1: Gather Context

Read `.pi/artifacts/<slug>/PLAN.md` to understand the requirements.

Read `.pi/artifacts/<slug>/` to check what artifacts exist (`PLAN.md`, `TODO.md`, `PROGRESS.md`, `DECISIONS.md`).

Read the plan and any other artifacts (`TODO.md`, `PROGRESS.md`, `DECISIONS.md`).

**Verify guards:**

- [ ] Plan exists and is up to date
- [ ] You have read the full plan

## Phase 2: Completeness

Extract all requirements/tasks from `PLAN.md` and `TODO.md` and verify each is implemented:

- For each requirement: find evidence in the codebase (`path:line` reference)
- Mark as: complete, partial, or missing
- Report completeness score (X/Y requirements met)

## Phase 3: Correctness

Follow the `verification-before-completion` skill protocol.

**Default: incremental mode** (changed files only, parallel gates).

| Mode        | When                                      | Behavior                         |
| ----------- | ----------------------------------------- | -------------------------------- |
| Incremental | Default, <20 changed files                | Lint changed files, test changed |
| Full        | `--full` flag, >20 changed files, or ship | Lint all, test all               |

**Execution order:**

1. **Parallel**: typecheck + lint (simultaneously)
2. **Sequential** (after parallel passes): test, then build (ship only)

For browser/manual local-web requirements, use stable URLs as verification evidence. A reachable URL supplements, but never replaces, typecheck/lint/test/build evidence.

Report results with mode column:

```text
| Gate      | Status | Mode        | Time   |
|-----------|--------|-------------|--------|
| Typecheck | PASS   | full        | 2.1s   |
| Lint      | PASS   | incremental | 0.3s   |
| Test      | PASS   | incremental | 1.2s   |
| Build     | SKIP   | —           | —      |
```

Quick or incremental checks cannot produce a terminal `VERIFIED` result. A `SKIP` on a required gate blocks `VERIFIED`. Missing, failed, timed-out, or non-zero required checks block `VERIFIED`.

After all gates pass, re-capture the fingerprint and compare it to the initial tuple. If any component differs, rerun the affected checks. A formatter, concurrent writer, or later edit invalidates a stale PASS.

## Phase 4: Coherence (skip with --quick)

Cross-reference artifacts for contradictions:

- Plan vs implementation (does code address all plan requirements?)
- TODO vs implementation (did code follow the task list?)
- Research recommendations vs actual approach (if different, is it justified?)
- DECISIONS vs implementation (were recorded tradeoffs honored?)

Flag contradictions with specific `path:line` references.

## Phase 5: Report

Phase 5 runs after Phase 4 Coherence and is ordered: advisory evidence review (5A), candidate evidence writes (5B), fresh final no-write pass (5C), transcript-only result (5D). Any implementation defect found in 5A that requires a write sends work back to `/ship`.

### Phase 5A: Advisory Evidence Review

After preliminary gates (Phase 3) and coherence (Phase 4), and before any candidate evidence writes, run an advisory read-only review over the assembled verification evidence. This catches what mechanical gates miss: superseded checks, stale assertions, untested branches, skips-as-passes, and freshness defects.

Compute the **Effective Review Level** = `max(stored Discovery Level, stored Effective Review Level, current risk floor)` from the PLAN header. The `/verify` advisor is **always advisory** — it never blocks by its own authority (ADR-006). Independently validated correctness/safety defects still produce `NEEDS WORK` under Main's authority; any required write returns to `/ship`.

#### Build the evidence packet (in-memory)

The read-only reviewer has only `read,grep,find,ls`. Main builds an inline sanitized packet from the preliminary verification run:

- Command names, exit codes, modes (incremental/full), and concise non-sensitive output.
- Skips, timeouts, truncations, and any `SKIP` on a required gate.
- Completeness (Phase 2) and coherence (Phase 4) summaries with `path:line` references.
- The before-fingerprint tuple (HEAD, staged/unstaged digests, untracked manifest, verified-file hashes).
- The effective level and rationale, plus prior review dispositions from `/ship`.
- PLAN/TODO/DECISIONS excerpts relevant to the claim being verified.
- An explicit file allowlist excluding secrets; the reviewer must not access unlisted or secret-bearing paths.

#### Dispatch (exact)

```typescript
const result = await agents.run({
  task: "Evidence review for <slug>. Audit completeness, coherence, command evidence, and freshness for superseded checks, stale assertions, untested branches, and skips-as-passes. Return evidence-backed findings only. <inline sanitized evidence packet>",
  name: "lifecycle-review-verify",
  runner: "pi",
  model: "openai-codex/gpt-5.6-sol",
  thinking: "max",
  extensions: false,
  recursive: false,
  tools: ["read", "grep", "find", "ls"],
  worktree: false,
});
```

Only `status === "completed"` is a completed review. Partial text from a failed/stopped/timed-out child is context only. A child failure is an advisory warning; it does not independently prevent `VERIFIED`.

#### Finding semantics

Each finding: `[Critical|High|Medium|Low][category] path:line` + violated authority + concrete failure scenario and cost + smallest correction + confidence + evidence status. No score, no quota. Main reopens every cited `path:line` (Worker Distrust); only Main's validated disposition produces `NEEDS WORK`.

### Phase 5B: Candidate Evidence Writes

Only after the 5A review is dispositioned (advisory findings recorded), append candidate evidence to `.pi/artifacts/<slug>/PROGRESS.md` **before** the final fingerprint: commands, exit codes, and a `pending final no-write verification` status. Record significant non-sensitive findings in `.pi/memory.md` (before the final fingerprint only):

```bash
# Append to .pi/memory.md:
#   - YYYY-MM-DD: [scope] [key finding] — [what, impact, resolution]
# Put under the Decisions or Gotchas section as appropriate
```

No repository write occurs after the final fingerprint — a post-fingerprint write invalidates the PASS it records.

### Phase 5C: Final No-Write Pass

After all allowed PROGRESS/MEMORY writes (5B), capture a fresh final-pass baseline fingerprint. Then rerun all required terminal gates and coherence (Phase 4) against the current bytes. Compare the final fingerprint to the fresh baseline: if any component differs (a formatter, concurrent writer, or later edit), rerun the affected checks. A stale PASS is invalid.

This is the last mutation-free pass. No edit, stage, commit, or push occurs in 5C or after — any such write invalidates the PASS it records.

### Phase 5D: Transcript-Only Result

Emit the final result and the fingerprint tuple in the response/session transcript only. `/verify` is the sole command allowed to declare terminal verified status, and it does so only in its transcript — never as a repository write after the final fingerprint.

Output:

1. **Result**: VERIFIED / NEEDS WORK / BLOCKED
2. **Completeness**: score and status
3. **Correctness**: gate results (with mode column)
4. **Coherence**: contradictions found (if not --quick)
5. **Advisory evidence review (5A)**: findings and Main disposition
6. **Fingerprint**: the before/fresh-final tuple (HEAD, staged digest, unstaged digest, untracked manifest, verified-file hashes)
7. **Blocking issues** to fix before verified status
8. **Next step**: if NEEDS WORK, run `/ship <slug>` to fix; if VERIFIED, the feature is complete

## Related Commands

| Need              | Command       |
| ----------------- | ------------- |
| Ship to implement | `/ship <slug>` |
| Plan a feature    | `/plan <slug>` |
| Fix a bug         | `/fix`        |
