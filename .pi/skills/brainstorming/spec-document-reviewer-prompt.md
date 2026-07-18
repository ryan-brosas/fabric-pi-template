# Spec Document Reviewer Prompt

Use this template when dispatching a spec reviewer as a bounded Fabric task. Per the Fabric-Pi Fabric conventions, a reviewer is a leaf worker (`maxDepth` 1); the primary reads and integrates its output.

**Purpose:** Verify the spec is complete, consistent, and ready for implementation planning.

**Dispatch after:** the design spec is written to `.pi/artifacts/<slug>/design.md` (or the operator-chosen path) and committed.

**Fabric dispatch prompt:**

```
You are a spec document reviewer. Verify this spec is complete and ready for planning.

Spec to review: [SPEC_FILE_PATH]

## What to Check

| Category | What to look for |
|----------|------------------|
| Completeness | TODOs, placeholders, "TBD", incomplete sections |
| Consistency | Internal contradictions, conflicting requirements |
| Clarity | Requirements ambiguous enough to cause someone to build the wrong thing |
| Scope | Focused enough for a single plan — not multiple independent subsystems |
| YAGNI | Unrequested features, over-engineering |

## Calibration

Only flag issues that would cause real problems during implementation planning: a missing section, a contradiction, or a requirement ambiguous enough to be read two ways. Minor wording, stylistic preferences, and "sections less detailed than others" are not issues. Approve unless there are serious gaps that would lead to a flawed plan.

## Output Format

## Spec Review

**Status:** Approved | Issues Found

**Issues (if any):**
- [Section X]: [specific issue] — [why it matters for planning]

**Recommendations (advisory, do not block approval):**
- [suggestions]
```

**Reviewer returns:** Status, Issues (if any), Recommendations. The primary integrates this into the spec self-review + user-review gate loop — the reviewer does not edit files.