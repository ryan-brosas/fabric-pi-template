
> **Pi execution binding:** The phase prompts run inside `fabric_exec` as real governed dispatch — read-only fan-out (`explore`/`scout`) and judgment (`review`) on the GLM lanes (`makora/zai-org/GLM-5.2-NVFP4`, alt `umans/umans-glm-5.2`); the implementation `general` route (same GLM pool) is not dispatched here. The full dispatch doctrine — GLM pool, role routes, `required_skills`, board states (`assigned → running → returned → verified | failed`), worker-distrust / primary-sole-integrator — lives in `.pi/docs/fabric-tuning.md` (kernel in `APPEND_SYSTEM.md`).
# audit-pattern

Find all occurrences of a code pattern in the codebase, review each match for correctness/security/edge-cases, and produce prioritized remediation recommendations. Use for cross-cutting concerns like auth checks, error handling, or API patterns.

## Args

- `pattern` (required) — The code pattern to search for

## Phases

### Phase 1: discover

- **Agent:** @explore
- **Concurrency:** 1
- **Prompt:**

Search the codebase for the pattern: {pattern}. Use the available grep, find, and read tools to find every occurrence. List each file with line numbers, grouped by subdirectory. If the pattern has common variations, include those too. Return results in this format:

## Directory: [path]
- `file.ts:42` — [brief context]
- `file.ts:87` — [brief context]

Keep each entry under 50 words.

### Phase 2: audit

- **Depends on:** Phase 1
- **Agent:** @review
- **Concurrency:** Dynamic (estimate ~10 occurrences per agent, min 2; ceiling 12, but size to the occurrence count — read-only judgment stays evidence-driven, not ceiling-bound)
- **Prompt:**

Review the following files for the pattern '{pattern}': {phase_1_output}. For each occurrence check: correctness, edge cases, security implications, error handling, and adherence to project conventions. Return findings in this format:

## File: [path:line]
- **Severity:** [critical/important/minor]
- **Issue:** [description]
- **Recommendation:** [fix suggestion]

Keep each finding under 100 words.

## Final Synthesis (Main Agent)

After Phase 2 completes, synthesize the audit findings directly from {phase_2_output}.

Produce:
1. **Issues ranked by severity** — Critical, important, minor with file:line references
2. **Affected scope** — Count of files and occurrences
3. **Recommended fixes** — Specific fix suggestions per issue
4. **Correct patterns** — Patterns that are already correct and should be preserved

Group findings by subdirectory. Keep the report under 1500 words.
