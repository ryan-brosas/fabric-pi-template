# State

## Current Status

Clean-slate. `/init --all` established foundational setup files. The Pi-native
template structure under `.pi/` (settings, fabric config, role routes, prompts) is
**not yet created** — it is the next workstream.

Established this session:
- `AGENTS.md` routing section rewritten to the clean-slate supervisor-led authority model
  (kept the safety constitution verbatim; removed the rejected `/team`,
  `fabric_exec`-brain, and CAS-board design).
- `.opencode/tech-stack.md`, `.opencode/roadmap.md`, `.opencode/state.md`,
  `.opencode/user.md` created (per `/init --all`, literal `.opencode/` paths).

## Active Decisions

- **Authority model:** GPT-5.6-sol max Main = sole scheduler/integrator + commit
  authority; persistent Fabric advisory council (supervisor + security + architecture
  advisors, all read-only `directive`, gpt-5.6-sol max) — only the supervisor steers Main
  (ambient, drift/blockers/missing verification); advisors are mailbox-only, invoked only
  at lifecycle gates, and never steer Main. Supervisor arbitrates, never a scheduler. No
  `/team`. Per-session (`mesh.actorScope: "session"`).
- **Worker topology:** 1 Makora GLM 5.2 worker per session (ceiling, not a quota; host runs 4-5 sessions);
  GPT-5.4-mini read-only gatherers; GPT-5.6-sol max for plan/review/debug.
- **Lifecycle record:** Markdown artifacts only — no lifecycle kernel, schemas,
  candidate manifests, receipts, or CAS board.
- **Mesh:** durable coordination/mailbox only; never phase or lifecycle authority.
- **Init paths:** `.opencode/` literal per the invoked `/init --all` (`.opencode` remains
  a reference scaffold; the authoritative template home is `.pi/`).

## Next Priorities

1. Create `.pi/settings.json` and `.pi/fabric.json` (Pi project + Fabric config; pin
   `mesh.actorScope: "session"` for per-session actor registries).
2. Create `.pi/config.json` (role routes + model tiers + ceilings + budgets).
3. Author `.pi/prompts/supervise.md` (native supervisor + advisor create/inspect,
   session-scoped, supervisor-only steer).
4. Author `.pi/prompts/gate.md` (lifecycle-gate workflow: parallel advisor `agent()` fan-out
   + supervisor synthesis; mailbox-only advisors, no host events).
5. Author thin lifecycle prompts: `.pi/prompts/{create,plan,ship,verify,research}.md`.
6. Establish `.pi/artifacts/` canonical set (lazy) and `.pi/.gitignore` for mesh runtime.
7. Validate model IDs resolve (`pi --approve --list-models`) and run a lifecycle smoke
   check that touches only intended files.
