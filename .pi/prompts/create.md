---
description: Create a specification with PRD, tasks, and workspace setup
argument-hint: "<slug> <description>"
---

# Create: $ARGUMENTS

Create a specification (PRD), set up workspace, and define executable tasks — ready for `/ship`.

> **Workflow:** **`/create`** → `/ship`

## Parse Arguments

| Argument        | Default       | Description                               |
| --------------- | ------------- | ----------------------------------------- |
| `<slug>`        | required      | Lowercase-hyphen feature namespace (first positional) |
| `<description>` | required      | What to build/fix (quoted string, after the slug)     |

## Determine Input Type

| Input Type  | Detection            | Action                        |
| ----------- | -------------------- | ----------------------------- |
| Quoted text | `"description here"` | Create PRD from description   |
| Short form  | Simple string        | Ask for more detail if needed |

## Before You Create

- **Be certain**: Only create specs you're confident have clear scope
- **Don't over-spec**: If the description is vague, ask clarifying questions first
- **Check duplicates**: Always check for existing work
- **No implementation**: This command creates specs and workspace — don't write implementation code
- **Verify PRD**: Before saving, verify all sections are filled (no placeholders)
- **Flag uncertainty**: Use `[NEEDS CLARIFICATION]` markers for unknowns — never guess silently

## Available Helpers

| Helper    | Use When                                     |
| --------- | -------------------------------------------- |
| `explore` | Finding patterns in codebase, affected files |
| `scout`   | External research, best practices            |

## Phase 2: Validate Slug

This phase runs before Phase 1 because the slug must be validated before any filesystem or project-memory access.

Validate the provided `<slug>` before any filesystem access. Reject values that are empty, absolute (start with `/`), contain slashes or `..` segments, uppercase letters, leading/trailing hyphens, or double hyphens.

Accepted pattern:

```
^(?=.{1,64}$)[a-z0-9]+(?:-[a-z0-9]+)*$
```

If the slug is invalid, stop and report the exact validation failure. Do not access `.pi/artifacts/` or `.opencode/artifacts/MEMORY.md` until the slug passes validation.

## Phase 1: Duplicate Check

### Context Search

Search `.opencode/artifacts/MEMORY.md` for: prior decisions, similar work.

```bash
rg -n "topic" .opencode/artifacts/MEMORY.md
```

### Existing Work Check

Check `.pi/artifacts/` for existing work on this slug. An **established** namespace has both `PLAN.md` AND `TODO.md`. Classify and act:

- **Established** (both `PLAN.md` and `TODO.md` exist): stop — the namespace is in use. Ask the operator whether they want to continue with `/ship` instead. Never overwrite an existing namespace.
- **Partial** (only one of `PLAN.md`/`TODO.md` exists): stop — the namespace is partially initialized from an interrupted `/create`. Block for operator recovery; do not adopt, overwrite, or delete. Report which sentinel file is missing.
- **Absent** (neither exists): proceed — `/create` is the sole namespace creator and will `mkdir -p .pi/artifacts/<slug>/` and write both sentinel files in Phase 5.

## Phase 3: Choose Research Depth

Ask the operator before delegating research:

Ask: "How much codebase research do you need?" with these options:

- **Deep (Recommended for complex work)** — 3-5 agents: patterns, tests, deps, best practices (~2 min)
- **Standard** — 2 agents: patterns + tests (~1 min)
- **Minimal** — 1 explore worker: quick file scan (~30 sec)
- **Skip** — I know the codebase, use existing knowledge

This choice becomes the **Discovery Level** persisted in the PLAN (Phase 6):

| Choice | Discovery Level |
|---|---|
| Skip | 0 |
| Minimal | 1 |
| Standard | 2 |
| Deep | 3 |

The Discovery Level feeds the tier-gated review gates (`/create` Phase 10A, `/plan` Phase 8A, `/ship`, `/verify`): L0-1 review is advisory; L2-3 review is blocking. Because `/plan` is optional, `/create` must persist the level so a slug that skips `/plan` still carries it into `/ship`/`/verify`.

## Phase 4: Gather Context

Based on research depth choice, delegate read-only context gathering:

**If Deep:**

- 3x `explore` (patterns, tests, deps)
- 1x `scout` (feature/epic)
- 1x `review` (epic)

**If Standard:**

- 2x `explore` (patterns, tests)
- 1x `scout` (feature/epic only)

**If Minimal:**

- 1x `explore` (patterns)

**If Skip:**

- No agents, use existing AGENTS.md context

**While agents run**, ask clarifying questions if the description lacks scope or expected outcome. For bugs, also ask for reproduction steps and expected vs actual behavior.

## Phase 5: Initialize Plan

Extract title and description from the remaining arguments (after `<slug>`):

- If the operator provided a single line, use it for both title and description.
- If the operator provided multiple lines, use first line as title and full text as description.

The `<slug>` validated in Phase 2 becomes the feature's namespace:

```bash
mkdir -p ".pi/artifacts/$SLUG"
```

## Phase 6: Determine PRD Rigor

Not every change needs a full spec. Assess complexity to choose the right PRD level:

| Signal | Lite PRD | Full PRD |
| --- | --- | --- |
| Scope | Simple, single-concern | Cross-cutting, multi-system |
| Files affected | 1-3 | 4+ |
| Research depth | Skip or Minimal | Standard or Deep |
| Description | "Fix X in Y" | "Implement X with Y and Z" |

**Auto-detect:** If research was Skip/Minimal AND description is a single sentence → default to Lite.

### Lite PRD Format

For simple, well-scoped work (bugs, small tasks):

```markdown
# [Title]

## Problem
[1-2 sentences: what's wrong or what's needed]

## Solution
[1-2 sentences: what to do]

## Affected Files
- `src/path/to/file.ts`

## Tasks
- [ ] [Task description] → Verify: `[command]`

## Success Criteria
- Verify: `npm run typecheck && npm run lint`
- Verify: `[specific test or check]`
```

### Full PRD Format

For features and complex work, use the full template and write it to the active feature's plan (`.pi/artifacts/<slug>/PLAN.md`).

### Persisted Review Levels

Every PLAN (Lite or Full) must carry both numeric levels near the top, so later gates (`/plan`, `/ship`, `/verify`) compute a deterministic effective level even when `/plan` is skipped:

```markdown
**Discovery Level:** N — rationale
**Effective Review Level:** N — max(discovery, risk floor)
```

The **risk floor** is the minimum level the work's risk profile imposes, independent of research depth. Apply at least **L2** for: authentication or authorization; secrets, credentials, PII, or sensitive data; destructive actions; database/schema/persistence changes; concurrency or distributed state; public APIs or compatibility contracts; new dependencies or unfamiliar external APIs; cross-subsystem work. The Effective Review Level is `max(discovery, risk floor)`. Never default missing or malformed data to L0.

## Review Profile

The PLAN must include a `## Review Profile` section (Full PRD) or a brief review-notes block (Lite PRD) so the review gates have the context they need:

- **Language and framework:** detected stack with exact manifest/lockfile versions.
- **Local authorities:** applicable `AGENTS.md` rules, accepted DECISIONS, and PLAN requirements.
- **Required source packet:** exact-version official material the reviewer needs (supplied inline by Main at gate time; the read-only reviewer cannot fetch it).
- **Required checks:** the verification commands the work must pass.
- **Applicable overlays:** generated-code quality, language/framework best practice, security, performance — whichever the risk profile invokes.

## Phase 7: Write PRD

Copy and fill the PRD template (lite or full) using context from Phase 4.

**If Lite PRD:** Fill the lite format directly. No template file needed.

**If Full PRD:** Read the template and fill all required sections:

| Section           | Source                                                     | Required          |
| ----------------- | ---------------------------------------------------------- | ----------------- |
| Problem Statement | User description + clarifying questions                    | Always            |
| Scope (In/Out)    | User input + codebase exploration                          | Always            |
| Proposed Solution | Codebase patterns + user intent                            | Always            |
| Success Criteria  | User verification + test commands (must include `Verify:`) | Always            |
| Technical Context | Explore agent findings                                     | Always            |
| Affected Files    | Explore agent findings (real paths from Phase 4)           | Always            |
| Tasks             | Derived from scope + solution                              | Always            |
| Risks             | Codebase exploration                                       | Feature/epic only |
| Open Questions    | Unresolved items from Phase 4                              | If any exist      |

### Task Format

Tasks must follow this format:

- Title with `[category]` tag
- One-sentence **end state** description (not step-by-step)
- Metadata block: `depends_on`, `parallel`, `conflicts_with`, `files`
- At least one verification command per task

## Phase 8: Validate PRD

Before saving, verify:

- [ ] No placeholder text remains (e.g., "[Clear description", "[List what's allowed]")
- [ ] Success criteria include `Verify:` commands
- [ ] Technical context references actual `src/` paths from exploration
- [ ] Affected files list real paths
- [ ] Tasks have `[category]` headings
- [ ] Each task has verification
- [ ] No implementation code in the PRD
- [ ] No unresolved `[NEEDS CLARIFICATION]` markers remain (convert to Open Questions or resolve)

If any check fails, fix it — don't ask the user.

## Phase 9: Prepare Workspace

### Workspace Check

```bash
git status --porcelain
git branch --show-current
```

- If uncommitted changes: ask the operator whether to proceed, commit, or stop. Do not stash, create branches, or create worktrees automatically — surface the state and let the operator decide.

Do not create branches, worktrees, or stashes from this command. Workspace readiness is inspection and an operator gate only; any branch or worktree setup must be an explicit operator action.

Additionally, offer the operator a "Create worktree" option for isolated workspace setup. If the operator accepts, load the `using-git-worktrees` skill (read its `SKILL.md`) and follow its guidance. Worktree creation remains an explicit operator action — never automatic from this command.

## Phase 10: Convert PRD to Tasks

Convert the PRD into an executable task list in `.pi/artifacts/<slug>/TODO.md` (with `depends_on`, `parallel`, `conflicts_with`, and `files` metadata per task).

## Phase 10A: Spec Review Gate

After the PRD is validated (Phase 8) and converted to tasks (Phase 10), and before the report, run a tier-gated read-only review of the *final synchronized* `PLAN.md` + `TODO.md`. This reviews the artifacts as they will enter `/ship`, not an earlier draft.

Compute the **Effective Review Level** = `max(stored Discovery Level, stored Effective Review Level, current risk floor)` from the PLAN header.

### Dispatch (exact)

```typescript
const result = await agents.run({
  task: "Spec review for <slug>. Audit the final validated PLAN.md and TODO.md: scope clarity, observable-truth completeness, ambiguous non-goals, open questions that block /plan, task-to-criterion traceability, versioned source obligations in the Review Profile. Return evidence-backed findings only. <inline sanitized packet: PLAN.md, TODO.md, applicable AGENTS.md/DECISIONS excerpts, effective level + rationale, explicit path allowlist excluding secrets>",
  name: "lifecycle-review-create",
  runner: "pi",
  model: "openai-codex/gpt-5.6-sol",
  thinking: "max",
  extensions: false,
  recursive: false,
  tools: ["read", "grep", "find", "ls"],
  worktree: false,
});
```

Only `status === "completed"` is a completed review. Partial text from a failed/stopped/timed-out child is context only.

### Finding semantics

Each finding: `[Critical|High|Medium|Low][category] path:line` + violated authority + concrete failure scenario and cost + smallest correction + confidence + evidence status (`local | host-supplied | source-check-required`). No overall score, no quota; zero findings is valid. A clean review never certifies readiness.

Main reopens every cited `path:line` and reproduces the reasoning before accepting (Worker Distrust). Only Main's validated disposition blocks or proceeds. Critical/High independently validated defects block at every level.

### Tier behavior

- **L0-1 (advisory):** reviewer completion is not a phase precondition. A child failure warns and proceeds. Existing hard safety/correctness rules still apply to validated Critical/High findings.
- **L2-3 (blocking):** Main cannot advance to the report until the review is tied to current artifacts and every Critical/High finding is adjudicated (resolved, disproved with evidence, or explicitly accepted with rationale). A timeout or unavailable reviewer blocks unless the operator overrides.

### Convergence

Accepted findings may stale the validation or TODO conversion. After an accepted finding: regenerate TODO as necessary, rerun Phase 8 validation, then re-review at L2-3. Bound convergence to **two review-integration rounds**; if unresolved findings remain after two rounds, escalate to the operator with the accumulated findings.

## Phase 11: Report

Output:

1. Summary: task count, success criteria count, affected files count
2. Workspace state (if reported)
3. Active feature: `.pi/artifacts/<slug>/`
4. Next step: `/ship` (or `/plan` for complex work)

---

## Related Commands

| Need               | Command      |
| ------------------ | ------------ |
| Research first     | `/research`  |
| Plan after spec    | `/plan`      |
| Implement and ship  | `/ship`      |
