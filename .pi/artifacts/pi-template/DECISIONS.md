# DECISIONS — Pi/Fabric Template (`pi-template`)

Architecture Decision Records. Real trade-offs only; one viable option goes in `PLAN.md`
as a fact, not here. Format: Status / Date / Context / Decision / Consequences /
Alternatives.

## ADR-001: Hybrid per-session advisory council
**Status:** superseded by ADR-008
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

## ADR-008: Single supervisor — drop the advisors and the gate
**Status:** accepted
**Date:** 2026-07-22
**Context:** ADR-001 specified a hybrid council: one ambient supervisor plus mailbox-only
security/architecture advisors invoked at lifecycle gates via a `/gate` prompt. On review
the advisor+gate half was redundant: the advisors were mailbox-only (no host events), so they
could never wake on their own — the only thing that would consult them was `/gate`, which was
never built and, as a standalone operator command, would depend on the operator manually
deciding "this change is security-sensitive" and remembering to invoke it. That is the kind
of easy-to-forget, rarely-used machinery that accumulates as dead weight. The supervisor, by
contrast, runs ambiently (host events + steer delivery) and steers Main on drift with no
invocation — it pays for itself; the advisors did not. The supervisor also cannot substitute
for the gate (it runs `extensions:false` with read-only tools, no `agents.ask`), so the
advisor mailboxes created by `/supervise` were genuinely unused.
**Decision:** Drop the security/architecture advisors and the `/gate` workflow entirely. The
council is now a single persistent supervisor (per-session, `mesh.actorScope:"session"`,
custom instructions, never self-stops). `/supervise` creates/reconciles one actor. There is
no `/gate` prompt and no advisor consultation. The supervisor remains the sole and final steer
authority, ambient only. This supersedes ADR-001's advisor+gate half.
**Consequences:** Easier: one actor to create/reconcile instead of three; no dormant mailboxes;
no never-built gate milestone; no manual-invocation burden; less surface to verify at runtime.
Harder: no specialist-depth consultation at security/architecture boundaries — the supervisor
is a generalist; if a change genuinely needs a security or architecture specialist review, the
operator dispatches a read-only `explore`/`review` child ad hoc rather than relying on a fixed
advisor panel. ADR-005 (session scope), ADR-006 (external verification), and ADR-007 (two
surfaces) are unaffected.
**Alternatives:** (a) Keep the advisors dormant and just never build `/gate` — leaves the
redundant actor-creation overhead in `/supervise` and the stale advisor/gate language in the
authority docs. (b) Embed gate mechanics into `/ship`/`/verify` so advisors are always consulted
— adds cost/noise on every slug and the trigger rules become load-bearing. (c) Keep `/gate` as
a standalone manual command (the original plan) — redundant with `/supervise` in practice and
easy to forget, the exact concern raised. Chosen the single supervisor as the only part that
earns its keep.

## ADR-009: Safe extension defaults and explicit writable dispatch
**Status:** accepted
**Date:** 2026-07-22
**Context:** ADR-003 established the extension split (Makora `extensions:true`, GPT/read-only
`extensions:false`) as a per-call discipline. But `.pi/fabric.json`'s `subagents.extensions`
defaulted to `true`, so every read-only one-shot child (explore/scout/review/plan/debug) inherited
`fabric_exec`/`agents.*`/`mesh.*` unless its dispatch explicitly passed `extensions:false` — a
dispatch that forgot the override silently granted a review child recursive orchestration. The
AGENTS rule "GPT council and read-only children use `extensions:false`" was per-call-dependent and
fragile. Separately, the Makora writable tool allowlist was described ("exact allowlist") but never
concretely pinned, and `bash` inclusion was load-bearing and undecided. Installed pi-fabric 0.22.4
source confirms `extensions` resolves as `recursive ? true : (request.extensions ??
config.extensions)` (`dist/subagents/manager.js:332-337`), so the config default is the fail-safe
floor; a recursive Pi run forces `true` regardless, which is why the canonical Makora dispatch pins
`recursive:false`. The same source confirms there is exactly one shared semaphore from
`config.maxConcurrent` (`manager.js:210-214,300-301`) — no separate writable pool — and `agents.run`
blocks until settlement (`manager.js:457-460`), so the one-writable-run ceiling is Main policy, not
host enforcement.
**Decision:** Pin `subagents.extensions:false` in `.pi/fabric.json` as the safe read-only default;
Makora overrides `extensions:true` explicitly per call. Pin the concrete Makora writable allowlist
to `read`, `grep`, `find`, `ls`, `edit`, `write` — no `bash`. Main runs all verification after the
worker settles; there is no general exact-argv child command runner (`schema.trustedCommands` is
schema-verification machinery only). The canonical Makora `agents.run` dispatch pins
`runner:"pi"`, `model:"makora/zai-org/GLM-5.2-NVFP4"`, `thinking:"max"`, `extensions:true`,
`recursive:false`, `tools:[<pinned allowlist>]`, `worktree:false`. The one-Makora ceiling is enforced
by Main issuing at most one blocking writable `agents.run()` at a time and making no edit or write
call while it is active; `maxConcurrent` bounds total concurrent children across tiers, not the
writable pool. This is operator/prompt policy, not host-enforced — labeled honestly.
**Consequences:** Easier: read-only children cannot accidentally inherit orchestration capability;
the Makora dispatch shape is identical every time and statically checkable; worker capability is
minimal (no shell, no network), strengthening distrust. Harder: a Makora worker cannot self-verify
by running commands — Main must run all verification after settlement, and if an implementation
genuinely needs an intermediate command, Main splits the work into serial worker runs around a
Main-owned command. The one-writable-run ceiling is policy, not a host lock, so a discipline
failure is not caught at the Fabric layer.
**Alternatives:** (a) Keep `extensions:true` default and require every read-only dispatch to pass
`extensions:false` — fragile; one forgotten override grants excess capability, the exact concern.
(b) Include `bash` in the Makora allowlist so the worker self-verifies — wider capability (network,
destructive commands) contradicts the distrust posture; Main-owned verification is stronger.
(c) Add a host-side writable semaphore or atomic single-writer lease to enforce the ceiling —
rejected as clean-slate scope creep; v1 stays operator/prompt policy, honestly labeled. Chosen
the fail-safe default, the pinned non-shell allowlist, and the Main-owned verification discipline.
