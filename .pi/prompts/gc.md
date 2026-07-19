---
description: Run garbage collection — Fallow analysis, quality grading, and propose cleanup
agent: build
---

> **Pi execution binding:** GLM-only — 6 Makora + 2 Umans (8 seats); dispatch doctrine in `.pi/docs/fabric-tuning.md`.

# Garbage Collection

Run structural analysis, update quality grades, and propose cleanup (the operator owns every commit/PR).

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

Read `.pi/QUALITY.md` if it exists. Compare with current Fallow findings.

## Phase 3: Grade Each Domain

Run the structural check:

```bash
.pi/tools/structural-check.sh
```

Prepare evidence for grades per domain; Phase 4 performs the final synthesis into a PROPOSAL (no file mutation):

| Domain | Source | Grade |
|---|---|---|
| Extensions | `.pi/extensions/*.ts` | A–D |
| Prompts | `.pi/prompts/*.md` | A–D |
| Skills | `.pi/skills/` | A–D |
| Docs | `.pi/artifacts/MEMORY.md` | A–D |

## Phase 4: Governed Analysis and Cleanup Proposal

The primary supplies the completed command outputs as named strings
`π.fallowReport` and `π.structuralReport`. Read-only grading fan-out is
NON-MUTATING and GLM-only: defer to `/team`'s canonical read-only 6 Makora + 2
Umans wave (8 seats), or dispatch GLM workers directly. No implementation
route, worktree, source edit, commit, PR, or `.pi/QUALITY.md` write is created —
the report is a PROPOSAL only; no file mutation before operator selection.

```typescript
// fabric_exec — non-mutating, GLM-only GC proposal; primary synthesizes.
const fallowReport = typeof π.fallowReport === 'string' ? π.fallowReport.trim() : '';
const structuralReport = typeof π.structuralReport === 'string' ? π.structuralReport.trim() : '';
if (!fallowReport) throw new Error('π.fallowReport is required; run Phase 1 first');
if (!structuralReport) throw new Error('π.structuralReport is required; run Phase 3 first');
// Read-only grading is delegated to /team (6 Makora + 2 Umans GLM-only wave)
// or GLM workers; this block performs no spawn/wait and no file mutation.
return {
  fallow: fallowReport.slice(0, 16000),
  structural: structuralReport.slice(0, 16000),
  note: 'Grades synthesized by primary from /team read-only wave; proposal only, no writes.',
};
```

The primary verifies cited findings against the files, resolves conflicting
grades, and lists remediation as operator-owned proposals. Do not dispatch
fix workers from `/gc`; use `/fix` or `/ship` after the operator selects a
proposal.

## Phase 5: Report

Output structured cleanup UNITS — a PROPOSAL only; no file mutation before
operator selection:

```json
{
  "grades": { "extensions": "A-D", "prompts": "A-D", "skills": "A-D", "docs": "A-D" },
  "issuesBySeverity": { "high": 0, "medium": 0, "low": 0 },
  "units": [
    { "id": "gc-N", "ownedPaths": [], "checks": [], "tag": "delete" },
    { "id": "gc-N", "ownedPaths": [], "checks": [], "tag": "simplify" }
  ]
}
```

Each unit is operator-owned; `/fix` or `/ship` executes after selection.

## Related Commands

| Need | Command |
|---|---|
| Full verification | `/verify all --full` |
| Architecture audit | `/audit` |
