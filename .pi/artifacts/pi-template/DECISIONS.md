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
registry under `.pi/fabric/mesh/actors/<sessionId>/`. Restarting the **same** session
(same `--session-id`) restores actors with the same IDs/createdAt/config
(`dist/actors/manager.js:1192-1247`); a **brand-new** session starts from an empty
session-local registry and must create its own actors from the canonical definitions.
**Consequences:** Easier: no cross-session registry races; each session's council is
self-contained; exact-session restart preserves identities and history. Harder: session
scope does not isolate name-addressed mesh messages (topics/state remain project-scoped) —
resolve actor IDs locally and never address by canonical name over mesh
(`dist/actors/manager.js:1007-1020`). A brand-new session does NOT inherit another session's
actors; old-session actor history is unavailable through the new session's actor API
(decisions persist in Markdown, not in actor history). `agents.remove()` and same-name
create over a stopped actor both recursively delete actor state, so reconciliation must
block on drift rather than remove+recreate.
**Alternatives:** (a) Project scope with a single owning process — fragile under
concurrent sessions. (b) Global templates (`scope:"global"`) — non-live, import per
session, adds a step. Chosen session scope as the natural per-session boundary.

## ADR-006: External-only final verification declaration
**Status:** accepted
**Date:** 2026-07-22
**Context:** `/verify` must prove a PASS is bound to the bytes tested via a before/after
fingerprint tuple. Persisting the final fingerprint itself into a tracked artifact
(`PROGRESS.md`) is self-defeating: the write alters the worktree, which changes a later
fingerprint, which invalidates the very PASS it records. The same applies to any status
write after the final fingerprint.
**Decision:** `/verify` is the sole phase permitted to declare terminal verified status,
and it does so in its response/session transcript only. Candidate evidence (commands, exit
codes, hashes, pending notes) may be written to `PROGRESS.md` before the final pass, but
the final verified declaration is external and no repository write (edit, stage, commit,
push) occurs after the final before/after fingerprint. The `/verify` body encodes this;
`AGENTS.md` Freshness and `PLAN.md` Verification encode the no-post-fingerprint-write rule.
**Consequences:** Easier: the final PASS cannot invalidate itself; the fingerprint tuple
is internally consistent; no special "exclude the verification record from its own digest"
normalization is needed. Harder: the final evidence is not a tracked artifact — it lives in
the session transcript, so auditability depends on the transcript being retained; a brand-new
session cannot read another session's final declaration (decisions persist in Markdown, but
terminal verified status does not). Operators who need durable proof must capture the
transcript or re-run `/verify`.
**Alternatives:** (a) Persist the final fingerprint in `PROGRESS.md` and exclude that one
record from its own digest — fragile, requires a special-case normalization, and any
later edit still invalidates it. (b) A separate evidence file excluded from the digest —
adds an artifact outside the canonical four and the same exclusion machinery. Chosen
external declaration as the only self-consistent option.

## ADR-007: Two writable surfaces — lifecycle state vs project memory
**Status:** accepted
**Date:** 2026-07-22
**Context:** The roadmap says `.pi/artifacts/<slug>/{PLAN,TODO,PROGRESS,DECISIONS}.md` is the
"sole lifecycle record," but several ported lifecycle prompts also read or write
`.opencode/artifacts/MEMORY.md` (project memory). This is intentional — MEMORY.md carries
durable cross-slug knowledge (architecture, decisions, patterns, gotchas) distinct from
per-slug lifecycle state — but the separation was undocumented, so a future reader could not
tell whether a MEMORY.md reference was a confinement violation or intended design. The
template is adoptable by copying `.pi/`, but MEMORY.md lives outside `.pi/`, so a `.pi`-only
adopter could fail on a missing `.opencode` tree. Separately, namespace ownership was
underspecified: `/plan`/`/ship`/`/verify` only required `PLAN.md`, and `/research` wrote
`PROGRESS.md` with no establishment guard, so a partial directory or a pre-`/create`
research write could be mistaken for a valid namespace or permanently block `/create`.
**Decision:** Formalize two writable surfaces. (1) **Lifecycle state** is confined to the
four canonical slug files. (2) **Project memory** (`.opencode/artifacts/MEMORY.md`) is an
**optional** separate surface for durable cross-slug knowledge; missing memory is treated
as absent and non-blocking; ordinary prompts must not auto-create the OpenCode scaffold;
only `/init` may establish the OpenCode context surface; `/verify` may append one distilled
non-sensitive finding pre-fingerprint; lifecycle prompts may read memory for context when it
exists, and other memory writes are explicit "record durable finding" steps, never lifecycle
state. Memory content is distilled, non-sensitive knowledge only — never secrets,
credentials, PII, raw tool output, per-slug status, or final verification results.
Alongside, `/create` is the sole namespace creator; an established namespace requires both
`PLAN.md` and `TODO.md`; downstream lifecycle commands fail closed on a missing/partial
namespace (no adoption, overwrite, or deletion); pre-`/create` `/research` is response-only.
**Consequences:** Easier: the distinction is explicit and auditable; a `.pi`-only adopter is
not forced to carry `.opencode`; lifecycle state stays slug-confined and cannot leak cross
slug; the no-post-fingerprint-write rule (ADR-006) bounds the one `/verify` memory append.
Harder: two surfaces to maintain; project memory is tracked but lives outside the portable
`.pi/` tree, so adopters who want durable memory must copy or recreate `.opencode/artifacts/`
themselves; the privacy rule (distilled, non-sensitive only) is prompt-enforced, not
host-enforced.
**Alternatives:** (a) Fold memory into the lifecycle files (e.g. a per-slug `MEMORY.md`) —
loses cross-slug durability and duplicates knowledge per slug. (b) Treat every MEMORY.md
reference as a confinement violation and forbid lifecycle prompts from touching it — loses
the durable cross-slug context that justified memory in the first place. (c) Auto-create the
OpenCode scaffold when memory is missing — violates the "no `.pi`-only adopter is forced to
carry `.opencode`" portability goal and the lazy-creation discipline. Chosen the optional
two-surface design with `/init` as the sole scaffold establisher and `/verify` as the sole
pre-fingerprint appender.
