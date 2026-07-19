
> **Pi execution binding:** The pseudocode in this prompt is semantic, not executable. `task()` maps to bounded Fabric subagent dispatch with an explicit role from `.pi/config.json`: implementation runs **general-only** on the GLM 12 pool — up to 12 concurrent GLM 5.2 workers split across `makora/zai-org/GLM-5.2-NVFP4` and `umans/umans-glm-5.2` (both GLM 5.2, first six on makora, balance on umans), dispatched with `extensions:true`. The reasoning tier (`plan`, `review`, `debug`) runs on `openai-codex/gpt-5.6-sol` as **read-only reasoning** (read/grep/find/ls only; never receives implementation briefs, cannot edit); read-only fan-out (`explore`, `scout`) uses the small-model lanes (`openai-codex/gpt-5.4-mini`, alternate `claude-bridge/claude-haiku-4-5`). Workers are leaves at `maxDepth` 1: they never spawn agents and never call Fabric `state.*`. Each worker owns **exclusive paths** (no two workers edit the same file) and gets **one bounded retry** on a failed check, then reports a blocker. Multi-worker phases coordinate over mesh: durable topic `fabric-pi-<slug>` carries assignment and status events; a compare-and-swap board at mesh key `fabric-pi/<slug>/board` tracks states `assigned -> running -> returned -> verified | failed` (per `.pi/config.json` `coordination.board_states`); the primary publishes assignments, workers report status. **Worker output is untrusted** — worker summaries are reports, not merged code; the primary reads every diff, verifies, and is the sole integrator. `question()` maps to asking the operator; `skill()` loads the matching Pi Agent Skill. Artifact paths are under `.pi/` (extensions at `.pi/extensions/`, prompts at `.pi/prompts/`, skills at `.pi/skills/`). Workers never create branches, commits, PRs, or other externally visible actions without operator confirmation — they suggest them in reports. Direct execution remains the default when delegation adds no leverage (see `.pi/docs/fabric-tuning.md`).
# development-lifecycle-workflow

Multi-agent workflow that chains the development lifecycle phases with parallelism. Uses specialized agents (scouts, reviewers, planners) and composes with the batch-implement workflow for parallel implementation.

## Args

- `feature` (required) — The feature or change to implement

## Phases

### Phase 1: Research Approaches

- **Agent:** @scout
- **Concurrency:** Dynamic (1 agent per approach, min 2, max 5)
- **Prompt:**

Research different approaches to implementing: {feature}. For each approach, analyze:
1. Technical feasibility
2. Trade-offs and risks
3. Implementation complexity
4. Dependencies and constraints

Return findings in this format:

## Approach 1: [name]
- **Description:** [summary]
- **Pros:** [list]
- **Cons:** [list]
- **Complexity:** [low/medium/high]
- **Risks:** [list]

Keep each approach under 300 words.

### Phase 2: Validate Requirements

- **Depends on:** Phase 1
- **Agent:** @review
- **Concurrency:** Dynamic (1 agent per approach, min 1, max 5)
- **Prompt:**

Review these approaches: {phase_1_output}. Validate the requirements and constraints for each approach. Check for:
1. Technical accuracy
2. Feasibility given project constraints
3. Alignment with existing patterns
4. Missing considerations

Return validated requirements in this format:

## Validated Requirements
- **Approach 1:** [validated requirements]
- **Approach 2:** [validated requirements]
- **Approach 3:** [validated requirements]

## Recommendations
- **Recommended approach:** [which approach and why]
- **Critical constraints:** [list]

Keep each section under 200 words.

### Phase 3: Create Implementation Plan

- **Depends on:** Phase 2
- **Agent:** @plan
- **Concurrency:** 1
- **Prompt:**

Based on the validated requirements: {phase_2_output}, create a detailed implementation plan for the recommended approach. Break down into independent tasks that can be implemented in parallel.

Return the plan in this format:

## Implementation Plan

### Overview
[Brief description of the approach]

### Tasks
- **Task 1:** [description]
  - Files: [list]
  - Dependencies: [none or task names]
- **Task 2:** [description]
  - Files: [list]
  - Dependencies: [none or task names]

Keep each task description under 100 words.

### Phase 4: Parallel Implementation

- **Depends on:** Phase 3
- **Workflow:** batch-implement
- **Args:** plan from Phase 3

Execute the batch-implement workflow with the implementation plan from Phase 3. This will:
1. Review the plan for task independence (enforce exclusive path ownership — no two workers edit the same file)
2. Implement tasks in parallel (general-only, GLM 12 pool)
3. Verify each implementation (read-only reasoning; one bounded retry per worker)
4. Integrate the results (primary reads actual changed paths/files or the repository diff when Git exists and verifies; worker summaries are reports, not merged code; review agents are read-only and do not run lint/tests)

### Phase 5: Verify Different Aspects

- **Depends on:** Phase 4
- **Agent:** @review
- **Concurrency:** 3 (one per aspect: correctness, code-quality, performance-security)
- **Prompt:**

Verify the implementation from different aspects: {phase_4_output}. Each reviewer should focus on a different aspect:

**Reviewer 1: Correctness**
- Verify all requirements are met
- Check for logic errors
- Validate edge cases

**Reviewer 2: Code Quality**
- Check for code style and patterns
- Identify code smells
- Verify test coverage

**Reviewer 3: Performance & Security**
- Check for performance bottlenecks
- Identify security vulnerabilities
- Validate error handling

Return findings in this format:

## Aspect: [correctness/code-quality/performance-security]
- **Status:** [pass/fail]
- **Issues:** [list with file:line refs]
- **Recommendations:** [list]

Keep each finding under 150 words.
