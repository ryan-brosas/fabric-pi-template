# PROGRESS — Autonomous Away Loop (`autonomous-away-loop`)

Implementation evidence only. This file does not declare terminal verification; only `/verify autonomous-away-loop` may do that.

## 2026-07-23 — Ship execution

- Operator invoked `/ship autonomous-away-loop` after two L3 `/create` reviewer timeouts; this is recorded as the operator override allowing execution to proceed.
- Workspace baseline HEAD: `ca64468b4086882947f8edd83a4f8447413132d2` on `main`; pre-existing concurrent changes were preserved.

### P0.1 — Fabric 0.24.3 closure

- RED: `node --experimental-strip-types --test .pi/away-runtime/bootstrap.test.ts` exited 1 because the manifest still reported `0.23.0` while the new assertion required `0.24.3`.
- GREEN: locked and installed `pi-fabric` both resolved to `0.24.3`; child-source value SHA-256 remained `ee0bb190d5af47ff6ee99a0dd5874889b44b0857db23b897b4c57c88956793fb`; `node-process-runtime.js:29` retained the writable `process.execPath` seam.
- Verify: `node --experimental-strip-types --test .pi/away-runtime/bootstrap.test.ts .pi/away-runtime/executor-sandbox.test.ts` — exit 0, 44 tests passed.
- Settled candidate hashes: manifest `d2a931fdd3c82e1b43f340d207cd9526c23ca5ca`; bootstrap test `84dd7a47d713ad6fd961b2b3bb7d2d39357b2834`; executor test `185552ea9aec0bbb5661a18bb419a17be5220a49`.
- Commit: `729ca97dd388dd86c203784d5532eb40390900f2`.
### P0.2 — Fabric authority reconciliation (reload barrier)

- RED: the targeted authority assertion exited 1 at `canonical goal is not 0.24.3`.
- Scope correction: `.pi/prompts/init.md` was added because the structural contract enforces three-way managed-boilerplate byte identity across AGENTS, fixture, and init prompt. The operator authorized two serial substeps: three source documents, then two packet files.
- P0.2a source authority passed: active canonical and managed text targets locked/live `pi-fabric` 0.24.3; current citations point to `dist/worker.js:209-214` and `agent-session.js:631-642`. Historical ADR records outside active authority were not rewritten.
- The managed `AGENTS.md` change intentionally created a new reload barrier after the earlier initialization refresh; it was not a recurrence of the old barrier.
- Recovery mode: operator-directed equivalent recovery, not a normal `/init --refresh` invocation in this turn. The operator reported completing the reload/refresh sequence; Main independently confirmed the active context carried the updated managed authority, all six packet files existed, and AGENTS, the locked fixture, and the embedded init block shared SHA-256 `e12e27bdb65d49e4431cc7ede5549071d8bc195e8a5690f4ca6c7203d1e3bd2b`, then promoted only the stale sentinel to `ready` / `false`.
- Exact P0.2 Verify command — exit 0. Three-way managed-region identity and task-scoped `git diff --check` also exited 0.
- Settled candidate hashes: fixture `d1341d1a5f017f59e57b990dcee759e5615e5bbc`; init prompt `9e5d8eed456ab8462c819acb587176162f51a126`; canonical PLAN `4799eb21560d7146a4ec376d75f33153b40d295f`; AGENTS `c984750c28ad1f42fe7cf8ec8504ced13dcfeb33`; state `986bf7fccdd4950bfc8faa964ce0ccd2cd8b1970`.
- Commit: `cc6160ab023e112dc989d3041b2590ab7367783e`.

### Operator override — historical execution while the P0.2 barrier was pending

- Exact operator directive: `# Ship: autonomous-away-loop FUCKING GO!!!!`
- At that point Main observed `initialization_status: partial`; the directive was treated as an explicit Rule 0 override of the `/ship` packet stop for reversible implementation work only.
- That pending state is superseded by the operator-directed equivalent recovery and successful P0.2 verification above.
- The override did not authorize deletion, destructive Git, push/publication, live external effects, or bypass of task tests/review.

### P0.3 — Separate network scouting from repository access

- Executed while the P0.2 reload barrier was pending under the recorded operator override; P0.2 was subsequently reconciled and verified.
- RED: targeted external-scout tests exited 1. The lane exposed `away_read`, and the real strict sandbox returned sentinel `NETWORKED_SCOUT_MUST_NOT_READ_REPOSITORY_7d39e2` through the host bridge.
- GREEN: `external-scout` retains `network: true` and `filesystem: false` but now has an empty `host_call_refs` array. Unit coverage rejects read/list/search registration; a real wrapper+bubblewrap run confirms sentinel denial.
- Verify: `node --experimental-strip-types --test --test-name-pattern='external scout.*(filesystem|sentinel|read)' .pi/away-runtime/{lane-extension,integration}.test.ts` — exit 0, 2 tests passed.
- Candidate hashes: manifest `eed11efde6fd31a96d0cb36e0788848ac4cfc2b4`; lane test `be192a5b6c377657dc8c702dfb549aa9ee6b22b8`; integration test `b24909a115656aa876805b6525c1e44b1ee3bcf0`.
- Commit: `82bacdfd5ce367183bf52b4d5f1f1e7e2d1bc588`.

### P0.4 — Re-establish ADR-014 foundation

- Full checkpoint: `node --experimental-strip-types --test .pi/away-runtime/*.test.ts && git diff --check` — exit 0.
- Result: 209 tests passed across 52 suites; no failures, skips, cancellations, or TODOs; diff hygiene passed.
- Commit: N/A (verification-only checkpoint, no task-owned file mutation).
- At checkpoint time P0.2 packet readiness was still pending; the later operator-directed equivalent recovery and exact P0.2 verification supersede that constraint.

### A1 — Durable external effect ledger

- RED: `ledger.test.ts` initially exited 1 with `ERR_MODULE_NOT_FOUND` for `ledger.ts`.
- Implementation: `away-loop-ledger/1`, bounded allowlisted host facts, monotonic legal reducer, immutable effect keys/exclusive reservation, canonical length+SHA-256 frames, strict fsync append, caps, retained torn evidence.
- Review finding: a High crash-replay defect was independently validated in the initial in-band recovery marker because marker+record could tear before the marker completed. Resolved by an empty `O_EXCL`-created/fsynced recovery acknowledgement whose filename binds prior segment number/length/SHA-256 before any fallible successor write; partial successors recover via the next ack/segment without deleting evidence.
- Verify: `node --experimental-strip-types --test .pi/away-runtime/ledger.test.ts` — exit 0, 26 tests passed; dynamic import exit 0; task diff-check exit 0.
- Settled blob hashes: `ledger.ts` `249a8efe8032dbcc973d38c9a179a979cccb0f2e`.
- Commit: `f50c607c4306cfe3461b91965ffad2a62ed5dcf2`.

### A2 — Deterministic selection and reservation

- Initial worker produced only a stale dry-run test and no controller; Main rejected it and fixed root contracts before acceptance.
- Implementation: strict `.pi/ROADMAP.md` grammar v1, six-file `.pi/state.md` ready/hash packet gate without memory reads, all-lane closure gate, main/HEAD/repository Git facts, real nonblocking held flock lease, lowest eligible card selection, namespace/ledger filtering, and fsynced A1 reservation with pre-append packet/source/base/repository/closure/namespace drift checks.
- Live roadmap parsed RM-001..003 and returned no-work because all are manual-only.
- Verify command `node --experimental-strip-types --test --test-name-pattern='selector|reservation|no-work|source drift|lease|packet|closure' .pi/away-runtime/controller.test.ts` exit 0, 11 tests passed; import and task diff-check exit 0.
- Commit `983c9a2738fb1b3e8a58d3b3db72a340b014fad5`.
- Do not claim /supervise --away is implemented yet; that remains assigned to A3/A7.

### Operator scope — /supervise --away UX

- Operator directive: the shipped feature must be usable as `/supervise --away [objective]`. Normal `/supervise` remains the existing advisory actor-only prompt. Exact `/supervise --away` is intercepted by a project extension `input` hook before template expansion; no extension command named `supervise` is registered (it would shadow normal prompt behavior). The hook ignores extension-injected input and intercepts only idle interactive/RPC exact grammar `^/supervise\s+--away(?:\s+.*)?$`; malformed supervise forms pass to normal prompt handling or fail in the prompt, not start away mode. The hook reconciles/uses the existing read-only supervisor, then starts the trusted controller without giving the supervisor dispatch/write authority.
- Assignment: this UX is assigned to A3 (input-hook implementation, normal supervise pass-through, fixed lifecycle policy) and A7 (real command-discovery/RPC smoke of the command split). A1 remains completed; no implementation claimed yet.

### A3 — Fixed-policy lifecycle and /supervise --away entry

- RED: focused tests failed on missing lifecycle exports and the drifted extension's separate `runAwayOnce` path. Additional review RED cycles covered expanded prompt history, candidate path/hash evidence, objective isolation, host actor proof, pending cleanup, distinct candidate commits, strict result shapes, and independent freshness assertions.
- Controller: only a durable A2 reservation can drive the exact source-backed `/create <slug> --from .pi/ROADMAP.md#RM-NNN` → `/ship <slug>` → host-observed clean candidate path/hash set → `/verify <slug>` sequence. Supplemental objective text is bounded and excluded from reservation input; only fixed unattended answers are accepted.
- Entry hook: exact idle interactive/RPC `/supervise --away [objective]` transforms to an internal nonce mode; normal/malformed/extension-injected/non-idle input passes through. No extension command named `supervise` is registered. The continuation requires JSON READY evidence, exact canonical read-only actor registry fields/instructions, and the nonce-bound actor transcript before calling the canonical controller.
- Review disposition: validated High forged-READY concern fixed with host actor registry + transcript proof; all six validated Medium/Low findings fixed (distinct OID, strict result discriminants, settled-turn cleanup, split freshness test, pre-retention objective bound, independent input-guard tests).
- Foundation repair: isolated full-suite failures reproduced. The writer-token barrier was restored before attestation, direct tests now model host release, and the stale closure-error regex was aligned to the authoritative `closure: missing required closure input` contract.
- Verify: `node --experimental-strip-types --test .pi/away-runtime/*.test.ts` — exit 0, 257 tests passed; `node --experimental-strip-types --test .pi/extensions/away/index.test.ts` — exit 0, 11 tests passed; controller/extension imports and `git diff --check` exit 0.

## Verification candidate — incomplete full-scope run

- Ready-packet gate: exit 0; six files present, schema 1, ready, reload false, and managed AGENTS SHA-256 matched.
- Initial fingerprint: HEAD `3cbcc6ccb221195125cb5f3ac66e763d37a8f57b`; staged `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; unstaged `3d7d54daedc225f91aef0597abba394c78544f84957bcc8c5c96d3ac085cf306`; untracked `0bde0564e5bf00ca4bc3dc7e577661905dcf768f1227ee37b850b556cef4c688`.
- Completeness: 7/13 PLAN tasks implemented. A4, A5, A6, A7, D1, and V1 remain unchecked; planned Git/GitHub broker and replay test files are absent.
- Full runtime gate: `node --experimental-strip-types --test .pi/away-runtime/*.test.ts` — exit 0, 257/257 passed.
- Away extension gate: `node --experimental-strip-types --test .pi/extensions/away/index.test.ts` — exit 0, 11/11 passed.
- ADR-015 authority gate — exit 1: required ADR heading and canonical `away-loop-ledger/1` text are absent.
- Typecheck, lint, and build are unavailable because this repository has no configured tools/scripts; these required skips block terminal verification.
- Gated live smoke was not run because no explicit authorization was supplied.
- Advisory evidence review failed to launch because the Fabric child budget was already exhausted; this is advisory only. Main independently validated the missing-scope evidence.
- Status before the final mutation-free pass: pending final no-write verification; expected result is NEEDS WORK and returns to `/ship autonomous-away-loop`.

## A4 — Git broker attempt blocked at retry limit

- Ship baseline: HEAD `3cbcc6ccb221195125cb5f3ac66e763d37a8f57b` on `main`; retained baseline snapshot `/tmp/autonomous-away-loop-ship-baseline-ujgS9q`; concurrent changes preserved.
- TDD RED: `node --experimental-strip-types --test .pi/away-runtime/git-broker.test.ts` exited 1 with `ERR_MODULE_NOT_FOUND` for the planned broker module.
- Candidate: fixed-argv host broker with dedicated branch derivation, exact-path temporary index, commit marker, local ref CAS, exact remote observation, and normal dedicated-ref push.
- GREEN attempt 1 exited 1: absent local refs were probed with the wrong Git command status contract; the test bare remote also lacked the base object. Both root causes were repaired.
- GREEN attempt 2 exited 1 with 3/4 tests passing. The remaining divergence test supplied a nonexistent expected local OID, so publication correctly failed its local-object precondition before remote-divergence classification.
- Stop condition reached after two failed GREEN attempts. Smallest next correction: construct a real distinct local candidate commit in the divergence fixture, then rerun the A4 test.
- Authorized third retry: the divergence fixture used a real distinct local candidate OID; A4 passed 4/4 tests.
- Commit: `9a36032` (`feat(away): add host Git broker`). A4 is checked.

## A5 — GitHub draft-PR broker

- TDD RED: missing `github-broker.ts` produced the expected module-resolution failure.
- GREEN: create-or-get, exact head/base/draft validation, one-POST ambiguity reconciliation, pinned REST headers, request evidence, serialized mutations, and bounded rate-limit waits passed 6/6 tests.
- Authoritative sources: GitHub REST pulls and best-practices API `2022-11-28`, plus `gh api` method/header/typed-field behavior.
- Commit: `f9433ae` (`feat(away): add GitHub draft PR broker`). A5 is checked.

## A6 — Durable crash replay

- TDD RED: replay tests reached the controller and failed because `reconcileAwayRun` was absent.
- GREEN cycles: implemented the legal ten-state reducer driver; repaired a stale-evidence fixture; then added and passed a regression proving GitHub request evidence cannot drift the durable host intent key.
- Recovery evidence: every post-reservation durable append cut converges; push and PR crashes are observed before mutation and are not duplicated; stale verification, divergent refs, and ambiguous PRs block.
- Verify: replay 4/4; controller + ledger + replay regression 45/45.
- Commit: `45e0c45` (`feat(away): reconcile durable external effects`). A6 is checked.

## A7 preflight — scope checkpoint

- The planned A7 file list contains only `integration.test.ts`, `fixtures.ts`, and `.pi/away-sandbox.json`.
- Production remains intentionally unbound: `.pi/extensions/away/index.ts` calls `runAwayController` without dependencies, and `.pi/away-runtime/controller.ts` returns `lifecycle-host: confined lifecycle host is not connected`.
- A hermetic test-only loop would not satisfy the wired `/supervise --away` goal. Production binding requires edits outside A7’s listed scope: controller/adapter/extension code and their tests.
- Operator authorized completing the artifact; the hermetic A7 proof stayed within its originally planned fixture/integration files.

## A7 — Full confined loop

- TDD RED: the new integration suite failed because autonomous Git/GitHub fixture exports did not exist.
- GREEN: added a retained real-sandbox fixture with local `main`, a local bare origin, and a strict `gh api --include` protocol service validating methods, endpoint, pinned headers, coordinates, and draft fields.
- Full-loop evidence: real launcher/wrapper/firewall/staging and exact-OID verifier; exact-path CAS commit; dedicated branch publication; crash after push and after PR creation; replay convergence without duplicate mutation; protected manifest and local/remote `main` unchanged.
- Verify: targeted A7 1/1; complete integration suite 17/17.
- Commit: `cf8150f` (`test(away): prove confined autonomous loop`). A7 is checked.
- NOTICED BUT NOT TOUCHING: live Pi extension loading currently fails before RPC command discovery (`Extension runtime not initialized`). Per operator direction this will be investigated in a separate artifact after this artifact’s non-live work; no plugin fix is included here.

## D1 — ADR-015 authority

- TDD RED/GREEN: canonical grep failed before documentation and passed after adding ADR-015 plus `away-loop-ledger/1` authority.
- Canonical PLAN/DECISIONS now bind the host-only effect boundary, lifecycle/ledger split, exact status chain, single-host scope, observe-before-mutate replay, retained evidence, and human-only merge.
- Verify: ADR heading + ledger schema grep and doc diff hygiene passed.
- Commit: `d21f6e1` (`docs(away): codify autonomous loop authority`). D1 is checked.

## V1 — Deterministic acceptance and live blockers

- Fresh deterministic regression: all `.pi/away-runtime/*.test.ts` passed 272/272 with zero skips; away extension unit tests passed 11/11; `git diff --check` passed.
- Quality-gate blocker: `.pi/away-runtime/controller.ts` still contains the A7 placeholder `confined lifecycle host is not connected`, so the default extension path cannot run an eligible card.
- Live-entry blocker: the planned `controller.ts --once --live-smoke <config>` CLI is absent, and `~/.config/pi-away/live-smoke.json` does not exist. The specified command would currently perform no smoke.
- Separately deferred plugin blocker: loading `.pi/extensions/away/index.ts` in Pi fails during extension initialization, as reported by the operator; investigation belongs to the requested follow-up artifact.
- No GitHub POST, remote push, merge, or cleanup was attempted. V1 remains unchecked and this artifact cannot honestly receive terminal verified status yet.

This file does not declare terminal verification; only `/verify autonomous-away-loop` may do that.
