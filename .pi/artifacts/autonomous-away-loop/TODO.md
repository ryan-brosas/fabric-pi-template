# TODO — Autonomous Away Loop (`autonomous-away-loop`)

Executable task list synchronized with `PLAN.md`. The source roadmap remains read-only.

### 2026-07-23 - RM-003 autonomous away loop
status: active

#### P0.1 [prerequisite] Synchronize the operational Fabric closure
- [x] Manifest/runtime assertions identify locked/live Fabric 0.24.3 and re-prove the wrapper seam plus child-source digest.
- **depends_on:** `[]`
- **parallel:** `false`
- **conflicts_with:** `[P0.2, P0.3]`
- **files:** [`.pi/away-sandbox.json`, `.pi/away-runtime/bootstrap.test.ts`, `.pi/away-runtime/executor-sandbox.test.ts`]
- **Verify:** `node -p 'require("./.pi/npm/package-lock.json").packages["node_modules/pi-fabric"].version' | rg -x '0\.24\.3' && node --experimental-strip-types --test .pi/away-runtime/{bootstrap,executor-sandbox}.test.ts`

#### P0.2 [authority] Reconcile canonical and managed Fabric authority
- [x] Operational 0.24.3 text is synchronized through canonical PLAN, init boilerplate, managed AGENTS, and the reload/refresh packet cycle while historical citations remain intact.
- **depends_on:** `[P0.1]`
- **parallel:** `false`
- **conflicts_with:** `[P0.1, D1]`
- **serial_substeps:**
  - `P0.2a` source authority — [`.opencode/artifacts/pi-native-init/boilerplate.md`, `.pi/prompts/init.md`, `.pi/artifacts/pi-template/PLAN.md`]
  - `P0.2b` packet authority — [`AGENTS.md`, `.pi/state.md`]
- **Verify:** `node -e 'const fs=require("fs"),crypto=require("crypto"); const a=fs.readFileSync("AGENTS.md","utf8"),s=fs.readFileSync(".pi/state.md","utf8"); const x="<!-- pi:init:boilerplate:start -->",y="<!-- pi:init:boilerplate:end -->"; const h=crypto.createHash("sha256").update(a.slice(a.indexOf(x)+x.length,a.indexOf(y))).digest("hex"); if(!s.includes("initialization_status: ready")||!s.includes("context_reload_required: false")||!s.includes(h)) process.exit(1)'`

#### P0.3 [security] Separate network scouting from repository access
- [x] External scouting retains network research but no repository read/list/search bridge, with end-to-end sentinel denial.
- **depends_on:** `[P0.2]`
- **parallel:** `false`
- **conflicts_with:** `[P0.1, A7]`
- **files:** [`.pi/away-sandbox.json`, `.pi/away-runtime/lane-extension.test.ts`, `.pi/away-runtime/integration.test.ts`]
- **Verify:** `node --experimental-strip-types --test --test-name-pattern='external scout.*(filesystem|sentinel|read)' .pi/away-runtime/{lane-extension,integration}.test.ts`

#### P0.4 [checkpoint] Re-establish the ADR-014 foundation
- [x] Every runtime test passes after prerequisite work; no A-series implementation starts on stale evidence.
- **depends_on:** `[P0.3]`
- **parallel:** `false`
- **conflicts_with:** `[A1, A2, A3, A4, A5, A6, A7]`
- **files:** `[]`
- **Verify:** `node --experimental-strip-types --test .pi/away-runtime/*.test.ts && git diff --check`

#### A1 [persistence] Add the durable external effect ledger
- [x] A framed, fsynced, append-only, secret-free journal supports exclusive reservation, legal transitions, torn-tail recovery, duplicate no-op, and fail-closed corruption.
- **depends_on:** `[P0.4]`
- **parallel:** `false`
- **conflicts_with:** `[A6]`
- **files:** [`.pi/away-runtime/ledger.ts`, `.pi/away-runtime/ledger.test.ts`]
- **Verify:** `node --experimental-strip-types --test .pi/away-runtime/ledger.test.ts`

#### A2 [control] Add roadmap selection and one-shot policy
- [x] The host validates packet/closure, locks the repository, selects one stable eligible card or `no-work`, and reserves exact source/base identity.
- **depends_on:** `[A1]`
- **parallel:** `false`
- **conflicts_with:** `[A3, A4, A5, A6]`
- **files:** [`.pi/away-runtime/controller.ts`, `.pi/away-runtime/controller.test.ts`]
- **Verify:** `node --experimental-strip-types --test --test-name-pattern='selector|reservation|no-work|source drift' .pi/away-runtime/controller.test.ts`

#### A3 [lifecycle] Drive lifecycle through fixed host policy
- [x] The controller invokes `/create` as sole creator, drives `/ship`, creates/observes the candidate commit, invokes `/verify` on that OID, and blocks unexpected dialogue/claims. A project extension `input` hook implements the exact `/supervise --away [objective]` UX: it intercepts only idle interactive/RPC exact grammar `^/supervise\s+--away(?:\s+.*)?$` before template expansion, ignores extension-injected input, reconciles/uses the existing read-only supervisor without granting it dispatch/write authority, then starts the trusted controller; it never registers an extension command named `supervise`, so normal `/supervise` stays the existing advisory actor-only prompt and malformed supervise forms pass to normal prompt handling or fail in the prompt rather than starting away mode.
- **depends_on:** `[A2]`
- **parallel:** `false`
- **conflicts_with:** `[A2, A4, A5, A6]`
- **files:** [`.pi/away-runtime/controller.ts`, `.pi/away-runtime/controller.test.ts`, `.pi/away-runtime/launcher.ts`, `.pi/extensions/away/index.ts`, `.pi/extensions/away/index.test.ts`, `.pi/prompts/supervise.md`]
- **Verify:** `node --experimental-strip-types --test --test-name-pattern='supervise|input hook|normal pass-through|policy answer|namespace|ship|verify' .pi/away-runtime/controller.test.ts .pi/extensions/away/index.test.ts`

#### A4 [git] Add the host Git broker
- [x] Exact-path commits, local-ref CAS, dedicated fast-forward publication, and remote reconciliation are host-derived and cannot alter default/foreign refs.
- **depends_on:** `[A3]`
- **parallel:** `false`
- **conflicts_with:** `[A2, A3, A6]`
- **files:** [`.pi/away-runtime/git-broker.ts`, `.pi/away-runtime/git-broker.test.ts`, `.pi/away-runtime/controller.ts`]
- **Verify:** `node --experimental-strip-types --test .pi/away-runtime/git-broker.test.ts`

#### A5 [github] Add the host GitHub draft-PR broker
- [x] Exact create-or-get, API pinning, bounded retries, ambiguity queries, request evidence, and rate-limit handling produce at most one draft pull request.
- **depends_on:** `[A4]`
- **parallel:** `false`
- **conflicts_with:** `[A2, A3, A6]`
- **files:** [`.pi/away-runtime/github-broker.ts`, `.pi/away-runtime/github-broker.test.ts`, `.pi/away-runtime/controller.ts`]
- **Verify:** `node --experimental-strip-types --test .pi/away-runtime/github-broker.test.ts`

#### A6 [recovery] Reconcile every ambiguous effect
- [x] Restart from each cut point queries journal, refs, receipts, run records, and GitHub before mutation and converges once or blocks with evidence.
- **depends_on:** `[A5]`
- **parallel:** `false`
- **conflicts_with:** `[A1, A2, A3, A4, A5]`
- **files:** [`.pi/away-runtime/controller.ts`, `.pi/away-runtime/ledger.ts`, `.pi/away-runtime/replay.test.ts`]
- **Verify:** `node --experimental-strip-types --test .pi/away-runtime/replay.test.ts`

#### A7 [integration] Prove the full confined loop hermetically
- [x] A retained fixture runs real ADR-014 plumbing/controller with local bare Git and protocol-faithful GitHub, crash injection, and protected-path hashes.
- **depends_on:** `[A6]`
- **parallel:** `false`
- **conflicts_with:** `[P0.3]`
- **files:** [`.pi/away-runtime/integration.test.ts`, `.pi/away-runtime/fixtures.ts`, `.pi/away-sandbox.json`]
- **Verify:** `node --experimental-strip-types --test .pi/away-runtime/integration.test.ts`

#### D1 [docs] Codify ADR-015 authority
- [x] Canonical PLAN/DECISIONS record the tested ledger/effect boundary, single-host scope, lifecycle split, human-only merge, replay, and source obligations.
- **depends_on:** `[A7]`
- **parallel:** `false`
- **conflicts_with:** `[P0.2]`
- **files:** [`.pi/artifacts/pi-template/PLAN.md`, `.pi/artifacts/pi-template/DECISIONS.md`]
- **Verify:** `rg -q '^## ADR-015: Autonomous away loop$' .pi/artifacts/pi-template/DECISIONS.md && rg -q 'away-loop-ledger/1' .pi/artifacts/pi-template/PLAN.md && git diff --check`

#### V1 [acceptance] Run regression and gated live smoke
- [ ] Deterministic tests pass, then an explicitly authorized invocation using `~/.config/pi-away/live-smoke.json` observes one dedicated branch and draft PR without merge/cleanup.
- **depends_on:** `[D1]`
- **parallel:** `false`
- **conflicts_with:** `[]`
- **files:** `[]`
- **Verify:** `node --experimental-strip-types --test .pi/away-runtime/*.test.ts && git diff --check`
- **Verify (explicit operator authorization required):** `node --experimental-strip-types .pi/away-runtime/controller.ts --once --live-smoke ~/.config/pi-away/live-smoke.json`