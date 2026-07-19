---
description: Debug and fix a bug or failing test
argument-hint: "<description of bug or error>"
agent: build
---

> **Pi execution binding:** Thin router into `/team`. Full dispatch doctrine in `.pi/docs/fabric-tuning.md`.

# Fix: $ARGUMENTS

Systematically debug and fix the reported issue, then delegate the repair to `/team`.

## Load Skills

```typescript
skill({ name: "root-cause-tracing" });
skill({ name: "verification-before-completion" });
```

## Process

### Phase 1: Reproduce

```bash
# Reproduce the issue with the exact steps or command
```

### Phase 2: Isolate

- Search for the error message or symptom in the codebase
- Trace the execution path to find the root cause
- Read the 2-4 most relevant files
- Distinguish symptom from root cause

### Phase 3: Delegate Repair

Parse `$ARGUMENTS` into a repair brief and one exact `verifyCommand` (the command
that proves the bug is gone). Fail closed unless `π.issue` is non-empty (like
`π.verifyCommand`). Build the `/team` named-string contract and invoke `/team`
with `{ goal, goalCheck, verifyAllowlist }`. `/team` owns all dispatch,
implementation, gating, and integration; this prompt performs none of it and
makes no `agents.spawn`, `schema.commit`, or `schema.hypothesize` calls.

```typescript
// fabric_exec — thin router: validate named strings, build the /team contract,
// then hand the repair off to /team. No agents.spawn, no schema.* here.
const issue = typeof π.issue === 'string' ? π.issue.trim() : '';
if (!issue) throw new Error('a non-empty π.issue is required to route /fix to /team');
const diagnosis = typeof π.diagnosis === 'string' ? π.diagnosis.trim() : '';
const verifyCommand = typeof π.verifyCommand === 'string' ? π.verifyCommand.trim() : '';
if (!verifyCommand) throw new Error('a verifyCommand is required to route /fix to /team');
if (/[\n\r;&|`$<>]/.test(verifyCommand))
  throw new Error('shell control operators are not allowed in π.verifyCommand');
// /team named-string contract (known before the cycle). PLAN is NOT a named
// string — Main authors it from discover output and writes plan.json.
const goal = 'Fix: ' + issue + (diagnosis ? '\nRoot cause: ' + diagnosis : '');
const goalCheck = verifyCommand; // single predicate command proving the goal is met
const verifyAllowlist = JSON.stringify([verifyCommand]);
const brief = goal +
  '\nVerify (must pass): ' + verifyCommand +
  '\nEdit existing files only; route additions/deletions/renames to /ship; do not commit.';
// /team is invoked with { goal, goalCheck, verifyAllowlist }.
return { route: '/team', brief, goal, goalCheck, verifyAllowlist };
```

### Phase 4: Verification Result

`/team` reports whether the `verifyCommand` passes in its gated worktrees and
after integration. Surface that result; this prompt performs no rollback.

## Output

Report:
1. Root cause (with file:line)
2. Repair delegated to `/team`
3. Verification results (from `/team`)
4. What else was considered and rejected
