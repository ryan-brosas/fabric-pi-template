---
description: Run garbage collection — Fallow analysis, quality grading, and cleanup PRs
agent: build
---

# Garbage Collection

Run structural analysis, update quality grades, and open cleanup PRs.

## Load Skills

```typescript
skill({ name: "fallow" });
skill({ name: "verification-before-completion" });
```

## Phase 1: Run Fallow Scan

```bash
npx fallow --format json --quiet
```

Extract:
- Dead code (unused exports, files, dependencies)
- Code duplication (clone groups)
- Complexity hotspots (cyclomatic complexity)
- Architecture boundary violations

## Phase 2: Read Existing Quality Grades

Read `.opencode/QUALITY.md` if it exists. Compare with current Fallow findings.

## Phase 3: Grade Each Domain

Run the structural check:

```bash
.opencode/tool/structural-check.sh
```

Update `.opencode/QUALITY.md` with grades per domain:

| Domain | Source | Grade |
|---|---|---|
| Plugins | `.opencode/plugin/*.ts` | A–D |
| Commands | `.opencode/command/*.md` | A–D |
| Skills | `.opencode/skill/` | A–D |
| Docs | `.opencode/artifacts/MEMORY.md` | A–D |

## Phase 4: Open Cleanup PRs (if findings warrant)

For each P0/P1 finding from Fallow:

```typescript
task({
  subagent_type: "general",
  description: "Fix [finding type]",
  prompt: `Fix this Fallow finding: [detail]. Run verification after.`,
});
```

Wait for all fix tasks to complete. Verify each.

## Phase 5: Report

Output:

1. **Quality Grades:** Per-domain status
2. **Issues Found:** Count by severity
3. **Cleanup PRs:** Opened/not needed
4. **Recommendations:** Suggested improvements for next cycle

## Related Commands

| Need | Command |
|---|---|
| Full verification | `/verify all --full` |
| Architecture audit | `/audit` |
