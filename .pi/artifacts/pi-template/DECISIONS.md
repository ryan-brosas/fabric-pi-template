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
**Status:** accepted (superseded in part by ADR-016 — project-memory location and the `/init` context surface)
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
authority, ambient only. This supersedes ADR-001's advisor+gate half. (Superseded in part by ADR-011, which embeds tier-gated read-only review children at the `/create`/`/plan`/`/ship`/`/verify` boundaries — reversing this ADR's no-consultation clause and rejected alternative (b); the single supervisor, no mailbox panel, and no standalone `/gate` remain. Superseded in part by ADR-012, which extends the supervisor from reactive-only to reactive + boundary-proactive via an explicit blocking handshake at the `/create`/`/plan`/`/research`/`/ship` boundaries with Main-mediated read-only research — reversing this ADR's "steers ONLY on drift" clause; the ABSOLUTE never-dispatches, single supervisor, no mailbox panel, and no standalone `/gate` remain.)
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

## ADR-010: Adopt native prewalk via explicit Fabric trajectory handoff
**Status:** accepted
**Date:** 2026-07-22
**Context:** pi-fabric 0.23.0 (commit `ed08a16`, "feat(agents): add trajectory handoff and
prewalk") introduced two native prewalk primitives: explicit `agents.handoff()` and automatic
`/fabric prewalk`. Both require `fullCodeMode:true` because the atomic unit is a `fabric_exec`
invocation (`commands/fabric.js:226-231`). The prior prewalk design — a project-local synthetic
`prewalk` provider routing GPT→Makora within one AgentSession, premised on "0.22.4 has no native
prewalk" — is now redundant. The automatic `/fabric prewalk` path is incompatible with ADR-009:
`FabricPrewalkConfig = { model?: string }` only (`config.d.ts:37-39`), and it builds handoff args
`{model, name, task?}` with no `extensions`/`tools` (`handoff.js:29-33`), so `manager.spawn`
resolves `extensions = request.extensions ?? config.extensions` (`manager.js:347`) → inherits
`subagents.extensions:false` → Makora fails to resolve (the exact ADR-003/009 failure), and tools
inherit the read-only `defaultTools` (no `edit`/`write`). Automatic prewalk would force a global
reversal of ADR-009; rejected.
**Decision:** Flip `.pi/fabric.json` `fullCodeMode:false → true`. This is isolated to Main:
children and the supervisor use their own allowed tools directly (`configuration.md:167`), so
ADR-009 read-only children and the direct Makora `agents.run` lane are unaffected. Use explicit
`agents.handoff({model:"makora/zai-org/GLM-5.2-NVFP4", extensions:true,
tools:["read","grep","find","ls","edit","write"], thinking:"max"})` inside a `fabric_exec`
program. `runRequest` forwards `extensions`/`tools`/`thinking` from args when supplied
(`agents-provider.js:517,536`), so the Makora executor gets `extensions:true` + the exact writable
allowlist + `thinking:"max"` per call — ADR-009's per-call discipline preserved unchanged. The
handoff is trajectory-preserving: Fabric forks the finalized `fabric_exec` call/result and spawns
the executor from that branch; the source session is not switched or historically rewritten
(`docs/agents.md:50-69`). The prewalk lane shares the one blocking-writable-run ceiling with the
direct Makora lane; the two never overlap and never silently fall back; a handoff failure is
terminal for that invocation (`docs/agents.md:94`). Selective routing: prewalk handoff for
novel/multi-file M–L implementation; direct Makora `agents.run` for S/single-file mechanical work.
`prewalk.model` is left unset (`prewalk:{}`) because explicit handoff carries the model per call.
**Consequences:** Easier: no custom router code to maintain; the native trajectory fork is faithful
to "warm session inheritance" without a synthetic provider; ADR-009 safety posture fully preserved;
the direct Makora lane still works unchanged. Harder: Main's operating model changes — Main authors
`fabric_exec` programs for file work, and Pi core tools move behind `pi.*` inside `fabric_exec`
(`configuration.md:143-149`). Native prewalk is coarser than Stencil/OMP: the first successful
mutation marks the outer `fabric_exec` invocation, but remaining calls in that program still run
before the executor starts; Fabric disclaims benchmark equivalence (`docs/agents.md:73`). There is
no TODO gate (simpler than the superseded design's 5–9 item gate); the executor receives the forked
frontier trajectory, so Main must not put secrets into a prewalk `fabric_exec` program
(`docs/architecture.md:66`).
**Alternatives:** (a) Automatic `/fabric prewalk` — rejected; inherits `subagents.extensions:false`
+ read-only `defaultTools` → Makora can't resolve or edit, the exact ADR-009 clash, and would
require a global reversal of ADR-009. (b) The superseded synthetic-router extension (a project-local
`prewalk` provider with a `prewalk_todo` gate, dynamic `promptGuidelines`, fail-closed
`auth.resolve()`, and a parent-side log validator) — correct for the 0.22.4 gap but now redundant;
0.23.0 ships the native primitive and the explicit-handoff path preserves ADR-009 per-call without
custom code. (c) Leave `fullCodeMode:false` and ship without a prewalk lane — leaves the native
primitive present-but-locked; rejected in favor of unlocking it under ADR-009. Chosen the explicit
handoff: native, trajectory-preserving, ADR-009-safe, no custom code.

## ADR-011: Tier-gated lifecycle review gates
**Status:** accepted
**Date:** 2026-07-22
**Context:** ADR-008 dropped the dormant advisor panel and the standalone `/gate`, keeping only an
ad-hoc read-only `review` child escape hatch: "if a change genuinely needs a security or
architecture specialist review, the operator dispatches a read-only `explore`/`review` child ad
hoc." That escape hatch is exactly the easy-to-forget, rarely-invoked machinery ADR-008 criticized
`/gate` for being. The four lifecycle prompts (`/create`, `/plan`, `/ship`, `/verify`) had no
systematic judgment layer over artifacts, diffs, or evidence — `/create`/`/plan` dispatch
read-only children only for research, `/ship` commits before its Standard/Iterative scored review,
and `/verify` runs mechanical gates with no evidence judgment. ADR-008 also explicitly rejected
embedding gate mechanics into `/ship`/`/verify` (its alternative (b)).
**Decision:** Partially supersede ADR-008. Embed a tier-gated read-only `review` child gate at all
four lifecycle boundaries (`/create` Phase 10A spec review, `/plan` Phase 8A planning review,
`/ship` Tier-Gated Diff Review, `/verify` Phase 5A advisory evidence review). This reverses
ADR-008's no-consultation clause and its rejected alternative (b). ADR-008's other decisions are
preserved: the single ambient supervisor, no mailbox panel, no standalone `/gate`. Review remains
a read-only child — no new lane, no new model tier, no capability widening (`extensions:false`,
`read,grep,find,ls`, non-recursive, no `bash`).
**Effective Review Level:** `max(stored Discovery Level, stored Effective Review Level, current
risk floor)`. `/create` persists both numeric levels because `/plan` is optional; missing/malformed
data never defaults to L0. Risk floor >= L2 for authentication, secrets/PII, destructive actions,
schema/persistence, concurrency, public APIs, new dependencies, cross-subsystem work. L0-1 review
is advisory and non-blocking; L2-3 requires a completed current-byte review and disposition of
every Critical/High finding. `/verify`'s advisor is always advisory.
**Dispatch (exact):** `agents.run({task, name:"lifecycle-review-<phase>", runner:"pi",
model:"openai-codex/gpt-5.6-sol", thinking:"max", extensions:false, recursive:false,
tools:["read","grep","find","ls"], worktree:false})`. Only `status === "completed"` is a completed
review; there is no role field on `agents.run`, so the focused role is encoded in the task text.
**Packet:** the read-only child cannot run `git diff` or verification, so Main supplies an inline
sanitized in-memory packet (diff, hashes, commands/exit codes/modes, versions, source excerpts,
effective level, path allowlist excluding secrets). Do not silently truncate; split by disjoint
subsystem when large.
**Finding authority:** children return `[Critical|High|Medium|Low][category] path:line` + violated
authority + concrete failure scenario and cost + smallest correction + confidence + evidence
status only. A child never blocks by its own authority. Main reopens every cited `path:line`
(Worker Distrust) and only Main's validated disposition blocks or proceeds. A clean review never
certifies readiness. Critical/High independently validated defects block at every level.
**Objective Generated-Code Quality:** report only concrete costs — untraceable scope, duplicate
implementations with divergence risk, dead/unwired code, speculative abstractions, behaviorless
wrappers, placeholder/no-op behavior, invented/version-incompatible APIs, error swallowing,
mock-only tests, unnecessary compatibility shims, large unrelated generated edits. "Looks
AI-generated" alone is not a finding.
**Language and Framework Overlay:** establish exact framework/version from the packet, then apply
an authoritative rule (official material > maintained source > maintainer guidance > local skills >
model memory — never). At L2-3, `source-check-required` stops acceptance until Main obtains
authoritative evidence directly (Main-mediated research, ADR-013) and the review is rerun. Do not invent a best
practice from memory.
**Freshness:** any candidate-byte change invalidates an L2-3 review and requires a new
packet/review. Accepted findings trigger bounded convergence (max two review-integration rounds,
then escalate). `/verify` runs its advisor after coherence, before candidate evidence writes and a
fresh final no-write pass (5A→5B→5C→5D); ADR-006 no-write is preserved.
**Failure behavior:** L0-1 child failure warns and proceeds; L2-3 retries once then stops for
operator disposition; `/verify` child failure is advisory only; `source-check-required` halts L2-3
acceptance; candidate mutation invalidates; two rounds without convergence escalate.
**Consequences:** Easier: ADR-008's escape hatch is systematic, not forgotten; evidence-backed
judgment at every boundary catches what mechanical gates miss. Harder: a read-only child
round-trip at L2-3 before `/ship`/`/verify` adds latency (L0-1 stays non-blocking); the in-memory
packet contract is load-bearing — Main must supply it, or the reviewer audits current files, not
the final diff/evidence.
**Alternatives:** (a) Keep ADR-008's ad-hoc-only escape hatch — the easy-to-forget failure mode it
itself criticized. (b) Restore the dormant mailbox advisor panel + standalone `/gate` — ADR-008
rejected this; preserved. (c) A fixed review perspective matrix run every cycle — rejected: review
runs at every invocation but is evidence-based and tier-gated, not a fixed matrix. Chosen the
tier-gated read-only child at the boundaries, superseding ADR-008's no-consultation clause only.

## ADR-012: Proactive supervisor boundary handshake

**Status:** accepted · **Date:** 2026-07-22

**Context:** ADR-008's supervisor is reactive-only — it steers Main ONLY on observed material drift,
blockers, or missing verification, and it never reaches out for its own context. A senior engineer
who only reacts to drift, and who cannot scout, is weaker than the role implies: the lifecycle's
biggest decisions (what to build, how) get no ambient senior review until something breaks. The
supervisor is `extensions:false`, so it cannot spawn (`pi-fabric 0.23.0 docs/agents.md:214`), and
`delivery:"steer"` auto-delivers `action:"message"` responses before `agents.ask` resolves
(`manager.js:734-758`), so direct protocol replies need a silent-response discipline.

**Decision:** Partially supersede ADR-008's "steers ONLY on drift" clause (narrower than ADR-011's
supersession). Extend the supervisor from reactive-only to reactive + boundary-proactive via an
**explicit blocking handshake** in each of `/create`, `/plan`, `/research`, `/ship` (Phase 10B, 8B,
5, 6A — after the phase's writes/review/close settle and before Output). `/verify` gets NO handshake
(the supervisor is opener-only; verify remains closer + sole terminal-verified authority per
ADR-006). At each boundary the supervisor steers DIRECTION/STRATEGY (prior art, cross-slug redundancy,
superseded decisions, gold-plating, a better path) as the **OPENER** for the next phase, leaving the
ADR-011 review gate as the **CLOSER** that audits the just-finished artifact (past vs future object
split — no overlap).

Research is **Main-mediated** via a two-round blocking handshake on the `proactive-supervisor/v1`
protocol: the supervisor is `extensions:false` and cannot spawn, so it *requests* read-only research;
Main (which is `fullCodeMode:true`) runs ONE `agents.run` on `openai-codex/gpt-5.4-mini` (read-only,
`extensions:false`, `recursive:false`, `read/grep/find/ls`, `worktree:false`), synthesizes a summary
at most 8 KiB (non-secret, with source paths), and feeds it back via a second `agents.ask`. The
supervisor then emits its final direction. Direct protocol responses MUST use `action:"silent"` with
payload in `data` — `action:"message"` is auto-delivered before `ask` resolves and is reserved for
ambient reactive steering only.

ADR-008's other decisions are **preserved unchanged**: the **ABSOLUTE** never-dispatches (not "never
dispatches writable" — the supervisor never dispatches anything; it requests, Main spawns), never
edits, never integrates, never mutates lifecycle state, never certifies readiness, never self-stops;
the single ambient supervisor; no mailbox panel; no standalone `/gate`; `extensions:false` read-only
posture; per-session actor scope; Main sole integrator. The supervisor actor *configuration* is
unchanged (same model/tools/events/responseMode/scope); only the instructions and the lifecycle
prompt phases change. ADR-011 review gates are independent and unchanged.

**Authority:** Advisory always. The supervisor never blocks by its own authority; Main independently
validates every steer (Worker Distrust) and may proceed past it. Independently validated Critical/High
defects and binding-authority (ADR/AGENTS) violations retain their **existing** blocking semantics
under Main — not because the actor declared itself blocking. No mid-writable-run injection: the
handshake fires between phases only. Research candidates derive from namespace state (absent→create,
established→plan/ship, partial→[]+operator-recovery).

**Consequences:** Easier: the supervisor becomes a proactive senior engineer that scouts for
direction before lifecycle transitions, using cheap mini research while staying read-only and
unable to dispatch. Harder: the V2 run model burns `gpt-5.6-sol` thinking-max on every
`agent_settled` wake (accepted cost for steering quality); the Main-mediated round-trip is one extra
hop; boundary mis-detection is eliminated by the explicit handshake (V1 had relied on unreliable
ambient inference). The `supervise.md` stale pi-fabric 0.22.4 field matrix remains a separate
NOTICED BUT NOT TOUCHING defect.

**Alternatives:** (a) Best-effort ambient inference from `agent_settled` snapshots — rejected:
`agent_settled` is a bounded snapshot with no lifecycle-boundary marker; the closer-then-opener
ordering could not be guaranteed. (b) Flip the supervisor to `extensions:true` so it spawns directly
— rejected: it opts the actor into `fabric_exec` + `mesh.*` + recursive children, a massive capability
widening that breaks the read-only safety posture. (c) Make the supervisor a blocking gate at
boundaries — rejected: it would turn the supervisor into a second lifecycle gate and edge toward the
ADR-008 advisor panel; ADR-011 review gates own blocking at L2-3. Chosen the explicit handshake with
Main-mediated read-only research, superseding ADR-008's "steers ONLY on drift" clause only.

## ADR-013: Main-mediated MCP research lane

**Status:** accepted · **Date:** 2026-07-23

**Context:** The read-only research lane (the supervisor's Main-mediated `gpt-5.4-mini` gather in
ADR-012, plus the `/create`/`/plan`/`/research` gather phases) needed current documentation and web
search. The original design (committed in `2c0dad9`, `1a6b9c0`, `7201882`) extended the
`extensions:false` children's `tools` allowlist with four MCP names — `context7` `resolve-library-id`+
`query-docs` and `exa` `web_search_exa`+`web_fetch_exa` — on the premise that "MCP loads under
`extensions:false` via the MCP config because `--no-extensions` only blocks extension discovery, not
MCP." Exact-version source inspection disproved this premise:

- `pi-mcp-adapter` (which exposes `context7`/`exa` to Pi as MCP direct tools) declares itself a Pi
  extension in its `package.json` `pi.extensions` (`package.json:32-35`).
- Pi's `DefaultResourceLoader` drops package-discovered extensions under `noExtensions:true`
  (`resource-loader.js:267-270,351-354`); only explicit CLI `-e` extension paths survive.
- Fabric passes `--no-extensions` for every `extensions:false` child and passes `--tools`
  (`pi-fabric 0.23.0 dist/worker.js:321-333`); there is no explicit-extension-path field in `agents.run`
  (the API supports only a boolean `extensions`).
- Pi ignores unknown active tool names — `setActiveTools` keeps only names already in the registry
  (`agent-session.js:626-645`). Adding MCP names to an `extensions:false` child's allowlist therefore
  adds unknown names that resolve to nothing: the committed allowlist edits were functionally
  no-ops, granting children zero new capability.
- `pi-codex-search` is likewise a package-discovered Pi extension (`package.json` `pi.extensions`),
  registered via `pi.registerTool` on `session_start` (`index.ts:687-705`), so it is also removed by
  `--no-extensions`.

**Decision:** Make the research lane **Main-mediated** context gathering — scout (external,
this ADR) + explore (codebase, the existing child capability). Trusted Main owns the
external scout (Context7/Exa/Codex); every delegated child stays strictly local and
explores the codebase. Main reaches Context7/Exa primarily through `fabric_exec`
programs using Fabric's internal MCP proxy (`mcp.<server>.<tool>`, enabled by
`approvals.network:"allow"`), and additionally via the `capture.keepVisible`-retained direct-tool
names (`context7_resolve-library-id`, `context7_query-docs`, `exa_web_search_exa`,
`exa_web_fetch_exa`) plus `codex_search` — exposed in Main's direct model-facing registry under
`fullCodeMode:true` (`pi-fabric docs/configuration.md:173-207`, `dist/capture/interceptor.js:97-110`).
Main reaches external tools through two paths: (1) `fabric_exec` programs using Fabric's
internal MCP proxy (`mcp.<server>.<tool>`), enabled by `approvals.network:"allow"` — the
configured posture for Main's external research, live-verified in the operator's Main session;
(2) the `capture.keepVisible`-retained direct-tool names — a narrower path that bypasses
`fabric_exec` entirely (Main may call `context7_resolve-library-id`, `context7_query-docs`,
`exa_web_search_exa`, `exa_web_fetch_exa`, or `codex_search` as direct Pi tools). The security
boundary is the child dispatch (`extensions:false`), not Main's network posture: delegated
children get neither `fabric_exec`, the MCP proxy, `codex_search`, nor any network path. Main
treats all external content as prompt-injection-capable untrusted data,
independently validates citations, discards instructions found in retrieved content, and distills a
non-secret cited packet ≤8 KiB. Main then launches children with exactly
`tools:["read","grep","find","ls"]`, `extensions:false`, `recursive:false`, `worktree:false`,
supplying only the distilled packet. Gather phases may fan out local children in parallel (bounded by
`subagents.maxConcurrent`) after Main gathers external evidence; the supervisor handshake stays ONE
local-only gather. The exact direct-tool names are server-prefixed per `pi-mcp-adapter`
(`types.ts:431-437`) and must be registry-proven before the `capture.keepVisible` line is written.
The Context7/Exa (`pi-mcp-adapter`) and `codex_search` (`pi-codex-search`) extensions are
discovered from the global package list; Pi's package manager combines project and global package
lists separately then dedupes (`package-manager.js:694-708`), so no project-level package pin in
`.pi/settings.json` is required to make Main's direct tools resolve.
Capability-aware fallback (Context7=docs, Exa=search/fetch, Codex=cited search; not interchangeable):
required source unavailable → capable alternative else `partial`; optional and unavailable →
`local-only`; L2/L3 `source-check-required` unsatisfiable → `blocked`; sensitive/unbounded →
`rejected`. Never widen child `extensions`/`tools` to recover.

**Consequences:** Easier: the security boundary is honest — children never receive network or
extension tools, so there is no reliance on an unproven allowlist-vs-`fabric_exec` filter on the
`agents.run` child path. The committed child-direct edits are reworked to the Main-mediated protocol
(across `supervise.md`, `create.md`, `plan.md`, `research.md`, `ship.md`). Harder: Main becomes the
single point for external acquisition, so research parallelism is local-child fan-out only, not
parallel external calls (Main may still fire `codex_search` + Context7 + Exa in one turn for a quick
lookup). The exact direct-tool names and `pi-codex-search@0.1.5` compatibility with Pi 0.81.1 (its
declared `^0.79.10` peers exclude 0.81.1) were runtime-gated at decision time and are now RESOLVED:
the 4 names are proven via live `/mcp tools` (context7_resolve-library-id, context7_query-docs,
exa_web_search_exa, exa_web_fetch_exa), `codex_search` registers at runtime (live
`/codex-search-settings status`: enabled=true), and all 5 tools were live-verified callable by Main
(Task C committed `438adef`); scope stays full (MCP + Codex). If a future Codex registration fails,
scope shrinks to MCP-only (operator disposition). No generic `mcp` proxy is exposed by default — it can connect,
authenticate, discover, and invoke arbitrary configured MCP servers (`pi-mcp-adapter index.ts:254-
271`) and is broader than this feature; exposing it would require a separate explicit operator
acceptance and ADR.

**Authority:** Main's external-research authority spans `fabric_exec`'s internal MCP proxy
(with `approvals.network:"allow"`) plus the `keepVisible`-retained direct tools; Main is trusted.
Children retain no network/extension authority — the `extensions:false` dispatch is the enforced
boundary. "Local-only child" is
capability policy, not secret isolation — the configured model provider can still receive repository
data sent in a prompt; Main's ≤8 KiB non-secret cited-packet discipline bounds what enters a child.

**Alternatives:** (a) Child-direct MCP (the original design) — rejected: invalidated by the exact-
version evidence above; the allowlist edits were no-ops. (b) Flip children to `extensions:true` so
`codex_search`/MCP load — rejected: this also registers `fabric_exec` and grants `pi.bash`/`pi.write`/
`agents.*`; safety would hinge on the `--tools` allowlist filtering `fabric_exec` on the `agents.run`
child path, which is not runtime-proven, and a wrong assumption is a real ADR-008/009 boundary breach
with high blast radius. (c) Expose the generic `mcp` proxy via `capture.keepVisible` — rejected for the
primary plan: it is broader than this feature; only exact direct-tool names are exposed.

## ADR-014: Away sandbox runtime

**Status:** accepted · **Date:** 2026-07-23

**Context:** Unattended (no operator present) execution of model-generated `node-process` Fabric
guests and candidate verification needs real OS confinement. `node-process` is explicitly not a
security sandbox (`docs/configuration.md:10-12`): `agent:allow` plus caller-selectable child tools let
generated code spawn a shell-capable child (`dist/subagents/manager.js:824-828`), and
`PI_FABRIC_GRANTED_RISKS` grants broad risk classes with no per-run override
(`dist/core/approval-controller.js:1-22`, `dist/config.js:374-395`). So `node-process` cannot be the
boundary. The question is how to keep the trusted Pi RPC host, the provider credential, and the real
ledger/Git/GitHub loop OUTSIDE the sandbox, confining ONLY the generated node-process guest.

**Decision:** Add a host-pinned bubblewrap confinement runtime under `.pi/away-runtime/` (ADR-014).
Keep Fabric `node-process` as the executor but pin per-lane `process.execPath` to a trusted outer
wrapper (`executor-wrapper.mjs`). The wrapper validates the exact Fabric argv and the child-source
value digest, then launches the untrusted inner guest (`inner-guest.mjs`) inside strict bubblewrap.
Credentials and provider auth stay in the trusted parent; only generated node-process code is
sandboxed.

- **Writable-`process.execPath` seam (version-coupled, A2-proven, D3-reconfirmed on 0.24.3).** Fabric 0.24.3's
  `NodeProcessRuntime` unconditionally spawns `spawn(process.execPath, ['--max-old-space-size=<mb>',
  '--input-type=module', '--eval', NODE_PROCESS_CHILD_SOURCE], {stdio:['ignore','ignore','ignore',
  'ipc']})` (`node-process-runtime.js:29`). There is NO config field to pin a wrapper — the runtime
  class is a hard dependency and the only knob is `executor.runtime`. But `process.execPath` is
  writable+configurable on Node 24, so the launcher reassigns it to the trusted wrapper before Fabric
  boots. The wrapper is the script node runs (shebang `#!/usr/bin/env node`); Fabric's argv becomes
  `process.argv.slice(2)` and node never evals the child-source. The reassignment is host-owned, runs
  before untrusted code, and the model cannot influence it.
- **Child-source digest pin = the VALUE, not the file.** Fabric passes `NODE_PROCESS_CHILD_SOURCE`
  (the imported value, sha256 `ee0bb190d5af47ff6ee99a0dd5874889b44b0857db23b897b4c57c88956793fb`,
  2838 chars) via `--eval`, not the `.js` source file. The wrapper validates `sha256(argv[3])` against
  this value; a pi-fabric reinstall changes the value, the drift guard fails, and the pin is re-cut.
  This digest is frozen to the child-source VALUE; it is byte-identical across pi-fabric 0.23.0→0.24.3
  (D3-reconfirmed), so the pin couples to the digest, not the version number.
- **Strict bubblewrap (A1/A3-proven).** `--unshare-user` STRICT, never the fail-open
  `--unshare-user-try`; PID/mount/IPC/UTS/net namespaces; `--die-with-parent`; minimal binding (node
  binary + ldd-resolved libs + ld-linux + inner-guest.mjs + `/proc` + `/dev` + `/tmp` only — no full
  rootfs, no `/etc`, no host home, no repo, no credentials); `--clearenv` (sandbox env = {PATH, LANG}).
  The credential at `~/.pi/agent/auth.json` lives under `/home/ryan/.pi/`, which is not bound, so it is
  ENOENT from the sandbox. Non-scout lanes have no network; the external-scout lane has network but no
  filesystem and no credential env. The wrapper filters every host-call by effective ref
  (`fabric.$call` → `args.ref`) against the lane's allowlisted `away_*` refs, enforces frame
  discipline, and fsyncs a terminal attestation before forwarding the result.
- **Cgroup-v2 systemd delegation (A3-proven).** `systemd-run --user --wait --pipe --collect -p
  TasksMax=/MemoryMax=/CPUWeight=` service mode enforces PID/memory/CPU; `--scope` is unsuitable for
  long-running children. cgroup2fs; delegated subtree `user@1000.service`;
  `DelegateControllers=cpu memory pids`. Storage and file-count are quota-backed.
- **Controller-derived profiles.** The controller (Main, or a Main-derived launcher) derives the lane
  profile from trusted phase/state; the model never chooses model IDs, tools, cwd, env, binaries, args,
  or risk grants, and never dispatches raw `agents.*`.
- **Immutable startup closure.** The wrapper, inner guest, lane extension, config, and pinned
  Pi/Fabric/provider/Node/bwrap source and command catalog are hash-pinned and rechecked before launch,
  after restart, and before accepting a result.

**Consequences — block conditions.** Missing wrapper attestation, strict userns, cgroup support, or
closure hash each block execution: no weaker fallback wrapper, no fail-open userns variant, no
fabricated success. Easier: the security boundary is a real OS sandbox, so safety does not depend on a
`node-process` allowlist. Harder: the runtime is version-coupled to the child-source VALUE digest
(`ee0bb190...`, byte-identical across pi-fabric 0.23.0→0.24.3, D3-reconfirmed) and the
writable-execPath seam; a Fabric upgrade that changes the digest requires re-cutting the pin. The
runtime is opt-in per away lane; normal interactive sessions keep their existing config
and are unaffected.

**Authority — invariants preserved separately.**
- **Real OS sandbox, not `node-process` as the boundary.** Confinement is strict bubblewrap; the
  executor stays `node-process` behind a pinned wrapper.
- **Host-controlled lanes, no model dispatch.** The controller is Main (or a Main-derived launcher);
  the model never dispatches raw `agents.*` or selects capabilities.
- **Default-deny closure.** The closure is default-deny; only allowlisted `away_*` refs reach the host.
- **Human-only merge.** The sandbox never commits, merges, or pushes; it stages to reserved files and
  attests; Main and the operator retain merge authority.
- **Main sole integrator.** Main remains the sole scheduler, integrator, and commit authority.
- **`/verify` authority + freshness.** The verifier reuses the launcher with a distinct profile (exact
  remote OID checkout, source+deps read-only, no network, no credentials, broker-controlled exact argv
  from command IDs); a stale PASS is invalidated by any change.
- **No destructive cleanup, no normal-session widening.** The sandbox does no destructive cleanup;
  this is an opt-in away lane, not a widening of normal sessions. Provider credentials and the trusted
  Pi RPC host stay in the parent; only generated node-process code is sandboxed.

**Pi-native closure (ADR-016 relationship).** The startup closure contains no `.opencode` path
— all closure inputs (manifest, wrapper, inner guest, lane extension, config, pinned source) resolve
under `.pi/` or host paths, so a copied `.pi` runtime operates with `.opencode` absent (verified by
`confinement.test.ts`). The manifest `protected_paths` cover the init packet (managed `AGENTS.md`
boilerplate region + five `.pi/{ROADMAP,user,tech-stack,state,memory}.md` context files) from
autonomous mutation, added by ADR-016's P7.1; `.opencode/command/**` remains protected as source.
This does not change ADR-014's independent confinement authority; it records the relationship to
ADR-016's Pi-native init packet.

**Implemented extension.** ADR-015 (autonomous-away-loop) adds the tested ledger/Git/GitHub
crash-replay loop on top of this confinement foundation without widening sandbox authority.

**Alternatives:** (a) `node-process` as the boundary — rejected: it is not a sandbox; shell-capable
children and broad risk grants. (b) Fail-open `--unshare-user-try` — rejected: userns failure would
run unconfined. (c) Pin a wrapper via Fabric config — rejected: no such field exists in 0.23.0 or 0.24.3; the
writable-execPath seam is the only mechanism and it is host-owned and pre-boot. (d) Pass credentials
into the sandbox env — rejected: an exfiltration channel; credentials stay in the parent.

## ADR-015: Autonomous away loop

**Status:** accepted · **Date:** 2026-07-25

**Context:** ADR-014 established strict confinement for one generated-code lane and exact-OID
verification, but intentionally stopped before unattended orchestration. A crash between host commit,
push, verification evidence, or draft-PR creation could otherwise duplicate or lose an external
effect. Roadmap prose and model claims are not durable effect authority, while putting credentials,
Git, GitHub, or the journal inside the sandbox would defeat ADR-014.

**Decision:** Add an explicitly invoked, single-repository, one-card host controller on top of
ADR-014.

- The trusted host validates the ready packet and immutable closure, acquires one repository `flock`,
  deterministically selects the lowest eligible stable roadmap card, and fsyncs a reservation before
  workspace or lifecycle mutation. Supplemental objective text can narrow work but cannot select a
  different card.
- External effects use the append-only, checksum-framed `away-loop-ledger/1` journal outside the
  repository. Its legal chain is `reserved` → `workspace_observed` → `candidate_observed` →
  `commit_observed` → `verified` → `push_intent` → `push_observed` → `pr_intent` → `pr_observed` →
  `completed`, with terminal `blocked`/`aborted`. Exact duplicate records are no-ops; conflicting
  evidence, earlier corruption, or cap exhaustion blocks. Torn final bytes are retained, never
  truncated.
- Lifecycle authority remains the four slug artifacts: `/create` alone establishes the namespace,
  `/ship` cannot claim completion, and `/verify` alone declares terminal verification for the exact
  clean candidate OID. The ledger records external observations, not lifecycle state.
- Generated code remains credential-free and Git-free. It sees only its controller-derived ADR-014
  lane and `away_*` bridge. The host validates exact staged paths/hashes, creates or observes one
  dedicated `pi-away/rm-NNN-<run>` commit with local-ref compare-and-swap, verifies that OID in the
  strict verifier, then publishes only that dedicated branch.
- Before every ambiguous mutation the host queries authoritative state. Push reconciliation compares
  the exact remote ref; GitHub reconciliation queries exact head/base, creates at most one draft pull
  request through pinned REST headers, and queries again after ambiguous success. Completion rechecks
  verification receipt freshness, commit OID, remote OID, and one exact draft PR.
- Scope is one host and one repository invocation. Merge, default-branch update, force-push, branch or
  evidence deletion, roadmap mutation, recurring scheduling, and automatic cleanup remain forbidden.
  Retained workspaces, ledger segments, refs, receipts, and PR evidence are audit material.

**Consequences:** Restart can converge after every durable cut point without blindly replaying a push
or POST, and auditors can bind roadmap provenance to candidate, verification, remote ref, and draft PR.
The cost is retained evidence growth, strict single-host locking, version-coupled confinement, and
fail-closed operation when any local or remote observation is partial, stale, divergent, or ambiguous.
Human merge authority and Main's normal interactive integrator role remain unchanged.

**Evidence:** `ledger.test.ts`, `controller.test.ts`, `git-broker.test.ts`,
`github-broker.test.ts`, and `replay.test.ts` cover each boundary. `integration.test.ts` runs the real
launcher/wrapper/firewall/staging/verifier path with a local bare Git remote, a protocol-faithful
GitHub service, injected post-push/post-PR crashes, protected-path hashes, and unchanged local/remote
`main`.

**Alternatives:** (a) Store state in roadmap or lifecycle prose — rejected: not an external-effect
journal and unsafe under crash replay. (b) Let the model commit/push/call GitHub — rejected: exposes
credentials and makes arguments/refs model-controlled. (c) Treat request IDs as idempotency keys —
rejected: GitHub request IDs are evidence only. (d) Use SQLite or a daemon — rejected: unnecessary for
the one-shot, one-host scope and adds a new dependency/authority surface. (e) Auto-clean retained
evidence — rejected: destructive and removes recovery/audit material.

## ADR-016: Pi-native initialization packet and `/init` as the mandatory first lifecycle touch

**Status:** accepted · **Date:** 2026-07-23

**Context:** ADR-007 formalized two writable surfaces but located project memory at
`.opencode/artifacts/MEMORY.md` and the context surface under `.opencode/`, outside the portable
`.pi/` tree. A `.pi`-only adopter could therefore fail on a missing `.opencode` scaffold, and the
away runtime (ADR-014/015) cannot depend on `.opencode`. Separately, `/init` (`.pi/prompts/init.md`)
was a collection of optional setup flags (`--context`/`--user`/`--all`) producing `.opencode/tech-stack.md`
and a capped `AGENTS.md`, with a stale handoff to `/plan` — not a coherent lifecycle opener. There
was no observable readiness contract, no packet gate, and no crash-safe refresh. The canonical
non-goal "no schemas" (PLAN.md) would forbid the machine-readable readiness state needed to make
the packet gate deterministic.

**Decision:** Establish a full Pi-native initialization packet and make `/init` the mandatory first
lifecycle touch. `/init` compiles a complete packet from explicit source (`--from <path[#anchor]>`),
repository discovery, and operator interview; `/init --refresh` reconciles an established packet.

(1) **Packet (six files).** `AGENTS.md` (binding rules) + `.pi/tech-stack.md` (generated facts) +
`.pi/ROADMAP.md` (intent cards) + `.pi/state.md` (readiness sentinel) + `.pi/user.md` (operator-approved
preferences) + `.pi/memory.md` (distilled durable knowledge). All six live inside the portable `.pi/`
tree except `AGENTS.md` at the repo root. A complete packet is REQUIRED before any lifecycle command
(`/create`, `/plan`, `/ship`, `/verify`, `/research`) or `/gc` may access lifecycle state or project
memory.

(2) **State schema v1.** `.pi/state.md` carries frontmatter: `schema_version: 1`,
`initialization_status: partial|ready`, `context_reload_required: true|false`, `generation_id`,
`updated_at`, `agents_boilerplate_sha256`. `BLOCKED` is a command outcome, not a persisted state.
This is the narrow versioned initialization-state frontmatter that the "no schemas" non-goal must
permit; lifecycle-kernel and schema-validated typed-handoff schemas remain out of scope.

(3) **AGENTS managed region (verbatim everywhere).** `AGENTS.md` carries a managed region bounded by
`<!-- pi:init:boilerplate:start -->` / `<!-- pi:init:boilerplate:end -->` markers. The marker
interior is byte-identical to a locked fixture (`.opencode/artifacts/pi-native-init/boilerplate.md`,
SHA-256 recorded in `.pi/state.md`). `# Agent Rules` + the leading `---` are the fixed file header
(outside markers); `## Repository` (project routing/topology appendix) is placed AFTER the end
marker. `/init --refresh` replaces the marker interior byte-for-byte from the fixture and preserves
the project appendix; conflicts outside managed regions block. The boilerplate includes Rule 0
through Safety and the Note-for-Codex concurrent-agent note, verbatim — no deduplication, weakening,
or conditionalization.

(4) **Crash-safe refresh.** Fresh `/init` writes no state until all other packet files succeed, then
writes `ready` last. `/init --refresh` first previews and revalidates hashes, transitions state
`ready -> partial` BEFORE mutating any other packet file, reconciles serially, and writes final
`ready` last. Any `AGENTS.md` mutation leaves state `partial` + `context_reload_required: true`; only
a post-`/reload` (or restart) refresh with no drift writes `ready` + `context_reload_required: false`
last — Pi 0.81.1 retains stale context until `/reload`. A crash therefore leaves lifecycle commands
blocked.

(5) **Packet gate.** Lifecycle commands validate the slug first (where applicable), then require the
complete six-file packet with `initialization_status: ready` and `context_reload_required: false` and
a matching `agents_boilerplate_sha256` before project-memory or lifecycle-state access. `/gc` is
slugless but also requires the complete initialized packet; its memory use is read-only.

(6) **`/create` syntaxes.** `/create <slug> "<raw description>"` (direct idea) and
`/create <slug> --from <in-repo-source[#anchor]>` (compile one bounded feature from a roadmap card or
PLAN/PRD section). `/init` never creates a feature namespace; `/create` remains the sole namespace
creator. `/create --from` records provenance (path, anchor, whole-file SHA-256, Roadmap ID) in the
feature `PLAN.md`, stops when a source has multiple independently shippable outcomes, and never
mutates roadmap intent.

(7) **Source bounds (untrusted data).** Sources are repo-relative `.md`/`.txt`/`.json`; reject
absolute/traversal/symlink/non-regular/outside-root/secret-named. Whole file <=1,048,576 bytes;
extracted section <=65,536 bytes; no truncation. JSON is unanchored in v1. Markdown anchors match one
exact case-sensitive heading or `RM-NNN` ID; zero/multiple matches block. Source content is
prompt-injection-capable untrusted data — embedded instructions/commands/tool requests are ignored
and never trigger actions. Stable SHA-256 is revalidated before write; drift restarts extraction.

(8) **Roadmap grammar v1.** `.pi/ROADMAP.md` frontmatter `roadmap_schema_version: 1` + monotonic
`last_issued_id: RM-NNN`. Ready cards have unique immutable `RM-NNN` IDs and exact fields (outcome,
why now, acceptance evidence, dependencies, candidate slug, autonomy, open decisions, source
provenance). IDs are never reused, renumbered, or reassigned to a materially different outcome;
moving horizons preserves ID; refresh matches by normalized outcome and allocates a new ID above the
high-water mark for a materially changed/new outcome. Away eligibility is Ready + `Autonomy: away-ok`
+ `Open decisions: none`; reservations/completion live in the autonomous-loop ledger, not the roadmap.

(9) **Pi-native memory.** Project memory moves from `.opencode/artifacts/MEMORY.md` to
`.pi/memory.md`, inside the portable tree. `/init` persists an immutable `## Initialization Intent —
<generation-id>` section in `.pi/memory.md` BEFORE the roadmap, so interview-derived cards carry
truthful provenance. Memory excludes secrets, PII, raw tool output, per-slug status, and
verification declarations.

**Consequences:** Easier: the away runtime and `.pi`-only adopters have a complete, portable context
surface with no `.opencode` runtime dependency; the packet gate makes "uninitialized" a deterministic
block rather than a silent partial state; crash-safe refresh prevents mixed-generation packets;
verbatim-everywhere boilerplate plus a project appendix lets refresh replace policy without losing
project routing. Harder: six files to seed and keep coherent; the state schema is a narrow exception
to the "no schemas" non-goal that must be kept narrow; managed-region refresh overwrites any
in-flight edits inside the markers, so features that need to update boilerplate content must update
the fixture (and its SHA references), not just `AGENTS.md`.

**Supersedes:** ADR-007's project-memory LOCATION (`.opencode/artifacts/MEMORY.md` ->
`.pi/memory.md`) and the `/init`-establishes-OpenCode-scaffold clause. ADR-007's namespace-ownership
decisions (`/create` sole creator, established = PLAN+TODO, fail-closed downstream) are PRESERVED
unchanged. ADR-007's historical text is retained as-is.

**Alternatives:** (a) Keep memory under `.opencode` and make the away runtime depend on `.opencode` —
rejected: violates the no-`.opencode`-runtime-dependency constraint and the `.pi`-portability goal.
(b) Optional packet modes (`--context`/`--user`/`--all`) as in the old `/init` — rejected: a partial
packet makes the gate non-deterministic; the full packet is always produced. (c) No state schema —
rejected: without machine-readable readiness, the packet gate is prompt-enforced and cannot be
crash-safe. Chosen the full Pi-native packet with the narrow versioned state schema and verbatim
managed boilerplate.
