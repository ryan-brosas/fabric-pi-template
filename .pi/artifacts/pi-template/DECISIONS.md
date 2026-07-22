# DECISIONS — Pi/Fabric Template (`pi-template`)

Architecture Decision Records. Real trade-offs only; one viable option goes in `PLAN.md`
as a fact, not here. Format: Status / Date / Context / Decision / Consequences /
Alternatives.

## ADR-001: Hybrid per-session advisory council
**Status:** accepted
**Date:** 2026-07-22
**Context:** Need ambient senior-engineering review without a `/team`-style orchestrator
or a fixed role matrix every cycle. 4-5 concurrent Pi sessions share this project;
project-scoped actor registries can race. Fabric's stock `fabric-supervisor` self-stops on
"Goal verified complete", giving an actor independent completion authority.
**Decision:** A hybrid persistent council, per-session (`mesh.actorScope:"session"`):
one ambient supervisor (custom instructions, never self-stops, steers Main on drift) plus
mailbox-only security/architecture advisors invoked only at lifecycle gates. Only the
supervisor steers Main; advisor findings flow to the supervisor or Main reads them as
advice. Gate mechanics use blocking `agents.ask()` — never fire-and-forget `tell()`.
**Consequences:** Easier: single decision point, no race on a shared registry, no actor
with completion authority. Harder: persistent-actor cost/race complexity; session scope
does not isolate name-addressed mesh messages (resolve IDs locally, never address by
canonical name over mesh). Main remains sole integrator and treats all actor output as
untrusted advice.
**Alternatives:** (a) All advisors steer Main directly — race-prone under concurrent
sessions; arbitration pushed into message ordering. (b) Ephemeral panel → supervisor —
simpler but loses ambient persistence. (c) Single supervisor only — minimal but loses
specialist depth at gates. Chosen middle ground preserves persistence + specialist depth
with one steer authority.

## ADR-002: Per-session worktrees for concurrent write isolation
**Status:** accepted
**Date:** 2026-07-22
**Context:** Main is sole commit authority; commits require scoped staging; concurrent
root sessions sharing one worktree can stage each other's bytes. Fabric's Makora
semaphore is per-`SubagentManager` process, not per worktree — 4 roots in one worktree can
each start a Makora.
**Decision:** One root Pi process per writable Git worktree; writable work uses blocking
`agents.run()`; no writable `spawn()`/`parallel`; Main does not edit until the run
settles. Labeled honestly as operator/prompt policy (no atomic lease in v1).
**Consequences:** Easier: disjoint write domains, clean scoped commits. Harder: no
host-enforced single-writer guarantee; an atomic lease is deferred. Concurrent read-only
fan-out and council activity remain allowed alongside a writable run.
**Alternatives:** (a) A host-owned project lock around hash-check → approval → stage →
commit — stronger but adds machinery beyond the template's scope. (b) Shared worktree
with explicit ownership — fragile under "multiple agents per minute" churn. Chosen the
worktree boundary as the natural isolation unit.

## ADR-003: `extensions:false` default with a Makora exception
**Status:** accepted
**Date:** 2026-07-22
**Context:** `extensions:false` is the safe default for read-only GPT children (no
`fabric_exec`/`agents.*`/`mesh.*`). But Fabric maps `extensions:false` to Pi
`--no-extensions`, which a live probe confirmed fails to resolve
`makora/zai-org/GLM-5.2-NVFP4`. A universal `extensions:false` policy would disable the
only writable worker.
**Decision:** GPT council and read-only children use `extensions:false`; Makora
implementation workers MUST use `extensions:true` + `thinking:"max"` + an exact writable
tool allowlist. The split is encoded in `AGENTS.md`, `tech-stack.md`, and `PLAN.md`.
**Consequences:** Easier: read-only children stay capability-bounded; Makora resolves.
Harder: two extension policies to maintain; the Makora allowlist must be exact and
audited (no ambient `bash`/`write` beyond the allowlist).
**Alternatives:** (a) `extensions:true` for all children — widens the capability surface
for read-only roles unnecessarily. (b) A different writable provider that resolves under
`--no-extensions` — none available. Chosen the split that matches each lane's authority.

## ADR-004: Remove `.pi/config.json`; dispatch params are per-call
**Status:** accepted
**Date:** 2026-07-22
**Context:** Prior design routed roles and model tiers through `.pi/config.json`, but no
loader exists in Pi 0.81.1 or Fabric 0.22.4 (verified in installed source). Placing routes
there would be silently ignored; children would inherit one default or Main's model.
**Decision:** Remove every `.pi/config.json` reference. Main defaults live in
`.pi/settings.json`; child defaults in `.pi/fabric.json`; every `agents.run`/`create`/
`spawn` passes exact `runner`/`model`/`thinking`/`tools`/`extensions` at the call site.
**Consequences:** Easier: no phantom config file; dispatch is explicit and auditable.
Harder: dispatch params repeat per call; a shared role helper is a future option if
duplication grows.
**Alternatives:** (a) Add a project extension that parses `.pi/config.json` and fails
closed — re-introduces a lifecycle-router the clean-slate design rejected. (b) Keep
`.pi/config.json` as documentation only — risks being mistaken for live config. Chosen
to remove it entirely and make dispatch explicit.

## ADR-005: Session actor scope (`mesh.actorScope: "session"`)
**Status:** accepted
**Date:** 2026-07-22
**Context:** The host runs 4-5 concurrent Pi sessions on this project. Default project
actor scope shares a registry across sessions; Fabric warns concurrent roots may race on
it. Project-scoped actors persist across `/new`, which can overwrite one session's
supervisor remit with another's.
**Decision:** Pin `mesh.actorScope:"session"`. Each Pi session owns a disjoint actor
registry under `.pi/fabric/mesh/actors/<sessionId>/`. Actors are recreated from the
canonical definitions on resume.
**Consequences:** Easier: no cross-session registry races; each session's council is
self-contained. Harder: session scope does not isolate name-addressed mesh messages
(topics/state remain project-scoped) — resolve actor IDs locally and never address by
canonical name over mesh. Old-session actor history is unavailable through the new
session's actor API (decisions persist in Markdown, not in actor history).
**Alternatives:** (a) Project scope with a single owning process — fragile under
concurrent sessions. (b) Global templates (`scope:"global"`) — non-live, import per
session, adds a step. Chosen session scope as the natural per-session boundary.
