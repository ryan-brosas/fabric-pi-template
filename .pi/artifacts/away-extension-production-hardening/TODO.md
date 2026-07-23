# TODO — Away Extension Production Hardening (`away-extension-production-hardening`)

**Discovery Level:** 3 — architectural Pi/Fabric/confinement/Git/GitHub integration; retained from `/create`.
**Effective Review Level:** 3 — security, persistence, concurrency, recovery, and external effects.
**Context Budget:** Three serial child plans at 45%, 50%, and 45%; one writer per wave.

### 2026-07-23 - Away extension production hardening implementation
status: active

## Child Plan A — Pi Load and Supervisor Evidence

#### A1 [runtime] Make extension loading lifecycle-safe
- [x] RED: throwing pre-bind harness proves the factory calls bound actions too early.
- [x] GREEN: normalize READY-tool/pending state in `session_start`; teardown clears memory without action calls.
- [x] Add reload, settlement, controller-error, wrong-token, and shutdown state regressions.
- [x] Prove explicit extension RPC command discovery.
- **depends_on:** `[]`
- **parallel:** `false`
- **conflicts_with:** `[A2, C1]`
- **files:** [`.pi/extensions/away/index.ts`, `.pi/extensions/away/index.test.ts`]
- **Verify:** `node --experimental-strip-types --test --test-name-pattern='loading|session_start|active tool|settled|shutdown|reload' .pi/extensions/away/index.test.ts`
- **Verify:** `printf '%s\n' '{"type":"get_commands","id":"away-startup"}' | timeout 20s pi --approve --no-extensions -e .pi/extensions/away/index.ts --mode rpc --no-session | rg '"id":"away-startup".*"success":true'`

#### A2 [security] Require exact structural supervisor evidence
- [x] RED: realistic session-v3 fixture plus decoy/drift matrix defeats substring matching.
- [x] GREEN: bounded parser validates Fabric direct envelope, Pi IDs/parents, and one exact assistant health ack.
- [x] Carry exact session/request/actor correlation through the supervisor prompt READY payload.
- [x] Run complete extension regression.
- **depends_on:** `[A1]`
- **parallel:** `false`
- **conflicts_with:** `[A1, C1]`
- **files:** [`.pi/extensions/away/index.ts`, `.pi/extensions/away/index.test.ts`, `.pi/prompts/supervise.md`]
- **Verify:** `node --experimental-strip-types --test --test-name-pattern='session-v3|supervisor-ready|registry|transcript|decoy|correlation' .pi/extensions/away/index.test.ts`

## Child Plan B — Retained Lifecycle and Durable Production Composition

#### B0 [architecture] Expose correlated launcher responses
- [x] RED: real Pi RPC integration requires an exact prompt response ID.
- [x] GREEN: launcher binds `request()` to its existing `RpcDispatcher` before sending.
- [x] Run complete launcher regression.
- **depends_on:** `[A2]`
- **parallel:** `false`
- **conflicts_with:** `[B1, C1]`
- **files:** [`.pi/away-runtime/launcher.ts`, `.pi/away-runtime/launcher.test.ts`]
- **Verify:** `node --experimental-strip-types --test .pi/away-runtime/launcher.test.ts`

#### B1 [host] Build the retained confined lifecycle adapter
- [x] RED: no-work purity, retained identity, strict RPC, and lifecycle evidence tests fail without production host.
- [x] GREEN: implement bounded state/workspace and prompt/settlement adapters over existing launcher.
- [x] Validate create/ship/verify via host observations and exact receipts, not completion prose.
- [x] Add production host to runtime-protected closure and rerun ADR-014 suites.
- **depends_on:** `[A1]`
- **parallel:** `false`
- **conflicts_with:** `[B2, C1]`
- **files:** [`.pi/away-runtime/production-host.ts`, `.pi/away-runtime/production-host.test.ts`, `.pi/away-sandbox.json`]
- **Verify:** `node --experimental-strip-types --test --test-name-pattern='production host|retained workspace|lifecycle RPC|phase evidence' .pi/away-runtime/production-host.test.ts`
- **Verify:** `node --experimental-strip-types --test .pi/away-runtime/{bootstrap,confinement,launcher,lane-extension,verifier}.test.ts`

#### B2 [recovery] Compose resume, lifecycle, verification, and effects
- [x] RED: established-namespace restart, unfinished ordering, no-work purity, drift, and terminal composition cases.
- [x] GREEN: make lifecycle phases idempotently observable without a second status reducer.
- [x] Resume one exact unfinished reservation before selection and reconcile through existing brokers.
- [x] Return completed only after terminal ledger convergence.
- **depends_on:** `[A2, B1]`
- **parallel:** `false`
- **conflicts_with:** `[B1, C1, C2]`
- **files:** [`.pi/away-runtime/production-host.ts`, `.pi/away-runtime/production-host.test.ts`, `.pi/away-runtime/controller.ts`]
- **Verify:** `node --experimental-strip-types --test --test-name-pattern='resume|unfinished reservation|terminal composition|no-work|identity drift' .pi/away-runtime/production-host.test.ts`
- **Verify:** `node --experimental-strip-types --test .pi/away-runtime/{controller,ledger,replay,git-broker,github-broker,production-host}.test.ts`

## Child Plan C — Default Binding, Full Process Proof, and Authority

#### C1 [integration] Wire the default extension to the production root
- [x] RED: default-binding and real command-discovery process tests reach the disconnected path.
- [x] GREEN: extension default imports only `runProductionAwayController`; retain focused injection seam.
- [x] Cover normal/malformed/injected/non-idle input and exact transformed continuation in real RPC.
- [x] Run full extension plus production-host tests.
- **depends_on:** `[B2]`
- **parallel:** `false`
- **conflicts_with:** `[A1, A2, B1, B2, C2]`
- **files:** [`.pi/extensions/away/index.ts`, `.pi/extensions/away/index.test.ts`, `.pi/away-runtime/production-host.ts`]
- **Verify:** `node --experimental-strip-types --test --test-name-pattern='default binding|command discovery|supervise' .pi/extensions/away/index.test.ts`
- **Verify:** `printf '%s\n' '{"type":"get_commands","id":"away-project"}' | timeout 20s pi --approve --mode rpc --no-session | rg '"id":"away-project".*"success":true'`

#### C2 [acceptance] Prove the hermetic production path and crash replay
- [x] RED: production full-loop test replaces the test-local host and initially fails.
- [x] Prove no-work produces no workspace/ref/remote/PR effect.
- [x] Prove eligible create→ship→candidate→verify→branch→draft-PR terminal flow.
- [x] Add every lifecycle/effect crash cut and negative drift/confinement cases.
- [x] GREEN: production entry converges with exactly one branch publication and one draft PR.
- [x] Run all away runtime and extension tests with no required skip/TODO.
- **depends_on:** `[C1]`
- **parallel:** `false`
- **conflicts_with:** `[B2, C1, C3]`
- **files:** [`.pi/away-runtime/integration.test.ts`, `.pi/away-runtime/fixtures.ts`, `.pi/away-runtime/controller.test.ts`]
- **Verify:** `node --experimental-strip-types --test --test-name-pattern='production full confined|production no-work|production crash replay' .pi/away-runtime/integration.test.ts`
- **Verify:** `node --experimental-strip-types --test .pi/away-runtime/*.test.ts .pi/extensions/away/index.test.ts`

#### C3 [docs] Synchronize canonical production authority
- [x] RED: canonical authority grep identifies missing connected-path concepts.
- [x] Document one production root, session-v3 health evidence, retained resume, host candidate commit, and terminal reconciliation.
- [x] Preserve ADR-014/ADR-015 safety boundaries and make no live-smoke claim.
- [x] Run full deterministic regression and diff hygiene.
- **depends_on:** `[C2]`
- **parallel:** `false`
- **conflicts_with:** `[C2]`
- **files:** [`.pi/artifacts/pi-template/PLAN.md`, `.pi/artifacts/pi-template/DECISIONS.md`]
- **Verify:** `rg -n 'production composition root|session-v3|unfinished reservation|host-owned candidate commit' .pi/artifacts/pi-template/{PLAN,DECISIONS}.md`
- **Verify:** `node --experimental-strip-types --test .pi/away-runtime/*.test.ts .pi/extensions/away/index.test.ts && git diff --check`

## Waves

- Wave 1: A1
- Wave 2: A2
- Wave 3: B1
- Wave 4: B2
- Wave 5: C1
- Wave 6: C2
- Wave 7: C3

Writable tasks execute serially in this order.