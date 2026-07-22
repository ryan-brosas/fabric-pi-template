---
description: Debug and fix a bug or failing test
argument-hint: "<description of bug or error>"
---

# Fix: $ARGUMENTS

Systematically debug and fix the reported issue.

## Load Skills

Load the full `SKILL.md` for any skill whose description matches the current task before starting work:

- `root-cause-tracing` — trace execution paths backward to find the original trigger, adding instrumentation when needed.
- `verification-before-completion` — define the success check before implementing and verify after.

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

Detect the project toolchain rather than assuming a specific one. Look for `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, `Makefile`, etc., then run the corresponding checks.

```bash
# TypeScript/Node project example
npm run typecheck
npm run lint
npm test            # or vitest relevant test

# Rust project example
cargo check
cargo clippy
cargo test

# Python project example
ruff check .
mypy .
pytest
```

Run the narrowest check capable of failing because of the change first, then the relevant typecheck, lint, tests, and build. A source inspection or pass count is not runtime proof.

If verification fails twice on the same approach, escalate with learnings. Preserve partial useful output before retrying a failed portion.

## Output

Report:

1. Root cause (with `path:line`)
2. Fix applied
3. Verification results
4. What else was considered and rejected
