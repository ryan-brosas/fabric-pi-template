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
1. Review the plan for task independence
2. Implement tasks in parallel
3. Verify each implementation
4. Merge the results

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
