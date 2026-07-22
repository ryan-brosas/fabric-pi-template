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
- **Concurrency:** Dynamic (1 agent per task, min 2, max 10)
- **Prompt:**

Implement the following task from the plan: {phase_1_output}. Write production-quality code following project conventions. Include type definitions, error handling, and unit tests. Keep changes scoped to the task — do not refactor unrelated code. Return a summary in this format:

## Task: [name]
- **Files modified:** [list]
- **Tests added:** [list]
- **Key changes:** [brief summary]

Keep the summary under 200 words.

### Phase 3: verify

- **Depends on:** Phase 2
- **Agent:** @review
- **Concurrency:** Dynamic (~3 implementations per agent, min 2, max 8)
- **Prompt:**

Review this implementation: {phase_2_output}. Check: correctness against the task requirements, test coverage, edge case handling, type safety, and lint compliance. Return findings in this format:

## Task: [name]
- **Status:** [pass/fail]
- **Issues:** [list with file:line refs]
- **Recommendations:** [list]

Keep each finding under 100 words.

## Final Merge (Main Agent)

After Phase 3 completes, merge the verified implementations directly from {phase_3_output}.

Ensure:
- No duplicate imports
- Consistent naming conventions
- Proper module boundaries
- No broken imports between modules

Report any merge conflicts or integration issues. Return a summary:

## Merge Summary
- **Tasks merged:** [count]
- **Files modified:** [list]
- **Integration issues:** [list or 'none']
- **Next steps:** [list]

Keep the summary under 500 words.
