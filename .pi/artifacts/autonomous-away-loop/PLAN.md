# PLAN — Autonomous Away Loop (`autonomous-away-loop`)

**Status:** specified — ready for `/ship`
**Discovery Level:** 3 — Deep research covered runtime seams, tests, dependencies, external Git/GitHub behavior, and an epic blind-spot review.
**Effective Review Level:** 3 — max(discovery 3, risk floor 3 for credentials, durable state, concurrency, external side effects, and cross-subsystem work).

## Provenance

- **Source path:** `.pi/ROADMAP.md`
- **Anchor:** `RM-003`
- **Whole-file SHA-256:** `897ffa6f3a94b55e4eff8b3f415936c848b53321a96b40495417226558ba742d`
- **Roadmap ID:** `RM-003`
- **Extracted-section SHA-256:** `896717e76332f7ee181a714169e9857d23ed150a3bad4173ae130098eee99545`

## Problem Statement

ADR-014 provides strict bubblewrap/cgroup confinement, fixed host-derived lane dispatch, staged writes, attestation, and exact-OID verification, but intentionally stops before the real unattended loop. There is no durable reservation ledger, deterministic roadmap selector, lifecycle controller, Git broker, GitHub draft-PR broker, or recovery protocol for a crash between an external mutation and its local acknowledgement.

An operator needs one explicitly enabled, single-repository away invocation to select one eligible roadmap card, create and ship it through the existing lifecycle, verify an exact candidate commit under confinement, publish only a dedicated branch and draft pull request, and reconcile every ambiguous effect after restart without mutating the roadmap or trusting model claims.

## Goal

Deliver a host-controlled, crash-replayable one-card away loop whose reservation, candidate, verification, Git, GitHub, and completion facts are derived from durable local or remote observations while generated code remains confined and credential-free.

## Scope

### In scope

- Reconcile the operational ADR-014 Fabric pin and binding authority to locked/live `pi-fabric` 0.24.3 before loop implementation.
- Close the pre-existing network-plus-repository-read capability intersection in the `external-scout` lane before unattended use.
- Select one deterministic `Ready` card only when `Autonomy: away-ok`, `Open decisions: none`, candidate slug, dependencies, namespace, and ledger checks pass.
- Reserve stable roadmap ID, exact roadmap hash, base OID, repository identity, slug, and host-generated run ID without modifying `.pi/ROADMAP.md`.
- Drive `/create` → `/ship` → host commit → `/verify` in an isolated retained workspace; `/create` remains the sole namespace creator.
- Permit only fixed unattended answers: Deep research, proceed only in the clean isolated workspace, reject unexpected questions, and never authorize agent-side commit, push, publication, or merge.
- Persist an external append-only, fsynced, checksum-framed ledger and serialize one controller per repository with `flock`.
- Create a dedicated run branch with exact-path staging and local-ref compare-and-swap; publish only a fast-forward dedicated branch after verification.
- Create-or-get one draft pull request through a host GitHub broker with exact head/base reconciliation, bounded retries, and rate-limit handling.
- Replay every durable cut point using ledger, local/remote refs, retained host run evidence, and GitHub observations before mutation.
- Ship the operator entry point as `/supervise --away [objective]`: a project extension `input` hook intercepts only idle interactive/RPC exact grammar `^/supervise\s+--away(?:\s+.*)?$` before template expansion, ignores extension-injected input, reconciles/uses the existing read-only supervisor, then starts the trusted controller without granting it dispatch/write authority; normal `/supervise` remains the existing advisory actor-only prompt and no extension command named `supervise` is registered.

### Out of scope

- Automatic merge, update of `main`, force-push, branch deletion, pull-request closure, or destructive cleanup.
- Roadmap mutation, status rewriting, ID allocation, completion marks, or treating the ledger as lifecycle authority.
- A daemon, recurring scheduler, multi-card batch, multi-repository fleet, or cross-host distributed lock.
- Model-selected capabilities, subprocess arguments, Git refs, GitHub endpoints, credentials, or retry policy.
- Credentials, repository bytes, raw prompts/tool output, source content, or logs in the ledger or sandbox environment.
- Broad network access for a lane that can read repository files.
- New npm/database dependencies, SQLite, compatibility shims, or normal interactive-session changes.
- Automatic deletion of retained workspaces, ledger segments, branches, or evidence.

## User Stories

- As an operator, I can explicitly start one away run and return to a durable branch, draft pull request, and evidence trail without staying online.
- As an operator recovering after a crash, I can rerun the controller and have it reconcile observed effects instead of duplicating them.
- As a maintainer, I can audit selection and completion through stable roadmap provenance, exact OIDs, receipt hashes, and remote identifiers.
- As a security reviewer, I can prove generated code never receives credentials or Git/GitHub authority and a networked scout cannot read repository bytes.

## Proposed Solution

### Prerequisite closure

Align `.pi/away-sandbox.json`, operational canonical PLAN text, and managed AGENTS source/region with locked/live Fabric 0.24.3 while preserving historical references. Reconfirm the child-source value digest and writable-`process.execPath` seam, complete the required reload/refresh packet cycle, remove repository refs from the networked scout, and pass the complete ADR-014 suite. Any failure blocks all A-series work.

### Selection and reservation

`.pi/away-runtime/controller.ts` is an explicitly invoked, one-shot trusted-host entrypoint. It validates the ready packet and immutable closure, acquires a per-repository `flock`, hashes and parses roadmap schema v1, and chooses the lowest stable eligible roadmap ID not reserved/completed for those source bytes. The live manual-only roadmap may yield deterministic `no-work`; tests use an immutable away-eligible fixture.

Reservation is fsynced before workspace or namespace creation. Changed source/base identity, partial/existing namespace, unresolved dependency, malformed ledger, unavailable lock, or unexpected lifecycle dialogue blocks.

### External effect ledger

`.pi/away-runtime/ledger.ts` owns a narrow `away-loop-ledger/1` journal outside the repository. Records contain only version, sequence, run/repository/card identifiers, source hashes, OIDs, effect key, bounded status, receipt/request identifiers, and timestamps—never secrets, source, prompts, payloads, or lifecycle prose.

Each length/checksum-framed record is flushed before advancement; segment creation fsyncs its directory. A torn final frame is retained and replay starts a new segment; earlier corruption blocks. Repeating the same event key/value is a no-op; a conflicting value blocks. Nothing is truncated or deleted automatically. The journal records external effects only; the four slug artifacts remain lifecycle authority and only `/verify` declares terminal verified status.

### Lifecycle controller

The trusted controller is started only through `/supervise --away [objective]`. A project extension `input` hook intercepts only the idle interactive/RPC exact grammar `^/supervise\s+--away(?:\s+.*)?$` before template expansion, ignores extension-injected input, reconciles/uses the existing read-only supervisor (granting it no dispatch/write authority), then starts the trusted controller. No extension command named `supervise` is registered, so normal `/supervise` remains the existing advisory actor-only prompt; malformed supervise forms pass to normal prompt handling or fail in the prompt rather than starting away mode.

A reservation gets a retained workspace and dedicated branch rooted at the recorded base OID. The controller invokes a concrete source-backed `/create` command for the selected ID; it never creates the namespace itself. It supplies only fixed policy answers and aborts on anything else.

After `/ship`, the host validates candidate paths/hashes from staging and attestation, stages only exact paths, and creates or observes one local candidate commit. `/verify` runs against the exact clean commit OID. No repository write follows its final fingerprint; push, draft-PR creation, and completion journaling are external to repository bytes.

### Git broker

`.pi/away-runtime/git-broker.ts` runs fixed argv arrays without a shell, validates repository/remote/ref grammar, and uses a dedicated branch shaped like `pi-away/rm-003-01234567`. It stages only host-validated paths, records a run marker in commit metadata, and updates the local ref with old-OID compare-and-swap.

Before/after push it observes the exact remote ref with `git ls-remote --exit-code`; absent, match, divergence, auth failure, and transport ambiguity are distinct. It performs a normal fast-forward push only. It never pushes `main`, forces, deletes refs, merges, or rewrites another run's branch.

### GitHub broker

`.pi/away-runtime/github-broker.ts` uses host `gh api` 2.96.0 with REST version `2022-11-28`, allowlisted repository/hostname/base, explicit methods, bounded JSON/output, and host-held authentication. It lists exact head/base before create, creates a draft only when absent, and lists again after timeout, 5xx, conflict, or creation ambiguity. It never blindly replays POST.

Mutations are serialized; `Retry-After` and primary reset headers drive bounded backoff. `X-GitHub-Request-Id` is evidence, not idempotency. Multiple matches, mismatched coordinates, unexpected repository, or exhausted retries block.

### Replay and completion

Legal host-observed transitions are `reserved`, `workspace_observed`, `candidate_observed`, `commit_observed`, `verified`, `push_intent`, `push_observed`, `pr_intent`, `pr_observed`, then `completed`, `blocked`, or `aborted`. Restart acquires the lock, validates source identity, replays the journal, and queries the authoritative system for the next ambiguous effect before mutation. Completion requires a valid `/verify` result tied to the commit/fingerprint, expected remote OID, and exactly one observed draft pull request. Model prose or exit code alone cannot advance state.

## Success Criteria

1. **Current Fabric closure.** Operational pins/authority resolve to 0.24.3, digest/seam are re-proven, packet is ready, and ADR-014 passes.
   **Verify:** `node -p 'require("./.pi/npm/node_modules/pi-fabric/package.json").version' | rg -x '0\.24\.3' && node -e 'const m=require("./.pi/away-sandbox.json"); if(m.pinned_versions.pi_fabric!=="0.24.3") process.exit(1)' && node --experimental-strip-types --test .pi/away-runtime/*.test.ts`
2. **No network-plus-repository capability.** External scout cannot read/search/list repository bytes and a sentinel exfiltration attempt is denied.
   **Verify:** `node --experimental-strip-types --test --test-name-pattern='external scout.*(filesystem|sentinel|read)' .pi/away-runtime/{lane-extension,integration}.test.ts`
3. **Deterministic immutable selection.** Fixture selects one stable ID, live roadmap returns `no-work`, drift/duplicate namespace block, and roadmap bytes do not change.
   **Verify:** `node --experimental-strip-types --test --test-name-pattern='selector|no-work|roadmap' .pi/away-runtime/controller.test.ts`
4. **Durable host facts.** Concurrent attempts yield one reservation; torn-tail replay is safe; earlier corruption blocks; duplicate events do not duplicate completion.
   **Verify:** `node --experimental-strip-types --test .pi/away-runtime/ledger.test.ts`
5. **Lifecycle ownership.** Controller invokes `/create` as sole creator, accepts only fixed policy answers, and leaves lifecycle truth in the four artifacts.
   **Verify:** `node --experimental-strip-types --test --test-name-pattern='namespace|policy answer|lifecycle authority' .pi/away-runtime/controller.test.ts`
6. **Confinement and credentials.** Git/GitHub/ledger remain host-only; sandbox descendants cannot access credentials, host Git state, or broker commands.
   **Verify:** `node --experimental-strip-types --test .pi/away-runtime/{executor-sandbox,confinement,integration}.test.ts`
7. **Git reconciliation.** Local CAS, exact-path commit, remote state classification, ambiguous push recovery, and retry produce one dedicated branch OID without default-branch mutation.
   **Verify:** `node --experimental-strip-types --test .pi/away-runtime/git-broker.test.ts`
8. **GitHub create-or-get.** Head/base lookup, draft create, post-timeout reconciliation, duplicate detection, headers, request evidence, and backoff produce at most one draft PR.
   **Verify:** `node --experimental-strip-types --test .pi/away-runtime/github-broker.test.ts`
9. **Crash replay.** Crashes before/after every ledger flush, commit/ref update, remote probe/push, verification receipt, and PR request converge or block without duplicate effects.
   **Verify:** `node --experimental-strip-types --test .pi/away-runtime/replay.test.ts`
10. **Fresh completion.** Stale fingerprint, changed commit, mismatched receipt, divergent remote OID, or ambiguous PR prevents completion.
    **Verify:** `node --experimental-strip-types --test --test-name-pattern='freshness|completion gate|mismatch' .pi/away-runtime/{controller,replay}.test.ts`
11. **Full confined loop.** Real launcher/wrapper/firewall/staging/verifier run with local bare Git and a protocol-faithful GitHub service; only provider, clock, and GitHub service are fake.
    **Verify:** `node --experimental-strip-types --test .pi/away-runtime/integration.test.ts`
12. **No cleanup/regression.** Evidence is retained, caps fail closed, protected/source bytes remain unchanged, full tests and diff hygiene pass.
    **Verify:** `node --experimental-strip-types --test .pi/away-runtime/*.test.ts && git diff --check`
13. **Command split and RPC smoke.** The away entry is exactly `/supervise --away [objective]` via the input hook (normal `/supervise` unaffected, no extension command named `supervise`), and a real command-discovery/RPC smoke under A7 confirms the split end-to-end in the confined loop.
    **Verify:** `node --experimental-strip-types --test --test-name-pattern='supervise|input hook|normal pass-through' .pi/extensions/away/index.test.ts && node --experimental-strip-types --test --test-name-pattern='command discovery|RPC smoke|supervise' .pi/away-runtime/integration.test.ts`

## Technical Context

- This template has no application `src/`; implementation lives in `.pi/away-runtime/` and uses Node strip-types plus `node:test`.
- `dispatch.ts:21-29,62-97` maps trusted phases and rejects model capability fields.
- `staging.ts:54-108,126-231` provides path reservation, atomic replacement, hash validation, and settlement barrier.
- `attestation.ts:45-99,145-214` provides allowlisted fsynced evidence.
- `launcher.ts:54-60,136-139` is bounded launch plumbing, not durable state.
- `verifier.ts:1-13,237-276` uses exact-OID evidence with read-only source/deps/catalog and writable scratch only.
- `.pi/away-sandbox.json:130-143` combines network with `away_read`/`away_search`; `lane-extension.ts:117-138,172-194` confirms those refs read repository source. This independently validated High defect is prerequisite scope.
- `.pi/away-sandbox.json:10` says 0.23.0 while lockfile/live package/settings/tech-stack resolve 0.24.3.
- The review's staged-discard concern is disproved by `lane-extension.ts:317-335` plus `staging.ts:206-231`, which block discard until host settlement.
- The coarse verifier `writable:true` concern is disproved by `verifier.ts:266-276`, which ro-binds inputs and limits writes to scratch.

## Affected Files

### Existing paths

- `.pi/away-sandbox.json`
- `.pi/away-runtime/bootstrap.test.ts`
- `.pi/away-runtime/executor-sandbox.test.ts`
- `.pi/away-runtime/lane-extension.ts`
- `.pi/away-runtime/lane-extension.test.ts`
- `.pi/away-runtime/dispatch.ts`
- `.pi/away-runtime/launcher.ts`
- `.pi/away-runtime/verifier.ts`
- `.pi/away-runtime/fixtures.ts`
- `.pi/away-runtime/integration.test.ts`
- `.pi/artifacts/pi-template/PLAN.md`
- `.pi/artifacts/pi-template/DECISIONS.md`
- `.pi/prompts/supervise.md`
- `.opencode/artifacts/pi-native-init/boilerplate.md`
- `AGENTS.md`
- `.pi/state.md`

### Planned new paths

- `.pi/away-runtime/controller.ts`
- `.pi/away-runtime/controller.test.ts`
- `.pi/away-runtime/ledger.ts`
- `.pi/away-runtime/ledger.test.ts`
- `.pi/away-runtime/git-broker.ts`
- `.pi/away-runtime/git-broker.test.ts`
- `.pi/away-runtime/github-broker.ts`
- `.pi/away-runtime/github-broker.test.ts`
- `.pi/away-runtime/replay.test.ts`
- `.pi/extensions/away/index.ts`
- `.pi/extensions/away/index.test.ts`

## Review Profile

- **Language and framework:** Node 24.16.0; TypeScript via `--experimental-strip-types`; `node:test`; locked/live `pi-fabric` 0.24.3; Pi 0.81.1; Git 2.43.0; GitHub CLI 2.96.0; util-linux `flock` 2.39.3; bubblewrap 0.9.0; systemd 255.
- **Local authorities:** `AGENTS.md`; ADR-006/011/012/013/014/016 in `.pi/artifacts/pi-template/DECISIONS.md`; canonical PLAN; this PLAN; exact RM-003 provenance.
- **Required source packet:** live `pi-fabric@0.24.3` runtime/config source; Git 2.43.0 update-ref/push/ls-remote; Node v24 fs durability; GitHub REST 2022-11-28 refs/pulls/best practices; `gh api` behavior exercised by 2.96.0; util-linux 2.39.3 flock semantics.
- **Official references:** `https://git-scm.com/docs/git-update-ref/2.43.0`, `https://git-scm.com/docs/git-push/2.43.0`, `https://git-scm.com/docs/git-ls-remote/2.43.0`, `https://nodejs.org/docs/latest-v24.x/api/fs.html`, `https://docs.github.com/en/rest/git/refs`, `https://docs.github.com/en/rest/pulls/pulls?apiVersion=2022-11-28`, `https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api?apiVersion=2022-11-28`, `https://cli.github.com/manual/gh_api`, `https://man7.org/linux/man-pages/man1/flock.1.html`.
- **Required checks:** every targeted task test, full `.pi/away-runtime/*.test.ts`, ready-packet hash gate after AGENTS updates, `git diff --check`, source/roadmap before-after hashes, and explicitly authorized live smoke before live acceptance.
- **Applicable overlays:** security, persistence/concurrency, external API correctness, recovery/idempotency, resource caps, and objective generated-code quality. Reject invented APIs, broad wrappers, compatibility shims, hidden lifecycle state, mock-only evidence, swallowed errors, and speculative abstractions.

## Tasks

### P0.1 [prerequisite] Synchronize the operational Fabric closure

The manifest/runtime assertions identify locked/live Fabric 0.24.3 and re-prove the wrapper seam plus child-source digest.

- **depends_on:** `[]`
- **parallel:** `false`
- **conflicts_with:** `[P0.2, P0.3]`
- **files:** [`.pi/away-sandbox.json`, `.pi/away-runtime/bootstrap.test.ts`, `.pi/away-runtime/executor-sandbox.test.ts`]
- **Verify:** `node -p 'require("./.pi/npm/package-lock.json").packages["node_modules/pi-fabric"].version' | rg -x '0\.24\.3' && node --experimental-strip-types --test .pi/away-runtime/{bootstrap,executor-sandbox}.test.ts`

### P0.2 [authority] Reconcile canonical and managed Fabric authority

Operational 0.24.3 text is synchronized through canonical PLAN, init boilerplate, managed AGENTS, and the reload/refresh packet cycle while historical citations remain intact.

- **depends_on:** `[P0.1]`
- **parallel:** `false`
- **conflicts_with:** `[P0.1, D1]`
- **serial_substeps:**
  - `P0.2a` source authority — [`.opencode/artifacts/pi-native-init/boilerplate.md`, `.pi/prompts/init.md`, `.pi/artifacts/pi-template/PLAN.md`]
  - `P0.2b` packet authority — [`AGENTS.md`, `.pi/state.md`]
- **Verify:** `node -e 'const fs=require("fs"),crypto=require("crypto"); const a=fs.readFileSync("AGENTS.md","utf8"),s=fs.readFileSync(".pi/state.md","utf8"); const x="<!-- pi:init:boilerplate:start -->",y="<!-- pi:init:boilerplate:end -->"; const h=crypto.createHash("sha256").update(a.slice(a.indexOf(x)+x.length,a.indexOf(y))).digest("hex"); if(!s.includes("initialization_status: ready")||!s.includes("context_reload_required: false")||!s.includes(h)) process.exit(1)'`

### P0.3 [security] Separate network scouting from repository access

External scouting retains network research but no repository read/list/search bridge, with end-to-end sentinel denial.

- **depends_on:** `[P0.2]`
- **parallel:** `false`
- **conflicts_with:** `[P0.1, A7]`
- **files:** [`.pi/away-sandbox.json`, `.pi/away-runtime/lane-extension.test.ts`, `.pi/away-runtime/integration.test.ts`]
- **Verify:** `node --experimental-strip-types --test --test-name-pattern='external scout.*(filesystem|sentinel|read)' .pi/away-runtime/{lane-extension,integration}.test.ts`

### P0.4 [checkpoint] Re-establish the ADR-014 foundation

Every existing runtime test passes after prerequisite work; no controller implementation starts on stale evidence.

- **depends_on:** `[P0.3]`
- **parallel:** `false`
- **conflicts_with:** `[A1, A2, A3, A4, A5, A6, A7]`
- **files:** `[]`
- **Verify:** `node --experimental-strip-types --test .pi/away-runtime/*.test.ts && git diff --check`

### A1 [persistence] Add the durable external effect ledger

A framed, fsynced, append-only, secret-free journal supports exclusive reservation, legal transitions, torn-tail recovery, duplicate no-op, and fail-closed corruption.

- **depends_on:** `[P0.4]`
- **parallel:** `false`
- **conflicts_with:** `[A6]`
- **files:** [`.pi/away-runtime/ledger.ts`, `.pi/away-runtime/ledger.test.ts`]
- **Verify:** `node --experimental-strip-types --test .pi/away-runtime/ledger.test.ts`

### A2 [control] Add roadmap selection and one-shot policy

The host controller validates packet/closure, locks the repository, selects one stable eligible card or `no-work`, and reserves exact source/base identity.

- **depends_on:** `[A1]`
- **parallel:** `false`
- **conflicts_with:** `[A3, A4, A5, A6]`
- **files:** [`.pi/away-runtime/controller.ts`, `.pi/away-runtime/controller.test.ts`]
- **Verify:** `node --experimental-strip-types --test --test-name-pattern='selector|reservation|no-work|source drift' .pi/away-runtime/controller.test.ts`

### A3 [lifecycle] Drive lifecycle through fixed host policy

The controller invokes `/create` as sole creator, drives `/ship`, creates/observes the candidate commit, invokes `/verify` on that OID, and blocks unexpected dialogue/claims. A project extension `input` hook implements the exact `/supervise --away [objective]` UX: it intercepts only idle interactive/RPC exact grammar `^/supervise\s+--away(?:\s+.*)?$` before template expansion, ignores extension-injected input, reconciles/uses the existing read-only supervisor without granting it dispatch/write authority, then starts the trusted controller; it never registers an extension command named `supervise`, so normal `/supervise` stays the existing advisory actor-only prompt and malformed supervise forms pass to normal prompt handling or fail in the prompt rather than starting away mode.

- **depends_on:** `[A2]`
- **parallel:** `false`
- **conflicts_with:** `[A2, A4, A5, A6]`
- **files:** [`.pi/away-runtime/controller.ts`, `.pi/away-runtime/controller.test.ts`, `.pi/away-runtime/launcher.ts`, `.pi/extensions/away/index.ts`, `.pi/extensions/away/index.test.ts`, `.pi/prompts/supervise.md`]
- **Verify:** `node --experimental-strip-types --test --test-name-pattern='supervise|input hook|normal pass-through|policy answer|namespace|ship|verify' .pi/away-runtime/controller.test.ts .pi/extensions/away/index.test.ts`

### A4 [git] Add the host Git broker

Exact-path commits, local-ref CAS, dedicated fast-forward publication, and remote reconciliation are host-derived and cannot alter default/foreign refs.

- **depends_on:** `[A3]`
- **parallel:** `false`
- **conflicts_with:** `[A2, A3, A6]`
- **files:** [`.pi/away-runtime/git-broker.ts`, `.pi/away-runtime/git-broker.test.ts`, `.pi/away-runtime/controller.ts`]
- **Verify:** `node --experimental-strip-types --test .pi/away-runtime/git-broker.test.ts`

### A5 [github] Add the host GitHub draft-PR broker

Exact create-or-get, API pinning, bounded retries, ambiguity queries, request evidence, and rate-limit handling produce at most one draft pull request.

- **depends_on:** `[A4]`
- **parallel:** `false`
- **conflicts_with:** `[A2, A3, A6]`
- **files:** [`.pi/away-runtime/github-broker.ts`, `.pi/away-runtime/github-broker.test.ts`, `.pi/away-runtime/controller.ts`]
- **Verify:** `node --experimental-strip-types --test .pi/away-runtime/github-broker.test.ts`

### A6 [recovery] Reconcile every ambiguous effect

Restart from each cut point queries journal, refs, receipts, run records, and GitHub before mutation and converges once or blocks with evidence.

- **depends_on:** `[A5]`
- **parallel:** `false`
- **conflicts_with:** `[A1, A2, A3, A4, A5]`
- **files:** [`.pi/away-runtime/controller.ts`, `.pi/away-runtime/ledger.ts`, `.pi/away-runtime/replay.test.ts`]
- **Verify:** `node --experimental-strip-types --test .pi/away-runtime/replay.test.ts`

### A7 [integration] Prove the full confined loop hermetically

A retained fixture runs real ADR-014 plumbing/controller with local bare Git and protocol-faithful GitHub, crash injection, and protected-path hashes.

- **depends_on:** `[A6]`
- **parallel:** `false`
- **conflicts_with:** `[P0.3]`
- **files:** [`.pi/away-runtime/integration.test.ts`, `.pi/away-runtime/fixtures.ts`, `.pi/away-sandbox.json`]
- **Verify:** `node --experimental-strip-types --test .pi/away-runtime/integration.test.ts`

### D1 [docs] Codify ADR-015 authority

Canonical PLAN/DECISIONS record the tested ledger/effect boundary, single-host scope, lifecycle split, human-only merge, replay, and source obligations.

- **depends_on:** `[A7]`
- **parallel:** `false`
- **conflicts_with:** `[P0.2]`
- **files:** [`.pi/artifacts/pi-template/PLAN.md`, `.pi/artifacts/pi-template/DECISIONS.md`]
- **Verify:** `rg -q '^## ADR-015: Autonomous away loop$' .pi/artifacts/pi-template/DECISIONS.md && rg -q 'away-loop-ledger/1' .pi/artifacts/pi-template/PLAN.md && git diff --check`

### V1 [acceptance] Run regression and gated live smoke

Deterministic tests pass, then an explicitly authorized invocation using `~/.config/pi-away/live-smoke.json` observes one dedicated branch and draft PR without merge/cleanup.

- **depends_on:** `[D1]`
- **parallel:** `false`
- **conflicts_with:** `[]`
- **files:** `[]`
- **Verify:** `node --experimental-strip-types --test .pi/away-runtime/*.test.ts && git diff --check`
- **Verify (explicit operator authorization required):** `node --experimental-strip-types .pi/away-runtime/controller.ts --once --live-smoke ~/.config/pi-away/live-smoke.json`

## Task-to-Criterion Traceability

| Criterion | Tasks |
|---|---|
| SC1 | P0.1, P0.2, P0.4 |
| SC2 | P0.3, A7 |
| SC3 | A2, A7 |
| SC4 | A1, A6 |
| SC5 | A3, A7 |
| SC6 | P0.3, A3, A7 |
| SC7 | A4, A6 |
| SC8 | A5, A6 |
| SC9 | A6, A7 |
| SC10 | A3, A6 |
| SC11 | A7, V1 |
| SC12 | P0.4, A7, V1 |
| SC13 | A3, A7 |

## Risks

- Ambiguous external success: journal intent then query authoritative state; never blindly replay.
- Credential/source exfiltration: host-only brokers/credentials, no repository refs in networked scout, identifier-only ledger.
- Ledger corruption: checksums, fsync, retained segments, legal reducer, fail-closed earlier corruption.
- Concurrency: one local `flock` plus reservation uniqueness; cross-host is unsupported.
- Source/candidate drift: bind roadmap hash, base OID, commit, receipt, fingerprint, remote OID, and PR.
- Git collision: unique branch, local CAS, exact remote probe, fast-forward only.
- GitHub duplication: exact head/base create-or-get and bounded retries.
- Prompt drift: fixed answer allowlist; unexpected dialogue blocks.
- Evidence growth: storage/file caps fail closed without cleanup.
- API drift: exact sources, contract tests, and gated live smoke.

## Open Questions

None. Material deviations require an explicit ADR-015 amendment.

## Stop Conditions

- Ready packet/reload gate, version/digest closure, or any ADR-014 test fails.
- A networked lane retains repository reads.
- Source, namespace, base OID, lock, journal, workspace, or closure is partial/drifting/ambiguous.
- Generated code reaches credentials, Git/GitHub, ledger mutation, raw agents, or protected paths.
- Ref/push/PR state conflicts or retry budgets expire.
- Verification evidence is stale or mismatched.
- Live smoke lacks explicit operator authorization.
- Any step would delete retained work or evidence.

## Workspace

- **Branch:** `main`
- **Initial state:** uncommitted concurrent changes present.
- **Operator decision:** proceed in the current workspace and preserve all existing changes.
- **Isolation:** `/create` writes only `.pi/artifacts/autonomous-away-loop/`; it creates no branch, stash, or worktree.