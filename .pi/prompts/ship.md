---
description: Ship a plan - implement specs, verify, review, close
agent: build
---

> **Pi execution binding:** The pseudocode in this prompt is semantic, not executable. `task()` maps to bounded Fabric subagent dispatch with an explicit role from `.pi/config.json`.
> The implementation role `general` (only) runs on the GLM 12 pool (`makora/zai-org/GLM-5.2-NVFP4` + `umans/umans-glm-5.2`, up to 12 concurrent; first six on makora, balance on umans) with `extensions: true`; the primary (`build`, supervisor + sole integrator) runs `claude-bridge/claude-opus-4-8` at high thinking.
> Read-only fan-out (`explore`, `scout`) uses the small-model lanes (`openai-codex/gpt-5.4-mini`, alternate `claude-bridge/claude-haiku-4-5`); `review` runs on `openai-codex/gpt-5.6-sol` at medium thinking.
> The primary resolves `required_skills` against `.pi/skills/manifest.json` before spawn and injects the role contract from `.pi/agents/` into every dispatch. Multi-worker phases coordinate over the canonical mesh (topic `fabric-pi-<slug>`, CAS board `fabric-pi/<slug>/board`); the primary steers drift, reads every diff, and verifies before integrating.
> `question()` maps to asking the operator; `skill()` loads the matching Pi Agent Skill. Artifact paths are under `.pi/`. Direct execution remains the default when delegation adds no leverage (see `.pi/docs/fabric-tuning.md`).

# Ship

Execute spec tasks, verify each passes, run review, mark complete.

> **Workflow:** `/create` → **`/ship`**

## Load Skills

```typescript
skill({ name: "verification-before-completion" });
```

## Before You Ship
- **Be certain**: Only ship if all tasks pass verification
- **Don't skip gates**: Build, test, lint, typecheck are non-negotiable
- **Run the review**: Always spawn review agent before closing
- **Verify goals**: Tasks completing ≠ goals achieved (use goal-backward verification)
- **No automatic commits**: verification/review may finish with an uncommitted worktree; never commit, push, branch, PR, publish, deploy, or clean up without explicit operator authorization naming the exact action. On approval, stage individual files only and use Conventional Commits; never `git add .`/`-A`, never bypass hooks
- **Ask before closing**: Never close without user confirmation

## Available Tools

| Tool                 | Use When                                  |
| -------------------- | ----------------------------------------- |
| `explore`            | Finding patterns in codebase, prior art   |
| `scout`              | External research, best practices         |
| `diagnostics`        | Lint/typecheck/quality checks (Pi skill)  |
| `read`/`grep`/`find` | Symbol defs, references, file lookup       |
| `grep`               | Finding code patterns                     |
| `task`               | Spawning subagents for parallel execution |

## Phase 1: Guards
### Context Search

Search `.pi/artifacts/MEMORY.md` for: failed approaches to avoid repeating.

```bash
rg -n "topic" .pi/artifacts/MEMORY.md
```

### Plan Validation

Verify:

- `.pi/artifacts/$(cat .pi/artifacts/.active)/spec.md` exists (if not, tell user to run `/create` first)

Check what artifacts exist:

Read `.pi/artifacts/$(cat .pi/artifacts/.active)/` to check what artifacts exist (spec.md, plan.md, etc.).

### Workspace Setup

Inspect first; never create a branch without explicit operator
authorization naming the exact action. Install deps if needed.

## Phase 2: Route to Execution

### Complexity Detection

Before routing, analyze the plan complexity:

**Direct execution** (use existing logic):
- Plan has <5 tasks
- Tasks have dependencies (not fully independent)
- Tasks require sequential execution
- User explicitly requests sequential execution

**Workflow execution** (invoke `batch-implement`):
- Plan has ≥5 independent tasks
- Tasks have no file conflicts
- Tasks can run in parallel
- User wants maximum parallelism

### Decision Logic

1. **Parse the plan** from `.pi/artifacts/$(cat .pi/artifacts/.active)/plan.md` or `tasks.json`
2. **Count independent tasks** (tasks with no dependencies)
3. **Check for file conflicts** (do any tasks edit the same files?)
4. **Route accordingly:**
   - <5 tasks OR has dependencies OR has file conflicts → Direct execution (see "Direct Execution" below)
   - ≥5 independent tasks AND no file conflicts → Invoke `batch-implement` workflow (see "Workflow Execution" below)

### Workflow Execution (Parallel Implementation)

If complexity is detected as parallel:

1. **Read the workflow:** `.pi/workflows/batch-implement.md`
2. **Execute all phases:**
   - Phase 1: Spawn 1 @review agent to review plan for task independence
   - Phase 2: Spawn multiple @general agents (1 per task, dynamic count)
   - Phase 3: Spawn multiple @review agents to verify implementations
   - Phase 4: Main agent merges results directly (`dispatch.primary_integrates`; never a merge subagent)
3. **Replace placeholders:**
   - `{plan}` → the implementation plan
   - `{phase_N_output}` → actual output from completed phases
4. **Aggregate results** between phases
5. **Continue to Phase 4: Verification** (skip Phase 3 below)

**Announce:** "This plan has [N] independent tasks. Invoking batch-implement workflow for parallel execution."

### Direct Execution

If complexity is simple or tasks have dependencies, use the existing execution logic below.

| Artifact exists in `.pi/artifacts/$(cat .pi/artifacts/.active)/` | Action                                                   |
| --------------- | -------------------------------------------------------- |
| `plan.md`       | Parse plan header + dependency graph, execute wave-by-wave |
| `tasks.json`    | Proceed to PRD task loop below                             |
| Only `spec.md`  | Convert spec to `tasks.json`, then proceed                    |

## Phase 3: Wave-Based Execution

If `plan.md` exists with dependency graph:

1. **Parse waves** from dependency graph section
3. **Execute wave-by-wave:**
   - Single-task wave → execute directly (no subagent overhead)
   - Multi-task wave → dispatch parallel `task({ subagent_type: "general" })` subagents, one per task (Fabric `general` route on the GLM 12 pool; up to 12 per wave — first six on makora, rest on umans; track wave status on the mesh board `fabric-pi/<slug>/board`)
4. **Review after each wave** — run verification gates, report, wait for feedback
5. **Continue** until all waves complete

**Parallel safety:** Only tasks within same wave run in parallel. Tasks must NOT share files. Tasks in Wave N+1 wait for Wave N.

```typescript
// fabric_exec — one wave: parallel general-route workers on the GLM 12 pool
// resolve the role and inject its contract (contract injection is the dispatcher's job)
const route = cfg.role_routes.general;            // model, thinking, tools, contract
const contract = String(await pi.read(ROOT + '/' + route.contract));
const lanes = ['makora/zai-org/GLM-5.2-NVFP4', 'umans/umans-glm-5.2'];
const handles = [];
wave.tasks.slice(0, 12).forEach((t, i) => {
  const model = i < 6 ? lanes[0] : lanes[1];      // first six makora, then umans
  const skills = resolveSkills(t.id, t.required_skills); // resolved before spawn
  const skillInstruction = skills.length
    ? '\n\nrequired_skills: ' + JSON.stringify(skills) +
      '\nBefore other work, read every .pi/skills/<name>/SKILL.md listed above and follow it.'
    : '\n\nrequired_skills: [] (load no skill)';
  handles.push(tools.call({
    ref: 'agents.spawn',
    args: {
      name: t.id,
      task: contract + '\n\n---\n\n' + t.brief + skillInstruction +
        '\n\nEnd your report with a JSON object matching .pi/schemas/worker-result.json (status, changed_paths, checks_run, stop_reason).',
      model,                                       // role_routes.general (GLM 5.2)
      thinking: route.thinking,                     // medium
      tools: route.tools,                           // role_routes.general
      extensions: true,                             // custom providers (makora/umans) need this
    }
  }));
});
await tools.call({
  ref: 'mesh.publish',
  args: { topic: 'fabric-pi-<slug>', kind: 'assignment', text: 'wave dispatched', data: { tasks: wave.tasks.map(t => t.id) } }
});
for (const h of handles) { const r = await h; await tools.call({ ref: 'agents.wait', args: { id: r.id } }); }
// then: read every diff, run gates, update the CAS mesh board before the next wave
```

### Phase 3A: PRD Task Loop (Sequential Fallback)

For each task (wave-based or sequential fallback):

1. **Read** the task description, verification steps, and affected files
2. **Read** the affected files before editing
3. **Implement** the changes — stay within the task's `files` list
4. **Handle Deviations:** Apply deviation rules 1-4 as discovered
5. **Checkpoint Protocol:** If task has `checkpoint:*`, stop and request user input
6. **Verify** — run each verification step from the task
7. **If verification fails**, fix and retry (max 2 attempts per task)
8. **Suggest commit** — record a suggested Conventional Commit message in progress.md; never commit yourself without explicit operator authorization (see "Commit Authorization" below)
9. **Mark** `passes: true` in `.pi/artifacts/$(cat .pi/artifacts/.active)/tasks.json`
10. **Append** progress to `.pi/artifacts/$(cat .pi/artifacts/.active)/progress.md`

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

| Task | Suggested commit | Status |
| ---- | ---------------- | ------ |
| [N]  | [message]        | [[x]/[ ]]  |

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
3. Suggest commit: `test: add failing test for [feature]` (operator authorizes; no automatic commit)

**GREEN Phase:**

1. Write minimal code to make test pass
2. Run test → MUST pass
3. Suggest commit: `feat: implement [feature]` (operator authorizes; no automatic commit)

**REFACTOR Phase:** (if needed)

1. Clean up code
2. Run tests → MUST still pass
3. Suggest commit if changes: `refactor: clean up [feature]` (operator authorizes; no automatic commit)

### Commit Authorization
Commits are **not** automatic or per-task. Verification and review may
complete with an uncommitted worktree. No commit, push, branch, PR, publish,
deploy, or cleanup occurs until the operator explicitly authorizes the exact
action.

When the operator authorizes a commit:

1. **Check modified files:** `git status --short`
2. **Stage individually** — NEVER `git add .` or `git add -A`, never bypass hooks:
   ```bash
   git add src/specific/file.ts
   git add tests/file.test.ts
   ```
3. **Commit with a Conventional Commits type prefix:**

   ```bash
   git commit -m "feat: [task description]

   - [key change 1]
   - [key change 2]"
   ```

4. **Record hash** in progress log

**Conventional Commit types:**
| Type | Use For |
|------|---------|
| `feat` | New feature, endpoint, component |
| `fix` | Bug fix, error correction |
| `test` | Test-only changes (TDD RED phase) |
| `refactor` | Code cleanup, no behavior change |
| `chore` | Config, tooling, dependencies |

Never push, force-push, amend published commits, or run destructive ops
without separate operator authorization naming the exact action. Preserve
unrelated user changes in the dirty worktree.

### Stop Conditions

- Verification fails 2x on same task → stop, report blocker
- Blocked by unfinished dependency → stop, report which one
- Modifying files outside task scope → stop, ask user
- Rule 4 deviation encountered → stop, present options

## Phase 4: Verification

Follow the [Verification Protocol](../skills/verification-before-completion/references/VERIFICATION_PROTOCOL.md):

- Use **full mode** (shipping requires all gates)
- All 4 gates must pass before any operator-authorized commit/push (no automatic commits)
- Also run PRD `Verify:` commands

If the PRD requires local web, browser, OAuth callback, webhook, or multi-service verification, use stable URLs as verification evidence.

## Phase 5: Review

```bash
BASE_SHA=$(git rev-parse origin/main 2>/dev/null || git rev-parse HEAD~1)
# Commits are optional — review the actual current diff, including
# uncommitted working-tree changes, not only committed ranges:
#   git diff $BASE_SHA -- <paths>   # committed + staged + unstaged vs base
#   git diff --cached -- <paths>    # staged only
```

### Mode Selection

| Condition | Mode |
|---|---|
| Routine change, low risk | Standard Review (below) |
| High-risk feature, explicit user request for quality gating, or the build agent flagged the feature as requiring iterative quality gating | Iterative Quality Loop |

When using Standard Review mode, apply the UI Quality Gate then the parallel review. When using Iterative Loop mode, apply the UI Quality Gate first (before entering the loop), then run the scored loop flow.

---

### UI Quality Gate (always — both modes)

Detect changed UI files:

```bash
git diff --name-only $BASE_SHA -- \
  '*.tsx' '*.jsx' '*.css' '*.scss' '*.sass' '*.less' '*.html' '*.mdx'
```

If any UI files changed:

1. Run `/ui-slop-check auto --since=$BASE_SHA` or manually apply its checklist when slash-command invocation is unavailable.
2. Verify UX gates for changed surfaces:
   - One primary action per view/section
   - Empty/loading/error/success states for async/data flows
   - Retry/undo/confirm paths for errors and destructive actions
   - Form labels, helper text, validation, and error association
   - Semantic HTML, keyboard path, visible focus, reduced motion
   - Component family consistency for related controls
3. Treat Critical findings like review Critical findings: fix inline, rerun verification, then continue.

---

### Standard Review Mode

Run **5 parallel agents** for review: security/correctness, performance/architecture, type-safety/tests, conventions/patterns, simplicity/completeness. Each is a Fabric `review`-route dispatch (`openai-codex/gpt-5.6-sol`, medium thinking, read-only).

Fill placeholders:

- `{WHAT_WAS_IMPLEMENTED}`: brief summary of what changed
- `{PLAN_OR_REQUIREMENTS}`: `.pi/artifacts/$(cat .pi/artifacts/.active)/spec.md`
- `{BASE_SHA}`: from above; tell review agents to inspect the actual current diff (`git diff $BASE_SHA` plus `git diff --cached`), covering committed + staged + uncommitted working-tree changes — not only committed ranges

Wait for all 5 agents to return. Synthesize findings.

**Auto-fix rule:**

- Critical issues → fix inline, re-run Phase 4 verification, continue
- Important issues → fix inline, continue
- Minor issues → note in `.pi/artifacts/$(cat .pi/artifacts/.active)/progress.md`, flag for the learnings pass at close

If review finds critical issues that require architectural decisions → stop → present options to user.

### Iterative Quality Loop Mode

Score-gated feedback loop for high-risk features. Replaces the standard parallel review with a structured iteration cycle.

#### Setup

Initialize loop state:

```bash
SLUG=$(cat .pi/artifacts/.active)
cat > ".pi/artifacts/$SLUG/review-state.json" << EOF
{
  "slug": "$SLUG",
  "rounds": 0,
  "maxRounds": 5,
  "lastScore": 0,
  "sameScoreCount": 0,
  "findingsResolved": 0,
  "findingsRemaining": 0,
  "status": "active"
}
EOF
```

#### Loop

Repeat steps 2-8 until exit or escalation:

| Step | Action |
|---|---|
| **1. EXECUTE** | Implement per spec/plan (already done in Phase 3) |
| **2. REVIEW** | Spawn **one review subagent** (`subagent_type: "review"`) with spec + current diff + `review-state.json`. Returns: score (X/5), findings array (severity + file:line + suggestion), suggested next action |
| **3. GATE** | Score ≥ 5 → mark done (`status: "passed"`), exit loop, proceed to Goal-Backward Verification. Score 4 → ask user if they want to proceed or loop. Score <4 → continue |
| **4. STALL?** | If `sameScoreCount ≥ 2` → escalate: surface accumulated findings, present to user with a recommendation |
| **5. MAX?** | If `rounds ≥ maxRounds` → escalate with full finding log |
| **6. FILTER** | Split findings into categories and handle each: |
| | • **Actionable** (code-level, clear fix) → proceed to fix |
| | • **Informational** (note, no code change) → log to progress.md with `[info]` |
| | • **Architecture/Design** → stop loop, present to user for decision |
| **7. FIX** | For each actionable finding, spawn a fix subagent with the exact file:line and suggested fix. Run sequentially for same-file findings, parallel for different files |
| **8. RE-REVIEW** | Update `review-state.json`: increment rounds, update score, reset/resolve findings. Go to step 2 |

#### Loop State Updates

After each round, update `review-state.json`:

**`sameScoreCount` rule:**
- If new score === `lastScore` → increment `sameScoreCount`
- If new score !== `lastScore` → reset `sameScoreCount` to 0

**Status transitions:**

- Stall detected (`sameScoreCount ≥ 2`) → `status: "stalled"`, append accumulated findings to progress.md
- Max rounds reached → `status: "maxed"`, append full finding log to progress.md
- Pass (score ≥ 5) → `status: "passed"`, proceed to Goal-Backward Verification

#### Review Subagent Prompt

When spawning, include:

- The original spec/slug
- The current diff (all changed files since the start of Phase 3)
- The current `review-state.json`
- Return format: `{ score: number, findings: Array<{severity:"critical"|"important"|"minor", file:string, line:number, suggestion:string, type:"actionable"|"informational"|"architecture"}>, nextAction: string }`

#### Exit Conditions

| Condition | Action |
|---|---|
| Score ≥ 5 | Proceed to Goal-Backward Verification |
| User approves score 4 | Proceed to Goal-Backward Verification |
| Architecture finding | Stop, present options to user |
| Stalled (same score 2x) | Escalate with accumulated findings |
| Max rounds | Escalate with full finding log |

### Goal-Backward Verification (if plan.md exists)

Verify that tasks completed ≠ goals achieved:

**Three-Level Verification:**

| Level              | Check                  | Command/Action                                                    |
| ------------------ | ---------------------- | ----------------------------------------------------------------- |
| **1: Exists**      | File is present        | `ls path/to/file.ts`                                              |
| **2: Substantive** | Not a stub/placeholder | `grep -v "TODO\|FIXME\|return null\|placeholder" path/to/file.ts` |
| **3: Wired**       | Connected and used     | `grep -r "import.*ComponentName" src/`                            |

**Key Link Verification:**

- Component → API: `grep -E "fetch.*api/|axios" Component.tsx`
- API → Database: `grep -E "prisma\.|db\." route.ts`
- Form → Handler: `grep "onSubmit" Component.tsx`
- State → Render: `grep "{stateVar}" Component.tsx`

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

Ask user before closing:

```typescript
question({
  questions: [
    {
      header: "Close",
      question: "All tasks pass, gates green, review clean. Mark plan as complete?",
      options: [
        { label: "Yes, mark complete (Recommended)", description: "All checks passed" },
        { label: "No, keep working", description: "Need more work" },
      ],
    },
  ],
});
```

If confirmed:

Update `.pi/artifacts/todo.md` to mark all tasks complete and append summary to `.pi/artifacts/$(cat .pi/artifacts/.active)/progress.md`.

Record significant learnings in `.pi/artifacts/MEMORY.md` (Decisions / Gotchas) after closing.

## Output

Report:

1. **Execution Summary:**
   - Tasks completed/total
   - Waves executed (if plan.md with waves)
   - Deviations applied (Rules 1-3)
   - Checkpoints encountered (human-verify/decision/human-action)
   - Commits suggested (operator authorizes all commits/pushes; none automatic)

2. **PRD Task Results:**
   - Each task status ([x] pass, [ ] fail, [PAUSE] checkpoint)
   - Files modified per task
   - Suggested commit messages (no commits without operator authorization)

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
   - Verification and review may end with an **uncommitted worktree** — that is a valid stopping point, not a failure
   - Present **named Git/action options** for the operator to choose and explicitly authorize (none run automatically):
     - `commit` — stage individual files only (never `git add .`/`-A`) with a Conventional Commits message
     - `push` — push the current branch to remote
     - `branch` — create a named branch for the work
     - `pr` — open a pull request from the current branch
     - `publish` — publish a package/release
     - `deploy` — deploy to an environment
     - `hold` — keep the uncommitted workspace and defer the decision
   - For each option, state the exact command(s) you would run; execute only the one the operator names, and only that one
   - Suggest Conventional Commit messages for any `commit` option; never commit/push without explicit confirmation naming the exact action
   - Note deferred work in `.pi/artifacts/todo.md`

## Related Commands
| Need              | Command       |
| ----------------- | ------------- |
| Create feature    | `/create`     |
| Plan execution    | `/plan`       |
| Research a topic  | `/research`   |
| Fix a bug         | `/fix`        |
| Verify gate       | `/verify`     |
