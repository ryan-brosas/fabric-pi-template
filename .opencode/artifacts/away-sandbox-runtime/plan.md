# Away Sandbox Runtime Implementation Plan

> **For Claude:** Implement this plan task-by-task.
> **Status:** Plan materialized to disk after `/plan` delivered the design response-only.

**Goal:** Unattended Fabric `node-process` code and candidate verification can run without access to host credentials, unrestricted filesystem paths, arbitrary network, raw Fabric agent dispatch, or unbounded host resources—while normal interactive Pi/Fabric behavior remains unchanged.

**Discovery Level:** 3 — security boundary, process isolation, RPC, Fabric internals, credentials, and hostile candidate execution. Source-grounded against project-pinned pi-fabric 0.23.0 and Pi 0.81.1.

**Context Budget:** Five child plans (P0, A, B, C, D), ~35–50% each. All writes serial.

---

## TL;DR

The persisted PRD is not executable as written. It incorrectly places the whole Pi worker behind a no-network boundary, uses fail-open `--unshare-user-try`, and requires ledger/Git components explicitly outside this feature.

The corrected design keeps the trusted Pi RPC host and model-provider connection outside the sandbox. Fabric still uses `node-process`, but its dynamically selected `process.execPath` points to a trusted IPC wrapper that launches the actual generated-code guest inside strict bubblewrap. Host calls pass through an exact-reference protocol firewall; candidate verification uses a separate sandbox profile.

---

## Constraints

- Keep Fabric `executor.runtime:"node-process"`.
- No Pi or Fabric fork.
- Normal `.pi/fabric.json` remains unchanged.
- No automatic file, worktree, fixture, or branch deletion.
- ADR-013 must settle first.
- Model-generated code never selects its lane, model, tools, environment, executable, or risk grants.
- Human-only merge and `/verify` authority remain unchanged.
- Failure of user namespaces, cgroup confinement, wrapper compatibility, or authenticated smoke blocks implementation.

## Non-goals

- Autonomous scheduler, lifecycle controller, Git/GitHub broker, or PR loop (those are `autonomous-away-loop`, ADR-015).
- Real ledger/Git crash-replay loop; that remains in `autonomous-away-loop`.
- Protecting against a separate malicious process already running under the same host account.
- Widening normal interactive Fabric permissions.

---

## Must-Haves

### Observable Truths

1. Fabric continues to execute generated programs with `node-process`.
2. Generated Node code runs inside a strict OS sandbox.
3. The sandbox cannot read provider credentials or arbitrary host paths.
4. Only host-selected, schema-validated tool references cross the IPC bridge.
5. Cancellation cannot leave writes or descendant processes running.
6. Candidate verification cannot mutate its evidence tree or reach the network.
7. Normal Pi/Fabric configuration remains byte-identical to the settled baseline.

### Required Artifacts

| Artifact | Provides | Path |
| --- | --- | --- |
| Outer Fabric IPC peer + protocol firewall | Validates argv/source/frames; launches bwrap; filters refs | `.pi/away-runtime/executor-wrapper.mjs` |
| Sandboxed node-process guest | Inner model-generated Fabric program runtime | `.pi/away-runtime/inner-guest.mjs` |
| Dedicated-lane guard + exact host tools | Registers `away_*` tools; rejects raw dispatch | `.pi/away-runtime/lane-extension.ts` |
| Candidate-execution sandbox | Exact-OID evidence + bounded execution clone | `.pi/away-runtime/verifier.ts` |
| Versioned host-owned profiles + limits | Lane profiles, protected paths, cgroup/quota limits | `.pi/away-sandbox.json` |
| Strict LF RPC parser | Drives Pi RPC lane from controller | `.pi/away-runtime/rpc.ts` |
| Immutable startup closure + resource limits | Hash-pinned inputs; cgroup/quota enforcement | `.pi/away-runtime/closure.ts` + `resources.ts` |
| Host-derived dispatch + staging | Controller-derived profiles; reserved-path writes | `.pi/away-runtime/dispatch.ts` + `staging.ts` |
| Attestation | fsync evidence before result forwarded | `.pi/away-runtime/attestation.ts` |
| Command catalog | Allowlisted verifier command IDs → argv | `.pi/away-runtime/command-catalog.ts` |
| Bootstrap | Synthetic fabric.json + inert control cwd + exact argv/env | `.pi/away-runtime/bootstrap.ts` |
| ADR-014 + canonical contract | Confinement authority | `.pi/artifacts/pi-template/DECISIONS.md` + `PLAN.md` + `AGENTS.md` |

### Key Links

| From | To | Via | Risk |
| --- | --- | --- | --- |
| Pi RPC lane | Fabric NodeProcessRuntime | Dedicated process with exact synthetic config | Inherited `PI_FABRIC_*` vars or project trust alters policy |
| NodeProcessRuntime | executor-wrapper.mjs | Version-pinned `process.execPath` override | Fabric/Node version drift changes spawn contract |
| executor-wrapper.mjs | inner-guest.mjs | Bounded framed IPC through bubblewrap | Malformed/oversized frames crash trusted peer |
| Inner guest host call | lane-extension.ts | Exact-reference + argument firewall | Unknown ref smuggles `agents.run` through bridge |
| Verifier input OID | verification receipt | Immutable evidence tree + quota-bounded execution clone | Hardlinks or missing post-run manifest invalidate evidence |

---

## Corrected Security Boundary

```text
Trusted Node/Pi RPC host
├── provider authentication and model traffic
├── exact lane profile
├── Fabric host bridge
├── path-confined away_* tools
└── model response/tool-call orchestration
          │
          │ Fabric NodeProcessRuntime native IPC
          ▼
Trusted outer wrapper
├── validates exact Fabric 0.23.0 argv/source contract
├── validates every frame/ref/argument
├── launches strict bubblewrap profile
├── records terminal attestation before forwarding result
└── proxies cancellation and backpressure
          │
          ▼
Untrusted inner node-process guest
├── model-generated Fabric program
├── clear environment
├── no network, host /proc, credentials, or project runtime state
├── minimal Node binary/shared libraries only
└── cgroup PID/memory/CPU/storage limits
```

Fabric dynamically reads `process.execPath` at execution time (`node-process-runtime.js:29-34`), and Node 24 reports it writable. This is version-coupled and must be proven by A2 before ADR-014 is accepted.

---

## Required Corrections to Existing Spec/PRD

P0.2 must **replace**, not merely supplement, these stale contracts:

- Remove credentials from the sandbox (`spec.md:68-72`).
- Replace `--unshare-user-try` with strict `--unshare-user`.
- Remove the real ledger/Git full-loop requirement from this feature.
- Remove "not node-process"; node-process is retained behind the wrapper.
- Assign `.pi/away-sandbox.json` to an implementation task.
- Replace mutable `.pi/fabric/**` hashing with immutable startup-closure hashing.
- Replace model-selected lane intent with controller-derived profile selection.
- Replace broad alternation validators with one assertion per invariant.
- Compare protected paths against a captured baseline hash, not current cleanliness.

---

## Dependency Graph

```text
P0.1 ADR-013 settlement
  └─> P0.2 PRD/plan replacement + baseline
       └─> A1 deterministic bootstrap
            └─> A2 node-process sandbox tracer
                 └─> A3 live feasibility checkpoint
                      └─> B1 ADR-014 authority freeze
                           └─> B2 closure/resource enforcement
                                └─> B3 staging/dispatch confinement
                                     └─> C1 RPC launcher
                                          └─> C2 lane extension + attestation
                                               └─> C3 verifier
                                                    └─> D1 integration
                                                         └─> D2 docs
                                                              └─> D3 final no-write verification
```

All 14 waves are serial. Read-only test analysis may fan out, but no writable tasks overlap.

---

# Plan 0 — Settle and Rebase

## P0.1 — Settle ADR-013 and prior work

**Files:** existing `mcp-research-lane` scope; `.opencode/artifacts/.active`
**Checkpoint:** yes (externally visible sync)

1. Finish ADR-013 C1–C3 under its existing plan.
2. Resolve all current shared/concurrent edits without reverting another agent's work.
3. Verify exact ADR marker:
   ```bash
   rg -n '^## ADR-013: MCP research lane$' .pi/artifacts/pi-template/DECISIONS.md
   ```
4. Require local `main` and `origin/main` to identify the same commit.
5. Ensure the only remaining changes are the two already-created future feature artifact directories.
6. Obtain authorization before any externally visible synchronization.

**Stop:** ADR-013 absent, shared files unsettled, or baseline cannot be attributed.

## P0.2 — Replace the stale sandbox contract

**Files:**
- `.opencode/artifacts/away-sandbox-runtime/spec.md`
- `.opencode/artifacts/away-sandbox-runtime/prd.json`
- `.opencode/artifacts/away-sandbox-runtime/plan.md`

1. RED: prove stale architecture remains:
   ```bash
   rg -n 'unshare-user-try|real ledger|real Git broker|Credentials.*writer' \
     .opencode/artifacts/away-sandbox-runtime/{spec.md,prd.json}
   ```
2. Rewrite spec and PRD to this node-process child-wrapper design.
3. Keep this materialized plan (already written by this step).
4. Encode all 14 tasks and exact task-owned paths.
5. Capture a concrete baseline OID and SHA-256 manifest for protected files.
6. Validate JSON, acyclic dependencies, and the three-file task cap.

---

# Plan A — Feasibility

## A1 — Deterministic lane bootstrap

**Files:**
- `.pi/away-runtime/bootstrap.ts`
- `.pi/away-runtime/bootstrap.test.ts`
- `.pi/away-sandbox.json`

1. RED: run the absent test and confirm failure.
2. Define a versioned profile manifest with exact Node, Pi, Fabric, bwrap, model, tools, host-call refs, limits, and protected paths.
3. Test generation of a synthetic `fabric.json` that pins:
   - `executor.runtime:"node-process"`
   - MCP/subagents/mesh/memory disabled unless required by that profile
   - `agent`, `execute`, and Fabric network denied
   - exact captured-tool risks
4. Test an allowlisted environment; remove inherited `PI_FABRIC_*` authority variables.
5. Use an inert, retained control cwd—not the repository—to prevent pre-trust migrations.
6. Generate exact RPC argv using `--no-approve`, `--no-context-files`, `--no-extensions`, explicit `-e` paths, and `--tools fabric_exec`.
7. Verify a malicious synthetic project cannot alter the effective profile or mutate bytes.

```bash
node --experimental-strip-types --test .pi/away-runtime/bootstrap.test.ts
```

## A2 — Real NodeProcessRuntime sandbox tracer

**Files:**
- `.pi/away-runtime/executor-wrapper.mjs`
- `.pi/away-runtime/inner-guest.mjs`
- `.pi/away-runtime/executor-sandbox.test.ts`

1. RED: define adversarial tests before wrapper code.
2. Point `process.execPath` to the wrapper only inside the dedicated lane process.
3. Make the wrapper reject unexpected argv or a mismatched Fabric child-source hash.
4. Preserve Fabric's outer native IPC contract.
5. Run the actual guest inside strict bubblewrap with:
   - strict user, PID, mount, IPC, UTS, and network namespaces;
   - clear environment;
   - minimal Node executable/shared libraries;
   - no project runtime, credentials, host `/proc`, or host devices;
   - parent-death handling and process limits.
6. Implement bounded framing, backpressure, unique IDs, one terminal result, and rejection of post-result calls.
7. Filter every host-call reference and argument before forwarding.
8. Write/fsync terminal sandbox evidence before forwarding the result.

Adversarial tests include malformed/oversized frames, duplicate IDs, forged results, unknown refs, VM escape, environment read, filesystem/network access, descendant spawning, cancellation, and wrapper termination.

```bash
node --experimental-strip-types --test .pi/away-runtime/executor-sandbox.test.ts
```

## A3 — Live feasibility checkpoint

**Files:** none
**Checkpoint:** blocking

1. Confirm strict bubblewrap user namespaces work. A read-only probe already succeeded on this host; rerun against current bytes.
2. Confirm delegated cgroup PID/memory/CPU limits are available.
3. Run real Fabric 0.23.0 `NodeProcessRuntime` through the wrapper.
4. Run one minimal authenticated Makora parent-provider request without logging or forwarding the credential.
5. Confirm the inner guest has no credential environment or outbound network.
6. Compare repository fingerprint before/after.

**Stop permanently if any item fails.** Do not write ADR-014 and do not substitute a weaker wrapper.

---

# Plan B — Authority and Confinement Core

## B1 — Freeze ADR-014 authority

**Files:**
- `.pi/artifacts/pi-template/DECISIONS.md`
- `.pi/artifacts/pi-template/PLAN.md`
- `AGENTS.md`

1. RED: exact ADR-014 heading absent.
2. Record the tested `process.execPath` wrapper seam and version coupling.
3. State that Pi/provider auth stays in the trusted parent; only generated node-process code is sandboxed.
4. Preserve Main authority, human-only merge, `/verify` freshness, and normal-session configuration.
5. State that missing wrapper attestation, strict userns, cgroup support, or closure hash blocks execution.
6. Add a forward dependency from ADR-015 autonomous-away-loop.

## B2 — Immutable closure and resource limits

**Files:**
- `.pi/away-runtime/closure.ts`
- `.pi/away-runtime/resources.ts`
- `.pi/away-runtime/confinement.test.ts`

1. RED: write closure-drift and resource-exhaustion tests.
2. Resolve and hash immutable startup inputs: wrapper, inner guest, lane extension, config, Pi/Fabric/provider source, Node, bwrap, and command catalog.
3. Keep mutable session/Fabric state outside the immutable closure.
4. Recheck the closure before launch, after restart, and before accepting a result.
5. Enforce cgroup PID/memory/CPU limits and quota-backed storage/file-count limits.
6. Verify strict canonical-path and symlink handling.
7. Verify no sandbox descendants remain after timeout or cancellation.

## B3 — Host-derived dispatch and staging

**Files:**
- `.pi/away-runtime/dispatch.ts`
- `.pi/away-runtime/staging.ts`
- `.pi/away-runtime/dispatch.test.ts`

1. RED: unknown profile, model-supplied capability, path escape, and symlink tests.
2. Derive the profile from trusted controller phase/state; remove `lane` from all untrusted envelopes.
3. Mount the source view read-only.
4. Route writes to exact reserved staging files rather than broad writable directories.
5. Reject undeclared new files and path-prefix expansion.
6. Validate post-run candidate paths and hashes before exposing results.
7. Hold the writer token until staged mutations and cancellation barriers settle.

---

# Plan C — Runtime Wiring and Verification

## C1 — Dedicated Pi RPC lane launcher

**Files:**
- `.pi/away-runtime/launcher.ts`
- `.pi/away-runtime/rpc.ts`
- `.pi/away-runtime/launcher.test.ts`

1. RED: test chunked LF records, trailing CR, U+2028/U+2029, oversized records, wrong IDs, and early process exit.
2. Implement a raw-buffer LF-only RPC parser.
3. Start Pi from the inert control cwd with exact argv/environment from A1.
4. Load only explicit, hash-pinned extensions/provider sources.
5. Bind one immutable profile to one single-use lane process.
6. Reject reload, project-resource loading, model switching, or profile reuse.
7. Verify real prompt/event settlement using a deterministic fake provider.

## C2 — Lane extension, host tools, and attestation

**Files:**
- `.pi/away-runtime/lane-extension.ts`
- `.pi/away-runtime/attestation.ts`
- `.pi/away-runtime/lane-extension.test.ts`

1. RED: test forbidden refs, broad-risk operations, stale nonces, cancellation races, and missing attestation.
2. Register uniquely named `away_*` tools; do not expose ordinary write, shell, agent, compaction, or schema refs.
3. Validate every argument against the profile and reservation.
4. Make writes staged and atomic, with an in-flight mutation barrier.
5. Verify wrapper/resource/profile/closure hashes in each receipt.
6. Require the wrapper to fsync terminal evidence before Fabric receives success.
7. Reject settlement while bridge work or sandbox processes remain active.

## C3 — Candidate verifier sandbox

**Files:**
- `.pi/away-runtime/verifier.ts`
- `.pi/away-runtime/command-catalog.ts`
- `.pi/away-runtime/verifier.test.ts`

1. RED: malicious test attempts credential reads, network, source mutation, catalog mutation, and descendant survival.
2. Accept command IDs, never model-supplied argv.
3. Use an immutable exact-OID evidence tree without `.git` or hardlinks.
4. Run commands in a quota-bounded writable execution clone.
5. Mount dependencies and command definitions read-only.
6. Compare pre/post manifests for all source, test, dependency, and catalog inputs.
7. Bind OID, command ID, manifests, resource limits, and exit result into the verifier receipt.

---

# Plan D — Integration and Closure

## D1 — Hermetic sandbox integration

**Files:**
- `.pi/away-runtime/integration.test.ts`
- `.pi/away-runtime/fake-provider.ts`
- `.pi/away-runtime/fixtures.ts`

1. Use the real launcher, RPC parser, Fabric node-process runtime, wrapper, host-call firewall, staging, and verifier.
2. Fake only provider output and clock.
3. Use content-addressed retained fixtures; reuse valid fixtures and never auto-delete.
4. Test writer and reviewer profiles plus external-scout no-filesystem behavior.
5. Inject crashes around wrapper startup, calls, writes, result fsync, and verifier completion.
6. Assert no duplicate application, no descendant process, and no protected-path change.
7. Report retained fixture paths and stop when the configured storage cap is reached.

The real ledger/Git/GitHub full loop remains ADR-015 work.

## D2 — Synchronize development documentation

**Files:**
- `.opencode/tech-stack.md`
- `.opencode/roadmap.md`
- `.opencode/state.md`

Record ADR-014, the tested node-process wrapper boundary, strict failure conditions, and ADR-015 dependency. These are development summaries only; `.pi` remains independently usable. The canonical project context lives under `.pi` (ADR-016); the manifest `protected_paths` cover the init packet (managed `AGENTS.md` region + the five `.pi/{ROADMAP,user,tech-stack,state,memory}.md` context files) from autonomous mutation.

## D3 — Final no-write acceptance

**Files:** none

Run:

```bash
node --experimental-strip-types --test .pi/away-runtime/*.test.ts
git diff --check
pi --approve --list-models
```

Also require:

- live Makora sandbox smoke with no inner credential/network access;
- exact wrapper/Node/bwrap/Fabric version hashes;
- all baseline-listed protected paths equal the P0.2 baseline (the init packet — managed `AGENTS.md` region + five `.pi` context files — is protected at runtime via the manifest `protected_paths`, added by pi-native-init P7.1);
- normal `.pi/fabric.json` and `.pi/settings.json` unchanged;
- ADR-011/012/013 markers preserved;
- before/after repository and ref fingerprints identical;
- no surviving sandbox processes;
- no missing or malformed attestation.

---

## Failure Behavior

- **ADR-013 unsettled:** do not begin.
- **Unexpected Fabric/Node source hash:** block the lane.
- **Strict userns or cgroup unavailable:** block; no weaker fallback.
- **Malformed/oversized IPC:** terminate only that invocation and reject its result.
- **Unknown host-call reference:** reject before it reaches Fabric.
- **Closure drift:** pause before launch/result acceptance.
- **Cancellation:** retain writer ownership until bridge tasks and descendants settle.
- **Verifier input mutation:** reject all evidence.
- **Missing provider auth:** fail before any writable operation.
- **Fixture/storage cap reached:** retain existing evidence and request separate cleanup authorization.
- **Two failures at one step:** stop and report evidence/options.

## Privacy and Security

- Provider credentials exist only in the trusted Pi host process.
- The inner node-process receives a clear, allowlisted environment.
- No secret-bearing path is mounted into bubblewrap.
- External-scout profiles receive sanitized public questions and no project filesystem.
- Host-call output is bounded and redacted before persistence.
- The selected provider necessarily receives model prompt/context; that is the declared provider trust boundary.
- Attestations contain hashes, profile IDs, limits, and outcomes—not prompts, source bytes, credentials, or raw logs.

## Open Assumptions

- Strict bubblewrap user namespaces work on this host; a live strict probe already exited successfully.
- Cgroup v2 delegation remains to be proven at A3.
- Fabric 0.23.0's dynamic `process.execPath` spawn remains unchanged; every run pins and verifies it.
- V1 authenticated acceptance uses Makora's `MAKORA_OPTIMIZE_TOKEN` resolution in the trusted parent (`pi-makora-provider/index.ts:447-452,570-580`) without inspecting or logging its value.
- Recommend 16 content-addressed test fixtures, separate from the three-PR worktree cap.

## Constitutional Compliance

- No destructive filesystem or Git commands.
- No automatic deletion.
- No normal configuration widening.
- No new package dependency; Node 24 and bubblewrap 0.9.0 already exist.
- Every writable task owns at most three files.
- External action remains checkpointed.
- All implementation writes are serial.

**Constitutional compliance: PASS**

---

## Report

- **Discovery Level:** 3
- **Observable truths:** 7
- **Required artifact groups:** 13
- **Key links:** 5
- **Context budget:** five child plans, ~35–50% each
- **Dependency waves:** 14 serial waves
- **Tasks:** 14, approximately 75 TDD actions
- **Plan location:** `.opencode/artifacts/away-sandbox-runtime/plan.md` (now written)
- **Next step:** settle `/ship mcp-research-lane`, then execute P0.2 under `/ship away-sandbox-runtime`
