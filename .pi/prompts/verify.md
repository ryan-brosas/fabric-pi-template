---
description: Verify implementation completeness, correctness, and coherence
argument-hint: "[path|all] [--quick] [--full] [--fix] [--no-cache]"
agent: review
---

> **Pi execution binding:** The pseudocode in this prompt is semantic, not executable. `task()` maps to bounded Fabric subagent dispatch with an explicit role from `.pi/config.json`: implementation routes to the `general` role only, on the GLM 12 pool (`makora/zai-org/GLM-5.2-NVFP4` + `umans/umans-glm-5.2`, up to 12 concurrent GLM 5.2 workers, at least 6 on makora, at medium thinking); custom-provider children spawn with `extensions:true` and the primary injects the role contract from `.pi/agents/` before dispatch. The `build` route (`claude-bridge/claude-opus-4-8`, high thinking) is the primary supervisor and sole integrator — it orchestrates, gates, and integrates but is never dispatched as an implementation worker. This prompt's agent (`review`) is **read-only verification**: it reports findings with `file:line` evidence and never edits; the `general` route is the only tier granted edit/write/bash. Gates that need execution (build/test/lint/shell) are requested as blockers for the primary to run — the review agent never claims to run a check it cannot perform. Read-only fan-out (`explore`, `scout`) uses the small-model lanes (`openai-codex/gpt-5.4-mini`, alternate `claude-bridge/claude-haiku-4-5`); scouts carry `context7`, `grepsearch`, and pinned `codex_search`; the primary brokers MCP evidence and arbitrary URL fetching. Reasoning roles (`plan`, `review`, `debug`) run on `openai-codex/gpt-5.6-sol` at medium thinking, read-only. Workers are leaves at `maxDepth` 1: they never spawn agents and never call Fabric `state.*`. Multi-worker phases coordinate over mesh (topic `fabric-pi-<slug>`, CAS board `fabric-pi/<slug>/board`) with canonical board states `assigned|running|returned|verified|failed`; the primary publishes assignments, workers report status. **Worker output is untrusted evidence** — worker summaries are reports, not merged results; the primary reads every diff, verifies, and is the sole integrator. Briefs carry `required_skills` (resolved by the primary against `.pi/skills/manifest.json` before spawn; `[]` loads no skill). Workers never create branches, commits, PRs, or other externally visible actions without operator confirmation — they suggest them in reports. `question()` maps to asking the operator; `skill()` loads the matching Pi Agent Skill. Artifact paths are under `.pi/`. Direct execution remains the default when delegation adds no leverage (see `.pi/docs/fabric-tuning.md`).

# Verify: $ARGUMENTS

Check implementation against PRD before shipping.

## Load Skills

```typescript
skill({ name: "verification-before-completion" });
```

## Parse Arguments

| Argument     | Default  | Description                                    |
| ------------ | -------- | ---------------------------------------------- |
| `<path\|all>`| required | The path or keyword to verify                  |
| `--quick`    | false    | Gates only, skip coherence check               |
| `--full`     | false    | Force full verification mode (non-incremental) |
| `--fix`      | false    | Auto-fix lint/format issues                    |
| `--no-cache` | false    | Bypass verification cache, force fresh run     |

## Determine Input Type

| Input Type | Detection           | Action                     |
| ---------- | ------------------- | -------------------------- |
| Path       | File/directory path | Verify that specific path  |
| `all`      | Keyword             | Verify all in-progress work |

## Before You Verify

- **Be certain**: Only flag issues you can verify with tools
- **Don't invent problems**: If an edge case isn't in the PRD, don't flag it
- **Run the gates**: Build, test, lint, typecheck are non-negotiable
- **Use project conventions**: Check `package.json` scripts first

## Phase 0: Check Verification Cache

Before running any gates, check if a recent verification is still valid:

```bash
# Compute current state fingerprint (commit hash + diff)
CURRENT_STAMP=$(printf '%s\n%s' \
  "$(git rev-parse HEAD)" \
  "$(git diff HEAD -- '*.ts' '*.tsx' '*.js' '*.jsx')" \
  | shasum -a 256 | cut -d' ' -f1)
LAST_STAMP=$(tail -1 .pi/artifacts/verify.log 2>/dev/null | awk '{print $1}')
```

| Condition                                 | Action                                                 |
| ----------------------------------------- | ------------------------------------------------------ |
| `--no-cache` or `--full`                  | Skip cache check, run fresh                            |
| `CURRENT_STAMP == LAST_STAMP`             | Report **cached PASS**, skip to Phase 2 (completeness) |
| `CURRENT_STAMP != LAST_STAMP` or no cache | Run gates normally                                     |

When cache hits, report:

```text
Verification: cached PASS (no changes since <timestamp from verify.log>)
```

## Phase 1: Gather Context

Read `.pi/artifacts/$(cat .pi/artifacts/.active)/spec.md` to understand the requirements.

Read `.pi/artifacts/$(cat .pi/artifacts/.active)/` to check what plan artifacts exist.

Read the PRD and any other artifacts (plan.md, research.md, design.md).

**Verify guards:**

- [ ] Plan/spec exists and is up to date
- [ ] You have read the full spec

## Phase 2: Completeness

Extract all requirements/tasks from the PRD and verify each is implemented:

- For each requirement: find evidence in the codebase (file:line reference)
- Mark as: complete, partial, or missing
- Report completeness score (X/Y requirements met)

## Phase 3: Correctness

Follow the [Verification Protocol](../skills/verification-before-completion/references/VERIFICATION_PROTOCOL.md):

**Default: incremental mode** (changed files only, parallel gates).

| Mode        | When                                      | Behavior                         |
| ----------- | ----------------------------------------- | -------------------------------- |
| Incremental | Default, <20 changed files                | Lint changed files, test changed |
| Full        | `--full` flag, >20 changed files, or ship | Lint all, test all               |

**Execution order:**

1. **Parallel**: typecheck + lint (simultaneously)
2. **Sequential** (after parallel passes): test, then build (ship only)
3. **Quality pack (always)**: `node .pi/tools/quality/run-pack.mjs <changed files>` — deterministic universal + language checks (`config.json` `quality_packs`). Exclude intentionally-defective test fixtures; findings in artifact docs that merely *depict* defects (e.g. conflict-marker examples in fenced blocks) are reportable caveats, not blockers.

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

**After all gates pass**, record to verification cache:

```bash
echo "$CURRENT_STAMP $(date -u +%Y-%m-%dT%H:%M:%SZ) PASS" >> .pi/artifacts/verify.log
```

If `--fix` flag provided, run the project's auto-fix command (e.g., `npm run lint:fix`, `ruff check --fix`, `cargo clippy --fix`).

## Phase 4: Coherence (skip with --quick)

Cross-reference artifacts for contradictions:

- PRD vs implementation (does code address all PRD requirements?)
- Plan vs implementation (did code follow the plan?)
- Research recommendations vs actual approach (if different, is it justified?)

Flag contradictions with specific file references.

## Phase 5: Report

Append to `.pi/artifacts/$(cat .pi/artifacts/.active)/progress.md`: `Verification: [PASS|PARTIAL|FAIL] - [summary]`

Output:

1. **Result**: READY TO SHIP / NEEDS WORK / BLOCKED
2. **Completeness**: score and status
3. **Correctness**: gate results (with mode column)
4. **Coherence**: contradictions found (if not --quick)
5. **Blocking issues** to fix before shipping
6. **Next step**: `/ship $ARGUMENTS` if ready, or list fixes needed

Record significant findings in context files:

```bash
# Append to .pi/artifacts/MEMORY.md:
#   - YYYY-MM-DD: [scope] [key finding] — [what, impact, resolution]
# Put under the Decisions or Gotchas section as appropriate
```

## Related Commands

| Need              | Command       |
| ----------------- | ------------- |
| Ship after verify | `/ship <id>`  |
| Plan a feature    | `/plan`       |
| Fix a bug         | `/fix`        |
