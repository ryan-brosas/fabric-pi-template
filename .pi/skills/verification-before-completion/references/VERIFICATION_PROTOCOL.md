# Verification Protocol

## Default: Incremental Mode

**Incremental is the default.** Only switch to full mode when:

- `--full` flag is explicitly passed
- Shipping/releasing (pre-merge, CI pipeline)
- More than 20 files changed

### Changed Files Detection

```bash
# Get changed files (uncommitted + staged + untracked)
CHANGED=$({
  git diff --name-only --diff-filter=d HEAD -- '*.ts' '*.tsx' '*.js' '*.jsx'
  git ls-files --others --exclude-standard -- '*.ts' '*.tsx' '*.js' '*.jsx'
} | sort -u)

# If in a plan worktree, diff against the branch point:
# CHANGED=$({
#   git diff --name-only --diff-filter=d main...HEAD -- '*.ts' '*.tsx' '*.js' '*.jsx'
#   git ls-files --others --exclude-standard -- '*.ts' '*.tsx' '*.js' '*.jsx'
# } | sort -u)

# Count for mode decision
FILE_COUNT=$(echo "$CHANGED" | grep -c .)
# > 20 files → switch to full mode automatically
```

## Standard Gates

### Gate Execution Order

```
┌─────────────────────────────────────┐
│  Parallel (run simultaneously)      │
│  ┌─────────────┐ ┌───────────────┐  │
│  │  Typecheck   │ │  Lint         │  │
│  │  (always     │ │  (changed     │  │
│  │   full)      │ │   files only) │  │
│  └──────┬──────┘ └──────┬────────┘  │
│         └───────┬───────┘           │
│            both must pass           │
├─────────────────────────────────────┤
│  Sequential (after parallel passes) │
│  ┌─────────────┐ ┌───────────────┐  │
│  │  Test        │ │  Build        │  │
│  │  (--changed  │ │  (ship/release│  │
│  │   or full)   │ │   only)       │  │
│  └─────────────┘ └───────────────┘  │
└─────────────────────────────────────┘
```

### Parallel Group (independent — run simultaneously)

```bash
# Gate 1: Typecheck (always full — type errors propagate across files)
npm run typecheck 2>&1 &
PID_TC=$!

# Gate 2: Lint
# Incremental (default): lint only changed files
npx oxlint $CHANGED 2>&1 &
# Full mode: lint everything
# npm run lint 2>&1 &
PID_LINT=$!

wait $PID_TC $PID_LINT
```

### Sequential Group (depends on parallel group passing)

```bash
# Gate 3: Tests
# Incremental (default): only tests affected by changed files
npx vitest run --changed
# Full mode: run all tests
# npm test

# Gate 4: Build (only if shipping/releasing)
# npm run build
```

### Gate Commands Summary

| Gate      | Incremental (default)        | Full (`--full`)     | When              |
| --------- | ---------------------------- | ------------------- | ----------------- |
| Typecheck | `npm run typecheck`          | `npm run typecheck` | Always (parallel) |
| Lint      | `npx oxlint <changed-files>` | `npm run lint`      | Always (parallel) |
| Test      | `npx vitest run --changed`   | `npm test`          | Always            |
| Build     | Skip                         | `npm run build`     | Ship/release only |

## Candidate Evidence

Candidate evidence (command output, exit codes, file hashes) may be persisted in per-slug `PROGRESS.md` before the final verification pass. The final verified declaration is emitted externally (response/session transcript only) — no repository write occurs after the final before/after fingerprint. A post-fingerprint write would invalidate the PASS it records.

## Gate Results Format

Report results as:

```text
| Gate      | Status | Mode        | Time   |
|-----------|--------|-------------|--------|
| Typecheck | PASS   | full        | 2.1s   |
| Lint      | PASS   | incremental | 0.3s   |
| Test      | PASS   | incremental | 1.2s   |
| Build     | SKIP   | —           | —      |
```

Include the mode column so it's clear whether incremental or full was used.

## Failure Handling

- If any gate fails, stop and fix before proceeding
- Show the FULL error output for failed gates
- After fixing, re-run ONLY the failed gate(s) + any downstream gates
- Failed runs produce no evidence — next run will execute gates normally
