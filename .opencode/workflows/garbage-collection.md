# Garbage Collection Workflow

Scans the codebase for drift from quality standards and opens targeted cleanup PRs.

> **Pattern:** Fallow analysis → review findings → file issues → optional auto-fix PRs
> **Trigger:** Manual via `/gc` command or scheduled cadence

## Phase 1: Fallow Scan

Run full structural analysis:

```bash
npx fallow --format json --quiet > .opencode/artifacts/gc-fallow.json
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
| Plugin layer | `.opencode/plugin/*.ts` | Fallow + structural check |
| Command layer | `.opencode/command/*.md` | Manual assessment |
| Skills layer | `.opencode/skill/*/SKILL.md` | Fallow |
| Documentation | `.opencode/artifacts/MEMORY.md` | Manual + link checker |

For each domain, assign grade:
- **A** — No issues, well-maintained
- **B** — Minor issues, no blockers
- **C** — Notable decay, needs cleanup
- **D** — Significant decay, priority cleanup

Update `.opencode/QUALITY.md` with current grades.

## Phase 3: Prioritize Findings

| Severity | Criteria | Action |
|---|---|---|
| P0 | Dead code in critical path, security hazard | Immediate fix PR |
| P1 | Duplication >5 instances, complexity >20 | File issue / schedule PR |
| P2 | Minor style drift, stale docs | Log for next GC cycle |
| P3 | Informational | Note only |

## Phase 4: Open Cleanup PRs (Optional)

For P0 and P1 findings, spawn a `@general` agent per finding to:

1. Understand the finding from Fallow output
2. Create a fix branch
3. Apply the fix
4. Verify with `npm run typecheck && npm run lint`
5. Open PR with conventional commit message

## Phase 5: Report

```text
## GC Report — $(date -u +%Y-%m-%d)

| Domain | Grade | Issues | Trend |
|--------|-------|--------|-------|
| Plugins | A | 0 | → |
| Commands | B | 2 | ↓ |
| Skills | A | 0 | → |
| Docs | B | 1 | ↓ |

**P0:** 0 | **P1:** 2 | **P2:** 1 | **P3:** 3
**PRs opened:** 1
```
