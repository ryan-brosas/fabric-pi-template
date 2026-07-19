---
description: Create detailed implementation plan with TDD steps
agent: plan
---

> **Pi execution binding:** Dispatch doctrine (GLM pool sizing, role routes, board states, worker-distrust, primary-as-sole-integrator) lives in `.pi/docs/fabric-tuning.md`.

# Plan

Create a detailed implementation plan with TDD steps. Optional deep-planning between `/create` and `/ship`.

> **Workflow:** `/create` → **`/plan`** (optional) → `/ship`
>
> **When to use:** Complex tasks where spec verification steps aren't enough guidance. Skip for simple tasks.

## Parse Arguments

| Argument | Default  | Description                       |
| -------- | -------- | --------------------------------- |
| none     | —        | Plan based on current spec        |

## Before You Plan

- **Be certain**: Only create tasks you're confident about
- **Don't over-plan**: If the spec is clear, trust it
- **Budget context**: Target ~50% context per execution
- **Vertical slices**: Each task should cover one feature end-to-end

## Phase 0: Consume Prior Research (Tolerant)

Resolve the active feature slug from `.pi/artifacts/.active` first (fail with
"run `/create` first" if that file is absent or empty). All artifact paths below
use that resolved slug in place of `<slug>`.

Read `.pi/artifacts/<slug>/spec.md` (required — fail if absent). Then read
`.pi/artifacts/<slug>/research.md` tolerantly:

- `/create` always persists `research.md`. When research depth was Skip, the file
  contains a stub (`# Research\n\n(skipped: no research performed for this
  feature)`). Treat that stub as "research was skipped" and proceed to
  decomposition without re-running research.
- When `research.md` is absent entirely (legacy or hand-created spec), note that
  research was skipped and proceed; do not block on it.

Consume whatever context exists before planning. Do not re-run research that
`/create` already captured — no MEMORY.md search, no git-history mining, no
learnings-researcher spawn.

This resolves the prior Phase-0 "mandatory read" vs Phase-2 Level-0 "Skip
research" contradiction: the read is mandatory *when present*, but a Skip depth
legitimately produces a stub that planning must treat as skipped (and proceed),
not as missing research to block on. Phase 2's Level-0 "Skip" annotates the
plan header; Phase 0 handles the actual (tolerant) file read.

Any residual codebase exploration needed during planning must route to GLM
Makora/Umans workers (`makora/zai-org/GLM-5.2-NVFP4` or
`umans/umans-glm-5.2`). See `.pi/docs/fabric-tuning.md` for role routes.

## Phase 1: Guards

Verify:

- `.pi/artifacts/$(cat .pi/artifacts/.active)/spec.md` exists (if not, tell user to run `/create` first)
- If `.pi/artifacts/$(cat .pi/artifacts/.active)/plan.md` already exists, ask user: overwrite or skip?

## Phase 2: Discovery Assessment

Before research, determine discovery level based on PRD:

| Level | Scope                | When to Use                                                       | Action                                      |
| ----- | -------------------- | ----------------------------------------------------------------- | ------------------------------------------- |
| **0** | Skip                 | Pure internal work, existing patterns only (grep confirms)        | Skip research, proceed to decomposition     |
| **1** | Quick (2-5 min)      | Single known library, confirming syntax/version                   | `context7 resolve-library-id + query-docs`  |
| **2** | Standard (15-30 min) | Choosing between 2-3 options, new external integration            | Consume `research.md` (captured by `/create`) |
| **3** | Deep (1+ hour)       | Architectural decision, novel problem, multiple external services | Consume `research.md` (captured by `/create`) |

**Depth indicators:**

- Level 2+: New library not in package.json, external API, "choose/select/evaluate"
- Level 3: "architecture/design/system", data modeling, auth design

**Note:** `/create`'s research is already consumed from `research.md` in Phase 0;
do not re-spawn explore/scout here. The discovery level above only annotates the
plan header.

## Phase 3: Goal-Backward Analysis

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

## Phase 4: Decompose with Context Budget

**Quality Degradation Rule:** Target ~50% context per execution. More plans, smaller scope = consistent quality.

| Task Complexity | Max Tasks | Context/Task | Total   |
| --------------- | --------- | ------------ | ------- |
| Simple (CRUD)   | 3         | ~10-15%      | ~30-45% |
| Complex (auth)  | 2         | ~20-30%      | ~40-50% |
| Very complex    | 1-2       | ~30-40%      | ~30-50% |

**Split signals (create child plans):**

- More than 3 tasks
- Multiple subsystems (DB + API + UI)
- Any task with >5 file modifications
- Checkpoint + implementation in same plan
- Discovery + implementation in same plan

Assess size to determine plan structure:

| Size          | Files     | Approach                                 |
| ------------- | --------- | ---------------------------------------- |
| S (1-3 files) | 2-4 tasks | Single plan, no phases                   |
| M (3-8 files) | 5-8 tasks | 2-3 phases                               |
| L (8+ files)  | 9+ tasks  | Split into separate plans for each subsystem |

## Phase 5: Dependency Graph & Wave Assignment

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

**Wave assignment enables parallel execution in `/ship`.**

**Vertical slices preferred:** Each plan covers one feature end-to-end (model + API + UI)
**Avoid horizontal layers:** Don't create "all models" then "all APIs" then "all UI"

## Phase 6: Write Plan

Write `.pi/artifacts/$(cat .pi/artifacts/.active)/plan.md`:

### Required Plan Header

```markdown
# [Feature] Implementation Plan

> **For Claude:** Implement this plan task-by-task.

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
```

Task A: needs nothing, creates src/models/X.ts
Task B: needs Task A, creates src/api/X.ts
Task C: needs Task B, has_checkpoint, creates src/components/X.tsx

Wave 1: A
Wave 2: B
Wave 3: C

```

## Tasks
```

### Task Standards:

- **Exact file paths** — never "add to the relevant file"
- **Complete code** — never "add validation logic here"
- **Exact commands with expected output**
- **TDD order** — test first, then implementation
- **Each step is 2-5 minutes** — one action per step
- **Tasks map to PRD tasks**
- **UI state coverage** — UI tasks list empty/loading/error/success states when applicable
- **UX recovery path** — async/destructive/form tasks include retry/undo/confirm/error handling
- **Accessibility wiring** — form and interactive tasks include labels, focus behavior, keyboard path, and semantic HTML

## Phase 7: Constitutional Compliance Gate

Before executing, scan the plan against AGENTS.md hard constraints. This catches violations before they become implementation bugs.

### Automated Checks

Scan `plan.md` content for these patterns:

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
ACTIVE_SLUG=$(cat .pi/artifacts/.active 2>/dev/null)
if [ -z "$ACTIVE_SLUG" ]; then echo "No active feature."; exit 1; fi
ARTIFACT_DIR=".pi/artifacts/$ACTIVE_SLUG"
# Scan plan for violation patterns (fixed-string mode to avoid regex false positives)
grep -inF "git add ." "$ARTIFACT_DIR/plan.md"
grep -inF "git add -A" "$ARTIFACT_DIR/plan.md"
grep -inF -- "--no-verify" "$ARTIFACT_DIR/plan.md"
grep -inF "force push" "$ARTIFACT_DIR/plan.md"
grep -inF -- "--force" "$ARTIFACT_DIR/plan.md"
grep -inF "reset --hard" "$ARTIFACT_DIR/plan.md"
grep -inF "checkout ." "$ARTIFACT_DIR/plan.md"
grep -inF "clean -fd" "$ARTIFACT_DIR/plan.md"
```

Also check:

- Count files per task: if any task lists >3 files in its `files:` metadata, flag as WARNING
- Check for `as any` or `@ts-ignore` usage that lacks a documented reason
- Check if any task adds new dependencies (look for `npm install`, `pnpm add`, `yarn add`, `pip install`, `cargo add`)

### Violation Response

| Severity     | Action                                                             |
| ------------ | ------------------------------------------------------------------ |
| **CRITICAL** | Stop. Remove violation from plan. Report to user.                  |
| **WARNING**  | Flag in plan output. Add confirmation checkpoint to affected task. |

If no violations found, report: `Constitutional compliance: [x] PASS`

If violations found:

```markdown
## [!]️ Constitutional Compliance Check

| #   | Pattern Found        | Location       | Severity | Action                              |
| --- | -------------------- | -------------- | -------- | ----------------------------------- |
| 1   | `git add .`          | Task 3, step 2 | CRITICAL | Removed — use specific file staging |
| 2   | New dependency `zod` | Task 1         | WARNING  | Added approval checkpoint           |

Violations resolved. Plan is compliant.
```

## Phase 8: Report

Output:

1. **Discovery Level:** [0-3] with rationale
2. **Must-Haves:** [N] observable truths, [M] required artifacts, [K] key links
3. **Context Budget:** [Estimated usage]
4. **Dependency Waves:** [N] waves for parallel execution
5. **Task count:** [N] tasks, [M] TDD steps
6. **Files affected:** [List]
7. **Plan location:** `.pi/artifacts/$(cat .pi/artifacts/.active)/plan.md`
8. **Next step:** `/ship`

---

## Related Commands

| Need           | Command      |
| -------------- | ------------ |
| Create spec    | `/create`    |
| Execute plan   | `/ship`      |
| Research first | `/research`  |
