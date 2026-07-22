# Roadmap

## Vision

A Pi-native coding template powered by `pi-fabric`: GPT-5.6-sol Main as the sole
scheduler, integrator, and commit authority, with an ambient senior supervisor that
steers Main on drift and missing verification, and a bounded GLM worker pool for
implementation. Lifecycle ergonomics are inspired by `.opencode` (`/create` → optional
`/plan` → `/ship` → `/verify`), but realized with thin Pi prompts and Markdown artifacts —
no `/team`, no lifecycle kernel, no schemas, no candidate manifests, no CAS board.

## Target Users

- **Developers** adopting the template as the agent-driven development baseline for a new
  or existing repository.

## Success Criteria

- **Maintainability** — thin, readable Pi prompts and config; no hidden lifecycle state
  machines.
- **Stability / correctness** — host-derived evidence, worker distrust, verified commits;
  no silent model fallback across authority classes.
- **Ergonomics** — direct-first routing with delegation as a tool, optional supervisor per
  task, frequent safely scoped verified commits.

## Feature Roadmap

1. **Pi project config** — `.pi/settings.json`, `.pi/fabric.json`, `.pi/config.json`
   (role routes, model tiers, actor scope, budgets, ceilings).
2. **Advisory council (hybrid, session-scoped)** — native `agents.create` persistent
   actors, all read-only, `directive`, `model: gpt-5.6-sol`, `thinking: max`,
   `extensions: false`, tools `read`/`grep`/`find`/`ls`: **supervisor** (ambient,
   `events: ["agent_settled","tool_error"]`, `delivery: steer`, `triggerTurn: true`,
   sole steer authority) + **security advisor** and **architecture advisor** (persistent,
   mailbox-only, no host events, invoked only at lifecycle gates). Only the supervisor
   steers Main; advisor findings flow to the supervisor, never directly to Main. Per-session
   (`mesh.actorScope: "session"`). Create/inspect via `.pi/prompts/supervise.md`; gate
   workflow via `.pi/prompts/gate.md`. Council is optional per task, a ceiling not a quota.
3. **Lifecycle prompts** — thin Main-owned phase prompts under `.pi/prompts/`:
   `create`, `plan`, `ship`, `verify`, `research`; self-contained instructions, no agent
   routing or pseudo-tool calls.
4. **Canonical artifacts** — `.pi/artifacts/{PLAN,TODO,PROGRESS,DECISIONS}.md` as the
   sole lifecycle record (lazy creation).
5. **Worker topology + distrust** — 1 Makora GLM worker per session (ceiling; host runs 4-5 sessions);
   host-derived candidate bytes; Main reads and verifies every diff.
6. **Verification + quality gates** — focused checks per change; `verify` as the only
   phase allowed to claim completion.
7. **Mesh discipline** — durable coordination/mailbox only; never phase or lifecycle
   authority.

## Non-goals

- No `/team` orchestrator or mandatory two-skill lifecycle.
- No lifecycle kernel, schemas, typed handoffs, candidate manifests, receipts, or CAS
  board.
- No mandatory research/review agents every cycle.
- No automatic branch creation, commits, push, or publication.
- No supervisor writes, delegation, lifecycle-state mutation, or final readiness
  authority.
