---
description: Create detailed implementation plan with TDD steps
argument-hint: "<slug>"
---

# Plan: $ARGUMENTS

Create a detailed implementation plan with TDD steps. Optional deep-planning between `/create` and `/ship`.

> **Workflow:** `/create` → **`/plan`** (optional) → `/ship`
>
> **When to use:** Complex tasks where spec verification steps aren't enough guidance. Skip for simple tasks.

## Parse Arguments

| Argument | Default  | Description                       |
| -------- | -------- | --------------------------------- |
| `<slug>` | required | The active feature namespace (lowercase-hyphen, validated by `/create`) |

## Before You Plan

- **Be certain**: Only create tasks you're confident about
- **Don't over-plan**: If the spec is clear, trust it
- **Budget context**: Target ~50% context per execution
- **Vertical slices**: Each task should cover one feature end-to-end
- **Hard caps**: Maximum 2-3 tasks per plan and ≤3 modified files per task. If more are needed, split into separate child plans executed serially. Dependency waves order execution; writable work is never parallel.

## Phase 0: Institutional Research (Mandatory)

Before touching the PRD or planning anything, load what the codebase already knows.

**This step is not optional.** Skipping it means planning in the dark.

### Step 1: Search project context

Search `.opencode/artifacts/MEMORY.md` for: bugfixes, existing plans, prior decisions.

```bash
rg -n "topic" .opencode/artifacts/MEMORY.md
```

If relevant context found: incorporate it directly into the plan. Don't re-solve solved problems.

### Step 2: Mine git history

```bash
# What has changed recently in affected areas?
git log --oneline -20

# Who wrote the relevant code and when?
git log --oneline --follow -- <relevant-file-path>

# What patterns appear in recent commits?
git log --oneline --all | head -30
```

Look for:

- Commit conventions (how this team names things)
- Recent changes to files you'll touch (merge conflict risk)
- How similar features were implemented before
- Any "fix:", "revert:", "hotfix:" commits near your scope (footgun zones)

### Step 3: Delegate learnings-researcher (if Level 2-3 work)

Delegate to a read-only `explore` child to search the codebase for patterns, conventions, and existing implementations related to the feature. The child should: grep for relevant function names and patterns, find similar existing features, check test patterns for this domain, and look for any TODO/FIXME comments in relevant files. It returns: existing patterns to follow, files to be aware of, and any gotchas.

**Only after completing Phase 0** do you proceed to planning. The research phases must use this context.

## Phase 1: Guards

Verify:

- `.pi/artifacts/<slug>/PLAN.md` exists (if not, tell the operator to run `/create <slug> ...` first)
- If PLAN.md already contains an implementation-plan section (Must-Haves, Dependency Graph, Tasks), ask the operator: overwrite or skip?

## Phase 2: Discovery Assessment

Before research, determine discovery level based on PRD:

| Level | Scope                | When to Use                                                       | Action                                      |
| ----- | -------------------- | ----------------------------------------------------------------- | ------------------------------------------- |
| **0** | Skip                 | Pure internal work, existing patterns only (grep confirms)        | Skip research, proceed to decomposition     |
| **1** | Quick (2-5 min)      | Single known library, confirming syntax/version                   | `context7 resolve-library-id + query-docs`  |
| **2** | Standard (15-30 min) | Choosing between 2-3 options, new external integration            | Delegate to read-only `scout` children      |
| **3** | Deep (1+ hour)       | Architectural decision, novel problem, multiple external services | Full research with parallel `scout` children |

**Depth indicators:**

- Level 2+: New library not in package.json, external API, "choose/select/evaluate"
- Level 3: "architecture/design/system", data modeling, auth design

**Decision:** Ask the operator to confirm or adjust the discovery level, with these options:

- **Deep (Recommended for complex work)** — Level 2-3: delegate scout + explore children
- **Standard** — Level 1: quick doc lookup
- **Skip research** — Level 0: I know the codebase

Determine level from PRD content: Level 2+ if new library, external API, or "choose/evaluate" language. Level 3 if "architecture/design/system".

## Phase 3: Research (if Level 1-3)

Read the PRD and extract tasks, success criteria, affected files, scope.

Delegate to read-only children to gather implementation context:

| Helper   | Purpose                                                              |
| -------- | -------------------------------------------------------------------- |
| `explore` | Codebase patterns, affected file structure, test patterns, conflicts |
| `scout`   | Best practices, common patterns, pitfalls                            |

## Phase 4: Goal-Backward Analysis

**Forward planning:** "What should we build?" → produces tasks
**Goal-backward:** "What must be TRUE for the goal to be achieved?" → produces requirements

### Step 1: Extract Goal from PRD

Take success criteria from PRD. Must be outcome-shaped, not task-shaped.

- Good: "Working chat interface" (outcome)
- Bad: "Build chat components" (task)

### Step 2: Derive Observable Truths

"What must be TRUE for this goal to be achieved?" List 3-7 truths from USER's perspective.

Example for "working chat interface":

- User can see existing messages
- User can type a new message
- User can send the message
- Sent message appears in the list
- Messages persist across page refresh

**Test:** Each truth verifiable by a human using the application.

**For UI PRDs:** Include truths for state and recovery coverage, not just happy paths:

- User can understand where they are and what scope the screen/action affects
- User can identify the single primary action and the result of triggering it
- Empty, loading, error, and success states are visible where data/async work exists
- User can recover from failure with retry, undo, fallback, or support path
- Dangerous actions communicate consequences before execution
- Forms expose labels, helper text, validation, and accessible errors

### Step 3: Derive Required Artifacts

For each truth: "What must EXIST for this to be true?"

| Truth                          | Required Artifacts                                              |
| ------------------------------ | --------------------------------------------------------------- |
| User can see existing messages | Message list component, Messages state, API route, Message type |
| User can send a message        | Input component, Send handler, POST API                         |

**Test:** Each artifact = a specific file or database object.

### Step 4: Identify Key Links

"Where is this most likely to break?" Critical connections where breakage causes cascading failures.

| From      | To        | Via                 | Risk                                |
| --------- | --------- | ------------------- | ----------------------------------- |
| Input     | API       | `fetch` in onSubmit | Handler not wired                   |
| API       | Database  | `prisma.query`      | Query returns static, not DB result |
| Component | Real data | `useEffect` fetch   | Shows placeholder, not messages     |

**For UI PRDs:** Add UX failure links where relevant:

| From               | To                 | Via                          | Risk                                     |
| ------------------ | ------------------ | ---------------------------- | ---------------------------------------- |
| Destructive action | Confirmation/undo  | Dialog, toast, or action log | User deletes wrong entity or cannot undo |
| Form field         | Validation message | `aria-describedby` / focus   | User cannot find or understand the error |
| Async action       | Loading/recovery   | Button state, toast, banner  | User double-submits or hits a dead end   |
| Filtered data      | Empty/no-results   | Query state + empty copy     | User thinks data is missing or corrupted |

## Phase 5: Decompose with Context Budget

**Quality Degradation Rule:** Target ~50% context per execution. More plans, smaller scope = consistent quality.

| Task Complexity | Max Tasks | Context/Task | Total   |
| --------------- | --------- | ------------ | ------- |
| Simple (CRUD)   | 2-3       | ~10-15%      | ~30-45% |
| Complex (auth)  | 2         | ~20-30%      | ~40-50% |
| Very complex    | 1-2       | ~30-40%      | ~30-50% |

The max-tasks column is a hard cap. If a plan needs more than 3 tasks, split into separate child plans executed serially.

**Split signals (create child plans):**

- More than 3 tasks
- Multiple subsystems (DB + API + UI)
- Any task with >3 file modifications
- Checkpoint + implementation in same plan
- Discovery + implementation in same plan

Assess size to determine plan structure:

| Size          | Files     | Approach                                 |
| ------------- | --------- | ---------------------------------------- |
| S (1-3 files) | 2-3 tasks | Single plan, no phases                   |
| M (3-8 files) | 2-3 tasks | 2-3 phases (split into child plans)       |
| L (8+ files)  | 2-3 tasks | Split into separate plans for each subsystem, executed serially |

## Phase 6: Dependency Graph & Wave Assignment

**For each task, record:**

- `needs`: What must exist before this runs
- `creates`: What this produces
- `has_checkpoint`: Requires user interaction?

**Example:**

```
Task A (User model): needs nothing, creates src/models/user.ts
Task B (User API): needs Task A, creates src/api/users.ts
Task C (User UI): needs Task B, creates src/components/UserList.tsx

Wave 1: A (independent)
Wave 2: B (depends on A)
Wave 3: C (depends on B)
```

**Wave assignment orders serial execution in `/ship`.** Writable work is never parallel — each wave is a single writer. Read-only research within a wave may fan out, but every write is serial.

**Vertical slices preferred:** Each plan covers one feature end-to-end (model + API + UI)
**Avoid horizontal layers:** Don't create "all models" then "all APIs" then "all UI"

## Phase 7: Write Plan

Write the implementation plan into `.pi/artifacts/<slug>/PLAN.md` (enriching the spec with the sections below) and refine `.pi/artifacts/<slug>/TODO.md`:

### Required Plan Header

```markdown
# [Feature] Implementation Plan

**Goal:** [Outcome-shaped goal from PRD]

**Discovery Level:** [0-3] - [Rationale]

**Context Budget:** [Estimated context usage, target ~50%]

---

## Must-Haves

### Observable Truths

(What must be TRUE for the goal to be achieved?)

1. [Truth 1]
2. [Truth 2]
3. [Truth 3]

### Required Artifacts

| Artifact         | Provides       | Path                  |
| ---------------- | -------------- | --------------------- |
| [File/component] | [What it does] | `src/path/to/file.ts` |

### Key Links

| From        | To    | Via     | Risk           |
| ----------- | ----- | ------- | -------------- |
| [Component] | [API] | `fetch` | [Failure mode] |

## Dependency Graph

Task A: needs nothing, creates src/models/X.ts
Task B: needs Task A, creates src/api/X.ts
Task C: needs Task B, has_checkpoint, creates src/components/X.tsx

Wave 1: A
Wave 2: B
Wave 3: C

## Tasks
```

### Task Standards:

- **Exact file paths** — never "add to the relevant file"
- **Complete code** — never "add validation logic here"
- **Exact commands with expected output**
- **TDD order** — test first, then implementation
- **Each step is 2-5 minutes** — one action per step
- **Tasks map to PRD tasks**
- **Hard cap** — 2-3 tasks per plan, ≤3 files per task
- **Serial writes** — dependency waves order execution; no parallel writable work
- **UI state coverage** — UI tasks list empty/loading/error/success states when applicable
- **UX recovery path** — async/destructive/form tasks include retry/undo/confirm/error handling
- **Accessibility wiring** — form and interactive tasks include labels, focus behavior, keyboard path, and semantic HTML

## Phase 8: Constitutional Compliance Gate

Before executing, scan the plan against AGENTS.md hard constraints. This catches violations before they become implementation bugs.

### Automated Checks

Scan PLAN.md content for these patterns:

| Violation Pattern                                 | AGENTS.md Rule                              | Severity     |
| ------------------------------------------------- | ------------------------------------------- | ------------ |
| `git add .` or `git add -A`                       | Multi-Agent Safety: stage specific files    | **CRITICAL** |
| `--force` push or `force push`                    | Git Safety: never force push main           | **CRITICAL** |
| `--no-verify`                                     | Git Safety: never bypass hooks              | **CRITICAL** |
| `as any` or `@ts-ignore` without justification    | Quality Bar: strong typing                  | **WARNING**  |
| New package/dependency without approval step      | Guardrails: no new deps without approval    | **WARNING**  |
| Task modifying >3 files without plan confirmation | Guardrails: no surprise edits               | **WARNING**  |
| `reset --hard` or `checkout .` or `clean -fd`     | Git Restore: never without explicit request | **CRITICAL** |
| Secret/credential patterns                        | Security: never expose credentials          | **CRITICAL** |

### Check Process

```bash
PLAN=".pi/artifacts/<slug>/PLAN.md"
rg -nF "git add ." "$PLAN"
rg -nF "git add -A" "$PLAN"
rg -nF -- "--no-verify" "$PLAN"
rg -nF "force push" "$PLAN"
rg -nF -- "--force" "$PLAN"
rg -nF "reset --hard" "$PLAN"
rg -nF "checkout ." "$PLAN"
rg -nF "clean -fd" "$PLAN"
```

Also check:

- Count files per task: if any task lists >3 files in its `files:` metadata, flag as WARNING
- Check for `as any` or `@ts-ignore` usage that lacks a documented reason
- Check if any task adds new dependencies (look for `npm install`, `pnpm add`, `yarn add`, `pip install`, `cargo add`)

### Violation Response

| Severity     | Action                                                             |
| ------------ | ------------------------------------------------------------------ |
| **CRITICAL** | Stop. Remove violation from plan. Report to operator.              |
| **WARNING**  | Flag in plan output. Add confirmation checkpoint to affected task. |

If no violations found, report: `Constitutional compliance: [x] PASS`

If violations found:

```markdown
## Constitutional Compliance Check

| #   | Pattern Found        | Location       | Severity | Action                              |
| --- | -------------------- | -------------- | -------- | ----------------------------------- |
| 1   | `git add .`          | Task 3, step 2 | CRITICAL | Removed — use specific file staging |
| 2   | New dependency `zod` | Task 1         | WARNING  | Added approval checkpoint           |

Violations resolved. Plan is compliant.
```

## Phase 9: Report

Output:

1. **Discovery Level:** [0-3] with rationale
2. **Must-Haves:** [N] observable truths, [M] required artifacts, [K] key links
3. **Context Budget:** [Estimated usage]
4. **Dependency Waves:** [N] waves for serial execution
5. **Task count:** [N] tasks, [M] TDD steps
6. **Files affected:** [List]
7. **Plan location:** `.pi/artifacts/<slug>/PLAN.md`
8. **Next step:** `/ship <slug>`

---

## Related Commands

| Need           | Command      |
| -------------- | ------------ |
| Create spec    | `/create`    |
| Execute plan   | `/ship`      |
| Research first | `/research`  |
