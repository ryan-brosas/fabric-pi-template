# Proactive Supervisor — ambient senior engineer with boundary-proactive direction steer

> **Status:** proposed · **ID:** ps-001 · **Created:** 2026-07-22
> **Baseline OID:** `dd0bf9605bb9968b42768a9b5017650f5a6199cd` (HEAD after lifecycle-review-gates shipped + verified)

## Problem Statement

The session-scoped Fabric supervisor (`supervise.md`, ADR-008) is **reactive-only**: it steers Main
*only* on observed material drift, blockers, or missing verification, and it never reaches out for its
own context. It is a senior engineer who only reads what the host event snapshot hands them and only
speaks when something is already going wrong. Two gaps follow:

1. **No proactive direction steer.** The supervisor never steers *strategy* — "before you plan, there
   is prior art in slug X," "this approach contradicts ADR-009," "you are gold-plating." It only
   reacts to drift already in flight. The lifecycle's biggest decisions (what to build, how) get no
   ambient senior review until something breaks.
2. **No independent context.** When the supervisor suspects a problem, it cannot gather evidence —
   it can only act on the bounded event snapshot. A reactive senior engineer who cannot scout is
   weaker than the role implies.

## Relationship to ADR-008 (partial supersession — narrow)

This proposal **partially supersedes ADR-008**. ADR-008's supervisor "steers Main **ONLY** on material
drift, blockers, or missing verification." This feature reverses that **only** clause: the supervisor
additionally steers **proactively at lifecycle boundaries** on direction/strategy, and gains a
**read-only research-request** capability. It is the same supersession shape as ADR-011 (which
superseded ADR-008's no-consultation clause), but narrower.

ADR-008's *other* decisions are **preserved unchanged**:
- **The supervisor never dispatches (absolute, not "never dispatches writable").** This is the
  load-bearing finding: a Pi actor created with `extensions: false` is opted out of Fabric entirely
  and "runs without `fabric_exec`, `agents.*`, or `mesh.*`" (`pi-fabric 0.23.0 docs/agents.md:214`).
  The supervisor is `extensions: false`, so it **cannot spawn `scout`/`explore` itself**. Research is
  therefore **Main-mediated**: the supervisor *requests* read-only research via a directive; Main
  (which is `fullCodeMode:true`) spawns `scout`/`explore` on `gpt-5.4-mini` and feeds results back via
  `agents.ask`. Main stays the sole scheduler and spawner. The "never dispatches" letter is preserved
  absolutely; only the supervisor's *trigger set* and a new *request* behavior change.
- The single ambient supervisor is the only persistent reviewer; no mailbox panel is restored.
- No standalone `/gate` command is introduced.
- The supervisor never edits, integrates, or mutates lifecycle state; never certifies readiness;
  never self-stops; teardown follows `/verify` or operator action.
- Per-session actor scope (`mesh.actorScope: "session"`) is preserved.
- Main remains sole integrator and commit authority; supervisor output is untrusted advice
  (Worker Distrust).

The supersession is recorded as **ADR-012** (ADR-010 = prewalk handoff, ADR-011 = lifecycle review
gates). ADR-008 gets a forward reference noting the partial supersession. The ADR-011 review gates
are **independent of and unchanged by** this feature.

## Chosen design

**Extend the supervisor from reactive-only to reactive + boundary-proactive, add a Main-mediated
read-only research-request capability, and make the boundary signal explicit via a blocking
handshake in each lifecycle prompt.** The supervisor's *actor configuration does not change* — still
`openai-codex/gpt-5.6-sol`, thinking `max`, `extensions: false`, `read/grep/find/ls`,
`responseMode: "directive"`, `delivery: "steer"`, `triggerTurn: true`, per-session. Only the
*instructions* and the *lifecycle prompts* (adding a handshake phase) change.

### Explicit Boundary Handshake (user-approved, replaces best-effort inference)

V1 of this spec relied on the supervisor inferring lifecycle boundaries from the ambient
`agent_settled` snapshot. Research proved this unreliable: `agent_settled` is a bounded snapshot
with no lifecycle-boundary marker (`triggerTurn:true` only wakes idle Main), so the closer-then-opener
ordering could not be guaranteed and an operator could start `/ship` while the supervisor was still
reasoning. The user approved an **explicit blocking handshake**: each of `/create`, `/plan`,
`/research`, and `/ship` adds a phase-complete handshake *after* all writes/review/close settle and
*before* Output, giving the supervisor a reliable boundary signal. `/verify` gets NO handshake — the
supervisor is opener-only; `/verify` remains the closer and sole terminal-verified authority (ADR-006).

### Run model (V2 — accepted cost trade-off)

The supervisor runs ambient on `gpt-5.6-sol` (thinking max) on every `agent_settled`/`tool_error`
wake, even when it stays silent. This is the **highest-cost** option (Sol burns every wake) and was
chosen over a tiered (mini-ambient + escalate-on-steer) model to keep steering quality maximal.
Read-only research spawns run on `openai-codex/gpt-5.4-mini` (cheap, fast), so research itself is
not slow.

### Triggers

- **Reactive (current, kept):** drift from intent, blocker, missing verification — observed on
  `agent_settled`/`tool_error`. Silence remains the default between events.
- **Boundary-proactive (new):** when a lifecycle prompt's explicit handshake fires (after
  `/create`, `/plan`, `/research`, or `/ship` settles), the supervisor proactively scouts broadly
  for **direction/strategy** and steers. It looks for: prior art the spec missed, cross-slug
  redundancy (another slug already shipped this), contradiction of an accepted ADR/decision,
  gold-plating/scope creep, and a materially better path. **No mid-writable-run injection** — the
  handshake fires only after a phase settles, never during a blocking writable run.

### Sequencing vs the ADR-011 review gates (no overlap)

At a lifecycle boundary, two read-only senior voices can now speak. They are kept complementary by
a clean object split:

- **ADR-011 review gate = closer** — audits the *just-finished artifact* (past bytes: correctness,
  scope, regressions, generated-code quality, language/framework best practice).
- **Supervisor = opener** — steers the *next phase's direction* (future strategy: prior art,
  cross-slug drift, superseded decisions, gold-plating, a better path).

Different objects (past vs future), so no overlap and no double-audit of the same bytes. The review
gate runs first (closes the just-finished artifact); the supervisor handshake runs as the opener for
the next phase. The supervisor never performs artifact audit — that is the review gate's exclusive
remit.

### Read-only research — Main-mediated (Fabric-faithful mechanism)

The supervisor **cannot spawn** (`extensions: false` → no `agents.*`, `docs/agents.md:214`).
Research is therefore a **two-round blocking handshake**:

1. **Round 1 — phase-complete:** Main resolves the session-local `supervisor` actor by exact `id`
   (never by canonical name over mesh) and sends a blocking `agents.ask({id, message, data})` with
   `protocol:"proactive-supervisor/v1"`, `kind:"phase-complete"`, a unique `requestId`, the
   completed phase, candidate next phases, namespace state, and an explicit non-secret path
   allowlist.
2. The supervisor responds with `action:"silent"` and `data` containing one of:
   `kind:"no-advice"`, `kind:"direction-steer"` (final advice), or `kind:"research-request"` (asks
   Main to run one read-only mini gather).
3. **If research-request:** Main runs exactly one `agents.run` on `gpt-5.4-mini` (read-only,
   `extensions:false`, `recursive:false`, `read/grep/find/ls`, `worktree:false`), synthesizes a
   summary ≤8 KiB (non-secret, with source paths), and sends round 2.
4. **Round 2 — research-result:** Main sends a second blocking `agents.ask({id, message,
   data:{protocol, kind:"research-result", requestId, status, summary, sources}})`.
5. The supervisor responds with `action:"silent"` and final `direction-steer` or `no-advice` data.
6. Main independently validates the advice (Worker Distrust — fed-back scout output is untrusted
   advice, not evidence) and surfaces accepted advice itself.

**Critical: direct protocol responses MUST use `action:"silent"` with payload in `data`.** With
`delivery:"steer"`, an `action:"message"` response is auto-delivered to Main *before* `agents.ask`
resolves (`manager.js:734-758`), bypassing Main's validation. `action:"message"` is reserved for
ambient reactive steering only. Confidence 0.98 (review finding).

### `agents.ask` / `agents.run` schema (exact, validated against 0.23.0)

- `agents.ask({id, message, data?})` — object form, `additionalProperties:false`, `message` required
  string (`dist/providers/agents-provider.js:217-260`). The earlier `agents.tell(supervisorId,
  results)` positional form is **invalid** and was corrected.
- `agents.ask` resolves reliably even on `{action:"silent"}` (`manager.js:362-399,684-758,709-730`),
  so the blocking handshake returns reliably.
- `agents.run({task, name, runner:"pi", model:"openai-codex/gpt-5.4-mini", thinking:"max",
  extensions:false, recursive:false, tools:["read","grep","find","ls"], worktree:false})` — no role
  field; encode `scout`/`explore` behavior in `task`.

### De-duplication with Main's own research

The supervisor scouts *broadly for direction* (prior art, cross-slug redundancy, superseded
decisions). Main's own `/create`/`/plan` `scout`/`explore` scouts *specifically for implementation*
(the library, the API, the syntax). The supervisor's pre-pass informs Main's narrower research; it
does not duplicate it. If the supervisor's request and Main's planned research would cover the same
ground, Main may merge them and report once.

### Research candidates derive from namespace state

The handshake advertises candidate next phases based on the slug's namespace state (the established
ownership rules):
- **absent namespace** (pre-`/create` `/research`): candidates = `["create"]` (`/plan` and `/ship`
  reject absent namespaces per `plan.md:82-87`, `ship.md:57-62`).
- **established namespace** (both `PLAN.md` AND `TODO.md` exist): candidates = `["plan", "ship"]`
  (`/plan` is optional; `/create`→`/ship` is a documented direct path per `create.md:8-10`).
- **partial namespace**: candidates = `[]` plus operator-recovery context (downstream commands fail
  closed).

Confidence 0.99 (review finding — earlier draft advertised only invalid plan/ship for absent
namespaces).

### Authority

**Advisory always.** The supervisor steers; Main independently validates every steer (Worker
Distrust) and **may proceed past it**. Main remains sole scheduler, integrator, and commit
authority. The supervisor never certifies readiness, never stops itself. A boundary-proactive steer
is advisory, not a gate — it does not block Main from entering the next phase. **However:**
independently validated Critical/High defects and binding-authority (ADR/AGENTS) violations retain
their **existing** blocking semantics under Main — not because the actor self-declares blocking, but
because confirmed safety/authority defects block at every level per canonical authority
(`PLAN.md:221-225`, `DECISIONS.md:337-341`). Main may proceed only after disproving or validly
disposing of such a finding.

### Concurrency / single-writer safety

The handshake fires *between* phases (after a phase settles, before the next starts); reactive
directives fire from `agent_settled` after a run settles. The supervisor therefore never fires
mid-writable-run — Main's single-writer-per-worktree discipline is preserved. Main's research
spawns share `subagents.maxConcurrent` (one FIFO semaphore, `semaphore.js:1-53`, `manager.js:214`) —
read-only research does **not** auto-yield to writable runs (no priority), but since the handshake
fires between phases, contention is naturally avoided. No separate concurrency cap is needed.

### Scope

Per-session actor (`mesh.actorScope: "session"`, preserved) **+ repo file-read**. "Steer the whole
project" means the supervisor reads every `.pi/artifacts/<slug>/`, every ADR, every other
milestone's decisions via `read/grep/find/ls` — *whole project via files*, not cross-session mesh.
Cross-session mesh awareness is out of scope (it would re-open the race ADR-008 closed).

## Scope (In/Out)

### In scope
- Revise `.pi/prompts/supervise.md` `Supervisor Instructions` to add boundary-proactive direction
  steer + the Main-mediated read-only research-request convention (with the silent-response rule);
  document the two-round blocking handshake.
- Add an explicit boundary-handshake phase to `/create`, `/plan`, `/research`, `/ship`:
  - `/create` `## Phase 10B: Supervisor Boundary Handshake` (after Phase 10A, before Phase 11).
  - `/plan` `## Phase 8B: Supervisor Boundary Handshake` (after Phase 8A, before Phase 9).
  - `/research` `### Phase 5: Supervisor Boundary Handshake` (after Phase 4 Document, before Output).
  - `/ship` `## Phase 6A: Supervisor Boundary Handshake` (after Phase 6 Close, before Output).
  - `/verify` gets NO handshake (supervisor is opener-only; verify is closer + sole authority).
- ADR-012 recording the partial supersession of ADR-008's "steers ONLY on drift" clause and the new
  Main-mediated research-request capability; ADR-008 forward reference.
- `AGENTS.md` supervisor paragraph: update "steers ONLY on drift" → reactive + boundary-proactive;
  document the Main-mediated research-request; preserve never-dispatches (absolute) / never-edits /
  `extensions:false` / per-session.
- Canonical `PLAN.md` supervisor contract: opener role, research-request round-trip, sequencing vs
  the ADR-011 review gates.
- `.opencode/tech-stack.md`, `.opencode/roadmap.md`, `.opencode/state.md`: synchronized summaries.

### Out of scope (non-goals)
- Flipping the supervisor to `extensions: true` or giving it direct spawn capability (rejected for
  safety — `docs/agents.md:214`).
- Cross-session mesh awareness (per-session scope preserved; re-opening the ADR-008 race is a
  non-goal).
- Making the supervisor a blocking gate (stays advisory; ADR-011 review gates own blocking).
- Mid-writable-run injection (the handshake fires only between phases).
- Changing the supervisor's actor *configuration* (model/tools/events/responseMode/scope unchanged;
  only the *instructions* and the lifecycle prompt phases change).
- Adding a handshake to `/verify` (supervisor is opener-only; verify remains closer + sole
  terminal-verified authority per ADR-006).
- Sweeping the stale `pi-fabric 0.22.4` version reference and mutable/immutable field matrix in
  `supervise.md:29,40-42` (prewalk-residual, NOTICED BUT NOT TOUCHING — does not block this feature;
  the supervisor's actor config is unchanged, so the matrix is not load-bearing here).
- Changes to `.pi/fabric.json`, `.pi/settings.json`, `.opencode/command/*.md` source bodies, the
  ADR-011 review gates, or historical milestone artifacts.

## Sequencing (no blockers)

`lifecycle-review-gates` is shipped + verified + pushed (HEAD `dd0bf96`); ADR-011 present at
`DECISIONS.md:304`. This feature takes **ADR-012** (next available). Shared files
(`supervise.md`, `AGENTS.md`, `DECISIONS.md`, `PLAN.md`, `tech-stack.md`, `roadmap.md`, `state.md`,
`create.md`, `plan.md`, `research.md`, `ship.md`) are all free — lifecycle-review-gates listed
`supervise.md` as protected (it did not touch it); this feature flips it to its *primary* owned file.
`create.md`/`plan.md`/`ship.md` move from protected to owned (handshake insertion); `verify.md`
remains protected (no handshake there).

## Milestone-5 regression invariant (must preserve)

Milestone-5's V6 validator scans all `.pi/prompts/*.md`, including `supervise.md`. Every edit here
MUST preserve:
- Frontmatter `description` for supervise.md.
- No forbidden OpenCode-pseudocode tokens (`task(`, `question(`, `skill(`, `write(`, `.active`,
  `spec.md`, `prd.json`, `review-state.json`, etc.) — the research-request convention uses
  `agents.ask`/`agents.run` references, which are NOT forbidden and already appear in the existing
  `supervise.md` (`agents.create`, `agents.setInstructions`, `agents.actors`).
- The supervisor's "never dispatch / never edit / never certify / never self-stop" hard limits stay
  intact (each checked separately in verification).
- `ship.md` keeps its "cannot declare...verified status/completion" phrase.
- `verify.md` keeps its "sole...verified | transcript only | no repository write" phrase (and gets
  no handshake).
- ADR-011 review-gate markers (`Phase 10A`, `Phase 8A`, `Tier-Gated Diff Review`, `Phase 5A`) stay
  present in create/plan/ship/verify.

## Privacy and Security

- The supervisor's `extensions: false` read-only posture is unchanged; research is Main-mediated,
  so the supervisor never gains spawn or write capability.
- Read-only research spawns (`scout`/`explore`) are `extensions:false`, `read/grep/find/ls`, no
  `bash`, non-recursive; an explicit path allowlist excluding secret-bearing files applies (per the
  ADR-011 packet contract).
- Supervisor instructions continue to prohibit secret-bearing paths and raw payload echo.
- Fed-back research results are untrusted data (Worker Distrust); Main validates before acting.
- Direct actor responses use `action:"silent"` so unvalidated advice is never auto-delivered.
- Read-only tools are capability policy, not secret isolation.

## Failure Behavior

- **No, stopped, or ambiguous supervisor actor:** warn, skip the handshake, continue (supervisor is
  optional and advisory).
- **Actor request fails or times out:** warn and continue; no fabricated advice.
- **Unknown response kind or requestId mismatch:** ignore, warn, continue.
- **Mini research run fails:** send a sanitized failed-research result; await the actor's final
  response; never treat partial text as completed research.
- **More than one research request for a boundary:** reject the second; continue without another
  child.
- **Validated Critical/High defect or binding-authority violation:** stops under existing Main
  authority — not because the actor declared itself blocking.
- **Any post-review candidate mutation:** existing ADR-011 freshness and convergence rules apply.

## Risks

- **Sol-per-wake cost (highest, accepted):** V2 burns `gpt-5.6-sol` thinking-max on every
  `agent_settled` wake, even when silent. Accepted by design choice over the tiered V4. Mitigation:
  the supervisor stays silent by default and only steers on drift or at boundaries; ambient coverage
  is the point. If cost becomes a problem, the tiered V4 (mini-ambient + escalate-on-steer) is the
  documented fallback.
- **Research round-trip latency (medium):** Main-mediated research is one extra hop (request → spawn
  → feed back → steer) vs direct spawn. Mitigation: research runs on `gpt-5.4-mini` (fast); the
  round-trip only fires when the supervisor judges it needs context, not every wake.
- **Steer fatigue (medium):** a proactive supervisor that steers at every boundary can become noise.
  Mitigation: the supervisor scouts broadly for *material* direction concerns only; trivial
  "consider X" nudges are suppressed by the "material drift or genuine strategy gap" bar.
- **Authority confusion with the review gates (medium):** both speak at boundaries. Mitigation: the
  past/future object split (gate=closer audits bytes; supervisor=opener steers direction) and the
  advisory-only supervisor authority.
- **`delivery:"steer"` auto-delivery bypass (medium, mitigated):** direct `action:"message"`
  responses are auto-delivered before `ask` resolves. Mitigated: direct protocol responses MUST use
  `action:"silent"`; `action:"message"` is reserved for ambient steering only.

## Open Items

- **`supervise.md` stale version matrix (NOTICED BUT NOT TOUCHING):** `supervise.md:29,40-42` says
  "pi-fabric 0.22.4" and lists `model/tools/events` as observable-immutable with "no public
  live-actor setter." In 0.23.0, `setModel`/`setTools`/`setEvents` exist (`manager.d.ts:31,47,54`).
  This is a real stale defect but is out of scope here (the supervisor's actor config is unchanged;
  the matrix is not load-bearing for the proactive/instructions change). A follow-up should sweep it.
- **PR lifecycle transition:** `/ship` advertises `verify` as its only candidate (the PR step is
  undeveloped). A future PR lifecycle prompt would extend the handshake; deferred.
