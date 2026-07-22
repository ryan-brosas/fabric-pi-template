---
description: Debug and fix a bug or failing test
argument-hint: "<description of bug or error>"
agent: build
---

# Fix: $ARGUMENTS

Systematically debug and fix the reported issue.

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

### Phase 3: Fix

- Apply the minimal fix for the root cause
- Do not add speculative guards, tolerant readers, or defensive copies
- Prefer making the bad state impossible over handling all bad states

### Phase 4: Verify

```bash
npm run typecheck
npm run lint
npm test            # or vitest relevant test
```

If verification fails twice on the same approach, escalate with learnings.

## Output

Report:
1. Root cause (with file:line)
2. Fix applied
3. Verification results
4. What else was considered and rejected
