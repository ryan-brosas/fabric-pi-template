---
name: diagnostics
description: Use when checking for code errors, type issues, lint warnings, code quality (Fallow), or AI slop after making changes, before committing, or when troubleshooting build failures. Supports TypeScript, Rust, Go, Python plus optional Fallow + aislop.
---

# Diagnostics

## When to Use

Running code diagnostics after edits to verify typecheck, lint, and tests pass before claiming done. Part of the verification-before-completion workflow.

## Workflow

1. Run diagnostics on the changed files: `diagnostics(file="src/foo.ts", scope="changed")`.
2. If errors: fix the first one, re-run, repeat until clean.
3. If no errors but suspicious: run full-project diagnostics with fallow+aislop.
4. Fallow may report dead code or complexity hotspots — address or acknowledge before commit.
5. aislop may report AI-generated anti-patterns — review and clean up.
6. Commit only when all diagnostics are green.

## Parameters

| Param | Value | Effect |
|---|---|---|
| `scope` | `"changed"` | Git diff scope (default: `"full"`) |
| `scope` | `"full"` | Full project, every file |
| `languages` | `["typescript"]` | Language / runner filter |
| `includeFallow` | `true` (default when tsconfig.json exists) | Fallow code quality (health, dead-code, check-changed) |
| `includeAislop` | `true` (default, unless env var disables) | aislop AI slop detection |
| `file` | `"src/main.ts"` | Only language runners matching file extension |

## Fallow Integration

When `includeFallow: true` (default for TS/JS projects), diagnostics runs:

- **`scope=full`** — `fallow health --changed-since main` (complexity hotspots, refactoring targets) + `fallow dead-code` (unused files)
- **`scope=changed`** — `fallow check-changed --changed-since main` (issues in changed files only)

Fallow CLI is resolved via `FALLOW_BIN` env var, local `fallow` binary, or `npx --yes fallow` fallback.

## aislop Integration

When `includeAislop: true` (default unless `PI_DIAGNOSTICS_SKIP_AISLOP=true` or `PI_AISLOP_AUTO=true`), runs `aislop scan --json` (or `npx aislop@latest scan --json`) to detect AI-generated code anti-patterns.

## Common Mistakes

Running without `scope="changed"` (full project is slow); running without `languages` filter (runs all); ignoring fallow/aislop output; "I'll run later" (run now, fix before commit); running diagnostics on the wrong branch; not running after significant edits; "the typecheck passes, so it's fine" (check lint + fallow + aislop too).

## Anti-Patterns

**No scope filter**; **no language filter**; **ignore fallow/aislop**; **"run later"**; **wrong branch**; **no run after edits**; **"typecheck is enough"**.
