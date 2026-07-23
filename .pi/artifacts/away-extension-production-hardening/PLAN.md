# Away Extension Production Hardening Implementation Plan

**Goal:** A normal Pi session loads successfully, and one exact operator-invoked `/supervise --away [objective]` request follows a single fail-closed production path from correlated supervisor readiness through confined lifecycle work and durable branch/draft-PR reconciliation.

**Status:** planned — ready for serial `/ship`

**Discovery Level:** 3 — retained from `/create`; this is an architectural, cross-subsystem integration spanning Pi extension lifecycle, private Fabric persistence, sandboxed RPC execution, Git, GitHub, and crash recovery.

**Effective Review Level:** 3 — max(stored discovery 3, stored review 3, current L2 security/persistence/concurrency/external-effect risk floor).

**Context Budget:** Three serial child plans, each targeting 40–50% context. Child Plan A: 45%; Child Plan B: 50%; Child Plan C: 45%. No writable work overlaps.

---

## Planning Provenance

- The ready packet passed: all six files exist; `.pi/state.md` is schema 1, ready, reload false; the SHA-256 of the bytes strictly between the managed AGENTS markers is `e12e27bdb65d49e4431cc7ede5549071d8bc195e8a5690f4ca6c7203d1e3bd2b`, matching state.
- Institutional memory confirms lifecycle ready/hash gating, immutable roadmap IDs, and away eligibility rules. Recent history is one continuous ADR-014/ADR-015 sequence from deterministic reservation through durable replay and hermetic integration; the current work is corrective completion, not a replacement architecture.
- Three planning explore attempts timed out at Fabric's 500,000-token child ceiling and returned no admissible completed output. The operator's artifact-level Main-only research authorization remains recorded; no partial child prose is treated as evidence.
- Main validated exact local Pi 0.81.1 and pi-fabric 0.24.3 source. External Pi evidence is version-pinned to `v0.81.1`; public search did not expose a verifiable Fabric 0.24.3 tag, so the installed package is authoritative for Fabric persistence.
- The existing untracked `.pi/away-runtime/supervise-away.ts` remains outside this plan. It is neither adopted nor modified; there must be one canonical production composition root, not two.

## Institutional Findings Applied

1. Extension factories finish before `session_start`; Pi's loader installs throwing action stubs until runtime binding. Dynamic active-tool normalization therefore belongs in `session_start`, with in-memory-only shutdown cleanup.
2. Fabric's actor registry is project/session-scoped at `.pi/fabric/mesh/actors/<sessionId>/actors.json`; each actor's Pi session is `<actorId>/session.jsonl`. `ActorManager.#runRequest` serializes a direct envelope containing `source`, `payload`, and queue item `id`; Pi session entries carry `id`, `parentId`, `type`, and `message`.
3. The current registry test writes `{role, content}` records that are not real Pi session entries, and the production gate only searches substrings. The replacement must validate the actual session v3 tree and exact direct envelope.
4. `runAwayController` has a sound injected lifecycle seam, while the default is intentionally disconnected. `reconcileAwayRun` already owns the legal durable status chain and observe-before-mutate behavior; production code must compose it, not reproduce it.
5. The current full-loop integration test proves the real launcher, strict wrapper, staged writes, exact candidate commit, verifier, local bare remote, and protocol-faithful GitHub service, but its `AwayEffectHost` is test-local.
6. ADR-015 deliberately assigns commits, Git, GitHub, credentials, and the journal to the trusted host. In an away invocation this host-owned candidate commit satisfies the lifecycle's Git-history requirement; generated code remains Git-free. Normal interactive `/ship` behavior is unchanged.
7. A crash can leave an established namespace while the ledger is still `reserved`. Therefore lifecycle invocation must be idempotently observable; the current unconditional “namespace must be absent” check cannot remain the restart rule.

## Must-Haves

### Observable Truths

1. An operator can start Pi normally and discover commands without an extension initialization exception; the internal continuation tool is inactive before a valid pending request.
2. Only exact idle interactive/RPC `/supervise --away [objective]` input starts the flow, and controller execution requires one structurally correlated supervisor request/ack for the same Pi session, actor, request, and nonce.
3. When no roadmap card is eligible, the operator receives `no-work` and no retained workspace, candidate ref, remote branch, or pull request is created.
4. For an eligible card, lifecycle artifacts are source-backed, generated writes pass through the ADR-014 confined lane, the host observes exact candidate bytes, and only `/verify` evidence for the exact clean candidate is accepted.
5. After a crash at any durable cut, the next one-shot invocation resumes the existing reservation and converges to at most one dedicated branch and one exact draft PR without changing local or remote `main`.
6. The command reports `completed` only after the ledger reaches `completed`; identity drift, malformed evidence, unsupported dialogue, stale verification, divergent refs, ambiguous PRs, missing confinement, or exhausted bounds report `blocked`.
7. Automated acceptance never reaches a live remote. A real branch push/draft PR requires a separate explicit live-smoke authorization after deterministic `/ship` evidence.

### Required Artifacts

| Artifact | Provides | Path |
|---|---|---|
| Load-safe Pi adapter | Exact command split, pending state, internal tool lifecycle, safe result rendering | `.pi/extensions/away/index.ts` |
| Adapter behavior/process tests | Throwing pre-bind harness, structural transcript fixtures, real RPC discovery | `.pi/extensions/away/index.test.ts` |
| Canonical health protocol | Session/request fields and direct health-check/ack contract | `.pi/prompts/supervise.md` |
| Production composition root | Host state paths, retained lifecycle adapter, reservation resume, lifecycle/effect host composition | `.pi/away-runtime/production-host.ts` |
| Production composition tests | No-work purity, RPC bounds, idempotent lifecycle, resume, effect convergence | `.pi/away-runtime/production-host.test.ts` |
| Canonical controller seam | Restart-safe lifecycle rules and existing durable replay state machine | `.pi/away-runtime/controller.ts` |
| Controller regressions | Namespace restart and lifecycle/evidence drift cases | `.pi/away-runtime/controller.test.ts` |
| Protected startup closure | Prevents generated code from modifying the new trusted production host | `.pi/away-sandbox.json` |
| Hermetic retained fixture | Local repository/remote and strict GitHub protocol test dependencies | `.pi/away-runtime/fixtures.ts` |
| Full process proof | Real launcher/wrapper/staging/verifier plus production composition and crash cuts | `.pi/away-runtime/integration.test.ts` |
| Canonical authority updates | Connected production root, structural evidence, restart behavior | `.pi/artifacts/pi-template/{PLAN,DECISIONS}.md` |

### Key Links

| From | To | Via | Risk if broken |
|---|---|---|---|
| Extension factory | Bound Pi runtime | `session_start` active-tool normalization | Ordinary Pi startup throws before command discovery |
| Pending away request | Internal continuation tool | exact nonce and settled-turn state machine | Tool remains exposed or stale requests execute |
| READY tool | Fabric actor session | registry identity plus session-v3 `id`/`parentId` chain | Prompt/tool-output decoys unlock the controller |
| Extension default | Production host | one imported `runProductionAwayController` entry | Default remains disconnected or two controllers diverge |
| Durable reservation | Retained workspace | repository/run-derived state root and exact base OID | Restart selects new work or mutates the wrong checkout |
| Lifecycle phase | ADR-014 lane | host-expanded canonical prompt, fixed profile, strict RPC settlement | Generated code runs unconfined or lifecycle claims are inferred from prose |
| Staged bytes | Candidate commit | host-derived paths/hashes and `createOrObserveCandidateCommit` | Unobserved or protected bytes enter the candidate |
| Candidate commit | Verification receipt | exact-OID verifier and fingerprint freshness | Stale/different bytes are published |
| Verified ledger state | Remote branch and draft PR | `reconcileAwayRun` plus existing Git/GitHub brokers | Duplicate effects or premature completion |
| Process fixture | Production composition | injected provider/clock/GitHub only | Tests prove mocks rather than the shipped path |

## Architecture Decisions for Implementation

### One trusted production composition root

`.pi/away-runtime/production-host.ts` is the only new host composition module. It imports existing reservation, launcher, ledger, Git, GitHub, verifier, and replay APIs. It does not define a second selector, status reducer, broker, daemon, or cleanup path. The extension imports this entry directly; `runAwayController` remains dependency-injectable for focused tests.

### Retained state and restart identity

The host derives one absolute state directory beneath `${XDG_STATE_HOME:-~/.local/state}/pi-away/` from canonical repository identity, exact repository realpath, and run ID. It retains the detached exact-base workspace, lifecycle phase receipts, lane attestations, verifier evidence, and ledger. Paths are host-derived and symlink-checked. No cleanup is added.

Before selection, the host opens and replays the repository ledger. One non-terminal reservation with matching repository/source/base identity is resumed. Multiple non-terminal candidates, identity drift, or corrupt evidence block. Only when no resumable reservation exists may `reserveNext` select a new card. `no-work` returns before workspace, lane, Git, or GitHub mutation.

### Canonical lifecycle over the confined RPC lane

The trusted host interprets the controller's exact `/create`, `/ship`, and `/verify` phase requests. It reads the protected canonical prompt, substitutes only validated host values, and supplies a bounded away adapter describing fixed policy answers and the allowlisted `away_*` bridge. The inert Pi RPC parent uses the existing controller-derived profile and launcher; only generated `node-process` code enters strict bubblewrap. The model never chooses the profile, cwd, tools, binaries, refs, commands, credentials, or effect policy.

Each phase waits for its correlated prompt response and `agent_settled`, enforces record/output/time limits, rejects unsupported extension-UI dialogue, and requires both a structured phase result and host observations. `/create` is accepted only when exactly PLAN.md and TODO.md establish the reserved slug. `/ship` is accepted only after exact staged candidate settlement and lifecycle artifact updates; the generated lane does not commit. `/verify` is accepted only from the existing exact-OID verifier receipt with no repository write after the fingerprint. Normal interactive lifecycle commands are unchanged.

### Restart-safe lifecycle

Lifecycle receipts are observations, not a second status ledger. `driveReservedLifecycle` becomes idempotent at phase boundaries:

- absent namespace: invoke source-backed create;
- established namespace with matching reservation provenance: observe create and continue;
- partial or mismatched namespace: block;
- settled ship/candidate/verify receipt with exact identity: observe and reuse;
- missing receipt: invoke only that phase;
- conflicting receipt or changed bytes: block.

The append-only ADR-015 ledger remains the sole external-effect state machine. After lifecycle verification, the production host invokes `reconcileAwayRun`; it reports `completed` only when reconciliation returns terminal completion.

### Authorization boundary

Automated tests inject a local bare remote and protocol GitHub service. They cannot call the real `origin` or host `gh`. Production effect methods are reachable only from the original exact operator input after the nonce/READY gate and durable identity checks. No live smoke is part of this plan's execution; a later real remote test requires a new explicit authorization.

## Dependency Graph

```text
A1: needs nothing; creates load-safe extension state and real startup harness
A2: needs A1; creates structural supervisor evidence gate
B1: needs A1; creates retained confined lifecycle host and protected closure entry
B2: needs A2+B1; creates restart-safe reservation→lifecycle→reconcile production composition
C1: needs B2; creates shipped extension default binding and process command proof
C2: needs C1; creates hermetic full production-path crash/replay proof
C3: needs C2; creates synchronized canonical authority

Wave 1: A1
Wave 2: A2
Wave 3: B1
Wave 4: B2
Wave 5: C1
Wave 6: C2
Wave 7: C3
```

Every wave has one writer. Read-only investigation may occur inside a wave; writable dispatches never overlap.

## Child Plan A — Pi Load and Supervisor Evidence

**Budget:** ~45% context · **PRD mapping:** T1, T2 · **Waves:** 1–2

### A1 [runtime] Make extension loading lifecycle-safe

- **needs:** nothing
- **creates:** bound-session initialization, explicit pending reset, throwing pre-bind harness, real startup proof
- **has_checkpoint:** false
- **files:** [`.pi/extensions/away/index.ts`, `.pi/extensions/away/index.test.ts`]

#### TDD steps

1. **RED — pre-bind harness.** Change the test API so `getActiveTools` and `setActiveTools` throw `Extension runtime not initialized` until a captured `session_start` handler is invoked.
2. Run `node --experimental-strip-types --test --test-name-pattern='factory does not call bound actions' .pi/extensions/away/index.test.ts`.
   **Expected:** non-zero; factory-time `deactivate` reaches the throwing stub.
3. Add lifecycle assertions for startup/reload/new/resume/fork: pending state clears, the READY tool is removed after binding, and no blocked entry is fabricated during initialization.
4. Move initial active-tool normalization from factory execution to `session_start`; keep registration in the factory. Make `session_shutdown` clear memory/UI state without invoking bound action methods during teardown.
5. Run the RED command again.
   **Expected:** exit 0 with the new lifecycle test passing.
6. Add settlement/controller-throw/wrong-token regressions proving every non-running path returns to no pending request and an inactive READY tool; preserve active state only while a valid request is pending.
7. Run `node --experimental-strip-types --test --test-name-pattern='loading|session_start|active tool|settled|shutdown|reload' .pi/extensions/away/index.test.ts` and the explicit RPC startup command from SC1.
   **Expected:** targeted tests pass; RPC returns one successful `get_commands` response and no extension initialization error.

### A2 [security] Require exact structural supervisor evidence

- **needs:** A1
- **creates:** pinned Fabric/Pi record parser, correlated health evidence, decoy rejection
- **has_checkpoint:** false
- **files:** [`.pi/extensions/away/index.ts`, `.pi/extensions/away/index.test.ts`, `.pi/prompts/supervise.md`]

#### TDD steps

1. **RED — real record fixture.** Replace the unrealistic role-only transcript with session-v3 records: one header, unique entry IDs, parent IDs, a direct-envelope user message, and its assistant directive descendant.
2. Add a positive test requiring exact `protocol`, `kind`, `requestId`, `sessionId`, actor ID, queue item ID, direct source, and `action:"silent"` health acknowledgement.
3. Add table-driven negatives for prompt/tool-result substrings, malformed lines, duplicate IDs, missing parents, cycles/disconnected branches, ack-before-request, wrong role/source/session/request/actor, extra assistant prose, duplicate matching pairs, oversized files, and stale nonces.
4. Run `node --experimental-strip-types --test --test-name-pattern='session-v3|decoy|correlation' .pi/extensions/away/index.test.ts`.
   **Expected:** non-zero because substring matching accepts at least one decoy and cannot validate ancestry.
5. Add bounded line-by-line JSONL parsing. Validate the session header, unique IDs, known parent references, exact direct envelope shape emitted by Fabric 0.24.3, and one unambiguous assistant descendant whose parsed directive data is the exact health ack.
6. Extend the READY value and supervisor prompt health payload with the current session ID and exact request/actor correlation. Keep private-storage parsing isolated and version-pinned; unknown record shapes fail closed.
7. Run the targeted command.
   **Expected:** all structural and adversarial cases pass; controller-call count remains zero for every rejection.
8. Run the complete extension test file.
   **Expected:** all command-split, state-machine, READY, registry, and transcript tests pass.

## Child Plan B — Retained Lifecycle and Durable Production Composition

**Budget:** ~50% context · **PRD mapping:** T3, T4 · **Waves:** 3–4

### B0 [architecture] Expose correlated launcher responses (approved correction)

- **needs:** A2
- **files:** `.pi/away-runtime/launcher.ts`, `.pi/away-runtime/launcher.test.ts`
- **verification:** complete launcher suite plus real fake-provider Pi process response correlation

The volatile B1 contract check found that `Launcher` exposed only fire-and-forget `send()` even though its private dispatcher already supported exact response IDs. The operator approved this serial root correction: expose one `request()` method backed by that dispatcher, without adding another process or framing implementation.

### B1 [host] Build the retained confined lifecycle adapter

- **needs:** A1
- **creates:** production host module, deterministic retained paths, strict lifecycle RPC adapter, protected closure membership
- **has_checkpoint:** false
- **files:** [`.pi/away-runtime/production-host.ts`, `.pi/away-runtime/production-host.test.ts`, `.pi/away-sandbox.json`]

#### TDD steps

1. **RED — no-work purity seam.** Add a production-host test with injected host dependencies and assert construction alone performs no workspace, lane, Git, GitHub, or ledger mutation.
2. **RED — retained identity.** Add tests for canonical repository/run state paths, exact-base detached workspace observation, retained restart reuse, symlink/non-directory rejection, and mismatched base blocking.
3. **RED — strict RPC.** Add a fake launcher stream proving prompt-response ID correlation, LF-only framing, response-before-settlement handling, `agent_settled` completion, early exit, wrong IDs, malformed/oversized records, timeout, and unsupported UI dialogue.
4. Run `node --experimental-strip-types --test --test-name-pattern='production host|retained workspace|lifecycle RPC' .pi/away-runtime/production-host.test.ts`.
   **Expected:** non-zero because the production module does not yet exist.
5. Implement only the dependency interfaces, deterministic state-path validation, retained exact-base workspace observation/creation, and bounded RPC phase runner needed by the tests. Use fixed argv arrays and existing launcher APIs; do not add shell interpolation or a generic process wrapper.
6. Re-run the targeted command.
   **Expected:** the foundational host tests pass without invoking a live model or remote.
7. **RED — lifecycle phase evidence.** Add create/ship/verify fixture turns that require canonical prompt digest, fixed phase/profile, exact slug/card/base/run identity, settlement receipt, namespace observation, candidate paths/hashes, exact verified OID, fingerprint, and zero post-fingerprint writes.
8. Add adversarial cases for a model-selected profile, unknown policy question, completion prose without a receipt, wrong phase/command, protected path, changed prompt digest, stale candidate, and recursive parent away entry.
9. Implement the three phase adapters by composing the existing launcher, lane settlement, host observations, and verifier. Add `.pi/away-runtime/production-host.ts` to the manifest's runtime-protected paths so generated writes cannot alter the trusted root.
10. Run the targeted test file plus `node --experimental-strip-types --test .pi/away-runtime/{bootstrap,confinement,launcher,lane-extension,verifier}.test.ts`.
    **Expected:** production-host phase tests and the unchanged ADR-014 closure/confinement suites pass.

### B2 [recovery] Compose resume, lifecycle, verification, and effects

- **needs:** A2, B1
- **creates:** restart-safe lifecycle, unfinished-reservation replay, one terminal production result
- **has_checkpoint:** false
- **files:** [`.pi/away-runtime/production-host.ts`, `.pi/away-runtime/production-host.test.ts`, `.pi/away-runtime/controller.ts`]

#### TDD steps

1. **RED — established-namespace resume.** Reserve a run, persist matching create evidence with an established namespace, restart the host, and assert lifecycle continues at ship instead of blocking on “expected absent namespace.”
2. Add RED cases for partial namespace, source/card/base mismatch, conflicting phase receipt, candidate hash drift, stale verify receipt, and multiple unfinished reservations; each must block before a new lane or external effect.
3. **RED — no-work and unfinished ordering.** Assert an unfinished matching reservation is replayed before selection; with neither unfinished nor eligible work, return `no-work` with zero workspace/Git/GitHub calls.
4. **RED — terminal composition.** Inject existing Git/GitHub brokers and assert lifecycle success alone is not returned as `completed`; only terminal `reconcileAwayRun` completion produces the public result.
5. Run `node --experimental-strip-types --test --test-name-pattern='resume|unfinished reservation|terminal composition|no-work' .pi/away-runtime/production-host.test.ts`.
   **Expected:** non-zero on established-namespace restart and disconnected lifecycle/effect completion.
6. Make `driveReservedLifecycle` phase-idempotent: accept absent→create or exact established observation, reuse exact settled phase receipts, and block partial/mismatched observations. Do not create another status reducer.
7. Implement the production entry in this order: validate host facts/closure → open ledger/lock → choose exact unfinished reservation or reserve → ensure retained lifecycle → compose `AwayEffectHost` → call `reconcileAwayRun` → map terminal evidence to the public result.
8. Reuse `createOrObserveCandidateCommit`, `observeRemoteBranch`, `publishDedicatedBranch`, `verify`, and `createOrGetDraftPullRequest`; keep model-generated code Git/GitHub/credential-free.
9. Re-run the targeted command.
   **Expected:** all resume, no-work, drift, and terminal-order tests pass; effect call counts are zero or one as specified.
10. Run `node --experimental-strip-types --test .pi/away-runtime/{controller,ledger,replay,git-broker,github-broker,production-host}.test.ts`.
    **Expected:** all existing reducer/broker tests plus production composition pass with no skipped safety case.

## Child Plan C — Default Binding, Full Process Proof, and Authority

**Budget:** ~45% context · **PRD mapping:** T5, T6, T7 · **Waves:** 5–7

### C1 [integration] Wire the default extension to the production root

- **needs:** B2
- **creates:** single shipped call path and real Pi command-discovery regression
- **has_checkpoint:** false
- **files:** [`.pi/extensions/away/index.ts`, `.pi/extensions/away/index.test.ts`, `.pi/away-runtime/production-host.ts`]

#### TDD steps

1. **RED — default binding.** Add a process test that loads the actual extension default and supplies an eligible/no-work production fixture; assert the call reaches the production entry rather than the dependency-less controller branch.
2. **RED — command catalog.** Spawn Pi RPC once with the explicit away extension and once with normal project loading. Send correlated `get_commands`; assert success, normal `supervise` prompt discovery, no extension command named `supervise`, and no active internal continuation tool before a request.
3. Run `node --experimental-strip-types --test --test-name-pattern='default binding|command discovery' .pi/extensions/away/index.test.ts`.
   **Expected:** non-zero until the default import and process harness are connected.
4. Replace the extension's default dependency with `runProductionAwayController`; retain `createAwayExtension` dependency injection for unit tests. Remove the disconnected path from the shipped call graph rather than adding a compatibility wrapper.
5. Add process cases for normal `/supervise`, malformed/extension/streaming/non-idle input, exact transformed input, wrong nonce, settled cancellation, and controller failure. Bound child stdout/stderr and enforce timeout/exit cleanup.
6. Re-run the targeted command and both SC1/SC6 RPC commands.
   **Expected:** all process cases pass; no initialization exception; only exact input transforms.
7. Run the full extension test file and production-host test file.
   **Expected:** all unit and process integration cases pass.

### C2 [acceptance] Prove the hermetic production path and crash replay

- **needs:** C1
- **creates:** real confined end-to-end fixture with production composition and replay evidence
- **has_checkpoint:** false
- **files:** [`.pi/away-runtime/integration.test.ts`, `.pi/away-runtime/fixtures.ts`, `.pi/away-runtime/controller.test.ts`]

#### TDD steps

1. **RED — use shipped composition.** Replace the test-local full-loop effect host in a new test case with the production entry plus injected provider, clock, local bare remote, and protocol GitHub service.
2. Add a no-eligible-card process case proving no retained workspace/ref/remote/PR mutation.
3. Add an eligible-card case proving source-backed namespace creation, confined staged implementation, exact candidate commit, exact-OID verify, dedicated branch publication, one draft PR, and terminal status chain.
4. Add restart cuts after namespace creation, lane settlement, candidate commit, verification, branch publication, and draft-PR creation. Preserve evidence and re-enter through the public production entry.
5. Add negative cases for local/remote `main` drift, protected-path mutation, stale receipt, divergent branch, ambiguous PR, duplicate unfinished runs, closure drift, and absent strict confinement.
6. Run `node --experimental-strip-types --test --test-name-pattern='production full confined|production no-work|production crash replay' .pi/away-runtime/integration.test.ts`.
   **Expected:** non-zero while the full-loop fixture still bypasses the shipped composition.
7. Extend only the existing fixture boundaries needed for injected provider/clock/GitHub/local remote. Do not fake launcher, wrapper, staging, candidate Git broker, verifier, ledger, or replay.
8. Re-run the targeted integration command.
   **Expected:** all production full-loop cases pass; push/PR mutation counts remain exactly one across every crash cut; local/remote `main` and protected hashes remain unchanged.
9. Run `node --experimental-strip-types --test .pi/away-runtime/*.test.ts .pi/extensions/away/index.test.ts`.
   **Expected:** complete deterministic suite exits 0 with no failures, skips in required production cases, cancellations, or TODO tests.

### C3 [docs] Synchronize canonical production authority

- **needs:** C2
- **creates:** canonical documentation matching shipped behavior
- **has_checkpoint:** false
- **files:** [`.pi/artifacts/pi-template/PLAN.md`, `.pi/artifacts/pi-template/DECISIONS.md`]

#### TDD steps

1. **RED — authority grep.** Run `rg -n 'production composition root|session-v3|unfinished reservation|host-owned candidate commit' .pi/artifacts/pi-template/{PLAN,DECISIONS}.md`.
   **Expected:** at least one required concept is absent.
2. Update ADR-014/ADR-015 implementation notes without changing their accepted safety boundaries: one production root, structural health evidence, retained lifecycle resume, host-owned commit exception for away execution, terminal reconciliation, and no live-smoke claim.
3. Re-run the authority grep.
   **Expected:** both canonical files contain the connected behavior and retain human-only merge/default-ref protections.
4. Run `git diff --check` and the full deterministic command from C2.
   **Expected:** both exit 0.

## PRD and Acceptance Criteria

### Problem Statement

The away extension currently calls active-tool actions before Pi binds its runtime, so ordinary startup fails while the injected unit harness passes. The continuation gate searches transcript substrings instead of proving a correlated direct request/assistant acknowledgement. The canonical lifecycle, confinement, ledger, Git, GitHub, and replay components are tested but the shipped extension's default path is disconnected.

### In Scope

- Bound-lifecycle active-tool state and real RPC startup coverage.
- Structural, bounded, exact-version actor registry/session evidence.
- One production host composition using existing ADR-014/ADR-015 components.
- Retained lifecycle and unfinished-reservation recovery.
- Host-derived candidate, exact-OID verification, observe-before-mutate Git/GitHub replay.
- Hermetic production-path process/integration coverage and canonical docs.

### Out of Scope

- Live remote smoke during `/ship`, merge, default-branch update, history-rewriting publication, branch deletion, roadmap mutation, recurring scheduling, cross-host locking, destructive cleanup, compatibility shims, new dependencies, or a second controller.
- Adoption or modification of `.pi/away-runtime/supervise-away.ts`.
- Weakening bubblewrap, cgroups, closure checks, protected paths, credential isolation, exact-path staging, or freshness.

### Success Criteria

1. **SC1 — startup:** explicit and normal project Pi RPC command discovery exit 0 without extension initialization failure.
2. **SC2 — tool lifecycle:** the factory survives throwing pre-bind stubs; start/reload/settlement/failure/shutdown leave exact pending/active state.
3. **SC3 — readiness proof:** only one exact correlated session-v3 direct health exchange unlocks the controller; every decoy/drift case blocks first.
4. **SC4 — connected no-work/default:** the shipped extension invokes the production root; no eligible card returns `no-work` before mutation.
5. **SC5 — retained lifecycle/replay:** eligible work uses the real confined lane and exact verifier, and crash cuts converge to one branch/PR.
6. **SC6 — command split:** ordinary/malformed/injected/non-idle input passes through; only exact idle interactive/RPC away input transforms.
7. **SC7 — deterministic regression:** all away runtime/extension tests and diff hygiene pass; no shipped connected-path placeholder remains.
8. **SC8 — authorization:** automated evidence uses only local/protocol fixtures; no live remote operation is executed or claimed.

### Criterion Traceability

| Criterion | Tasks | Primary evidence |
|---|---|---|
| SC1 | A1, C1 | real `get_commands` RPC responses |
| SC2 | A1 | throwing harness and state-transition tests |
| SC3 | A2 | session-v3 positive/negative table |
| SC4 | B2, C1, C2 | no-work call counters and default-binding process test |
| SC5 | B1, B2, C2 | retained fixture, receipts, ledger chain, crash cuts |
| SC6 | A1, C1 | input-hook unit/process matrix |
| SC7 | C2, C3 | full test command and `git diff --check` |
| SC8 | B2, C2, C3 | injected boundaries and no live-smoke evidence |

## Review Profile

- **Language and framework:** TypeScript under Node 24.16.0 strip-types; `node:test`; Pi coding agent 0.81.1; pi-fabric 0.24.3; Git 2.43.0; gh 2.96.0; bubblewrap 0.9.0. No new package is permitted.
- **Local authorities:** root `AGENTS.md`; this PLAN; ADR-011 through ADR-016 in `.pi/artifacts/pi-template/DECISIONS.md`; Away Sandbox Runtime and Autonomous away loop in `.pi/artifacts/pi-template/PLAN.md`; historical evidence in `.pi/artifacts/autonomous-away-loop/{PLAN,PROGRESS}.md`.
- **Required source packet:**
  - Pi v0.81.1 extension lifecycle: `https://github.com/earendil-works/pi/blob/v0.81.1/packages/coding-agent/docs/extensions.md` and installed `dist/core/extensions/loader.js:131-150`.
  - Pi v0.81.1 RPC framing/events: `https://github.com/earendil-works/pi/blob/v0.81.1/packages/coding-agent/docs/rpc.md`, installed `docs/rpc.md`, and `dist/modes/rpc/rpc-client.*`.
  - Pi session v3 ancestry: installed `dist/core/session-manager.d.ts:6-105`.
  - Fabric actor envelope/session persistence: installed pi-fabric 0.24.3 `dist/actors/manager.js:698-918,1389-1566` and `dist/actors/types.d.ts:1-129`. Public search was partial and is not version authority.
  - ADR-014 exact launcher/closure source: `.pi/away-runtime/{bootstrap,launcher,lane-extension,verifier}.ts` and `.pi/away-sandbox.json`.
- **Required checks:** each task's RED/GREEN command; explicit and normal RPC command discovery; all `.pi/away-runtime/*.test.ts`; `.pi/extensions/away/index.test.ts`; no required skip/TODO; `git diff --check`; ready-packet gate only if managed AGENTS bytes change.
- **Applicable overlays:** generated-code quality, TypeScript domain modeling, exact-version API use, security/confinement, persistence/concurrency, external-effect idempotency/recovery, resource bounds, and process-test realism. Block duplicate controllers, broad wrappers, invented APIs, swallowed failures, mock-only acceptance, no-op placeholders, or unrelated generated edits.

## Risks and Mitigations

| Risk | Mitigation / proof |
|---|---|
| Tool briefly active before `session_start` | Real no-session/startup process test plus throwing pre-bind harness; no model prompt is sent before normalization |
| Private Fabric transcript format drifts | Pin 0.24.3 envelope and Pi session v3 schema; strict known-key/ancestry parsing; unknown shape blocks |
| Fresh lifecycle RPC recursively loads away entry | Inert launcher uses `--no-extensions`, explicit Fabric/lane extensions, no project prompt discovery; host supplies protected prompt bytes |
| Away lifecycle diverges from normal lifecycle authority | Digest canonical prompt bytes; restrict adapter to tool/policy mapping; validate namespace/artifacts/receipts independently |
| Crash between lifecycle phases is mistaken for new work | Resume unfinished reservation first; deterministic retained paths and exact idempotent phase receipts |
| Lifecycle success leaks as terminal completion | Public mapping occurs only after `reconcileAwayRun` returns completed and terminal evidence is re-observed |
| Tests accidentally reach real remote | Injected GitHub/process boundaries, local bare origin, host/remote assertions, no live command in acceptance |
| New production host is writable by generated lane | Add it to runtime-protected paths and closure/confinement regression |
| Concurrent untracked adapter creates split brain | Do not touch/adopt it; fail review if shipped extension or canonical authority points to more than one root |

## Constitutional Compliance Check

**Constitutional compliance: 8 PASS.** Planned commands stage no files, bypass no hooks, rewrite no Git history, restore no working tree, install no dependency, and expose no credential. Every implementation task modifies at most three declared files. All writes are serial and every external/live mutation remains operator-gated.

## Open Questions

No operator decision blocks planning. The volatile implementation proof is B1: if the existing inert launcher cannot execute canonical lifecycle prompt bytes through the allowlisted bridge without weakening ADR-014 or contradicting lifecycle authority, stop before production binding and return the exact failed contract; do not fall back to an unconfined Pi child or the excluded parallel adapter.

## Stop Conditions

- Unknown Pi/Fabric record or response shape, wrong exact version, or unsatisfied source check.
- More than one production composition root in the shipped call graph.
- Partial/mismatched namespace, reservation, receipt, candidate, repository, ref, or PR identity.
- Any lifecycle phase requiring a capability outside the fixed profile or an unsupported operator answer.
- Missing strict user namespace, cgroup, wrapper attestation, closure hash, exact verifier evidence, or freshness.
- Any automated test attempting a live remote mutation.
- Two failed edits at the same location or two failed verification/fix cycles for one task.
- Any byte change after verification; rerun evidence against current bytes.