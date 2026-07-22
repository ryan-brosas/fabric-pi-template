---
description: Ship a plan - implement specs, verify, review, close
argument-hint: "<slug>"
---

# Ship: $ARGUMENTS

Execute spec tasks, verify each passes, run review, and record implementation.

> **Workflow:** `/create <slug>` → **`/ship <slug>`**
>
> `/ship` records implementation but cannot declare terminal verified status. Only `/verify` declares completion.

## Validate Slug

`<slug>` is required and must match `^(?=.{1,64}$)[a-z0-9]+(?:-[a-z0-9]+)*$`. Reject empty, absolute, slash-containing, dot-segment, uppercase, leading/trailing-hyphen, or double-hyphen values before any filesystem access. Lifecycle state is confined to `.pi/artifacts/<slug>/{PLAN,TODO,PROGRESS,DECISIONS}.md`. Project memory (`.opencode/artifacts/MEMORY.md`) is an optional separate surface: reads for context are allowed, and writes are explicit "record durable finding" steps only — never lifecycle state (see ADR-007).

## Load Skills

Load the full `SKILL.md` for any skill whose description matches the current task before starting work:

- `verification-before-completion` — define the success check before implementing and verify after.

## Before You Ship

- **Be certain**: Only ship if all tasks pass verification
- **Don't skip gates**: Build, test, lint, typecheck are non-negotiable
- **Run the review**: Always run a review pass before closing
- **Verify goals**: Tasks completing ≠ goals achieved (use goal-backward verification)
- **Commit before close**: Per-task commits required, don't ship without git history
- **Ask before closing**: Never close without user confirmation
- **Serial writes**: Writable work is never parallel. Tasks execute one at a time; a task in Wave N+1 waits for Wave N to settle.
- **Operator-gate Git**: Every commit, push, branch, or worktree action requires explicit operator authorization. Never stash, branch, create a worktree, commit, or push automatically. Stage only the exact paths owned by the current task.

## Available Tools

| Tool                 | Use When                                  |
| -------------------- | ----------------------------------------- |
| `explore`            | Finding patterns in codebase, prior art   |
| `scout`              | External research, best practices         |
| `lsp`                | Finding symbol definitions, references    |
| `grep`               | Finding code patterns                     |
| `task`               | Spawning subagents for bounded work       |

## Phase 1: Guards

### Context Search

Search `.opencode/artifacts/MEMORY.md` for: failed approaches to avoid repeating.

```bash
rg -n "topic" .opencode/artifacts/MEMORY.md
```

### Plan Validation

Verify the namespace is **established** (both `PLAN.md` AND `TODO.md` exist in `.pi/artifacts/<slug>/`):

- **Established** (both exist): proceed.
- **Partial** (only one of `PLAN.md`/`TODO.md` exists): stop — the namespace is partially initialized from an interrupted `/create`. Block for operator recovery; do not adopt, overwrite, delete, or `mkdir`. Report which sentinel file is missing.
- **Absent** (neither exists): stop — tell the operator to run `/create <slug>` first. `/ship` never creates a namespace.

Check what artifacts exist:

Read `.pi/artifacts/<slug>/` to check what artifacts exist (`PLAN.md`, `TODO.md`, `PROGRESS.md`, `DECISIONS.md`).

### Workspace Inspection

Inspect the workspace state before starting. Do not create a branch, worktree, or stash automatically.

```bash
git status --porcelain
git branch --show-current
```

- If uncommitted changes exist, ask the operator whether to proceed, commit, or pause. Never disturb unrelated work.
- Branch creation, worktree setup, or dependency installation requires explicit operator authorization.

## Phase 2: Route to Execution

### Complexity Detection

Before routing, analyze the plan complexity:

**Direct execution** (default):
- Plan has <5 tasks
- Tasks have dependencies (not fully independent)
- Tasks require sequential execution
- User explicitly requests sequential execution

All writable work is serial. There is no parallel writable fan-out path. If a plan contains ≥5 genuinely independent tasks with no file conflicts, the operator may explicitly authorize a parallel strategy, but the default is serial execution wave-by-wave.

### Decision Logic

1. **Parse the plan** from `.pi/artifacts/<slug>/PLAN.md`
2. **Count independent tasks** (tasks with no dependencies)
3. **Check for file conflicts** (do any tasks edit the same files?)
4. **Route:** direct execution (serial) unless the operator explicitly authorizes otherwise

### Direct Execution

| Artifact exists in `.pi/artifacts/<slug>/` | Action                                                   |
| --------------- | -------------------------------------------------------- |
| `PLAN.md`       | Parse plan header + dependency graph, execute wave-by-wave |
| `TODO.md` only  | Convert TODO to executable task list, then proceed         |

## Phase 3: Wave-Based Execution

If `PLAN.md` exists with dependency graph:

1. **Parse waves** from dependency graph section
2. **Execute wave-by-wave (serial):**
   - Single-task wave → execute directly
   - Multi-task wave → execute each task serially, one at a time
3. **Review after each wave** — run verification gates, report, wait for feedback
4. **Continue** until all waves complete

**Serial safety:** Tasks execute one at a time. Tasks must NOT share files. A task in Wave N+1 waits for Wave N to fully settle before starting.

### Phase 3A: PRD Task Loop

For each task (wave-based or sequential fallback):

1. **Read** the task description, verification steps, and affected files
2. **Read** the affected files before editing
3. **Implement** the changes — stay within the task's `files` list
4. **Handle Deviations:** Apply deviation rules as discovered
5. **Checkpoint Protocol:** If task has `checkpoint:*`, stop and request user input
6. **Verify** — run each verification step from the task
7. **If verification fails**, fix and retry (max 2 attempts per task)
8. **Commit** — per-task commit (see below)
9. **Mark** the task complete in `.pi/artifacts/<slug>/TODO.md`
10. **Append** progress to `.pi/artifacts/<slug>/PROGRESS.md`

### Checkpoint Protocol

When task has `checkpoint:*` type:

| Type                      | Action                                                     |
| ------------------------- | ---------------------------------------------------------- |
| `checkpoint:human-verify` | Execute automation first, then pause for user verification |
| `checkpoint:decision`     | Present options, wait for selection                        |
| `checkpoint:human-action` | Request specific action with verification command          |

**Automation-first:** If verification CAN be automated, MUST automate it before requesting human check.

**Checkpoint return format:**

```markdown
## CHECKPOINT REACHED

**Type:** [human-verify | decision | human-action]
**Progress:** X/Y tasks complete

### Completed

| Task | Commit | Status |
| ---- | ------ | ------ |
| [N]  | [hash] | [[x]/[ ]]  |

### Current Task

**Task:** [name]
**Blocked by:** [specific blocker]

### Awaiting

[What user needs to do/provide]
```

### TDD Execution Flow

When task specifies TDD:

**RED Phase:**

1. Create test file with failing test
2. Run test → MUST fail
3. Commit: `test: add failing test for [feature]`

**GREEN Phase:**

1. Write minimal code to make test pass
2. Run test → MUST pass
3. Commit: `feat: implement [feature]`

**REFACTOR Phase:** (if needed)

1. Clean up code
2. Run tests → MUST still pass
3. Commit if changes: `refactor: clean up [feature]`

### Task Commit Protocol

After each task completes (verification passed):

1. **Check modified files:** `git status --short`
2. **Stage individually** (NEVER `git add .`):
   ```bash
   git add src/specific/file.ts
   git add tests/file.test.ts
   ```
3. **Commit with type prefix:**

   ```bash
   git commit -m "feat: [task description]

   - [key change 1]
   - [key change 2]"
   ```

4. **Record hash** in `.pi/artifacts/<slug>/PROGRESS.md`

**Commit types:**
| Type | Use For |
|------|---------|
| `feat` | New feature, endpoint, component |
| `fix` | Bug fix, error correction |
| `test` | Test-only changes (TDD RED phase) |
| `refactor` | Code cleanup, no behavior change |
| `chore` | Config, tooling, dependencies |

Push to remote only with explicit operator authorization. Stage only the exact paths owned by the current task; never include unrelated concurrent changes.

### Stop Conditions

- Verification fails 2x on same task → stop, report blocker
- Blocked by unfinished dependency → stop, report which one
- Modifying files outside task scope → stop, ask user
- Deviation requires an architectural decision → stop, present options

## Phase 4: Verification

Follow the `verification-before-completion` skill protocol:

- Use **full mode** (shipping requires all gates)
- All 4 gates must pass before proceeding to commit/push
- Also run PRD `Verify:` commands

Detect the project toolchain (`package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, `Makefile`, etc.) and run the corresponding typecheck, lint, test, and build gates. A source inspection or pass count is not runtime proof.

If the PRD requires local web, browser, OAuth callback, webhook, or multi-service verification, use stable URLs as verification evidence.

## Phase 5: Review

```bash
BASE_SHA=$(git rev-parse origin/main 2>/dev/null || git rev-parse HEAD~1)
HEAD_SHA=$(git rev-parse HEAD)
```

### Mode Selection

| Condition | Mode |
|---|---|
| Routine change, low risk | Standard Review (below) |
| High-risk feature, explicit user request for quality gating, or the build agent flagged the feature as requiring iterative quality gating | Iterative Quality Loop |

When using Standard Review mode, apply the UI Quality Gate then the review. When using Iterative Loop mode, apply the UI Quality Gate first (before entering the loop), then run the scored loop flow.

---

### UI Quality Gate (always — both modes)

Detect changed UI files:

```bash
git diff --name-only $BASE_SHA...HEAD -- \
  '*.tsx' '*.jsx' '*.css' '*.scss' '*.sass' '*.less' '*.html' '*.mdx'
```

If any UI files changed:

1. Manually apply the UI slop checklist (no automated slop command exists; apply its checks directly):
   - One primary action per view/section
   - Empty/loading/error/success states for async/data flows
   - Retry/undo/confirm paths for errors and destructive actions
   - Form labels, helper text, validation, and error association
   - Semantic HTML, keyboard path, visible focus, reduced motion
   - Component family consistency for related controls
2. Treat Critical findings like review Critical findings: fix inline, rerun verification, then continue.

---

### Standard Review Mode

Run a review pass. Spawn review subagents for the perspectives relevant to the change (security/correctness, performance/architecture, type-safety/tests, conventions/patterns, simplicity/completeness). Choose the perspectives that match the risk; do not run a fixed matrix every cycle.

Fill placeholders:

- `{WHAT_WAS_IMPLEMENTED}`: brief summary of what changed
- `{PLAN_OR_REQUIREMENTS}`: `.pi/artifacts/<slug>/PLAN.md`
- `{BASE_SHA}` / `{HEAD_SHA}`: from above

Synthesize findings.

**Auto-fix rule:**

- Critical issues → fix inline, re-run Phase 4 verification, continue
- Important issues → fix inline, continue
- Minor issues → note in `.pi/artifacts/<slug>/PROGRESS.md`

If review finds critical issues that require architectural decisions → stop → present options to user.

### Iterative Quality Loop Mode

Score-gated feedback loop for high-risk features. Replaces the standard review with a structured iteration cycle.

#### Setup

Initialize loop state in `.pi/artifacts/<slug>/PROGRESS.md` (no separate review-state file; record review rounds in the existing PROGRESS log):

Record: slug, rounds (0), maxRounds (5), lastScore (0), sameScoreCount (0), findingsResolved (0), findingsRemaining (0), status (active).

#### Loop

Repeat steps 2-8 until exit or escalation:

| Step | Action |
|---|---|
| **1. EXECUTE** | Implement per spec/plan (already done in Phase 3) |
| **2. REVIEW** | Spawn **one review subagent** with spec + current diff + current review-round state. Returns: score (X/5), findings array (severity + file:line + suggestion), suggested next action |
| **3. GATE** | Score ≥ 5 → mark done (`status: passed`), exit loop, proceed to Goal-Backward Verification. Score 4 → ask user if they want to proceed or loop. Score <4 → continue |
| **4. STALL?** | If `sameScoreCount ≥ 2` → escalate: surface accumulated findings, present to user with a recommendation |
| **5. MAX?** | If `rounds ≥ maxRounds` → escalate with full finding log |
| **6. FILTER** | Split findings into categories and handle each: |
| | • **Actionable** (code-level, clear fix) → proceed to fix |
| | • **Informational** (note, no code change) → log to PROGRESS.md with `[info]` |
| | • **Architecture/Design** → stop loop, present to user for decision |
| **7. FIX** | For each actionable finding, fix at the exact file:line with the suggested fix. Run sequentially for same-file findings |
| **8. RE-REVIEW** | Update review-round state in PROGRESS.md: increment rounds, update score, reset/resolve findings. Go to step 2 |

#### Loop State Updates

After each round, update the review-round state in PROGRESS.md:

**`sameScoreCount` rule:**
- If new score === `lastScore` → increment `sameScoreCount`
- If new score !== `lastScore` → reset `sameScoreCount` to 0

**Status transitions:**

- Stall detected (`sameScoreCount ≥ 2`) → `status: stalled`, append accumulated findings to PROGRESS.md
- Max rounds reached → `status: maxed`, append full finding log to PROGRESS.md
- Pass (score ≥ 5) → `status: passed`, proceed to Goal-Backward Verification

#### Review Subagent Prompt

When spawning, include:

- The original spec/slug
- The current diff (all changed files since the start of Phase 3)
- The current review-round state from PROGRESS.md
- Return format: `{ score: number, findings: Array<{severity:"critical"|"important"|"minor", file:string, line:number, suggestion:string, type:"actionable"|"informational"|"architecture"}>, nextAction: string }`

#### Exit Conditions

| Condition | Action |
|---|---|
| Score ≥ 5 | Proceed to Goal-Backward Verification |
| User approves score 4 | Proceed to Goal-Backward Verification |
| Architecture finding | Stop, present options to user |
| Stalled (same score 2x) | Escalate with accumulated findings |
| Max rounds | Escalate with full finding log |

### Goal-Backward Verification (if PLAN.md exists)

Verify that tasks completed ≠ goals achieved:

**Three-Level Verification:**

| Level              | Check                  | Command/Action                                                    |
| ------------------ | ---------------------- | ----------------------------------------------------------------- |
| **1: Exists**      | File is present        | `ls path/to/file.ts`                                              |
| **2: Substantive** | Not a stub/placeholder | `rg -v "TODO|FIXME|return null|placeholder" path/to/file.ts`     |
| **3: Wired**       | Connected and used     | `rg "import.*ComponentName" src/`                                |

**Key Link Verification:**

- Component → API: `rg "fetch.*api/|axios" Component.tsx`
- API → Database: `rg "prisma\.|db\." route.ts`
- Form → Handler: `rg "onSubmit" Component.tsx`
- State → Render: `rg "{stateVar}" Component.tsx`

**Stub Detection:**
Red flags indicating incomplete implementation:

```javascript
return <div>Component</div>      // Placeholder
return <div>{/* TODO */}</div>    // Empty
return null                       // Empty
onClick={() => {}}                // No-op handler
fetch('/api/...')                 // No await, ignored
return Response.json({ok: true})  // Static, not query result
```

If any artifact fails Level 2 or 3 → fix → re-verify.

## Phase 6: Close

Ask the user before closing. `/ship` records implementation but does not declare terminal verified status — only `/verify` may do that.

If confirmed:

Update `.pi/artifacts/<slug>/TODO.md` to mark all tasks complete and append an implementation summary to `.pi/artifacts/<slug>/PROGRESS.md`. State that implementation is recorded and the next step is `/verify <slug>`.

## Output

Report:

1. **Execution Summary:**
   - Tasks completed/total
   - Waves executed (if PLAN.md with waves)
   - Deviations applied
   - Checkpoints encountered (human-verify/decision/human-action)
   - Commits made

2. **PRD Task Results:**
   - Each task status ([x] pass, [ ] fail, [PAUSE] checkpoint)
   - Files modified per task
   - Commit hashes

3. **Verification Gate Results:**
   - Build: [pass/fail]
   - Test: [pass/fail]
   - Lint: [pass/fail]
   - Typecheck: [pass/fail]

4. **Goal-Backward Verification:**
   - Artifacts verified: [N] exists, [M] substantive, [K] wired
   - Key links checked: [pass/fail per link]
   - Stubs detected: [N] (if any)

5. **Review Summary:**
   - Critical issues: [N]
   - Important issues: [N]
   - Minor issues: [N]
   - Overall assessment: [pass/needs work]

6. **Next Steps:**
   - **Ask user** before any push — never push without confirmation
   - Manual commits if not already done
   - Note deferred work in `.pi/artifacts/<slug>/TODO.md`
   - Run `/verify <slug>` to declare terminal verified status

## Related Commands

| Need              | Command       |
| ----------------- | ------------- |
| Create feature    | `/create`      |
| Plan execution    | `/plan`       |
| Research a topic  | `/research`   |
| Fix a bug         | `/fix`        |
| Verify gate       | `/verify`     |
