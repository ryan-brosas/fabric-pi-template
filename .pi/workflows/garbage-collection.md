
> **Pi execution binding:** The pseudocode in this prompt is semantic, not executable. `task()` maps to bounded Fabric subagent dispatch with an explicit role from `.pi/config.json`: implementation runs **general-only** on the GLM 12 pool — up to 12 concurrent GLM 5.2 workers split across `makora/zai-org/GLM-5.2-NVFP4` and `umans/umans-glm-5.2` (both GLM 5.2, first six on makora, balance on umans), dispatched with `extensions:true`. The reasoning tier (`plan`, `review`, `debug`) runs on `openai-codex/gpt-5.6-sol` as **read-only reasoning** (read/grep/find/ls only; never receives implementation briefs, cannot edit); read-only fan-out (`explore`, `scout`) uses the small-model lanes (`openai-codex/gpt-5.4-mini`, alternate `claude-bridge/claude-haiku-4-5`). Workers are leaves at `maxDepth` 1: they never spawn agents and never call Fabric `state.*`. Each worker owns **exclusive paths** (no two workers edit the same file) and gets **one bounded retry** on a failed check, then reports a blocker. Multi-worker phases coordinate over mesh: durable topic `fabric-pi-<slug>` carries assignment and status events; a compare-and-swap board at mesh key `fabric-pi/<slug>/board` tracks states `assigned -> running -> returned -> verified | failed` (per `.pi/config.json` `coordination.board_states`); the primary publishes assignments, workers report status. **Worker output is untrusted** — worker summaries are reports, not merged code; the primary reads every diff, verifies, and is the sole integrator. `question()` maps to asking the operator; `skill()` loads the matching Pi Agent Skill. Artifact paths are under `.pi/` (extensions at `.pi/extensions/`, prompts at `.pi/prompts/`, skills at `.pi/skills/`). Workers never create branches, commits, PRs, or other externally visible actions without operator confirmation — they suggest them in reports. Direct execution remains the default when delegation adds no leverage (see `.pi/docs/fabric-tuning.md`).
# Garbage Collection Workflow

Scans the codebase for drift from quality standards and proposes targeted cleanup (no branch/commit/PR action without explicit operator confirmation).

> **Pattern:** Fallow analysis → review findings → file issues → optional auto-fix (operator opens PRs)
> **Trigger:** Manual via `/gc` command or scheduled cadence

## Phase 1: Fallow Scan

Run full structural analysis:

```bash
npx fallow --format json --quiet > .pi/artifacts/gc-fallow.json
```

Extract key findings:
- Dead code (unused exports, files, dependencies)
- Code duplication (clone groups)
- Complexity hotspots (high cyclomatic complexity)
- Architecture boundary violations

## Phase 2: Quality Grade Update

Grade each domain by scanning findings:

| Domain | Definition | Source |
|---|---|---|
| Extensions layer | `.pi/extensions/*.ts` | Fallow + structural check |
| Prompts layer | `.pi/prompts/*.md` | Manual assessment |
| Skills layer | `.pi/skills/*/SKILL.md` | Fallow |
| Documentation | `.pi/artifacts/MEMORY.md` | Manual + link checker |

For each domain, assign grade:
- **A** — No issues, well-maintained
- **B** — Minor issues, no blockers
- **C** — Notable decay, needs cleanup
- **D** — Significant decay, priority cleanup

Update `.pi/QUALITY.md` with current grades.

## Phase 3: Prioritize Findings

| Severity | Criteria | Action |
|---|---|---|
| P0 | Dead code in critical path, security hazard | Immediate fix; operator opens PR |
| P1 | Duplication >5 instances, complexity >20 | File issue; schedule fix (operator opens PR) |
| P2 | Minor style drift, stale docs | Log for next GC cycle |
| P3 | Informational | Note only |

## Phase 4: Propose Cleanup (Optional)

For P0 and P1 findings, spawn a `@general` worker per finding (up to 12 concurrent — GLM 12 pool ceiling; batch remaining findings into later waves). Each worker owns exclusive paths, gets one bounded retry on a failed check, and never creates branches, commits, or PRs — it suggests them for the operator. Workers:

1. Understand the finding from Fallow output
2. Apply the fix within owned paths only
3. Verify with `npm run typecheck && npm run lint` (or the closest available check)
4. Report changed paths and evidence; suggest the commit/PR for the operator to open

## Phase 5: Report

```text
## GC Report — $(date -u +%Y-%m-%d)

| Domain | Grade | Issues | Trend |
|--------|-------|--------|-------|
| Extensions | A | 0 | → |
| Prompts | B | 2 | ↓ |
| Skills | A | 0 | → |
| Docs | B | 1 | ↓ |

**P0:** 0 | **P1:** 2 | **P2:** 1 | **P3:** 3
**PRs suggested:** 1 (operator opens)
```
