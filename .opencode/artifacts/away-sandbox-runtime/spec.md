# Away Sandbox Runtime — strict OS confinement for unattended Fabric `node-process` guests and candidate verification

**Created:** 2026-07-22
**Rewritten:** 2026-07-23 (P0.2 — stale contract replaced per plan.md's corrected design)
**Status:** Draft (corrected)
**ADR:** ADR-014 (next available; ADR-013 = mcp-research-lane settled at baseline `5dd5e34`)
**Baseline:** `.opencode/artifacts/away-sandbox-runtime/baseline.md` (OID `5dd5e347dea9a01385f6cac5433f2e533746a9de`)

## Problem Statement

### What problem are we solving?

The `autonomous-away-loop` feature needs to run model-generated code unattended — Fabric workers doing implementation, and candidate verification commands (`node --test`, builds) — with write authority, but Fabric 0.23.0 offers no real confinement boundary for that:

- `executor.runtime: "node-process"` is explicitly "an escape hatch, not a security sandbox. Node's `vm` API is not a security boundary" (`.pi/npm/node_modules/pi-fabric/docs/configuration.md:10-12`).
- `approvals.agent: "allow"` lets generated `fabric_exec` code spawn a non-recursive child; `#childTools` removes only `fabric_exec` and accepts the caller-requested remaining tools (`dist/subagents/manager.js:824-828`), so a generated `agents.run({tools:["bash"]})` bypasses any path-confined wrappers and gains arbitrary shell.
- The only internal risk grant, `PI_FABRIC_GRANTED_RISKS`, grants entire risk classes (`write`/`execute`/`network`) — broad, not path/command-scoped (`dist/core/approval-controller.js:1-22`); no public per-run/config-path override (`dist/config.js:374-395`).
- Pi extensions run with full system permissions and can execute arbitrary code (`~/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md:109-120`); ignored runtime under `.pi/.gitignore:1-7` (`/npm/`, `/git/`, `/fabric/`, `/sessions/`) is executable on the next reload but invisible to Git fingerprints.

Without a real confinement boundary, an away feature could exfiltrate credentials, escape the assigned worktree, modify protected runtime/authority files, or run arbitrary shell/network — violating every away safety invariant (human-only merge, no destructive cleanup, Main sole integrator, `/verify` authority, one writer).

### Why now?

`autonomous-away-loop` is specified and blocked at its own A1 gate precisely because no safe confinement exists (`autonomous-away-loop/spec.md:224-243`). The away loop cannot ship until a host-pinned runtime proves workers and candidate verification cannot escape. This prerequisite must land first.

### Who is affected?

- **Primary:** the operator, who wants unattended away progress without credential leakage, filesystem escape, or arbitrary shell.
- **Secondary:** future adopters copying `.pi/` — the sandbox runtime ships under `.pi` with no `.opencode` runtime dependency.

---

## Scope

### In-Scope

- A host-pinned, hash-validated away runtime under `.pi/away-runtime/` that keeps Fabric's `node-process` executor and the trusted Pi RPC host **outside** the sandbox, but points the per-lane `process.execPath` at a trusted outer wrapper (`executor-wrapper.mjs`) that launches the actual untrusted generated-code guest inside a strict bubblewrap profile (`/usr/bin/bwrap` 0.9.0).
- The trusted outer wrapper validates the exact Fabric 0.23.0 argv/source contract, validates every IPC frame/reference/argument, launches the strict bwrap profile, proxies cancellation/backpressure, and fsyncs terminal attestation before forwarding any result.
- The untrusted inner guest (`inner-guest.mjs`) runs the model-generated Fabric program with a clear allowlisted environment, no network (non-scout lanes), no host `/proc`, no credentials, no project runtime state, and minimal Node binary/shared libraries, under cgroup PID/memory/CPU/storage limits.
- Fixed host-controlled worker lanes — the controller (not the model) selects the lane profile; the model emits intents the host maps to one of `local-explorer`, `external-scout`, `writer`, `reviewer`, `verifier`. The model never chooses model IDs, tools, cwd, env, binaries, args, or risk grants, and never dispatches raw `agents.*`.
- A verifier sandbox that runs candidate test/build commands in a no-network, credential-free, source-read-only checkout with cache/scratch outside the tree, broker-controlled exact argv.
- A default-deny protected closure over all immutable startup inputs (wrapper, inner guest, lane extension, config, pinned Pi/Fabric/provider/Node/bwrap sources, command catalog), hashed at startup and rechecked before launch, after restart, and before accepting a result.
- ADR-014 codifying the confinement contract and preserved invariants.
- Dev-doc sync (`.opencode` only; the runtime operates if `.opencode` is absent).

### Out-of-Scope

- The away controller, scheduler, ledger, Git/GitHub brokers, and lifecycle prompt branches — those are `autonomous-away-loop` (ADR-015 after this lands), which calls into this runtime.
- The ledger/Git/GitHub crash-replay full loop — that remains `autonomous-away-loop` work. This feature's integration test (D1) uses the real launcher/RPC/wrapper/host-call firewall/staging/verifier and fakes only provider output and clock.
- Widening normal interactive `.pi/fabric.json` or normal-session permissions — the sandbox is invoked only by the away controller; normal `/ship`, `/verify`, and interactive Main use existing Fabric dispatch unchanged.
- A fork of Pi or pi-fabric; this uses public extension + host-process APIs only.
- Merge, force-push, reset, clean, branch/worktree deletion, arbitrary model shell, or package publication.
- Protecting against a separate malicious process already running under the same host account.

---

## Proposed Solution

### Overview

Fabric continues to execute generated programs with `node-process`. The trusted Pi RPC host (provider authentication, model traffic, lane-profile selection, the Fabric host bridge, path-confined `away_*` tools, and model response/tool-call orchestration) stays **outside** the sandbox. Fabric's `NodeProcessRuntime` dynamically reads `process.execPath` at execution time (`node-process-runtime.js:29-34`); for a dedicated lane process the host pins `process.execPath` to the trusted outer wrapper `executor-wrapper.mjs`. The wrapper validates the exact Fabric 0.23.0 argv/source contract and every IPC frame, launches the untrusted inner guest inside a strict bubblewrap profile, proxies cancellation/backpressure, and fsyncs terminal attestation before Fabric receives success.

```text
Trusted Node/Pi RPC host  (outside the sandbox)
├── provider authentication and model traffic
├── exact lane profile (controller-derived)
├── Fabric host bridge
├── path-confined away_* tools
└── model response/tool-call orchestration
          │  Fabric NodeProcessRuntime native IPC
          ▼
Trusted outer wrapper  (executor-wrapper.mjs, pinned process.execPath)
├── validates exact Fabric 0.23.0 argv/source contract
├── validates every frame/ref/argument
├── launches strict bubblewrap profile
├── records terminal attestation before forwarding result
└── proxies cancellation and backpressure
          │  bounded framed IPC through bubblewrap
          ▼
Untrusted inner node-process guest  (inner-guest.mjs)
├── model-generated Fabric program
├── clear, allowlisted environment
├── no network (non-scout), host /proc, credentials, or project runtime state
├── minimal Node binary/shared libraries only
└── cgroup PID/memory/CPU/storage limits
```

The runtime is hash-pinned: the immutable startup closure is hashed at startup; any drift pauses before launch or result acceptance. The verifier reuses the launcher with a distinct profile (read-only exact-OID source, deps read-only, scratch tmpfs, no network, no credentials, broker-controlled exact argv).

### User Flow

1. `autonomous-away-loop` controller (separate feature) derives a lane profile from trusted phase/state (the model never supplies `lane`).
2. Controller calls `launcher.launch(profile)` in its own host process, which starts Pi from an inert control cwd with exact argv/env (A1) over a dedicated RPC lane.
3. The dedicated lane extension (`lane-extension.ts`) registers uniquely-named `away_*` tools; ordinary write/shell/agent/compaction/schema refs are not exposed. Every host-call reference and argument is validated against the profile and reservation before it crosses the bridge.
4. Fabric's `NodeProcessRuntime` spawns the pinned `executor-wrapper.mjs`; the wrapper launches the strict bwrap guest and streams the result back with terminal attestation.
5. Controller advances on `agent_settled`; the writer token is held until staged mutations and cancellation barriers settle (B3).

---

## Requirements

### Functional Requirements

#### Real confinement

- **WHEN** generated node-process code runs **THEN** it runs inside a strict bubblewrap sandbox with user, PID, mount, IPC, UTS namespaces unshared (`--unshare-user`, strict — not the fail-open try variant), and the lane BLOCKS if strict userns is unavailable and confinement cannot be enforced.
- **WHEN** the inner guest attempts to reach provider credentials, host `/proc`, the ignored runtime (`/npm/`, `/git/`, `/fabric/`, `/sessions/`), or any path outside its assigned feature paths **THEN** the access is denied by bind-mount absence and clear environment (not by wrapper code the model could bypass).
- **WHEN** generated code attempts raw `agents.*` dispatch **THEN** it is not exposed; the model reaches the host only through the fixed, schema-validated `away_*` host-call references.
- **WHEN** a worker or the verifier has no network grant **THEN** no socket leaves the sandbox (bubblewrap `--unshare-net`).

#### Host-controlled lanes

- **WHEN** the controller derives a lane profile **THEN** the host — not the model — selects the lane, model, tools, cwd, env, binaries, args, and risk grant. The model never supplies these.
- **WHEN** a request names a lane that does not exist or a path outside the allowlist **THEN** the dispatch is rejected before it reaches Fabric.

#### Verifier confinement

- **WHEN** candidate verification runs (`node --test`, builds) **THEN** it runs in a fresh checkout of the exact remote OID with source + dependencies read-only, caches/scratch redirected outside the tree, no network, no credentials, and broker-controlled exact argv (command IDs, never model-supplied argv).
- **WHEN** candidate code attempts network or credential access during verification **THEN** it is denied.

#### Protected closure

- **WHEN** the runtime starts **THEN** it hashes the immutable startup closure: wrapper, inner guest, lane extension, config, pinned Pi/Fabric/provider/Node/bwrap sources, and command catalog. Mutable session/Fabric state is kept outside the immutable closure.
- **WHEN** the closure hash differs at restart, launch, or before result acceptance **THEN** the run pauses; it never proceeds on a drifted runtime.

#### Cancellation and attestation

- **WHEN** a lane is cancelled or times out **THEN** no writes or descendant sandbox processes remain; the writer token is held until bridge work and descendants settle.
- **WHEN** a result is forwarded to Fabric **THEN** the wrapper has fsynced terminal evidence (hashes, profile ID, limits, outcome — never prompts, source bytes, credentials, or raw logs) first.

### Non-Functional Requirements

- **Security:** Provider credentials exist only in the trusted Pi host process. The inner guest receives a clear, allowlisted environment; no secret-bearing path is mounted into bubblewrap. External-scout profiles receive sanitized public questions and no project filesystem. Host-call output is bounded and redacted before persistence. The selected provider necessarily receives model prompt/context; that is the declared provider trust boundary.
- **Safety:** No merge, force-push, reset, clean, branch/worktree deletion, arbitrary shell, or package publication in any lane or the broker. Human-only merge is enforced externally (GitHub branch rules), not by prompt text.
- **Reliability:** strict userns unavailable, cgroup unavailable, closure-hash drift, malformed/oversized IPC, or unknown host-call reference each pause safely without fabricating success.
- **Portability:** Runtime lives under `.pi`; the sandbox operates if `.opencode` is absent. bwrap 0.9.0 is the chosen mechanism (`/usr/bin/bwrap` verified); no new package dependency (Node 24 and bwrap 0.9.0 already exist).

---

## Success Criteria

Each invariant is asserted once (no broad alternation). Protected paths are compared against the captured baseline (`baseline.md`, OID `5dd5e34`), not current cleanliness.

- [ ] Fabric continues to execute generated programs with `node-process`; the inner guest runs inside a strict OS sandbox and cannot reach credentials, host `/proc`, the ignored runtime, or paths outside its assignment.
  - Verify: `node --experimental-strip-types --test .pi/away-runtime/executor-sandbox.test.ts` and `node --experimental-strip-types --test .pi/away-runtime/confinement.test.ts`
- [ ] Only host-selected, schema-validated tool references cross the IPC bridge; generated code cannot dispatch raw `agents.*` or choose model/tools/cwd/env/args; unknown lanes and out-of-allowlist paths are rejected.
  - Verify: `node --experimental-strip-types --test .pi/away-runtime/dispatch.test.ts` and `node --experimental-strip-types --test .pi/away-runtime/lane-extension.test.ts`
- [ ] Cancellation cannot leave writes or descendant sandbox processes running; the writer token is held until staged mutations and cancellation barriers settle.
  - Verify: `node --experimental-strip-types --test .pi/away-runtime/dispatch.test.ts` and `node --experimental-strip-types --test .pi/away-runtime/executor-sandbox.test.ts`
- [ ] Candidate verification cannot mutate its evidence tree or reach the network or credentials; it uses an immutable exact-OID evidence tree, quota-bounded writable clone, read-only deps/catalog, broker-controlled exact argv.
  - Verify: `node --experimental-strip-types --test .pi/away-runtime/verifier.test.ts` and `! rg -n 'reset --hard|clean -fd|rm -rf|force.push|branch -D' .pi/away-runtime/verifier.ts`
- [ ] The immutable startup-closure hash detects drift and pauses before launch and before result acceptance.
  - Verify: `node --experimental-strip-types --test .pi/away-runtime/confinement.test.ts`
- [ ] A worker with no network grant cannot open a socket.
  - Verify: `node --experimental-strip-types --test .pi/away-runtime/executor-sandbox.test.ts`
- [ ] The hermetic sandbox integration (real launcher + RPC parser + Fabric node-process runtime + wrapper + host-call firewall + staging + verifier; fake only provider output and clock) completes without duplicate application, surviving descendants, or protected-path change.
  - Verify: `node --experimental-strip-types --test .pi/away-runtime/integration.test.ts`
- [ ] Normal `.pi/fabric.json` and `.pi/settings.json` stay byte-identical to the baseline; normal `/ship`, `/verify`, and interactive Main are unaffected.
  - Verify: `git diff --check` and the protected-file SHA-256s in `baseline.md` are unchanged for non-shared-ownership files; `! rg -n 'away-sandbox|away-runtime' .pi/fabric.json`
- [ ] ADR-014 codifies the confinement contract and preserves each invariant separately: real OS sandbox (bubblewrap, not `node-process` as the boundary), host-controlled lanes, no model dispatch, default-deny closure, human-only merge, Main sole integrator, `/verify` authority + freshness, no destructive cleanup, no normal-session widening.
  - Verify: `rg -n '^## ADR-014: Away sandbox runtime$' .pi/artifacts/pi-template/DECISIONS.md && rg -n 'Away Sandbox Runtime|ADR-014' .pi/artifacts/pi-template/PLAN.md AGENTS.md`
- [ ] Existing ADR-011/012/013 markers, `<slug>` in lifecycle prompts, and forbidden-token cleanliness remain intact.
  - Verify: `rg -n '^## ADR-011|^## ADR-012|^## ADR-013' .pi/artifacts/pi-template/DECISIONS.md && ! rg -n 'agent:|task\(|question\(|skill\(|write\(|\.active|spec\.md|prd\.json|review-state\.json' .pi/prompts/*.md`
- [ ] A no-write closure pass (D3) mutates neither repository bytes (beyond the implementation files) nor refs; all protected paths equal the `baseline.md` manifest.
  - Verify: `node --experimental-strip-types --test .pi/away-runtime/*.test.ts && git diff --check` and protected-path SHA-256 equality vs `baseline.md`

---

## Technical Context

### Existing Patterns

- Fabric `node-process` is an explicit non-sandbox escape hatch; this feature keeps it as the executor but confines the generated guest via the pinned-wrapper + bubblewrap seam (`node-process-runtime.js:29-34` dynamically reads `process.execPath`; Node 24 reports it writable — version-coupled, proven at A2/A3).
- `agent:"allow"` + caller-selectable child tools (`dist/subagents/manager.js:824-828`, `dist/providers/agents-provider.js:79-97`) — raw `agents.run({tools:["bash"]})` bypasses wrappers; the lane extension never exposes ordinary write/shell/agent refs.
- `PI_FABRIC_GRANTED_RISKS` is broad risk-class only (`dist/core/approval-controller.js:1-22`); no per-run/config approval override (`dist/config.js:374-395`) — the sandbox boundary is bind-mount absence + clear env, not extension authority.
- Pi RPC `prompt` expands real lifecycle templates; strict LF-only framing (`docs/rpc.md:28-37`); `agent_settled` vs `agent_end` (`:839-840,879-885`); `get_state` exposes `pendingMessageCount` (`:160-190`).
- bwrap 0.9.0 at `/usr/bin/bwrap` supports `--unshare-all`, `--share-net`, `--ro-bind`, `--bind`, `--tmpfs`, `--setenv`, `--die-with-parent`, `--lock-file` (verified: `bwrap --version`, `bwrap --help`).

### Key Files

- `.pi/npm/node_modules/pi-fabric/docs/configuration.md:10-12` — node-process is not a sandbox (kept as executor; confinement is the wrapper + bwrap).
- `.pi/npm/node_modules/pi-fabric/dist/node-process-runtime.js:29-34` — dynamic `process.execPath` read (the pinned-wrapper seam).
- `.pi/npm/node_modules/pi-fabric/dist/subagents/manager.js:824-828` — child tools are caller-selectable (why raw `agents.*` is never exposed).
- `.pi/.gitignore:1-7` — ignored executable runtime state (covered by the immutable startup closure).
- `/usr/bin/bwrap` (0.9.0) — the chosen sandbox mechanism.

### Affected Files

```yaml
files:
  - .pi/away-runtime/bootstrap.ts          # deterministic synthetic fabric.json + exact RPC argv/env + inert control cwd (A1)
  - .pi/away-runtime/bootstrap.test.ts
  - .pi/away-runtime/executor-wrapper.mjs  # trusted outer wrapper: validates argv/source/frames, launches bwrap, filters refs, fsyncs attestation (A2)
  - .pi/away-runtime/inner-guest.mjs       # untrusted inner node-process guest (A2)
  - .pi/away-runtime/executor-sandbox.test.ts
  - .pi/away-runtime/closure.ts            # immutable startup-closure hash (default-deny, rechecked pre-launch/restart/pre-result) (B2)
  - .pi/away-runtime/resources.ts          # cgroup PID/memory/CPU + quota-backed storage/file-count limits (B2)
  - .pi/away-runtime/confinement.test.ts
  - .pi/away-runtime/dispatch.ts           # controller-derived profile -> launcher; denies raw agents.*; reserved-path writes (B3)
  - .pi/away-runtime/staging.ts            # atomic staged writes; in-flight mutation barrier (B3)
  - .pi/away-runtime/dispatch.test.ts
  - .pi/away-runtime/launcher.ts           # dedicated Pi RPC lane: start Pi from inert cwd, bind one immutable profile to one single-use process (C1)
  - .pi/away-runtime/rpc.ts                # raw-buffer LF-only RPC parser (chunked + U+2028/U+2029) (C1)
  - .pi/away-runtime/launcher.test.ts
  - .pi/away-runtime/lane-extension.ts     # registers away_* tools; exact-reference + argument firewall (C2)
  - .pi/away-runtime/attestation.ts        # fsync terminal evidence before result forwarded (C2)
  - .pi/away-runtime/lane-extension.test.ts
  - .pi/away-runtime/verifier.ts           # candidate test/build confinement (read-only exact-OID, no net, no creds, exact argv) (C3)
  - .pi/away-runtime/command-catalog.ts    # allowlisted verifier command IDs -> argv (C3)
  - .pi/away-runtime/verifier.test.ts
  - .pi/away-runtime/integration.test.ts   # hermetic sandbox integration (real wiring; fake only provider+clock) (D1)
  - .pi/away-runtime/fake-provider.ts
  - .pi/away-runtime/fixtures.ts
  - .pi/away-sandbox.json                  # versioned host-owned profiles, protected paths, limits, bwrap config (A1)
  - .pi/artifacts/pi-template/DECISIONS.md  # ADR-014 (B1)
  - .pi/artifacts/pi-template/PLAN.md      # canonical away-runtime contract (B1)
  - AGENTS.md                               # away-runtime authority paragraph (B1)
  - .opencode/tech-stack.md                # dev-doc sync (D2)
  - .opencode/roadmap.md                   # dev-doc sync (D2)
  - .opencode/state.md                     # dev-doc sync (D2)
```

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Strict bwrap userns unavailable on this host | Med | High | A3 live-probes `--unshare-user`; BLOCK if confinement cannot be enforced rather than falling back to a weaker wrapper. No fail-open userns variant. |
| Cgroup v2 delegation unavailable | Med | High | A3 live-probes cgroup PID/memory/CPU; BLOCK if unavailable. No weaker fallback. |
| Fabric/Node version drift changes the `process.execPath` spawn contract | Med | High | The wrapper rejects unexpected argv or a mismatched Fabric child-source hash; every run pins and verifies the seam (A2). |
| Unknown host-call reference smuggles `agents.run` through the bridge | Med | High | The lane extension validates every reference and argument against the profile/reservation before forwarding; ordinary write/shell/agent refs are not exposed (C2). |
| Malformed/oversized IPC crashes the trusted peer | Med | High | Bounded framing, backpressure, unique IDs, one terminal result, rejection of post-result calls (A2). |
| Candidate test/build commands reach network or credentials | High | High | Verifier sandbox: no network, no credentials, source read-only, cache/scratch outside tree, broker-controlled exact argv (C3). |
| Away feature modifies the sandbox itself to escape | Low | High | Immutable startup closure hash-pinned; drift pauses before launch and before result acceptance (B2). |
| Ignored runtime (`.pi/npm/**` etc.) tampered and loaded on restart | Med | High | Immutable closure covers the pinned startup inputs; hash-revalidated at restart. |
| Hermetic test fakes the critical seams (RPC/wrapper) and misses real behavior | Med | Med | D1 uses the real launcher, RPC parser, Fabric node-process runtime, wrapper, host-call firewall, staging, and verifier; fakes only provider output and clock. |
| Cancellation leaves writes or descendants running | Med | High | Writer token held until staged mutations and cancellation barriers settle; wrapper kills descendants on parent death (A2/B3). |

---

## Open Questions

| Question | Owner | Due Date | Status |
| --- | --- | --- | --- |
| Is strict bwrap userns available on this host (kernel 6.8.0)? A3 live-probes `--unshare-user`; if unavailable and confinement cannot be enforced, BLOCK permanently (no weaker wrapper). | A3 | before A3 ships | Open |
| Is cgroup v2 delegation (PID/memory/CPU) available on this host? A3 live-probes; BLOCK if unavailable. | A3 | before A3 ships | Open |
| Does Fabric 0.23.0's dynamic `process.execPath` spawn remain unchanged at the pinned versions? A2 pins and verifies every run; A3 confirms end-to-end. | A2/A3 | before A3 ships | Open |
| Confirm max retained-worktree/fixture count (default 3 worktrees; 16 content-addressed test fixtures) and the XDG state root for retained fixtures. | operator | before D1 ships | Open |

> Note: the stale spec's "credential-injection method" open question is resolved by the corrected design — credentials never enter the sandbox; they exist only in the trusted Pi host process. The inner guest gets a clear, allowlisted environment with no credential env and no network (non-scout), so there is no exfiltration channel. Output redaction remains defense-in-depth.

---

## Tasks

The plan is 14 serial waves (all writes serial; read-only analysis may fan out). Every writable task owns at most three files. Dependency graph and full task bodies live in `plan.md`; the PRD encoding lives in `prd.json`.

**P0.1** Settle ADR-013 + prior work *(checkpoint: externally visible sync)* — depends_on: []
**P0.2** Replace the stale sandbox contract (rewrite spec.md + prd.json; keep plan.md) — depends_on: [P0.1]
**A1** Deterministic lane bootstrap — depends_on: [P0.2]
**A2** Real NodeProcessRuntime sandbox tracer — depends_on: [A1]
**A3** Live feasibility checkpoint *(checkpoint: blocking)* — depends_on: [A2]
**B1** Freeze ADR-014 authority — depends_on: [A3]
**B2** Immutable closure + resource limits — depends_on: [B1]
**B3** Host-derived dispatch + staging — depends_on: [B2]
**C1** Dedicated Pi RPC lane launcher — depends_on: [B3]
**C2** Lane extension + host tools + attestation — depends_on: [C1]
**C3** Candidate verifier sandbox — depends_on: [C2]
**D1** Hermetic sandbox integration — depends_on: [C3]
**D2** Synchronize development documentation — depends_on: [D1]
**D3** Final no-write acceptance — depends_on: [D2]

---

## Notes

- **Prerequisite:** ADR-013 (`mcp-research-lane`) settled at baseline `5dd5e34` (== `origin/main` == `origin/master`) before this feature's implementation began (P0.1).
- **Baseline:** `.opencode/artifacts/away-sandbox-runtime/baseline.md` pins the protected files this feature must not change; D3 compares final on-disk bytes against it.
- **Effort:** XL — approximately 2-4 engineering days (wrapper design + adversarial tests + verifier + hermetic integration are the bulk).
- **No branch/worktree created:** trunk-oriented; the worktree carries concurrent in-flight work; implementation gates on P0.1.
- **autonomous-away-loop preserved:** `.opencode/artifacts/autonomous-away-loop/{spec.md,prd.json,plan.md}` remain on disk (untracked); `.active` re-points back to it after the sandbox lands. `autonomous-away-loop` becomes ADR-015.
- **Research basis:** the confinement analysis and corrected boundary were established during the preceding `/plan` Deep research phase (source-grounded against pi-fabric 0.23.0 + Pi 0.81.1 installed sources). P0.2 rewrites the stale spec/PRD to match that corrected design; plan.md was already materialized by `/plan`.
- **Corrected vs. stale contract:** the stale spec/PRD placed the whole Pi worker behind a no-network boundary, used a fail-open userns flag, required the ledger/Git full loop, and said "not node-process". The corrected design keeps `node-process` as the executor behind a pinned wrapper, uses strict `--unshare-user`, moves credentials out of the sandbox entirely, and defers the ledger/Git/GitHub full loop to ADR-015.
