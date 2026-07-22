# Autonomous Away Loop Implementation Plan

> **For Claude:** Implement this plan task-by-task. Do not begin controller code before Gate 0 prerequisites settle and ADR-015 is ratified.

**Goal:** A trusted operator can leave the system autonomously selecting, implementing, verifying, and publishing path-disjoint work as PRs across crashes and restarts — without granting models general host, Git, GitHub, or merge authority.

**Discovery Level:** 3 - Deep. This changes architecture, authority, capability, and lifecycle boundaries and depends on exact-version Pi 0.81.1 / Fabric 0.23.0 / bubblewrap 0.9.0 runtime behavior plus exact GitHub Checks/Branch-Protection/Rulesets semantics. Exact-version source inspection and official-doc validation disproved the original spec's core premises (ADR-014 numbering, fixed PR cap, broker-owned main->master sync, nonce-only idempotency, grep-only acceptance, optional integration test) and forced an architecture redesign: ADR-015 layered on a corrected ADR-014 sandbox prerequisite, unlimited open PRs with one active writer, a two-phase verify split, and an app-bound merge-barrier check.

**Context Budget:** XL (10-16 days including the ADR-014 correction, adversarial tests, authority review, and one authorized dogfood run). Execute serially; one writable task at a time per the single-writer rule. Re-read this plan + `AGENTS.md` + `.pi/artifacts/pi-template/PLAN.md` on resume.

---

## Must-Haves

### Observable Truths

(What must be TRUE for the goal to be achieved?)

1. An operator can start, pause, resume, stop, and recover an away run via `/supervise --away` and `/away status|pause|resume|stop`.
2. Exactly one away writer runs at a time, while any number of PRs may remain open concurrently in `PR_MONITOR`.
3. Restart reconciliation never knowingly duplicates commits, pushes, checks, or PRs.
4. Every published head is bound to a fresh no-write verification receipt mirrored to an app-bound required check.
5. The controller cannot merge, force-push, delete branches, or delete worktrees; no destructive Git operation or merge endpoint exists in the broker allowlist.
6. Credentials, protected paths, and lifecycle authority remain inaccessible to model workers; model-facing processes receive no GitHub credentials or arbitrary shell/network authority.
7. Ambiguity, policy drift, or resource exhaustion pauses safely without losing evidence or fabricating success.

### Required Artifacts

| Artifact | Provides | Path |
|---|---|---|
| Reviewed plan | Persisted implementation contract (this file) | `.opencode/artifacts/autonomous-away-loop/plan.md` |
| Corrected feature spec | ADR-015, unbounded PRs, server-side sync, two-phase verify | `.opencode/artifacts/autonomous-away-loop/spec.md` |
| Corrected task graph | ADR-015 ownership, all test files, fresh baseline | `.opencode/artifacts/autonomous-away-loop/prd.json` |
| Validated protocol contracts | Config, state, receipt, intent, feedback envelopes | `.pi/extensions/away/protocol.ts` |
| Tracked non-secret policy | Budgets, roadmap paths, check name, CI policy | `.pi/away.json` |
| Pure reducer + scheduler | Lifecycle state machine and bounded scheduling | `.pi/extensions/away/controller.ts` |
| Durable ledger + lease | Append-only effects, snapshots, reservations, lease | `.pi/extensions/away/state.ts` |
| Central path policy | Default-deny reservations and staging authorization | `.pi/extensions/away/paths.ts` |
| Strict RPC adapter | LF-delimited JSONL phase driver | `.pi/extensions/away/rpc.ts` |
| Extension UX | `/supervise --away` input-hook interception + `/away` commands | `.pi/extensions/away/index.ts` |
| Exact Git broker | Retained worktree, exact stage/commit/push, no destructive ops | `.pi/extensions/away/git.ts` |
| GitHub broker + `/pr` | Allowlisted policy/refs/checks/PR, no merge/delete | `.pi/extensions/away/github.ts` |
| Roadmap-first ideation | Grounded candidates + split research lanes + cooldown | `.pi/extensions/away/ideation.ts` |
| Host preflight | Closure/profile/trust/policy/resource checks, no mutation | `.pi/extensions/away/host.ts` |
| Mandatory integration proof | Real RPC + real Git + fake GitHub full loop + crash matrix | `.pi/extensions/away/integration.test.ts` |
| ADR-015 | Authority decision record | `.pi/artifacts/pi-template/DECISIONS.md` |
| Canonical contract | Away contract in PLAN | `.pi/artifacts/pi-template/PLAN.md` |
| Binding policy | Away authority paragraph in AGENTS | `AGENTS.md` |
| Phase prompts | Away-mode overlays for create/plan/research/ship/verify/supervise + new ideate/pr | `.pi/prompts/*.md` |
| Project summaries | Synced dev-doc (away runtime works if `.opencode` absent) | `.opencode/tech-stack.md`, `.opencode/roadmap.md`, `.opencode/state.md` |

### Key Links

| From | To | Via | Risk |
|---|---|---|---|
| `/supervise --away` input hook | Controller startup | Pi `input` event interception before template expansion | A registered `supervise` extension command would shadow the normal prompt; must intercept only the `--away` form |
| Controller | ADR-014 runtime | Typed host-intent channel to sandboxed `phase-main` lane | An ambient host Pi process escapes confinement; must be a fixed sandbox lane with no ambient capabilities |
| Controller | Durable state | Revisioned transitions + write-ahead effects | Nonce/revision alone does not prevent duplicate external effects; need fsync intent -> effect -> observe -> fsync completion |
| Path policy | Git broker | Default-deny reservation + staging authorization | Protected/CI/prompt/authority paths edited by a candidate corrupt future phases; enforce at every boundary |
| `/verify` receipt | GitHub check | Authenticated mirror of PASS into app-bound `away-final-verify` | A reviewer can merge a repair head before final verification; the missing check must block until receipt success |
| Exact verified OID | Pushed ref | Non-force exact refspec + remote-OID confirmation | Published bytes diverge from verified bytes without exact-OID push + remote confirmation |
| Unlimited open PRs | Reservation index | Disk-backed index + bounded reconciliation + cursors | Unbounded state livelocks finite epochs; no new writer until full reservation view restored |
| Remote push | GitHub Actions | Fail-closed CI policy + `.github/**` protection | Candidate code runs with tokens/secrets/self-hosted runners before final verification |

## Dependency Graph

```
Gate 0: Prerequisites (serial, blocking)
  0.1 settle ADR-013
  0.2 re-plan ADR-014 (phase-main, provider bridge, resource controls, immutable/mutable split, no circular test)
  0.3 ship + verify ADR-014
  0.4 wait for pi-native-init P8.3 (sole canonical .pi/ROADMAP.md, exact roadmap grammar, source-backed /create, Pi-native context packet, fixed managed AGENTS region)
        |
        v
Plan 01: ADR-015 contract and authority   (fully executable)
  1.1 reconcile spec/prd/plan
  1.2 ratify ADR-015 before code
  1.3 protocol + tracked policy
        |
        v
Plan 02: Durable state and effects
  2.1 pure reducer
  2.2 ledger + unbounded index
  2.3 lease + write-ahead effects
        v
Plan 03: Path, worktree, and host boundary
        v
Plan 04: Pi RPC and command UX
        v
Plan 05: Namespace and authoring prompts
        v
Plan 06: Verification and publication
        v
Plan 07: Unbounded monitoring, repair, ideation
        v
Plan 08: Mandatory hermetic and adversarial integration
        v
Plan 09: Documentation, review, dogfood
```

All writable plans execute serially (single-writer rule). Read-only research and review may fan out.

## Grounded Architecture

Exact-version source inspection and official-doc validation forced these corrections to the original spec:

- **ADR numbering:** `autonomous-away-loop` claimed ADR-014, but `away-sandbox-runtime` already claims ADR-014 and renumbers this feature to ADR-015 (`away-sandbox-runtime/spec.md:43-50,347-352`). ADR-015 is the correct number; ADR-014 is the sandbox prerequisite.
- **Fabric risk grants are whole-class and not a sandbox:** `PI_FABRIC_GRANTED_RISKS` is inherited and bypasses config denial for whole `read|write|execute|network|agent` classes (`dist/core/approval-controller.js:1-22`); `node-process` is an escape hatch, not a security boundary (`docs/configuration.md:10-12`). Broad away-process grants would let model-authored `fabric_exec`/children bypass an exact broker. Model-facing write/execute/network stay denied; fixed Git/GitHub/verifier effects live behind a separately confined, host-owned broker.
- **Pi command wiring:** Extension commands execute before input events/templates (`agent-session.js:792-826`); the `input` event fires after command lookup but before skill/template expansion and returns `continue|transform|handled` (`types.d.ts:614-637`; `docs/extensions.md:881-928`). Therefore do NOT register an extension command named `supervise`; an `input` handler intercepts only exact `/supervise --away ...` while normal `/supervise` returns `continue` and expands the existing template. Register `/away` separately. `agent_settled` has no phase payload (`types.d.ts:844-880`), so controller state derives phase from the ledger and RPC `get_state`.
- **`/verify` writes tracked evidence:** Current `/verify` performs candidate writes and the final no-write pass in one invocation (`.pi/prompts/verify.md:181-201`). A controller advancing only after `agent_settled` cannot insert commit/push/check between phases. Define two authenticated RPC invocations: `VERIFY_PREPARE` (may write candidate evidence, must stop) and `FINAL_VERIFY_NO_WRITE` (only the fresh fingerprint/evidence pass, returns a strict receipt).
- **Repair-head race:** Fresh-review requirements do not prevent a repair head merging before final verification. GitHub required checks can bind a context to a specific App ID (`required_status_checks.checks[].{context,app_id}`; rulesets use `integration_id`). `POST /repos/{owner}/{repo}/check-runs` supports `in_progress` then `completed/success|failure` bound to `head_sha`. Require an app-bound `away-final-verify` check that stays pending until the `/verify` receipt succeeds.
- **ADR-006 supersession:** ADR-006 currently mandates a transcript-only final result and no post-fingerprint write. ADR-015 narrowly authorizes mirroring (not originating) a `/verify` PASS into the app-bound check after the final fingerprint; `/verify` remains the sole authority deciding PASS.
- **Remote CI is a separate boundary:** A same-repo branch push can trigger GitHub Actions executing candidate bytes with `GITHUB_TOKEN`, secrets, or self-hosted runners before final verification. `.github/**` must be protected; preflight fails closed if workflows appear unless an audited hash allowlist proves away refs run only no-secret, read-only, ephemeral CI. Current repo has no `.github/**/*`.
- **Crash safety needs more than nonces:** Specify `fsync intent -> perform idempotent effect -> observe authoritative result -> fsync completion`, stable run/effect IDs in branch/commit/PR metadata, truncated-tail recovery, and lease retention until child processes are reaped.
- **Namespace publication:** Ordinary rename can replace an existing empty destination or symlink, contrary to the fail-closed invariant. Use canonical no-adopt/no-replace creation, exclusive file creation, file and parent-directory fsyncs, and run-owned crash recovery. Stage outside Git-visible bytes so it cannot block clean status. Unknown partial namespaces still fail closed.
- **Unlimited state livelock:** Unbounded retained features conflict with finite epoch budgets unless reconciliation is resumable. Add fsynced snapshots/cursors or a disk-backed reservation index, bounded reconciliation batches, and prohibit a new writer until the complete reservation view is restored.
- **Test convention:** No root `package.json`, no existing `.pi/**/*.test.ts`, no `.pi/away.json`, no `.pi/away-sandbox.json` currently exist. Node `--experimental-strip-types --test` is the initial deterministic local test convention. Do not add a package solely to manufacture a typecheck command.

## Constraints

### Hard

- Order: ADR-013 settles -> corrected and verified ADR-014 -> ratified ADR-015 -> controller code.
- Unlimited concurrently open PRs (no static count gate), but exactly one active away writer.
- Finite compute, transition, polling, repair, CPU, memory, process, output, disk, and inode budgets; resource exhaustion pauses safely but is never a PR-count cap.
- Auto-repair and fallback ideation remain in scope.
- No automatic merge, cleanup, force-push, ref deletion, worktree deletion, or compatibility-branch synchronization.
- `/verify` remains the sole authority deciding PASS.
- Normal lifecycle commands and `.pi/fabric.json`/`.pi/settings.json` permissions remain unchanged (no permission widening for ordinary sessions).
- The runtime must work with `.opencode/` absent.
- Model-facing processes receive no GitHub credentials or arbitrary shell/network authority.
- Retained worktrees and fixtures require explicit operator-approved cleanup.
- Never register an extension command named `supervise`; never delete files without express permission.

### Non-goals

- Proving reviewer humanity from a GitHub API field (human-only merge = capability + repository-policy composition).
- Globally excluding unrelated interactive writers in other worktrees (the claim is narrowed to one active away writer).
- Automated dependency installation, schema migration, or conflict resolution.
- Consuming raw review comments or remote CI logs.
- Automatically resolving ambiguous requirements.
- Backwards-compatibility shims (early development, no users, no tech debt).

## Corrected State Machine

```
BOOT
  -> PREFLIGHT
  -> ACQUIRE_LEASE
  -> RECONCILE_LEDGER_AND_EXTERNAL_STATE
  -> RESTORE_COMPLETE_RESERVATION_VIEW
  -> SELECT_ROADMAP_ITEM | IDEATE
  -> CREATE_PREPARE
  -> CREATE_NAMESPACE_EXCLUSIVE
  -> PLAN
  <-> RESEARCH
  -> RESERVATION_REVALIDATE
  -> SHIP
  -> VERIFY_PREPARE
  -> FINALIZE_COMMIT
  -> POLICY_AND_REMOTE_CI_CHECK
  -> PUSH_EXACT_OID
  -> CONFIRM_REMOTE_OID
  -> CREATE_PENDING_VERIFICATION_CHECK
  -> FINAL_VERIFY_NO_WRITE
  -> COMPLETE_CHECK_SUCCESS | COMPLETE_CHECK_FAILURE
  -> PR_DESCRIBE_NO_WRITE
  -> PR_LOOKUP_OR_CREATE
  -> PR_MONITOR
```

`PR_MONITOR` outcomes:
- Human merge observed -> release reservation; retain worktree.
- Actionable CI failure -> reproduce via configured local verifier -> repair (max 2 cycles).
- Valid structured review envelope -> repair scoped paths (max 2 cycles).
- Non-actionable feedback -> pause without consuming a repair cycle.
- Policy drift, unknown side-effect outcome, or resource pressure -> durable pause.
- No acceptable candidate -> cooldown rather than fabricated work.

## Configuration Contract

`.pi/away.json` contains no repository credentials or installation secrets:

```json
{
  "schemaVersion": 1,
  "runtimeProfile": "away-v1",
  "openPullRequests": { "kind": "unbounded" },
  "maxActiveWriters": 1,
  "maxVerifyRepairCycles": 2,
  "epoch": {
    "maxActiveComputeMs": 28800000,
    "maxTransitions": 256
  },
  "scheduler": {
    "maxPollsPerTick": 32,
    "pollIntervalMs": 60000
  },
  "roadmapPaths": [
    ".pi/ROADMAP.md"
  ],
  "requiredCheckName": "away-final-verify",
  "remoteCiPolicy": { "kind": "no-workflows" }
}
```

Repository identity, GitHub App identity, credential handles, and policy attestations belong in the host-owned external state root with restrictive permissions, never in the tracked config. Any configured workflow requires an audited hash allowlist, read-only tokens, no secrets, and ephemeral hosted runners.

## Tasks

### Task Standards

- Exact file paths; never "add to the relevant file".
- TDD order: RED assertion on current bytes first, then smallest GREEN change, then mechanical doc sync.
- Each step 2-5 minutes; one action per step.
- Per-file, per-location assertions; never one combined alternation grep; never a negative grep alone as a capability proof.
- Stage only the specific files you changed; never stage all files indiscriminately.
- Reread each target immediately before editing; anchored changes only.
- Tests own their test files; every task that adds behavior adds its test in the same task.
- Treat sibling artifact dirs and dirty shared files (other agents' work) as untouchable; never stash, revert, or overwrite them.

---

### Gate 0: Prerequisites (serial, blocking)

#### Task 0.1 — Settle ADR-013

- **Needs:** current ADR-013 candidate work (mcp-research-lane).
- **Creates:** accepted ADR-013 entry and synchronized canonical contract.
- **Steps:** execute the mcp-research-lane plan through `/ship` + `/verify`; append ADR-013 to `DECISIONS.md` after ADR-012 (`:370-431`); sync PLAN/AGENTS.
- **Verify:**
  ```bash
  rg -n '^## ADR-013:' .pi/artifacts/pi-template/DECISIONS.md
  rg -n 'context7|exa|codex_search' .pi/artifacts/pi-template/PLAN.md AGENTS.md
  pi --approve --list-models
  ```
- **Checkpoint:** L3 review; disposition of every validated Critical/High finding.

#### Task 0.2 — Re-plan ADR-014

- **Needs:** Task 0.1.
- **Creates:** corrected `away-sandbox-runtime` plan addressing the structural blockers below.
- **Steps:** amend the `away-sandbox-runtime` spec/plan to require:
  1. A sandboxed `phase-main` profile with trusted resources only, no secret mounts, no ambient extensions/tools, and a typed host-intent channel (the phase-driving RPC/Main process is security-critical and currently excluded at `away-sandbox-runtime/spec.md:43-50`).
  2. A credential-hiding per-run host inference bridge (e.g. a narrowly scoped Unix-socket proxy); no provider token inside sandboxes. The current writer-lane-has-credentials-but-no-network / scout-has-network-but-no-credentials split (`:62-72`) cannot execute as whole Pi model processes.
  3. Hard CPU, memory, process, output, file-size, disk, and inode controls with reserved ledger capacity (bubblewrap alone does not enforce these).
  4. Separate immutable executable/configuration closure hashes from run-owned mutable roots (`.pi/fabric/**`, `.pi/git/**`, `.pi/sessions/**` are mutable; do not mix them into the protected closure hash at `:107-108`).
  5. Tests limited to runtime/dispatch/verifier contracts; move the real ledger + real Git broker full-loop test to ADR-015 (`integration.test.ts`) to break the circular dependency (`:39` requires components declared out of scope at `:45`).
- **Next command:** `/plan away-sandbox-runtime`
- **Stop:** any model-controlled phase remains outside confinement, or any lane cannot perform a real model turn.

#### Task 0.3 — Ship and verify ADR-014

- **Needs:** Task 0.2.
- **Creates:** verified ADR-014 commit identity (ADR-015's immutable prerequisite).
- **Verify:**
  ```bash
  node --version
  bwrap --version
  flock --version
  node --experimental-strip-types --test .pi/away-runtime/*.test.ts
  ```
  Then run `/verify away-sandbox-runtime`. Capture its verified commit OID as `baseline_oid`. No target production work starts before PASS.

#### Task 0.4 — Wait for pi-native-init P8.3

- **Needs:** Task 0.3.
- **Creates:** explicit serialization gate blocking autonomous implementation until the Pi-native initialization packet is fully established.
- **Steps:** before any Plan 01 implementation begins, confirm that the `pi-native-init` feature has completed task P8.3 — final `.pi/state.md` promotion to `initialization_status: ready` with `context_reload_required: false`. That completion establishes the sole canonical default `.pi/ROADMAP.md`, the exact roadmap grammar (`roadmap_schema_version: 1`, monotonic `last_issued_id`, immutable `RM-NNN`), source-backed `/create`, the protected Pi-native context packet, and the fixed managed AGENTS boilerplate region. Without P8.3, autonomous ideation and `/create` overlays would operate against a superseded roadmap, memory, and AGENTS contract.
- **Verify:**
  ```bash
  rg -n '^initialization_status: ready$' .pi/state.md
  rg -n '^context_reload_required: false$' .pi/state.md
  ```
- **Stop:** any autonomous implementation begins before `pi-native-init` P8.3 is verified.

---

### Plan 01: ADR-015 Contract and Authority (first fully executable child plan)

#### Task 1.1 — Reconcile the planning artifacts

- **Needs:** verified ADR-014 identity (Task 0.3).
- **Files:** `.opencode/artifacts/autonomous-away-loop/spec.md`, `.opencode/artifacts/autonomous-away-loop/prd.json`, `.opencode/artifacts/autonomous-away-loop/plan.md`.
- **RED:** confirm the current artifacts still encode the stale ADR number, fixed PR count, old verification order, broker-owned compatibility sync, D2-after-implementation, and nonce-only idempotency:
  ```bash
  rg -n 'ADR-014' .opencode/artifacts/autonomous-away-loop/spec.md
  rg -n 'maxOpenPullRequests|3 path-disjoint|up to 3' .opencode/artifacts/autonomous-away-loop/spec.md
  rg -n 'main->master|master sync' .opencode/artifacts/autonomous-away-loop/spec.md
  rg -n 'FINALIZE_COMMIT.*PREVERIFY|PREVERIFY.*PUSH' .opencode/artifacts/autonomous-away-loop/spec.md
  ```
- **GREEN:**
  1. Materialize this `plan.md` (this file).
  2. Renumber the feature to ADR-015 throughout `spec.md` and `prd.json`.
  3. Replace the fixed PR cap with the discriminated unbounded policy (`openPullRequests: {kind:"unbounded"}`).
  4. Move authority ratification (Task 1.2) before implementation; remove the old D2-after-implementation ordering.
  5. Move full-loop proof from optional to mandatory.
  6. Apply the corrected verify/check sequence (`SHIP -> VERIFY_PREPARE -> FINALIZE_COMMIT -> POLICY_AND_REMOTE_CI_CHECK -> PUSH_EXACT_OID -> CONFIRM_REMOTE_OID -> CREATE_PENDING_VERIFICATION_CHECK -> FINAL_VERIFY_NO_WRITE -> COMPLETE_CHECK -> PR`).
  7. Remove compatibility-branch synchronization from broker scope (server-side policy owns it).
  8. Replace nonce-only idempotency claims with durable effect intents and natural-key reconciliation.
  9. Update `prd.json` manifests/ownership/task graph: add `paths.ts`, `effects.ts`, `namespace.ts`, `repair.ts`, `integration.test.ts`, `crash.test.ts`, `security.test.ts`, `portability.test.ts`; add every test file to `verified_paths`; set `baseline_oid` to the verified ADR-014 OID; add `.github/**` and all `.pi/prompts/**` to `runtime_protected_paths`.
- **Verify:**
  ```bash
  jq -e empty .opencode/artifacts/autonomous-away-loop/prd.json
  rg -n 'ADR-015' .opencode/artifacts/autonomous-away-loop/spec.md .opencode/artifacts/autonomous-away-loop/prd.json
  rg -n 'unbounded|FINAL_VERIFY_NO_WRITE|away-final-verify|server-side' .opencode/artifacts/autonomous-away-loop/spec.md
  ! rg -n 'maxOpenPullRequests|ADR-014: Autonomous' .opencode/artifacts/autonomous-away-loop/spec.md .opencode/artifacts/autonomous-away-loop/prd.json
  git diff --check
  ```
- **Checkpoint:** mandatory L3 plan review.
- **Stop:** spec, PRD, and plan disagree on scope, ordering, or ownership.

#### Task 1.2 — Ratify ADR-015 before code

- **Needs:** Task 1.1.
- **Files:** `.pi/artifacts/pi-template/DECISIONS.md`, `.pi/artifacts/pi-template/PLAN.md`, `AGENTS.md`.
- **RED:**
  ```bash
  rg -n '^## ADR-015:' .pi/artifacts/pi-template/DECISIONS.md || true   # absent today
  rg -n 'one active away writer|away-final-verify|never merge' .pi/artifacts/pi-template/PLAN.md AGENTS.md || true   # absent today
  ```
- **GREEN:** append ADR-015 to `DECISIONS.md` (after ADR-014) and add the canonical contract + binding policy. ADR-015 must explicitly authorize and bound:
  - `/supervise --away` as scoped operator consent for the epoch's exact commit/push/check/PR operations.
  - One deterministic host controller as scheduler; models only return typed intents.
  - The external ledger, OS lease, retained worktrees, and unlimited open-PR monitoring.
  - One active away writer, without claiming global exclusion of unrelated interactive sessions.
  - Exact Git/GitHub broker operations only.
  - No merge, force, ref deletion, cleanup, or compatibility synchronization.
  - Exclusive, run-owned away namespace publication; normal lifecycle commands still fail closed.
  - The `VERIFY_PREPARE`/`FINAL_VERIFY_NO_WRITE` split.
  - `/verify` as sole PASS authority, with only its receipt mirrored to the app-bound `away-final-verify` check (narrow ADR-006 supersession).
  - No permission widening for ordinary sessions.
  - ADR-014 runtime profiles as a mandatory dependency.
  - Protected paths (default-deny) and fail-closed remote-CI policy.
- **Verify:**
  ```bash
  rg -n '^## ADR-015: Autonomous away lifecycle$' .pi/artifacts/pi-template/DECISIONS.md
  rg -n 'unbounded|one active away writer|away-final-verify|never merge|server-side' \
    .pi/artifacts/pi-template/DECISIONS.md .pi/artifacts/pi-template/PLAN.md AGENTS.md
  git diff --check
  ```
  Compare recorded before/after hashes of `.pi/fabric.json` and `.pi/settings.json`; they must be unchanged by this task.
- **Checkpoint:** operator acceptance plus L3 authority review.
- **Stop:** any authority remains implicit or contradicts ADR-006/009/011/012/013.

#### Task 1.3 — Define protocol and tracked policy

- **Needs:** Task 1.2.
- **Files:** `.pi/extensions/away/protocol.ts`, `.pi/extensions/away/protocol.test.ts`, `.pi/away.json`.
- **RED tests:**
  - Reject unknown fields, invalid IDs, stale revisions, non-finite budgets, secret-like keys, and count-based PR policies.
  - Accept only `{kind:"unbounded"}` for open PRs and `maxActiveWriters:1`.
  - Parse phase receipts, verification receipts, host intents, review-feedback envelopes, and typed failure results.
  - Require explicit finite budgets and the ADR-014 runtime profile.
- **GREEN:** implement a dependency-free boundary parser using `unknown` and discriminated unions; no `any`, unchecked `JSON.parse`, domain throws, or ambient configuration. Write `.pi/away.json` per the Configuration Contract above.
- **Verify:**
  ```bash
  node --experimental-strip-types --test .pi/extensions/away/protocol.test.ts
  node -e 'const c=require("./.pi/away.json"); if(c.openPullRequests?.kind!=="unbounded" || c.maxActiveWriters!==1) process.exit(1)'
  jq -e empty .pi/away.json
  git diff --check
  ```
- **Checkpoint:** none after tests and review pass.

---

### Later Child Plans (gated outlines; each receives independent investigation before execution)

#### Plan 02 — Durable State and Effects

1. **Pure reducer** — `.pi/extensions/away/controller.ts`, `controller.test.ts`. Test every legal transition, reject stale/out-of-order revisions, prove exactly one queued continuation.
2. **Ledger and unbounded index** — `state.ts`, `state.test.ts`. Test checksummed append records, incomplete-tail recovery, snapshots/cursors, fair bounded reconstruction, and no writer before the full reservation view is restored.
3. **Lease and write-ahead effects** — `effects.ts`, `effects.test.ts`. Test `fsync intent -> effect -> authoritative observation -> fsync completion`, crash points on both sides of every step, and lease retention until child processes are reaped.
   ```bash
   node --experimental-strip-types --test \
     .pi/extensions/away/controller.test.ts \
     .pi/extensions/away/state.test.ts \
     .pi/extensions/away/effects.test.ts
   ```

#### Plan 03 — Path, Worktree, and Host Boundary

1. **Central path policy** — `paths.ts`, `paths.test.ts`. Default deny; canonical descriptor-relative paths; reject symlinks, type changes, deletions, renames, protected prefixes, and unreserved paths. Protected defaults include all controller/runtime/configuration paths, all `.pi/prompts/**`, all `.pi/extensions/**`, authority files, `.opencode/**`, `.github/**`, dependency manifests, Git attributes/modules, and every lifecycle namespace except the run-owned slug.
2. **Retained worktrees** — extend `git.ts`, `git.test.ts`. Create/reconcile without force or cleanup; bind branch/worktree/base OIDs; test restart adoption only for run-owned identities.
3. **Host preflight** — `host.ts`, `host.test.ts`. Verify ADR-014 closure, runtime profile, trust/bootstrap, resource floors, clean synchronized base, policy bindings, and protected bytes without mutation.

#### Plan 04 — Pi RPC and Command UX

1. **Strict RPC adapter** — `rpc.ts`, `rpc.test.ts`. LF-delimited JSONL only; reject malformed, oversized, U+2028/U+2029-split, stale-session, or unexpected-event input.
2. **Phase pump** — extend `controller.ts`, `host.ts`. Drive the persisted sandboxed `phase-main`; derive state from the ledger and `get_state`, not the payload-free `agent_settled` event.
3. **Extension UX** — `index.ts`, `index.test.ts`, `.pi/prompts/supervise.md`. Intercept only exact `/supervise --away ...` in the `input` hook, register `/away`, and refuse controller registration in worker roles. Never register an extension command named `supervise`. A real Pi RPC smoke test must prove command discovery and normal `/supervise` behavior; mocked registration alone is insufficient.

#### Plan 05 — Namespace and Authoring Prompts

1. **Exclusive namespace publication** — `namespace.ts`, `namespace.test.ts`. Stage outside Git-visible bytes; canonical no-adopt/no-replace creation, exclusive file creation, file and directory fsyncs, run-owned crash recovery. Unknown partial namespaces block.
2. **Away `/create` overlay** — `.pi/prompts/create.md`, `prompts.test.ts`. Generate staged PLAN/TODO output and typed host intent without directly adopting or replacing a canonical namespace.
3. **Away `/plan` and `/research` overlays** — `.pi/prompts/plan.md`, `.pi/prompts/research.md`, `prompts.test.ts`. Preserve all ADR-011/012 markers, remove routine unattended checkpoints only in authenticated away mode, and revalidate expanded reservations after planning.

#### Plan 06 — Verification and Publication

1. **Prompt contract split** — `.pi/prompts/ship.md`, `.pi/prompts/verify.md`, `prompts.test.ts`. SHIP performs no Git operations in away mode; `VERIFY_PREPARE` may write candidate evidence and must stop; `FINAL_VERIFY_NO_WRITE` executes only the fresh fingerprint/evidence pass and returns a strict receipt.
2. **Git broker** — extend `git.ts`, `git.test.ts`. Controlled environment and fixed argv for exact staging, tree creation, hook-free commit construction, compare-and-set ref update, non-force exact-OID push, and remote-OID confirmation. Test against a retained local bare remote.
3. **GitHub broker and `/pr`** — `github.ts`, `github.test.ts`, `.pi/prompts/pr.md`. Allowlist policy reads, refs, checks, PR lookup/create/update, and review metadata. Expose no merge, auto-merge, ref mutation, branch deletion, or raw comment/log endpoints. PR creation uses the natural key `(repository, base ref, head ref, head SHA)` and reconciles lookup/create races.

#### Plan 07 — Unbounded Monitoring, Repair, and Ideation

1. **Unbounded fair scheduler** — extend `controller.ts`, `state.ts`. No static open-PR or retained-worktree count. Durable `nextPollAt`, ETags, round-robin cursors, bounded polls per tick, resource admission.
2. **Roadmap-first ideation** — `ideation.ts`, `ideation.test.ts`, `.pi/prompts/ideate.md`. Prefer configured roadmaps; otherwise 3-5 grounded candidates. Local explorers have filesystem/no network; external scouts receive sanitized queries/no filesystem. Cool down if none qualify.
3. **Repair policy** — `repair.ts`, `repair.test.ts`, extend `controller.ts`. CI failures map to exact confined local verifier commands; review repair accepts only bounded schema-validated path-scoped envelopes from configured actors; raw prose, URLs, code blocks, and remote logs are ignored; non-actionable feedback pauses without consuming a cycle; every new repair SHA remains blocked by the required verification check.

#### Plan 08 — Mandatory Integration and Adversarial Proof

1. **Full lifecycle** — `integration.test.ts` plus a retained fake-GitHub fixture. Exercise real Pi RPC, actual extension loading, ADR-014 dispatch, local Git push, app-bound checks, PR creation, monitoring, repair, and restart.
2. **Crash matrix** — `integration.test.ts`, `crash.test.ts`. Inject termination before and after commit, push, remote-OID observation, check creation/update, PR creation, namespace publication, ledger append, and snapshot rotation.
3. **Security/scale/portability** — `security.test.ts`, `portability.test.ts`. Prove ten or more concurrently open PRs do not trigger a count cap, one writer remains enforced, `.pi` works without `.opencode`, and protected-path/CI/resource attacks pause safely.
- Fixtures remain retained and their paths are reported; tests do not delete them.

#### Plan 09 — Documentation, Review, and Dogfood

1. Synchronize development documentation — `.opencode/tech-stack.md`, `.opencode/roadmap.md`, `.opencode/state.md`.
2. Finalize target artifacts — `spec.md`, `prd.json`, `plan.md`; record deviations and discoveries here, not in duplicate planning files.
3. Final gates and dogfood:
   - Run the L3 read-only diff review; disposition every validated Critical/High finding.
   - Run the complete verification suite and capture the final freshness fingerprint.
   - Only with separate explicit approval, start one live away epoch and stop at the published PR. Human merge and server-side compatibility synchronization remain external.

## Full Verification

```bash
node --version
bwrap --version
flock --version
git --version
gh --version
pi --approve --list-models

node --experimental-strip-types --test .pi/away-runtime/*.test.ts
node --experimental-strip-types --test .pi/extensions/away/*.test.ts
jq -e empty .pi/away.json .opencode/artifacts/autonomous-away-loop/prd.json
git diff --check
```

Also verify behaviorally:
- Real `get_commands` from the retained trusted worktree.
- Normal `/supervise` still expands the existing prompt.
- More than three open PR records remain monitorable without a count cap.
- Only one writer enters a writable lane.
- Repair heads lack a successful required check until final verification.
- Exact remote SHA equals the verified receipt SHA.
- No GitHub merge route or destructive Git operation exists in the broker allowlist.
- `.pi/fabric.json` and `.pi/settings.json` retain their pre-feature hashes.
- No repository write occurs after the final verification fingerprint.

There is no current root package/typecheck harness; Node's type-stripping test runner is the initial deterministic convention. Do not add a package solely to manufacture a typecheck command.

## Failure Behavior

| Failure | Required behavior |
|---|---|
| Ledger tail incomplete | Preserve bytes, ignore only the checksum-invalid final fragment, recover from prior durable record |
| Earlier ledger corruption | Pause; never truncate, rewrite, or guess |
| External effect outcome unknown | Reconcile by natural identity; pause if still ambiguous |
| Push succeeded before completion record | Confirm exact remote OID, then record completion without pushing again |
| PR creation timed out | Lookup exact head/base identity before retry |
| Partial unknown namespace | Fail closed; never adopt or replace |
| Policy/check/App identity drift | Pause before push; repair PR remains blocked |
| Workflow configuration appears | Pause unless its exact audited hash and safe execution policy are configured |
| Resource or epoch budget exhausted | Durable pause; no new writer |
| Invalid review feedback | Ignore body, record non-actionable status, consume no repair cycle |
| Stop requested with live child | Request shutdown and retain lease until the child is observed reaped |
| No viable roadmap or fallback idea | Cooldown; do not fabricate work |

## Privacy and Security

- GitHub credentials remain in the host broker; prompts, sandboxes, ledger, and logs receive only opaque handles.
- External research receives sanitized public queries and no repository filesystem.
- Review text and CI logs are untrusted and never copied wholesale into prompts.
- The ledger stores minimal run IDs, OIDs, effect IDs, policy digests, review/check IDs, and statuses — not tokens or raw outputs.
- External state is mode-restricted and retained until operator-directed cleanup.
- Candidate branches must not trigger secret-bearing or self-hosted CI. This repository currently has no workflows, so the initial policy is fail-closed if any appear.
- The app-bound `away-final-verify` check mirrors a `/verify` receipt; it never invents PASS.
- Branch policy must require approval, stale-review dismissal, last-push approval, admin enforcement, the app-bound check, no bypass actors, and no force/deletion.
- GitHub policy cannot prove reviewer humanity; the accepted guarantee is capability and repository-policy composition.

## Constitutional Scan

- **No deletion:** preserved; no automatic worktree, branch, state, or fixture cleanup.
- **Main-only authority:** narrowly superseded only through accepted ADR-015; models still cannot directly execute effects.
- **Namespace ownership:** ordinary commands remain fail-closed; away publication is exclusive and effect-owned.
- **`/verify` authority:** preserved through a prepare/final split; only `/verify` decides PASS.
- **Single writer:** one active away writer; no false claim about unrelated interactive worktrees.
- **Supervisor role:** remains read-only and advisory.
- **Normal permissions:** no widening of `.pi/fabric.json` or `.pi/settings.json`.
- **Makora/GPT profiles:** ADR-014 owns exact profiles; writable Makora retains its required extension setting, while GPT read-only lanes remain non-recursive and restricted.
- **Portability:** shipped runtime depends only on `.pi`.
- **Git safety:** no merge, force, destructive restore, ref deletion, hook execution, or compatibility synchronization.
- **External effects:** `/supervise --away` is the explicitly scoped epoch authorization; live dogfood still requires separate approval.

## Open Questions and Assumptions

- `[BLOCKING]` ADR-013 and corrected ADR-014 must reach verified status.
- `[BLOCKING for live publication]` Install and configure the GitHub App and effective branch policy (approval + stale-review dismissal + last-push approval + admin enforcement + app-bound `away-final-verify` + no bypass actors + no force/deletion).
- `[ASSUMPTION]` Initial active-compute budget is eight hours per epoch (`maxActiveComputeMs: 28800000`).
- `[ASSUMPTION]` Roadmap lookup is the sole canonical default `.pi/ROADMAP.md` (ADR-016 v1 grammar: `roadmap_schema_version: 1`, monotonic `last_issued_id`, immutable `RM-NNN`); eligibility is Ready + `Autonomy: away-ok` + `Open decisions: none`; ideation reads `.pi/ROADMAP.md` read-only and never mutates it; reservations/completion live in the external ledger; feature creation uses source-backed `/create <slug> --from .pi/ROADMAP.md#RM-NNN`.
- `[UNCERTAIN]` If organization-level Actions or runner policy cannot be inspected, preflight must block rather than infer safety.

Unlimited open PRs imply potentially indefinite retained disk and metadata; actual resource exhaustion pauses work but never becomes a count cap.

### Alternative Trigger

If an app-bound required check cannot be installed and enforced, disable automated push/PR publication. Stop after a verified local commit and require operator-controlled publication; do not fall back to a weaker unbound commit status.

## Review Finding Disposition

(from the fresh-eyes read-only review of the proposed architecture; material corrections reflected above)

- **Authority after implementation (P0):** moved authority ratification to Task 1.2 before any controller code; ADR renumbered 014 -> 015; removed broker-owned compatibility sync.
- **Model-facing privilege boundary (P0):** kept model-facing write/execute/network denied; Git/GitHub/verifier effects moved to a separately confined host-owned broker (ADR-014 prerequisite).
- **PREVERIFY vs final-verify ordering (P1):** split into `VERIFY_PREPARE` (may write) and `FINAL_VERIFY_NO_WRITE` (no write) so the post-commit tree stays clean.
- **Crash consistency (P1):** replaced nonce-only claims with write-ahead intent + natural-key reconciliation + fsynced completion + lease retention until child reaping.
- **Namespace state machine (P1):** replaced contradictory reject-existing with an exclusive, run-owned, no-replace publication protocol; partial namespaces still fail closed.
- **`/supervise --away` wiring (P1):** switched from a shadowing extension command to `input`-hook interception of only the `--away` form.
- **Controller/RPC topology (P1):** added worker-role markers to prevent nested controller registration and duplicate `agent_settled` scheduling; supervisor reconciled inside the exact persisted RPC session.
- **Lease global claim (P1):** narrowed "one writable pipeline globally" to one active away writer.
- **Worktree trust bootstrap (P1):** preflight must run `get_commands` from the retained trusted worktree and fail unless all prompts/extensions load.
- **Protected paths (P1):** centralized default-deny prefix policy; expanded to all extensions/prompts/authority/CI/manifests; enforced at every boundary.
- **Capability matrix (P1):** Makora `extensions:true` edit/write only; local explorer filesystem-only; external scout network-only from a sanitized empty cwd; reviewers read-only.
- **`/ship` away overrides (P1):** no prompt-owned Git, no routine close confirmation, reviews use host-baseline working bytes, lifecycle writes settle before the broker commit.
- **Repair publication race (P1):** added the app-bound `away-final-verify` check as a merge barrier for repair heads.
- **Mandatory integration proof (P1):** moved hermetic full-loop test from optional to mandatory; added crash matrix and security/portability suites.
- **Path reservation timing (P2):** made ideation reservations provisional; revalidate after PLAN and from host-derived settled diffs.
- **Task sizing (P2):** split each broad task into 2-3-task vertical TDD slices; tests own their files.
- **Repair input (P2):** V1 accepts only bounded schema-validated path-scoped feedback; non-actionable feedback pauses without consuming a cycle.

## Effort and Context Budget

- Gate 0: M (ADR-013 settle + ADR-014 correction/ship/verify), 40-50% context.
- Plan 01: M, 30-40%.
- Plans 02-07: each M, 30-40%; serial execution.
- Plan 08: M-L (adversarial integration dominates), 40-50%.
- Plan 09: S-M, 20-30%.
- Total: XL (10-16 days), dominated by ADR-014 correction, runtime/trust/verification gates, and one authorized dogfood run.

## Next Step

1. Run `/plan away-sandbox-runtime` (correct ADR-014 per Task 0.2).
2. After ADR-014 verifies (`/verify away-sandbox-runtime`), run `/ship autonomous-away-loop` to execute this plan starting at Plan 01.

Do not infer the current `.active` slug (it points elsewhere due to concurrent work); always pass the explicit slug.
