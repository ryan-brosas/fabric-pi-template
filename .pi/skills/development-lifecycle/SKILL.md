---
name: development-lifecycle
description: Use when starting, planning, shipping, or verifying a work session — describes how `/init`, `/create`, `/plan`, `/ship`, `/verify`, and `/research` interact with the 4 canonical artifact files at `.pi/artifacts/`.
version: 2.0.0
tags: [workflow, artifacts, planning, work-sessions]
agent_types: [planner, worker, reviewer, scout]
tools: [read, write, edit, grep, bash]
---

# Development Lifecycle

## The 4 Canonical Artifact Files

At `.pi/artifacts/`, maintained in the working copy:

| File | Purpose | Use when |
|---|---|---|
| `TODO.md` | Live task list per session / day | >=2 tool calls OR >=2 files OR multi-step work |
| `PLAN.md` | Long-form spec, slice ordering, open questions | New feature, breaking change, ambiguous spec |
| `PROGRESS.md` | Per-iteration log: tried, failed, learned | Long-running investigation or build |
| `DECISIONS.md` | ADRs (Architecture Decision Records) | Real trade-off between two or more viable options |

**Entry format (TODO.md, PROGRESS.md):** `### YYYY-MM-DD - <title>` followed by `status: active | done | abandoned | updated: <date>`.

## Slash Commands (Lifecycle Hooks)

- `/init` — mandatory first touch. Initializes the full Pi-native project packet (`AGENTS.md` + `.pi/{tech-stack,ROADMAP,state,user,memory}.md`). Run once per project; `--refresh` to reconcile.
- `/create <slug> "<description>"` | `/create <slug> --from <source[#anchor]>` — turn a rough idea or a bounded source into a `PLAN.md` and `TODO.md` at `.pi/artifacts/<slug>/`. Requires a ready packet.
- `/plan <slug>` — open / resume the current plan. Loaded from `planning-and-task-breakdown`.
- `/ship <slug>` — pre-merge hardening: tests, lint, types, format. Loaded from `shipping-and-launch`.
- `/verify <slug>` — claim-completion evidence gate. Loaded from `verification-before-completion`.
- `/research <slug> <topic>` — exploratory investigation; lives in `PROGRESS.md`. Loaded from `spec-driven-development`.

## Workflow

```
   /init  ──>  /create  ──>  /plan  ──>  implement  ──>  /ship  ──>  /verify
                 │            │           │              │           │
              PLAN.md      TODO.md      artifacts    tests/lint    evidence
              TODO.md      updates      PROGRESS.md  green        claim holds
```

**`/research` is sideways** — it feeds `/plan` or `/create`, not the linear path.

## When to Use Each Phase

| Phase | Trigger | Skip if |
|---|---|---|
| `/init` | New project, untracked packet, or refresh needed | Already initialized and ready |
| `/create` | New feature / product / PRD | Trivial one-liner |
| `/plan` | Multi-file change, ambiguous spec | Single known file, clear spec |
| `/ship` | Before merge / commit | No code change this session |
| `/verify` | Before "done" claim, always | Never skip |
| `/research` | Open-ended question, no answer path | The answer is in the code or docs already |

## Lifecycle Rules

1. **`/init` is mandatory first** — every downstream lifecycle command (`/create`, `/plan`, `/ship`, `/verify`, `/research`, `/gc`) gates on a ready packet. Uninitialized or partial state blocks.
2. **No silent skipping** — if you skip a phase, name it in the response ("skipped /plan: single-file fix with clear spec"). This becomes the audit trail.
3. **Update TODO.md first, then code** — append the entry before the first edit. Re-reading it on resume gives you the state.
4. **PROGRESS.md = investigation log** — failed attempts and "what I tried" go here, not in chat.
5. **DECISIONS.md is for trade-offs, not choices** — if there's only one viable option, it goes in PLAN.md as a fact, not an ADR.
6. **/verify is non-negotiable** — every "done" claim cites evidence.

## Red Flags

- TODO.md has no `### YYYY-MM-DD - <title>` entries — likely stale or skipped.
- PROGRESS.md empty on a multi-hour task — context loss on resume.
- DECISIONS.md used as a dumping ground for any choice — noise, not signal.
- "Done" claim without `/verify` evidence — common regression.

## Skill Result Contract

```xml
<skill_result>
  <skill>development-lifecycle</skill>
  <status>success|partial|blocked|failure</status>
  <evidence>Phase(s) used named, artifact files updated, /verify evidence cited</evidence>
  <artifacts>TODO.md / PLAN.md / PROGRESS.md / DECISIONS.md paths touched</artifacts>
  <risks>Skipped phases, stale entries, or none</risks>
</skill_result>
```
