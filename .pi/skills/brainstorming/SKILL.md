---
name: brainstorming
description: Use before any creative work — new features, components, or behavior changes. Refines rough ideas into a validated design through collaborative questioning, alternative exploration, and incremental approval. Do not use for mechanical tasks with a clear spec.
version: 1.1.0
tags: [planning, workflow]
dependencies: []
agent_types: [plan, general, review]
tools: []
---

# Brainstorming

<HARD-GATE>
Do not write code, draft an implementation plan, or invoke `incremental-implementation` / `planning-and-task-breakdown` until you have presented a design and the user has approved it. This applies to every project regardless of perceived simplicity — "simple" is where unexamined assumptions waste the most work. The design can be two sentences; you must still present it and get approval.
</HARD-GATE>

## Execution Scope

This skill requires iterative, turn-by-turn operator approval (the interview, the variant selection, the design sign-off, and the user-review gate). That loop is **primary-session-only**: only the primary session (the operator-facing conversation) may run it, and it must **not** be delegated to a Fabric subagent / leaf worker, which breaks the back-and-forth. A subagent / leaf that discovers brainstorming is required must **not** run the interview itself — it reports a blocker in its result envelope stating that brainstorming is required and escalates to the primary so the primary can drive the interview. Leaves may still perform read-only context exploration (files, docs, recent commits) to scope the request before reporting.

## When to Use

- Rough idea, PRD, ADR draft, or vague feature request — before code.
- "What if we…", "I'm thinking…", "Let's try…" — multiple plausible approaches exist and the choice is load-bearing.

## When NOT to Use

- Bug fixes with a known root cause → `root-cause-tracing`.
- Mechanical refactor with a clear spec → `incremental-implementation`.
- Trivial one-liner or config value → just do it.

## Core Principle

**Classify unknowns before acting.** Distinguish known-knowns (in the prompt), known-unknowns (ask the user), unknown-knowns (show 2–4 cheap variants or point at a reference — you'd recognize the answer if you saw it), and unknown-unknowns (ask the model to teach you the criteria). Map the gap before proposing. A simpler approach often exists — say so.

## Workflow

1. **Explore context** — read files, docs, recent commits before asking anything. Follow existing patterns; don't propose unrelated refactoring. Where existing code has problems affecting the work, include targeted improvements as part of the design.
2. **Scope check** — if the request spans multiple independent subsystems, flag it and help decompose into sub-projects first. Each sub-project gets its own design → plan → build cycle.
3. **Map unknowns** — classify the gap; state assumptions aloud for ambiguous cases. If the request is already concrete, skip to step 6.
4. **Variants** — for novel / design-heavy work, show 2–4 cheap variants *before* recommending one. Each names the trade-off it accepts. Lead with your recommendation and why.
5. **Interview** — one question at a time on architecture / data-model / UX. Multiple-choice when options are genuinely live. Reference-pointing beats 200 words of explanation.
6. **Present design** — in sections scaled to complexity (a few sentences for simple parts, up to ~200 words for nuanced ones). Cover architecture, components, data flow, error handling, testing. Check in after each section; go back and clarify when something doesn't make sense. **Design for isolation:** each unit has one clear purpose, a well-defined interface, and is understandable without reading its internals. Can you change the internals without breaking consumers? If not, the boundaries need work.
7. **Write the spec** — on approval, save the design to `.pi/artifacts/<slug>/design.md` (operator may prefer project `docs/specs/`). Record write/spec evidence (path written, section count or diff summary) rather than committing implicitly. **Operator-confirmation gate before any commit:** do not commit the spec until the explicit operator has confirmed — name what you wrote, point at the artifact path, and ask for explicit go-ahead. On a leaf subagent, surface the written-spec path and stop for primary confirmation instead of committing.
8. **Spec self-review** — read it with fresh eyes: scan for placeholders/TODOs, internal contradictions, scope (one plan's worth, not multiple subsystems), and ambiguity (could a requirement be read two ways? pick one and make it explicit). Fix inline; no re-review.
9. **User review gate** — ask the user to review the written spec; revise and re-review until they approve.
10. **Hand off** — invoke `planning-and-task-breakdown` to create the implementation plan (or `incremental-implementation` for a trivial slice). Do not invoke any other build skill from here — brainstorming's terminal state is the planning skill.

## Visual Companion (optional)

For genuinely visual questions — mockups, layout comparisons, architecture diagrams — not merely UI *topics*, a browser-based companion is available. Offer it just-in-time as its own message the first time a question is clearer shown than told; never upfront, and never if no visual question arises. On a headless/remote host, bind `--host 0.0.0.0` and reach it via port-forward. See `visual-companion.md`.

## Cheat Sheet

| Situation | Default action |
|---|---|
| Spec concrete, single-file | Skip brainstorm, implement. |
| Spec concrete, multi-file or design-heavy | One question on the riskiest unknown, then design. |
| Spec vague | Variants first, then interview. |
| Spans multiple subsystems | Decompose first. |
| "Sanity check" / "prototype" | Use `prototype`, not this one. |
| New library / framework | Point at official docs/source. |

## Red Flags

Skipping variants for a design decision; asking several questions in one message; "we can add caching later" hand-waving in a production-bound design; starting code/plan before user approval; "YAGNI" used to dismiss a stated requirement (use it against speculative creep, not stated requirements); skipping the spec self-review or user-review gate.

## Anti-Patterns

**The 200-word answer** when 2–4 variants would surface the same trade-off; **the leading question** ("Should we use X, which is obvious?") collapses the brainstorm; **the silent assumption** picks a stack/pattern without naming it; **premature implementation** drafts a plan before the user approves the design; **"too simple for a design"** — the design can be two sentences, but you must still present and get approval.

## Skill Result Contract

```xml
<skill_result>
  <skill>brainstorming</skill>
  <status>success|partial|blocked|failure</status>
  <evidence>Context explored, unknowns mapped, variants shown (if novel), design approved, spec written + self-reviewed + user-approved</evidence>
  <artifacts>Design spec at .pi/artifacts/<slug>/design.md, or "skipped — spec was concrete"</artifacts>
  <risks>Unresolved questions, scope creep, premature commitment, or none</risks>
</skill_result>
```
