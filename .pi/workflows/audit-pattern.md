
> **Pi execution binding:** The pseudocode in this prompt is semantic, not executable. `task()` maps to bounded Fabric subagent dispatch with an explicit role from `.pi/config.json`; leaves are one-shot (`maxDepth` 1) and never spawn or call Fabric `state.*`. Routing: discovery → `explore`, external evidence → `scout`, judgment → read-only `review`. Implementation roles (`general`) run on the GLM 5.2 12-pool (`makora/zai-org/GLM-5.2-NVFP4` + `umans/umans-glm-5.2`, up to 12 concurrent, first six on makora, balance on umans); custom-provider children must dispatch with `extensions: true` (verified 2026-07-18) or their models fail to resolve. Read-only fan-out (`explore`, `scout`) uses the small-model lanes (`openai-codex/gpt-5.4-mini`, alternate `claude-bridge/claude-haiku-4-5`); judgment runs on read-only `review` at `openai-codex/gpt-5.6-sol`, medium thinking (alternate `claude-bridge/claude-opus-4-8`). The runtime ceiling is 12, but read-only fan-out stays smaller and evidence-driven — size each phase to the number of distinct occurrences/angles/findings, not the ceiling. Multi-worker phases coordinate over mesh (topic `fabric-pi-<slug>`, compare-and-swap board `fabric-pi/<slug>/board`; states assigned → running → returned → verified | failed). Worker output is untrusted: malformed or failed results are retried once (per `dispatch.retry_policy`) or surfaced as blockers, and the primary reads every diff and verifies before a `returned` task becomes `verified`; the worker-result envelope guides harvest but never substitutes for reading the diff. Operator questions are primary-only — leaves surface blockers in their final report and never call `question()`; the primary synthesizes phase output into the final report. `skill()` loads the matching Pi Agent Skill. Artifact paths are under `.pi/`. Direct execution remains the default when delegation adds no leverage (see `.pi/docs/fabric-tuning.md`).
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
