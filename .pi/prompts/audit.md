---
description: Audit codebase for a specific pattern
argument-hint: "<pattern>"
---

# Audit: $ARGUMENTS

Find all occurrences of a code pattern in the codebase, review each for issues, and produce prioritized remediation recommendations.

> Use for cross-cutting concerns like auth checks, error handling, API patterns, or security vulnerabilities.

## Parse Arguments

| Argument | Default  | Description                          |
| -------- | -------- | ------------------------------------ |
| Pattern  | required | Code pattern to search for           |

**Examples:**
- `/audit console.log` — Find all console.log statements
- `/audit app.use(` — Find all middleware registrations
- `/audit fetch(` — Find all fetch calls
- `/audit try {` — Find all try-catch blocks

## Execution

Auditing is a direct multi-angle investigation: discover occurrences, review each for issues, then synthesize prioritized findings. No workflow file is dispatched — the procedure runs inline.

### Phase 1: Discover Occurrences

Search the entire codebase for the pattern. Use `rg -n` scoped by language-relevant globs. Capture every occurrence with its file path and line number.

### Phase 2: Review Each Occurrence

For each occurrence, assess whether it is correct or an issue. Classify issues by severity:

- **Critical** — Security vulnerability, data loss, or correctness failure
- **Important** — Maintainability hazard, missing guard, or contract violation
- **Minor** — Style, naming, or documentation gap

Mark occurrences that are already correct as correct patterns — do not flag them as issues.

### Phase 3: Synthesize Findings

Aggregate all reviewed occurrences into a single prioritized report. Group issues by severity. List recommended fixes with exact file:line references. List correct patterns separately so they are not mistaken for issues.

## Output

Report (in the response — no file write, since audit has no slug contract):

1. **Pattern:** [pattern searched]
2. **Occurrences found:** [count]
3. **Files affected:** [count]
4. **Issues by severity:**
   - Critical: [N]
   - Important: [N]
   - Minor: [N]
5. **Recommended fixes:** [list with file:line refs]
6. **Correct patterns:** [list of occurrences that are already correct]

## Related Commands

| Need              | Command       |
| ----------------- | ------------- |
| Research a topic  | `/research`   |
| Create feature    | `/create`      |
| Ship feature      | `/ship`       |
| Verify gates      | `/verify`     |
