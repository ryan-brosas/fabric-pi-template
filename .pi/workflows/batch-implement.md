
> **Pi execution binding:** The TypeScript block(s) below run inside `fabric_exec` as real governed dispatch — `general`-only implementation on the GLM pool (`makora/zai-org/GLM-5.2-NVFP4` cap 6 + `umans/umans-glm-5.2` cap 2), read-only plan reasoning on `claude-bridge/claude-opus-4-8`, and read-only fan-out (`explore`/`scout`/`review`/`debug`) on the same GLM lanes.
> Workers never create branches, commits, or PRs without operator confirmation; the board tracks `assigned -> running -> returned -> verified | failed`; the full dispatch doctrine (GLM pool, role routes, `required_skills`, board states, worker-distrust / primary-sole-integrator) lives in `.pi/docs/fabric-tuning.md` (kernel in `APPEND_SYSTEM.md`).
# batch-implement

Take a plan with independent tasks and dispatch one subagent per task in parallel. Each task result is reviewed, then merged. Use for multi-file feature implementation where tasks don't share file dependencies.

## Args

- `plan` (required) — The implementation plan or PRD

## Phases

### Phase 1: plan-review

- **Agent:** @review
- **Concurrency:** 1
- **Prompt:**

Review this implementation plan for task independence: {plan}. Verify that the tasks don't edit the same files. If any tasks have overlapping file dependencies, flag them as conflicts. Return the list of tasks grouped by dependency in this format:

## Independent Tasks (can run in parallel)
- **Task 1:** [description]
  - Files: [list]
- **Task 2:** [description]
  - Files: [list]

## Dependent Tasks (must run sequentially)
- **Task 3:** [description]
  - Depends on: [task names]
  - Files: [list]

Keep each task description under 100 words.

### Phase 2: implement

- **Depends on:** Phase 1
- **Agent:** @general
- **Concurrency:** Dynamic (1 agent per task, min 2, up to 8 (GLM pool ceiling))
- **Prompt:**

Implement the following task from the plan: {phase_1_output}. Write production-quality code following project conventions. Include type definitions, error handling, and unit tests. Keep changes scoped to your owned paths — do not edit files outside them or refactor unrelated code. On a failed verification you get one bounded retry, then report a blocker instead of forcing a merge. Return a summary in this format:

## Task: [name]
- **Files modified:** [list]
- **Tests added:** [list]
- **Key changes:** [brief summary]

Keep the summary under 200 words.

### Phase 3: verify

- **Depends on:** Phase 2
- **Agent:** @review
- **Concurrency:** Dynamic (~3 implementations per reviewer, min 2)
- **Prompt:**

Review this implementation: {phase_2_output}. You are read-only: inspect files and the supplied primary check evidence — do not run lint or tests. Assess correctness against the task requirements, test coverage, edge case handling, and type safety. Return findings in this format:

## Task: [name]
- **Status:** [pass/fail]
- **Issues:** [list with file:line refs]
- **Recommendations:** [list]

Keep each finding under 100 words.

## Final Integration (Primary, Sole Integrator)

After Phase 3 completes, the primary integrates — never from worker summary text. Worker summaries are reports, not merged code: the primary reads each worker's actual changed paths/files (or the repository diff when Git exists), confirms the named checks passed (Phase 3 review agents supply read-only check evidence — they inspect files and supplied evidence, they do not run lint/tests), and applies only the verified changes. Each worker got one bounded retry on a failed check before reporting; a still-failing worker is a blocker, not a merge.

Ensure across the integrated diff:
- No duplicate imports
- Consistent naming conventions
- Proper module boundaries
- No broken imports between modules

Report any integration conflicts or issues. Do not create branches, commits, or PRs — suggest the commit in the report and let the operator confirm. Return a summary:

## Integration Summary
- **Tasks integrated:** [count]
- **Files modified:** [list]
- **Integration issues:** [list or 'none']
- **Next steps:** [list]

Keep the summary under 500 words.
