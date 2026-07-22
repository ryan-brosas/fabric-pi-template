---
description: Run garbage collection — Fallow analysis, quality grading, and cleanup recommendations
---

# Garbage Collection

Run structural analysis, update quality grades, and recommend cleanup.

## Validate Ready Packet

`/gc` is project-wide and slugless, but still requires a fully initialized project before any memory or action. The Pi-native init packet is six files:

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

If any check fails, **stop**. Do not read memory or run any scan. Report which packet gate failed and instruct the operator to run `/init` (fresh) or `/init --refresh` (established). A `partial` or reload-required state means the packet is not ready and `/gc` must fail closed. `/gc` remains response-only — it never writes lifecycle artifacts or project memory.

## Load Skills

Load the `fallow` skill before running the scan.

Load `verification-before-completion` before recording grades.

## Phase 1: Run Fallow Scan

If `fallow` is installed, run:

```bash
npx fallow --format json --quiet
```

If `fallow` is not installed or the command fails, report this as a PARTIAL result and skip to Phase 5. Never auto-install packages or make network calls without operator approval.

Extract:
- Dead code (unused exports, files, dependencies)
- Code duplication (clone groups)
- Complexity hotspots (cyclomatic complexity)
- Architecture boundary violations

## Phase 2: Read Existing Quality Grades

`/gc` is project-wide and slugless. Read project memory (`.pi/memory.md`) if it exists, for prior quality context, and compare with current Fallow findings. If no prior record exists, treat all grades as fresh. `/gc` never writes lifecycle artifacts (PLAN/TODO/PROGRESS/DECISIONS) and never writes project memory — grades and changes are emitted in the response only.

## Phase 3: Grade Each Domain

If a structural check is available for this project, run it. If no structural check exists, report that structural verification was skipped.

Grade each domain:

| Domain | Source | Grade |
|---|---|---|
| Plugins | Plugin source files | A–D |
| Commands | Command/prompt files | A–D |
| Skills | Skill directory | A–D |
| Docs | Memory and artifacts | A–D |

Grades are emitted in the response only. If a grade changed materially since the last cycle, note the change and its rationale in the response. `/gc` writes no lifecycle artifacts and no project memory; do not invent a separate quality file outside the canonical artifact set.

## Phase 4: Recommend Cleanup (if findings warrant)

For each P0/P1 finding from Fallow, recommend a specific fix with the exact file and line references. Do not automatically dispatch fix agents or open PRs. Present the recommendations and let the operator decide whether to proceed with `/fix` or `/create` for each finding.

If the operator approves a fix, implement it directly and run verification after. Never auto-dispatch parallel workers for cleanup without explicit operator approval.

## Phase 5: Report

Output:

1. **Quality Grades:** Per-domain status
2. **Issues Found:** Count by severity
3. **Cleanup Recommendations:** Listed (not auto-opened)
4. **Tooling Status:** Which tools ran, which were skipped or unavailable
5. **Recommendations:** Suggested improvements for next cycle

## Related Commands

| Need | Command |
|---|---|
| Full verification | `/verify` |
| Architecture audit | `/audit` |
| Fix a finding | `/fix` |
