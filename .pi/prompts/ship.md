---
description: Ship a plan - implement specs, verify, review, close
agent: build
---

> **Pi execution binding:** Thin router: execution → `/team`, verification → `/verify --full`. Topology is 6 Makora + 2 Umans (8 seats). Full dispatch doctrine in `.pi/docs/fabric-tuning.md`.

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
- **Review belongs to `/team`**: ship is a thin router; never spawn a review agent here — `/team` owns review during execution
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

### Run Ledger

```typescript
// fabric_exec — durable phase ledger for this /ship run. Every phase records a
// CAS-chained state.transition (from = observed head; on a from-mismatch the
// primary re-observes the real head once and chains from it — never force,
// never fork). Evidence entries are trusted shell commands state.verify can
// re-run after the run ends.
const ROOT = (await pi.bash({ cmd: 'pwd', timeoutMs: 30000 })).output.trim();
const cfg = JSON.parse(String(await pi.read(ROOT + '/.pi/config.json')));
const slug = String(await pi.read(ROOT + '/.pi/artifacts/.active')).trim();
const topic = 'fabric-pi-' + slug;
const board = 'fabric-pi/' + slug + '/board';
const s0 = await tools.call({ ref: 'state.get', args: {} });
let LEDGER_HEAD = s0 && s0.head && s0.head.to ? String(s0.head.to) : '';
async function ledgerReceipt(phase, summary, evidence) {
  const to = 'ship-' + slug + '/' + phase;
  const args = { label: 'ship ' + phase, to, summary: String(summary).slice(0, 300) };
  if (Array.isArray(evidence) && evidence.length) args.evidence = evidence.map(String);
  try { await tools.call({ ref: 'state.transition', args: LEDGER_HEAD ? { ...args, from: LEDGER_HEAD } : args }); }
  catch (_) {
    const s = await tools.call({ ref: 'state.get', args: {} });
    const observed = s && s.head && s.head.to ? String(s.head.to) : '';
    await tools.call({ ref: 'state.transition', args: observed ? { ...args, from: observed } : args });
  }
  LEDGER_HEAD = to;
}
await ledgerReceipt('guards', 'spec/plan present; workspace inspected');
```

### Workspace Setup

Inspect first; never create a branch without explicit operator
authorization naming the exact action. Install deps if needed.

## Phase 2: Delegate Execution

Parse the active plan/spec (`.pi/artifacts/$(cat .pi/artifacts/.active)/plan.md`
or `tasks.json`, falling back to `spec.md`) to derive the objective. Derive the
ship verify command(s) for the gate pass (build/test/lint/typecheck). Then
invoke `/team` with the named-string contract `{ goal, goalCheck, verifyAllowlist }`:

- `goal` — the objective derived from the plan/spec (the end state to reach)
- `goalCheck` — a single predicate command proving the goal is met
- `verifyAllowlist` — a JSON string array of the allowed verify commands
  (e.g. the ship gate commands); `/team` runs only allowlisted verify commands

`PLAN` is NOT a named string: Main authors it from discover-wave output and
writes it to `.pi/artifacts/<slug>/plan.json`; the implement phase reads that
file. `/team` owns all dispatch, gating, and integration; this prompt performs
no `agents.spawn`, `schema.commit`, or `schema.hypothesize` and runs no
wave/batch-implement engine itself.

```typescript
// fabric_exec — thin router: derive the /team named-string contract from the
// active plan/spec and ship verify commands, then delegate. No agents.spawn,
// no schema.* here.
const ROOT = (await pi.bash({ cmd: 'pwd', timeoutMs: 30000 })).output.trim();
const slug = String(await pi.read(ROOT + '/.pi/artifacts/.active')).trim();
const specDir = ROOT + '/.pi/artifacts/' + slug + '/';
let planText = '';
try { planText = String(await pi.read(specDir + 'plan.md')); } catch (_) {}
if (!planText) {
  try { planText = String(await pi.read(specDir + 'tasks.json')); } catch (_) {}
}
if (!planText) {
  try { planText = String(await pi.read(specDir + 'spec.md')); } catch (_) {}
}
if (!planText) throw new Error('no plan/tasks/spec found for slug ' + slug + ' — run /create first');
// Derive the objective and verify commands from the plan/spec.
const goal = 'Ship plan ' + slug + ': implement the spec tasks and reach all gates green';
// Single predicate command proving the goal is met.
const goalCheck = 'pi verify --full';
// JSON string[] of allowed verify commands (the ship gates).
const verifyAllowlist = JSON.stringify([
  'pi verify --full',
]);
// /team is invoked with { goal, goalCheck, verifyAllowlist }. Main authors
// plan.json from discover output; implement reads that file (no π.plan).
const brief = goal +
  '\nGoal check (must pass): ' + goalCheck +
  '\nVerify allowlist: ' + verifyAllowlist +
  '\nEdit existing files only; route additions/deletions/renames to /ship; do not commit.';
return { route: '/team', brief, goal, goalCheck, verifyAllowlist };
```

## Phase 3: —

(Merged into Phase 2; execution is delegated to `/team`.)

## Phase 4: Verification

Delegate the full gate pass to `/verify`:

```
/verify --full
```

`/verify --full` runs all four gates (build/test/lint/typecheck) and reports
the result. This prompt records no ledger receipt itself.

## Phase 5: Final Review

Holistic review of the whole outgoing diff before Close. Compute the diff
scope (committed changes since BASE_SHA plus staged plus unstaged
working-tree changes), then invoke `/team` with a REVIEW-ONLY brief over that
diff: assess correctness, security, and regressions across the entire
outgoing change set; report findings only and make NO edits. `/team` owns all
dispatch and the GLM cross-review; this prompt performs none of it — no
`agents.spawn`, `schema.commit`, or `schema.hypothesize` and no wave/
batch-implement engine — mirroring the delegation style of Phase 2.

```typescript
// fabric_exec — final holistic review receipt. Scope the outgoing diff
// (committed since BASE_SHA + staged + unstaged) and ledger the review-only
// delegation. /team owns all dispatch and cross-review; this block edits
// nothing and spawns nothing.
const base = (await pi.bash({ cmd: 'git rev-parse HEAD', timeoutMs: 30000 })).output.trim();
const diffScope = [
  'committed: git diff ' + base,
  'staged:    git diff --cached',
  'unstaged:  git diff',
].join(' | ');
// REVIEW-ONLY delegation: /team invoked with { goal, goalCheck, verifyAllowlist }.
// goal is review-only (report findings, no edits); goalCheck/guard confirms the
// review ran without edits; no π.plan.
const goal = 'Review-only: assess correctness, security, and regressions across the outgoing diff (' + diffScope + '); report findings only, make NO edits';
const goalCheck = 'test ! -n "$(git status --porcelain)" || git diff --quiet HEAD';
const verifyAllowlist = JSON.stringify([
  'git diff --quiet HEAD',
  'git status --porcelain',
]);
await ledgerReceipt('final-review', 'outgoing diff scoped @' + base.slice(0, 12) + '; /team review-only brief delegated with { goal, goalCheck, verifyAllowlist }');
return { route: '/team', brief: goal, goal, goalCheck, verifyAllowlist };
```

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

```typescript
await ledgerReceipt('close', 'operator confirmed close for ' + slug);
```

## Output

Report:

1. **Execution Summary:**
   - Tasks completed/total (executed by `/team`)
   - Commits suggested (operator authorizes all commits/pushes; none automatic)

2. **Verification Gate Results** (from `/verify --full`):
   - Build: [pass/fail]
   - Test: [pass/fail]
   - Lint: [pass/fail]
   - Typecheck: [pass/fail]

3. **Next Steps (Git/action options):**
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
