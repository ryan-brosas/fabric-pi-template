# PLAN — Ultra Mesh Pods (`ultra-mesh-pods`)

**Status:** specified — design approved; executable after `depth-2-lifecycle-routing` reconciles its shared Fabric defaults.
**Discovery Level:** 3 — exact-version Pi/Fabric source, prompt/extension patterns, mesh semantics, worktree behavior, Git integration risks, and operator interview were covered.
**Effective Review Level:** 3 — max(discovery 3, risk floor 3 for concurrent writers, Git history mutation, durable coordination, crash recovery, recursive model routing, and a new tool-call security gate).

## Problem Statement

The standard lifecycle intentionally permits one serial Makora writer in the current worktree. That is the correct default, but it cannot exploit a large goal with several genuinely independent implementation slices. Raising `.pi/fabric.json` to `maxDepth:6`, `maxConcurrent:32`, and `maxPerExecution:16` does not create six safe teams: `maxDepth` bounds recursive chain length, each recursive Fabric process enforces its own limits, and `maxPerExecution` resets for every `fabric_exec`. Broad children have already crossed the 500000 cumulative-token guard, so unbounded recursion would amplify repeated context ingestion.

The operator approved a separate `/ultra <goal>` command: one Sol control plane coordinates up to six adaptive pods through a project-scoped mesh ledger; every GLM writes only in its own retained Fabric worktree; Main alone reviews host-derived candidates, creates local commits, and cherry-picks accepted commits serially into a retained run-specific integration worktree. Ultra never mutates the checked-out `main` worktree or ref. Normal `/ship` behavior remains unchanged.

## Goal

Provide an opt-in, resumable Ultra workflow that converts one raw goal into bounded mesh-coordinated pod work, obtains one explicit pre-implementation authorization, enforces applicable `AGENTS.md` authority before every accepted agent contribution and before any GLM access or mutation, assembles reviewed candidates through Main-owned local commits in a retained integration worktree, and finishes with fresh read-only Sol verification over one stable candidate fingerprint.

## Dependency

`depth-2-lifecycle-routing` supplies the safe model split and depth-2 reasoning foundation. Before either feature ships, its config acceptance must be reconciled from a global `maxConcurrent:5` assumption to shared headroom of 12 while retaining a per-standard-phase policy ceiling of five Minis. Ultra changes the available global headroom, not ordinary `/ship` routing: standard writable work remains serial and standard Sol fan-out remains at most five.

ADR-017 remains owned by `depth-2-lifecycle-routing`. This feature adds ADR-018 as a narrow opt-in exception for reserved Ultra runs.

## Operator-Approved Design

- Command surface: `/ultra <goal>`.
- One central Main/Sol-max control plane; no autonomous pod schedulers.
- Project-scoped mesh ledger plus durable Markdown artifacts.
- Up to six adaptive pods; six is a ceiling, never a quota.
- Isolated Fabric worktrees for every GLM candidate.
- Main-owned local candidate commits and serial cherry-picks into a retained run-specific integration worktree after one explicit authorization gate; `main` remains untouched.
- Baseline Mini Explorer and Mini Reviewer per pod; up to two risk-triggered specialist Minis per pod.
- One replacement GLM repair candidate and one fresh Mini re-review per pod.
- Fresh Sol candidate and integration gates; Sol is always read-only and GLM is the only implementation writer.
- No push and no worktree/branch cleanup. Cleanup always requires separate explicit permission.
- Every pod agent must consume applicable `AGENTS.md` authority; writer mutation is physically gated.

## Scope

### In scope

- Parse, bound, normalize, and hash a raw Ultra goal.
- Reserve runtime namespaces under `.pi/artifacts/ultra-run-<goal-slug>-<hash8>[-h<next-hash-chunk>][-N]/` while keeping this feature specification at `.pi/artifacts/ultra-mesh-pods/`.
- Resume exactly one matching nonterminal full-hash run; use deterministic `-h...` expansion for display-hash collisions and a numeric suffix only for a later run of the same operationally terminal full hash.
- Treat `/ultra` as the sole creator/controller of `ultra-run-*`; ordinary `/create`, `/plan`, `/research`, `/ship`, `/verify`, and `/gc` fail closed on the reserved prefix.
- Maintain a project-scoped CAS mesh ledger, owner claim, pod records, events, artifact checkpoint hashes, candidate worktree/branch identities, commit OIDs, and verification evidence.
- One pre-implementation preview/authorization covering worktree branches, GLM mutations, Main-owned local commits, and serial cherry-picks for that run.
- Derive a dependency DAG and launch only ready, file-disjoint tasks, up to six pods.
- Exact model/capability routing: Sol-max control/review, Mini read-only exploration/review, Makora GLM leaf implementation.
- Adaptive Mini allocation with bounded calls, outputs, tools, and no automatic retry.
- Host-enforced Authority Receipt Gate for writers plus host-audited authority receipts for read-only agents.
- Worktree-local path ownership, host-derived candidate intake, one replacement repair round, candidate review, serial integration, one integration repair round, and fresh final review.
- Runtime and structural evidence proving the workflow, including fail-closed cases.
- Narrowly supersede the one-Makora/no-writable-fan-out rule only while an authorized Ultra run owns disjoint worktrees.

### Out of scope

- Making Ultra the default `/ship` route or changing ordinary lifecycle behavior.
- Six Sol leads, autonomous actor teams, pod-to-pod control messages, recursive GLM/Mini workers, or depth greater than 2.
- Concurrent writes to one worktree, overlapping path ownership, automatic conflict resolution, rebase, force operations, stash, destructive restoration, or automatic cleanup.
- Worker commits, worker shell/network access, worker mesh access, worker lifecycle writes, or Sol edits.
- More than one replacement repair per pod, more than one integration repair wave, automatic retry of failed/timed-out writable workers, or whole-run retry.
- Push, pull request, release, deployment, package publication, or any remote mutation.
- Persisting goals that match the deterministic secret-token predicate, or placing secret-bearing authority packets, mesh values, child prompts, logs, or artifacts under Ultra control. The operator's raw command already exists in the parent session transcript before the prompt can validate it.
- A general workflow engine, new pi-fabric APIs, host-wide write lock, compatibility shim, or automatic update of the checked-out `main` worktree/ref.
- Modifying a governing `AGENTS.md` from inside Ultra; authority changes use the standard serial lifecycle.
- An OpenCode `/ultra` command. This is a Pi runtime command and canonical Pi/Fabric contract.

## Observable Truths

1. Before mesh/artifact/child access, `/ultra` rejects an empty goal, C0/C1 control code points, more than 4096 post-NFC UTF-8 bytes, or a match to the documented high-confidence secret-token grammar; rejection never echoes the raw goal.
2. One full normalized-goal SHA-256 identifies matching runs; the runtime slug is at most 64 characters, expands beyond the first eight hash hex characters on a display collision, and uses numeric suffixes only for terminal reruns of the same full hash.
3. Exactly one live root owns an active run through a versioned 120-second lease renewed at most every 30 seconds; reclaim requires expiry plus skew grace, two absent membership samples, same-host proof, and CAS.
4. Mesh is live coordination; the four canonical Markdown files are durable checkpoints. Main is the only mesh/artifact writer.
5. No writable child, worktree, branch, commit, or cherry-pick starts before the preview is explicitly approved.
6. The task DAG launches at most six ready, path-disjoint GLM pods. Fewer independent tasks produce fewer pods.
7. Every GLM is a nonrecursive Makora leaf in a distinct `worktree:true` checkout with no shell/network/mesh tool.
8. Every accepted read-only result proves complete applicable authority reads in host logs; every GLM mutation is blocked until the authority extension verifies its manifest.
9. Main derives paths, bytes, worktree identity, and candidate state from host evidence; worker prose never authorizes integration.
10. Each pod gets at most one replacement repair candidate in a fresh worktree. The original candidate is retained and never cleaned automatically.
11. Sol never edits: it returns evidence-backed candidate/integration findings and exact repair briefs for Main adjudication and GLM execution.
12. Main alone makes exact-path candidate commits and serially cherry-picks into one run-specific integration worktree after write-ahead/CAS and applicability/fingerprint preflight. Any conflict state blocks; `main` is never mutated.
13. No push or cleanup occurs. Retained branches/worktrees and their paths are reported.
14. Final verified status is response-only after the last stable fingerprint; no tracked repository write follows it.
15. Standard `/ship` remains serial and does not inherit Ultra fan-out merely because global child headroom is 12.

## Proposed Solution

### 1. Command grammar and goal identity

`.pi/prompts/ultra.md` exposes:

```text
/ultra <goal>
```

The command trims outer whitespace, normalizes Unicode to NFC, encodes UTF-8, then requires 1..4096 bytes. It rejects code points U+0000..U+001F or U+007F..U+009F and the following case-appropriate high-confidence secret grammars: PEM private-key headers; `AKIA[0-9A-Z]{16}`; `gh[pousr]_[A-Za-z0-9]{20,}`; `github_pat_[A-Za-z0-9_]{20,}`; `Bearers+[A-Za-z0-9._~+/-]{20,}={0,2}`; or `(api[_-]?key|token|password|secret)\s*[:=]\s*\S{8,}`. This check occurs before mesh, artifact, or child-prompt access and never echoes rejected bytes; the original command text is already present in the parent session transcript and is outside that persistence guarantee. SHA-256 is computed over accepted normalized UTF-8 bytes.

The human component is lowercase-hyphen and truncated so the complete slug is at most 64 characters. Allocation starts at `ultra-run-<human>-<hash[0:8]>`. If that name stores a different full hash, append `-h<hash[8:16]>`, then successive eight-hex chunks while shortening `<human>`; use the full 64 hex characters if needed. A full-hash collision blocks. This collision expansion is independent of numeric rerun suffixes.

The narrower `ultra-run-*` reservation avoids colliding with this ordinary feature specification (`ultra-mesh-pods`). `/ultra` is the second namespace creator only for that reserved prefix; `/create` remains sole creator everywhere else. All ordinary lifecycle commands reject reserved namespaces rather than adopting them.

A matching nonterminal run is resumed only when exactly one full goal hash matches. Multiple matching nonterminal runs, a live foreign owner, a partial namespace, or mesh/artifact identity disagreement blocks. A prior operational terminal (`candidate-complete` or `abandoned`) of that same full hash creates `-2`, `-3`, and so on after any collision-expansion segment. `candidate-complete` is an operational run state, not a terminal verified declaration; verification authority remains response-only.

### 2. Mesh ledger and crash-safe checkpoints

Use project-scoped keys below `ultra/runs/<run-id>` and topic `ultra.<run-id>`:

- Run record: `schema:"ultra-run/1"`, goal hash, slug, state, owner root/host/boot identity, lease epoch/version/expiry, baseline, approval receipt, current phase, pod count, artifact revision/hashes, integration branch/worktree and order, candidate fingerprint, timestamps.
- Pod record: task/criteria, dependencies, exact owned paths, authority manifest hash, model role, status, worktree/branch, candidate hashes, findings/dispositions, replacement count, commit OID.
- Events: phase transitions, blocked reasons, review findings, candidate/commit acceptance. Never raw source, raw tool output, secrets, credentials, or PII.

Every state update uses `mesh.put(..., ifVersion)`. The owner record contains the exact session/root ID from `agents.self()`, host and boot identity, lease epoch, ledger version, and `expiresAtMs` from host `Date.now()`. The lease lasts 120 seconds and Main renews it at least every 30 seconds, including through a heartbeat loop while a writable wave runs. A competing owner blocks while the lease is unexpired or the exact owner is present in `agents.members()`. Reclaim is allowed only on the same host after `expiresAtMs + 60000`, two membership samples 30 seconds apart both omit the owner, no host run record reports its writable child RUNNING, and one CAS changes the observed version/epoch; cross-host or clock/identity ambiguity blocks. Children never call mesh.

After start, an operator may mark a run `abandoned` without cleanup only when Main owns or has safely reclaimed the lease and host records prove no writable child is RUNNING. Main records the operator authorization and reason, then CAS-transitions the exact nonterminal version to `abandoned`; inability to prove quiescence blocks rather than trapping or guessing.

Artifact checkpointing is two-phase: Main computes prospective bytes/hashes, CAS-records a bounded `checkpoint_pending`, writes the canonical artifact files, then CAS-confirms the observed hashes and revision. Resume may finish an exact pending checkpoint when bytes match; any other disagreement blocks for operator recovery. No artifact is deleted or silently rewritten from an unproven mesh value.

### 3. Artifact contract

Every runtime namespace contains:

- `PLAN.md` — normalized goal, review level, baseline, DAG, pod ownership, non-goals, checks, model/capability envelope, authority manifests.
- `TODO.md` — live pod/task state and dependencies.
- `PROGRESS.md` — bounded `ultra-evidence/1` JSON blocks carrying monotonically increasing event ID, run/ledger revision, event type, host run-record ID and log-file digest, exact command argv/exit code, baseline/after hashes and OIDs, authority/check/review disposition IDs, and candidate fingerprint.
- `DECISIONS.md` — material deviations and operator decisions only.

Artifacts mirror phase checkpoints; mesh remains the live coordination ledger. Main writes artifacts only between agent waves. Evidence prose never counts: the validator parses only `ultra-evidence/1` blocks, rejects duplicate/out-of-order IDs and unknown fields, reopens referenced host run records, recomputes current file/ref/hash facts, and checks every transition against the matching mesh revision. Missing host records make evidence unavailable rather than true. Before the final no-write pass, Main checkpoints candidate evidence and creates any authorized documentation commit. Final verified status is emitted only in the response/transcript.

### 4. One pre-implementation authorization

Research, goal decomposition, mesh reservation, PLAN/TODO creation, and a read-only Sol plan occur before the gate. The preview shows:

- normalized goal, generated slug, run ID, baseline HEAD/fingerprint;
- actual pod count, dependency waves, exact paths, and conflicts;
- planned Mini/Sol/GLM call ceilings and capabilities;
- required checks and stop conditions;
- local branch/worktree creation, Main-owned candidate commits, serial cherry-picks;
- explicit exclusions: no push and no cleanup.

Approval is scoped to that immutable preview. Any new owned/read path, task, external effect, additional repair, wider capability, changed baseline, or changed integration branch invalidates it and requires a new preview. Refusal marks the run `abandoned` without creating worktrees or commits. A later authorized abandon uses the quiescent CAS transition defined above and never cleans retained state.

### 5. Topology and exact roles

```text
Main / Sol-max (preflighted sole scheduler, mesh/artifact writer, adjudicator, integrator)
├─ Mini Explore/Specialists (read-only evidence)
├─ ≤6 GLM candidate pods (parallel only across isolated worktrees)
├─ Mini candidate reviewers (read-only)
├─ fresh Sol Candidate Gate (read-only, all candidate packets)
├─ optional ≤1 replacement GLM candidate per affected pod
├─ fresh Mini re-review per replacement
├─ Main candidate commits + serial cherry-picks
├─ fresh Sol Integration Gate (read-only)
└─ optional one GLM integration-repair worktree → fresh Sol recheck
```

Exact roles:

Before any Ultra namespace or mesh access, Main must obtain the active root provider/model/thinking identity from the Pi/Fabric session context, require exactly `openai-codex/gpt-5.6-sol` with `thinking:"max"`, and record that host fact in the preview/evidence. Missing identity or mismatch fails closed; resolving the model in `--list-models` alone is insufficient.

- Sol: `openai-codex/gpt-5.6-sol`, `thinking:"max"`, `extensions:false`, `recursive:false` except the depth-2 foundation's explicitly bounded Sol→Mini gather, `read/grep/find/ls`, no worktree, no mutation.
- Mini: `openai-codex/gpt-5.4-mini`, `thinking:"max"`, `extensions:false`, `recursive:false`, local `read/grep/find/ls` or packet-only as applicable, no mutation/mesh/network.
- GLM: `makora/zai-org/GLM-5.2-NVFP4`, `thinking:"max"`, `extensions:true`, `recursive:false`, `worktree:true`, exact tools `ultra_read_authority,read,grep,find,ls,edit,write`; no `bash`, network, mesh, or commit.

Global defaults become safe read-only Mini defaults with `maxDepth:2`, `maxConcurrent:12`, `maxPerExecution:16`, `timeoutMs:600000`, and `maxTokensPerChild:500000`. Ultra additionally passes exact per-call fields and exact stage-level `agentBudget`; standard phases retain their smaller policy ceilings.

### 6. Adaptive pod envelope

For `P` actual pods (`1 <= P <= 6`):

- Baseline: `P` Mini Explorers and `P` Mini Reviewers.
- Specialists: zero to two per pod, at most `2P`, assigned only for concrete risk such as tests/dependencies, security, concurrency, public contract, persistence, or unfamiliar exact-version API.
- Re-review reserve: at most `P`, one fresh Mini after each replacement repair.
- Maximum Mini calls: `5P` (30 when `P=6`), including failures; no automatic retry.
- Peak Mini concurrency: 12. Peak GLM concurrency: 6. Scout, build, review, and repair waves never overlap.
- Explore/review output: at most 6 KiB and four repository exploration calls after authority consumption unless the approved preview names a smaller bound. Authority calls are budgeted separately as exactly the manifest-derived page count: 64 KiB pages, at most 256 KiB total authority bytes per agent; larger authority blocks dispatch. Failed, timed-out, token-limited, oversized, or incomplete output is non-authoritative and still consumes the ceiling.

A systemic all-failed batch stops later spend. Main may directly cover a missing read-only angle and mark coverage partial; it never silently launches a replacement Mini.

### 7. Authority Receipt Gate

Main computes an authority manifest per agent from the candidate worktree baseline and exact owned/read paths:

- worktree-root `AGENTS.md`;
- every nested `AGENTS.md` governing an owned/read path;
- repo-relative canonical path, file size, 64 KiB byte-page count, and SHA-256;
- exact canonical read-file/read-root allowlist, including every nested authority file contained by or governing those roots;
- exact writable path allowlist for GLM.

The manifest is encoded in a host-authored bounded task envelope and hashed into mesh/artifacts. Goals and external packets cannot contribute manifest fields.

`.pi/extensions/authority-receipt/index.ts` activates only for the Ultra manifest marker. It registers `ultra_read_authority`, serves deterministic 64 KiB pages from manifest-listed authority files, records complete successful coverage, canonicalizes every path, and gates `read`/`grep`/`find`/`ls` as well as `edit`/`write`. Repository access blocks until all authority pages are consumed; every access must remain inside the exact read roots/files, every mutation re-hashes authority and must remain inside the writable allowlist, and symlink/outside-worktree traversal blocks. Directory search is allowed only when Main has enumerated and hashed every nested `AGENTS.md` under that root. Same-message authority-read plus any repository access fails because tool preflight occurs before receipt completion.

GLM loads the gate because Makora already requires `extensions:true`. If the extension, manifest, hash, paging, or gate cannot be proven, the pod fails closed. Ultra rejects goals that would modify a governing `AGENTS.md`.

Sol/Minis stay `extensions:false`. Their host envelope contains the same canonical read allowlist and complete governing/contained authority manifest. Their tasks require direct complete authority reads before repository exploration; Main rejects any host-observed out-of-allowlist access and validates successful page events, exact coverage, and current hashes in child logs before accepting output. Self-reported receipts never count. Authority drift or newly discovered nested authority invalidates all affected evidence/candidates.

### 8. Candidate isolation and replacement repair

Before dispatch, Main requires candidate-owned paths to match the approved wave baseline; unrelated dirty paths are preserved. Wave 1 starts from the approved command baseline. After a wave passes candidate review, Main commits and serially integrates it into the run-specific integration worktree; the resulting checked OID/fingerprint becomes the immutable derived baseline in the next authorized wave checkpoint. Only dependency-ready, path-disjoint pods sharing that wave baseline run together. Pi-fabric 0.24.3 returns `branch` and `worktree` on each `agents.run({worktree:true})`; Main validates both against host Git worktree metadata and records them.

Main performs no edit, commit, or artifact write while a writable wave is active. Every worktree has exactly one active writer. After settlement, Main derives changed paths/bytes against that worktree's baseline, rejects unowned changes, runs host checks with `git -C <worktree>`, and builds sanitized candidate packets.

A validated Critical/High candidate finding permits one replacement repair only. The original candidate is retained. A fresh GLM starts in a new worktree from the same immutable wave baseline, receives the original host-derived diff plus Main-validated repair brief, and produces a complete replacement candidate. A fresh Mini re-reviews it. A second validated Critical/High finding rejects that pod and blocks dependents.

Failed or timed-out writable workers never retry automatically. Partial worktrees remain retained for inspection.

### 9. Sol review gates

The fresh Sol Candidate Gate receives host-derived diffs/hashes, Mini findings, command evidence, applicable authority excerpts/hashes, dependency context, and exact allowlists. It reports only evidence-backed findings. Main reopens every citation and decides repair, reject, or disprove.

After serial integration, a separate fresh Sol Integration Gate examines the assembled diff for cross-pod contradictions, duplicate implementations, broken invariants, missing tests, security/performance regressions, and generated-code quality. Sol never edits. One validated integration-level repair wave may run through one new GLM worktree from the integrated HEAD, followed by checks and a new fresh Sol review. Further Critical/High findings produce `NEEDS WORK`.

### 10. Main-owned commits and isolated serial integration

Workers never stage or commit. Main creates a unique `ultra-integrated-<run-id>` branch/worktree from the approved baseline; the checked-out `main` worktree and `refs/heads/main` are read-only comparison inputs and are never updated by Ultra. A project key `ultra/integration-owner` uses the same lease/reclaim rules and excludes another Ultra integrator. After a candidate passes all gates, Main:

1. Revalidates candidate worktree/branch, exact changed paths, authority receipt, checks, and wave baseline.
2. Stages only exact owned paths in that candidate worktree; never `git add .`; creates one local candidate commit using the approved conventional message.
3. Revalidates the integration worktree HEAD/index/worktree fingerprint and confirms it equals the checkpointed expected OID.
4. Generates the candidate patch and runs Git 2.43.0 `git apply --check --index` against the integration worktree as a non-mutating applicability check.
5. CAS-records `integration_pending` with ledger version, pre-integration OID/fingerprint, candidate OID, and expected clean Git state; then cherry-picks exactly one commit in dependency order in that single-writer integration worktree.
6. Reopens HEAD, index/worktree state, `CHERRY_PICK_HEAD`, parent/candidate identity, changed paths, and checks; CAS-confirms the observed post-OID/fingerprint before starting another cherry-pick or dependent wave.

On resume, exact pending evidence is inspected before action. A clean HEAD whose parent is the recorded pre-OID and whose tree matches the recorded candidate effect may be confirmed; unchanged pre-OID may retry only after a new operator authorization because automatic writable retry is forbidden. `CHERRY_PICK_HEAD`, conflicts, dirty/ambiguous state, unexpected OID/path drift, or missing host evidence blocks for operator recovery. Ultra never auto-resolves, replays ambiguously, rebases, resets, aborts, stashes, cleans, deletes a worktree/branch, updates `main`, or pushes. The final report lists every retained path, branch, commit, and blocked Git state.

### 11. Freshness and operational terminal state

Before final verification, Main writes bounded evidence, creates any authorized documentation commit, and CAS-records `candidate-complete` with the exact candidate tuple. It then runs the final checks and captures a fresh before/after fingerprint. Mesh runtime state is excluded from candidate bytes but receives no transition after the final fingerprint. The response alone declares verified status.

On a later invocation, an unchanged `candidate-complete` run is operationally terminal for suffix allocation but does not prove that another session retained the external verification declaration. A request to rely on the prior PASS must re-run verification. `blocked`, `awaiting_approval`, and interrupted phases remain resumable.

## Success Criteria

### SC1 Narrow authority and dependency reconciliation

ADR-018 defines the Ultra-only exception; ADR-017/depth-2 artifacts and global config agree on depth 2, shared headroom 12, per-execution 16, Mini safe defaults, ordinary five-Mini policy, and unchanged serial `/ship` behavior.

**Verify:** `rg -n '^## ADR-018: Opt-in Ultra mesh pods$' .pi/artifacts/pi-template/DECISIONS.md && bash .opencode/tool/structural-check.sh --ultra-routing`

### SC2 Deterministic goal namespace and resume

Goal bounds, full-hash identity, `ultra-run-*` ownership, collision handling, terminal suffixing, exact-one active resume, CAS ownership, reserved-prefix rejection, and mismatch recovery are encoded and tested.

**Verify:** `bash .opencode/tool/structural-check.sh --ultra-routing && bash .opencode/tool/structural-check.sh --validate-ultra-evidence .pi/artifacts/ultra-mesh-pods/PROGRESS.md`

### SC3 One authorization gate

A no-write preflight proves that no worktree, branch, writable child, commit, or cherry-pick exists before an immutable preview is approved; approval is scoped to named paths/tasks/effects and excludes push/cleanup.

**Verify:** `bash .opencode/tool/structural-check.sh --validate-ultra-evidence .pi/artifacts/ultra-mesh-pods/PROGRESS.md`

### SC4 Exact bounded topology

Runtime evidence proves one Main/Sol control plane, `1..6` actual pods, distinct worktrees, exact models/capabilities, no recursive GLM/Mini, Mini call ceiling `5P`, peak GLM 6, peak Mini 12, and no overlapping phase classes.

**Verify:** `node -e 'const c=require("./.pi/fabric.json"),s=c.subagents;if(s.maxDepth!==2||s.maxConcurrent!==12||s.maxPerExecution!==16||s.extensions!==false||s.model!=="openai-codex/gpt-5.4-mini"||s.thinking!=="max"||s.timeoutMs!==600000||s.maxTokensPerChild!==500000)process.exit(1)' && bash .opencode/tool/structural-check.sh --validate-ultra-evidence .pi/artifacts/ultra-mesh-pods/PROGRESS.md`

### SC5 Authority Receipt Gate

Unit and live evidence prove complete root+nested authority consumption, hash/paging validation, mutation denial before receipt, parallel-call denial, drift denial, out-of-scope path denial, symlink/outside-worktree denial, read-only log auditing, and fail-closed missing-extension behavior.

**Verify:** `node --experimental-strip-types --test .pi/extensions/authority-receipt/index.test.ts && bash .opencode/tool/structural-check.sh --validate-ultra-evidence .pi/artifacts/ultra-mesh-pods/PROGRESS.md`

### SC6 Candidate isolation and host distrust

Every accepted candidate has a host-derived baseline/delta, one writer in one distinct worktree, exact owned paths, checks run by Main, no worker commit, and no accepted failed/partial prose.

**Verify:** `bash .opencode/tool/structural-check.sh --validate-ultra-evidence .pi/artifacts/ultra-mesh-pods/PROGRESS.md`

### SC7 Bounded review and repair

Every candidate receives Mini review plus one fresh Sol candidate gate; any repair is a single fresh replacement worktree with fresh Mini re-review; Sol never edits; a second validated Critical/High rejects the pod.

**Verify:** `bash .opencode/tool/structural-check.sh --validate-ultra-evidence .pi/artifacts/ultra-mesh-pods/PROGRESS.md`

### SC8 Main-owned Git integration

Main alone creates exact-path local commits and serially cherry-picks into one retained run-specific integration worktree after write-ahead CAS plus Git 2.43.0 applicability/fingerprint checks; dependent waves derive from confirmed integration OIDs. Conflict or ambiguous crash state blocks, and Ultra never mutates `main`, pushes, cleans, resets, rebases, stashes, or automatically aborts.

**Verify:** `bash .opencode/tool/structural-check.sh --validate-ultra-evidence .pi/artifacts/ultra-mesh-pods/PROGRESS.md && git diff --check`; the evidence validator must prove unchanged before/after `refs/heads/main` OID and root-worktree fingerprint.

### SC9 Artifact/mesh coherence and freshness

Two-phase artifact checkpoints recover only exact pending bytes, final candidate evidence is committed before the last pass, operational terminal state is distinct from verified authority, and no tracked write occurs after the final fingerprint.

**Verify:** `bash .opencode/tool/structural-check.sh --validate-ultra-evidence .pi/artifacts/ultra-mesh-pods/PROGRESS.md`

### SC10 Standard mode remains conservative

Ordinary `/ship` still has one serial in-place GLM writer and never invokes Ultra merely because global headroom is larger; normal lifecycle commands reject `ultra-run-*` namespaces.

**Verify:** `bash .opencode/tool/structural-check.sh --lifecycle-routing && bash .opencode/tool/structural-check.sh --ultra-routing`

### SC11 Exact models and runtime availability

All three exact models resolve after reload. The preview names an isolated local fixture repository at `/tmp/pi-ultra-fixture-<run-id>/repo`, initialized without network with repo-local test identity and only `fixture/a.txt`, `fixture/b.txt`, plus root/nested fixture `AGENTS.md`. The fixture goal exercises two disjoint pods, one dependency wave, authority denial, candidate commits, retained integration branch/worktree, and crash/resume records; it never touches this repository's refs or tracked bytes. The directory, branches, worktrees, commits, and logs are intentionally retained and reported because cleanup is excluded.

**Verify:** `models="$(pi --approve --list-models | awk 'NR>1 {print $1"/"$2}')"; printf '%s\n' "$models" | rg -qx 'openai-codex/gpt-5\.6-sol' && printf '%s\n' "$models" | rg -qx 'openai-codex/gpt-5\.4-mini' && printf '%s\n' "$models" | rg -qx 'makora/zai-org/GLM-5\.2-NVFP4' && bash .opencode/tool/structural-check.sh --validate-ultra-evidence .pi/artifacts/ultra-mesh-pods/PROGRESS.md`

### SC12 Objective generated-code quality

The current-byte review finds no duplicate controller/router, dead mesh state, speculative abstraction, invented API, swallowed error, compatibility shim, mock-only enforcement, untraceable scope, or prompt-only claim presented as host enforcement.

**Verify:** inspect L3 `/ship` review dispositions in `.pi/artifacts/ultra-mesh-pods/PROGRESS.md`, then run `/verify ultra-mesh-pods`.

## Technical Context

- Pi 0.81.1 prompt templates: `.pi/prompts/*.md`; `$ARGUMENTS` captures the raw goal (`docs/prompt-templates.md`).
- Pi 0.81.1 extension interception: `tool_call` can block; `tool_result`/execution events expose successful results; project extensions auto-load from `.pi/extensions/*/index.ts` after trust (`docs/extensions.md`, `examples/extensions/protected-paths.ts`).
- Pi tool calls in one assistant message are preflighted before parallel execution, so a same-message authority read cannot satisfy a sibling mutation (`docs/extensions.md`, Tool Events).
- Fabric 0.24.3 config semantics: `maxDepth` recursion bound, `maxConcurrent` child semaphore, `maxPerExecution` per-`fabric_exec` cap (`docs/configuration.md:216-223`). Recursive processes enforce their own limits (`docs/agents.md:336`).
- Worktree creation/result: `dist/subagents/worktree-manager.js`; branch/worktree fields in `dist/subagents/types.d.ts:96-97,124-125` and `dist/subagents/manager.js:333-461,926-974`.
- Worktrees are retained under the host temp root until explicit cleanup; cleanup force-removes and may delete branches, so Ultra never calls it (`dist/subagents/worktree-manager.js`).
- Mesh CAS/topics/identity: `skills/fabric-exec/references/mesh.md`; actor scope does not change project-scoped topics/state.
- Installed Git is 2.43.0. Exact-version authorities: local `/usr/share/man/man1/git-{apply,cherry-pick,update-ref}.1.gz`; https://git-scm.com/docs/git-apply/2.43.0 (`--check` turns off apply); https://git-scm.com/docs/git-cherry-pick/2.43.0 (conflicts set `CHERRY_PICK_HEAD`); https://git-scm.com/docs/git-update-ref/2.43.0 (old-OID compare-and-swap semantics). Ultra confines cherry-pick mutation to its unique integration worktree and blocks rather than invoking abort.
- Bounded workflow patterns: `skills/fabric-workflow/SKILL.md`; recursive decomposition is for oversized context, not difficulty (`skills/fabric-rlm/SKILL.md:9,274-275`).
- Current standard authority conflicts narrowly with Ultra: `AGENTS.md` Worker topology/Single writer and canonical `PLAN.md:94-97,125-161,514-565`; ADR-018 must supersede only authorized `ultra-run-*` execution.
- Existing `depth-2-lifecycle-routing` PLAN/TODO own ADR-017 and must be reconciled before Ultra runtime work.

## Affected Files

- `.pi/prompts/ultra.md` (new)
- `.pi/extensions/authority-receipt/index.ts` (new)
- `.pi/extensions/authority-receipt/index.test.ts` (new)
- `.pi/fabric.json`
- `.opencode/tool/structural-check.sh`
- `.pi/artifacts/pi-template/PLAN.md`
- `.pi/artifacts/pi-template/DECISIONS.md`
- `.pi/artifacts/depth-2-lifecycle-routing/PLAN.md`
- `.pi/artifacts/depth-2-lifecycle-routing/TODO.md`
- `.pi/prompts/create.md`
- `.pi/prompts/plan.md`
- `.pi/prompts/research.md`
- `.pi/prompts/ship.md`
- `.pi/prompts/verify.md`
- `.pi/prompts/gc.md`
- `.opencode/artifacts/pi-native-init/boilerplate.md`
- `.pi/prompts/init.md`
- `AGENTS.md`
- `.pi/tech-stack.md`
- `.pi/state.md`

## Create Review Dispositions

The completed L3 Sol review `0cb2aa5cc4ce47769d5e344d0e262c6c` examined PLAN SHA-256 `e95f1f649f43af5524fc15819977b7468681b6baa68a5649fdd8142ebf77189e` and TODO SHA-256 `c40f905c983ee6866f2ef7bfc69fe8e44c126086ba26f94ba9ce635b3fc330e9`. Main reopened every citation and accepted all findings for the first convergence round:

- Secret scope and the 4096 boundary now use a deterministic pre-persistence predicate and post-NFC UTF-8 byte unit; the unavoidable parent transcript boundary is explicit.
- Display-hash collision expansion is distinct from same-hash terminal rerun numbering.
- Ownership now has exact lease duration, renewal, clock, membership, skew, host, quiescence, abandon, and CAS rules.
- The root Sol-max identity is a fail-closed, host-recorded preflight rather than inferred from model availability.
- Dependency waves derive immutable baselines from confirmed isolated integration OIDs.
- Authority manifests/gates cover reads and searches as well as writes; authority pages have a separate bounded budget.
- Main no longer cherry-picks into `main`: one leased run-specific integration worktree uses write-ahead CAS and exact Git-state recovery.
- `PROGRESS.md` evidence is typed, ordered, host-referenced, and recomputed by the validator.
- The fixture repository, files, effects, and retention policy are explicit.
- U1/U3 checks now include the negative transition matrix and exact Git crash states.
- Installed Git 2.43.0 and version-matched official/local sources are required.

These edits stale the reviewed hashes; the required convergence review below must examine the new current bytes.

## Review Profile

- **Language/framework:** TypeScript project extension, Markdown prompt contracts, JSON Fabric config, Bash structural checks; Pi 0.81.1, Node 24.16.0, pi-fabric 0.24.3.
- **Local authorities:** `AGENTS.md`; ADR-002/003/005/006/007/009/010/011/012/013/016; pending ADR-017; canonical PLAN; this approved PLAN.
- **Required source packet:** installed Pi prompt/extension docs and protected-path example; installed Fabric configuration/agents/mesh docs, worktree manager, manager/result types, worker logs; exact model listing; installed Git 2.43.0 version plus local man pages and official 2.43.0 `git-apply`, `git-cherry-pick`, and `git-update-ref` documentation cited above.
- **Required checks:** extension unit tests, config source assertion, routing structural checks, no-write preflight, controlled worktree/mesh/authority smoke, numeric Ultra evidence validator, exact model resolution, packet three-way hash, `git diff --check`, L3 current-byte review, fresh `/verify`.
- **Applicable overlays:** concurrency, Git safety, capability/security boundary, crash consistency, performance/token bounds, exact-version framework behavior, and objective generated-code quality.

## Tasks

### D1 [dependency] Reconcile depth-2 shared headroom

The depth-2 feature keeps its five-Mini standard policy while accepting global child headroom 12 and an Ultra-only six-worktree exception, with synchronized PLAN/TODO criteria.

- **criteria:** `[SC1, SC4, SC10]`
- **depends_on:** `[]`
- **parallel:** `false`
- **conflicts_with:** `[A1, C1]`
- **files:** [`.pi/artifacts/depth-2-lifecycle-routing/PLAN.md`, `.pi/artifacts/depth-2-lifecycle-routing/TODO.md`]
- **Verify:** `rg -n 'maxConcurrent:12|five-Mini|Ultra' .pi/artifacts/depth-2-lifecycle-routing/{PLAN,TODO}.md`

### A1 [architecture] Record ADR-018 and canonical Ultra contract

Canonical authority defines reserved namespaces, leased mesh ownership, one authorization, adaptive pods, worktree isolation, read-only Sol, GLM-only writes, Main-owned isolated integration that never updates `main`, and the narrow standard-mode exception.

- **criteria:** `[SC1, SC2, SC3, SC4, SC8, SC10]`
- **depends_on:** `[D1]`
- **parallel:** `false`
- **conflicts_with:** `[D1, B1, C1, U1]`
- **files:** [`.pi/artifacts/pi-template/PLAN.md`, `.pi/artifacts/pi-template/DECISIONS.md`]
- **Verify:** `rg -n '^## ADR-018: Opt-in Ultra mesh pods$' .pi/artifacts/pi-template/DECISIONS.md && rg -n 'ultra-run-|Authority Receipt Gate|six.*worktree|serial.*cherry' .pi/artifacts/pi-template/PLAN.md`

### B1 [managed-authority] Synchronize the Ultra policy exception

State becomes partial/reload-required before the fixture, init source, and managed AGENTS interior become byte-identical with the ADR-018 exception; standard mode remains serial.

- **criteria:** `[SC1, SC3, SC5, SC8, SC10]`
- **depends_on:** `[A1]`
- **parallel:** `false`
- **conflicts_with:** `[A1, G1, C1, B2]`
- **files:** [`.pi/state.md`, `.opencode/artifacts/pi-native-init/boilerplate.md`, `.pi/prompts/init.md`, `AGENTS.md`]
- **serial_substeps:** set partial/reload-required first; update fixture and init source; update AGENTS last; stop before lifecycle/runtime execution.
- **Verify:** verify partial/reload-required state and byte-identical managed interiors; do not run `/ultra`.

### G1 [security] Build and test the Authority Receipt Gate

A project extension enforces bounded manifest paging/hashes, applicable authority consumption, exact read roots and writable paths, containment, drift rejection, and pre-access/pre-mutation blocking only for Ultra writer tasks.

- **criteria:** `[SC5, SC6]`
- **depends_on:** `[B1]`
- **parallel:** `false`
- **conflicts_with:** `[B1, C1, B2]`
- **files:** [`.pi/extensions/authority-receipt/index.ts`, `.pi/extensions/authority-receipt/index.test.ts`]
- **Verify:** `node --experimental-strip-types --test .pi/extensions/authority-receipt/index.test.ts`

### C1 [config] Encode safe shared defaults and Ultra validators

Fabric defaults become Mini/read-only/depth-2 with headroom 12 and per-execution 16, while structural checks validate standard/Ultra separation and the typed `ultra-evidence/1` schema.

- **criteria:** `[SC1, SC2, SC4, SC10, SC11]`
- **depends_on:** `[G1]`
- **parallel:** `false`
- **conflicts_with:** `[D1, A1, B1, G1, B2]`
- **files:** [`.pi/fabric.json`, `.opencode/tool/structural-check.sh`]
- **Verify:** run the SC4 config assertion and `bash .opencode/tool/structural-check.sh --ultra-routing`; no recursive/writable smoke before reload.

### B2 [reload] Reload the target topology and restore ready state

After operator `/reload`, `/init --refresh` regenerates tech-stack facts and writes ready/hash state last; all three models and the authority extension resolve.

- **criteria:** `[SC1, SC4, SC5, SC11]`
- **depends_on:** `[C1]`
- **parallel:** `false`
- **conflicts_with:** `[B1, G1, C1, U1]`
- **files:** [`.pi/state.md`, `.pi/tech-stack.md`]
- **Verify:** three-way managed-region/hash gate, exact model command from SC11, and a non-mutating extension-load probe.

### U1 [control-plane] Add goal, namespace, mesh, artifact, and approval preflight

`/ultra` validates byte/secret/model identity, establishes or resumes one reserved run, owns it through the exact lease/CAS state machine, checkpoints PLAN/TODO, computes a conflict-free DAG, and obtains one immutable preview authorization before any writable effect.

- **criteria:** `[SC2, SC3, SC9, SC10]`
- **depends_on:** `[B2]`
- **parallel:** `false`
- **conflicts_with:** `[A1, B2, U2, U3]`
- **files:** [`.pi/prompts/ultra.md`, `.pi/prompts/create.md`, `.pi/prompts/plan.md`, `.pi/prompts/research.md`, `.pi/prompts/ship.md`, `.pi/prompts/verify.md`, `.pi/prompts/gc.md`]
- **Verify:** `bash .opencode/tool/structural-check.sh --ultra-routing` plus table-driven evidence for empty/byte-boundary/secret input, display-hash collision, lease reclaim/refusal, checkpoint crash, exact-one resume, authorized abandon, baseline drift/reauthorization, and a declined no-write preflight.

### U2 [execution] Prove adaptive isolated pod candidates and bounded repair

The command launches only ready path-disjoint GLM worktrees, audits authority/results, runs adaptive Mini and fresh Sol candidate review, and permits one fresh replacement candidate per pod.

- **criteria:** `[SC4, SC5, SC6, SC7, SC11]`
- **depends_on:** `[U1]`
- **parallel:** `false`
- **conflicts_with:** `[U1, U3]`
- **files:** [`.pi/prompts/ultra.md`, `.pi/artifacts/ultra-mesh-pods/PROGRESS.md`]
- **Verify:** extension tests plus the preview-named `/tmp/pi-ultra-fixture-<run-id>/repo` two-pod authority/ownership fixture, validated by `bash .opencode/tool/structural-check.sh --validate-ultra-evidence .pi/artifacts/ultra-mesh-pods/PROGRESS.md`; retain and report all fixture effects.

### U3 [integration] Prove Main-owned commits, resume, and fresh Sol integration

Main commits accepted worktrees and serially cherry-picks them into the retained run-specific integration worktree using write-ahead CAS, derives dependent-wave baselines, performs one bounded integration repair when required, never updates `main`, and resumes or blocks deterministically without post-fingerprint writes.

- **criteria:** `[SC2, SC7, SC8, SC9, SC10, SC11]`
- **depends_on:** `[U2]`
- **parallel:** `false`
- **conflicts_with:** `[U1, U2, V1]`
- **files:** [`.pi/prompts/ultra.md`, `.pi/artifacts/ultra-mesh-pods/PROGRESS.md`]
- **Verify:** capture `git --version` = 2.43.0, exercise clean and `CHERRY_PICK_HEAD` crash-state fixtures against the exact-version source packet, then run `bash .opencode/tool/structural-check.sh --validate-ultra-evidence .pi/artifacts/ultra-mesh-pods/PROGRESS.md && git diff --check`.

### V1 [acceptance] Verify the complete Ultra contract on one fingerprint

All criteria, current-byte L3 review/dispositions, generated-code-quality review, exact model/runtime proof, regression checks, and fresh `/verify` complete without a later tracked write.

- **criteria:** `[SC1, SC2, SC3, SC4, SC5, SC6, SC7, SC8, SC9, SC10, SC11, SC12]`
- **depends_on:** `[U3]`
- **parallel:** `false`
- **conflicts_with:** `[U3]`
- **files:** `[]`
- **Verify:** run SC1–SC12 checks in order against one unchanged candidate fingerprint, then `/verify ultra-mesh-pods`.

## Risks

- Pi/Fabric does not provide a tree-wide model-specific semaphore; Ultra remains an explicit bounded workflow, not a host-global six-GLM pool.
- `maxPerExecution` resets per `fabric_exec`; call-count acceptance depends on one bounded stage invocation and mesh audit.
- Concurrent usage can overshoot observational token budgets before settlement; finite call counts, phase separation, compact packets, and no retries are load-bearing.
- Project extension loading and `tool_call`/`tool_result` ordering in a Makora worktree must be runtime-proven; unit tests alone are insufficient.
- Fabric worktrees live under the host temporary directory and are retained; reboot or external cleanup can make resume block.
- Candidate commits and serial cherry-picks can still be interrupted; a leased single-writer integration worktree, write-ahead CAS, and exact Git-state inspection contain the failure without touching `main`, while ambiguous state blocks operator recovery.
- A prompt template is control-plane policy, while the writer Authority Receipt Gate is host code; structural prompt checks cannot substitute for the runtime fixture.
- Mesh/artifact two-phase checkpoints add crash states; only exact hash-matching pending transitions recover automatically.
- The managed AGENTS change requires `/reload` and `/init --refresh` before Ultra can run.
- The existing depth-2 spec must be re-reviewed after its headroom criterion changes.

## Technical Gates

- Prove the Makora child loads `.pi/extensions/authority-receipt` under `extensions:true` and that `--tools` admits `ultra_read_authority` while excluding shell/Fabric/mesh tools.
- Prove a same-turn authority read plus edit blocks the edit, a later edit succeeds only after complete pages, and drift blocks subsequent mutation.
- Prove `agents.run({worktree:true})` returns a retained path/branch that Main can inspect and commit without trusting child prose.
- Prove project-scoped mesh CAS ownership across two roots and exact stale-owner recovery.
- Prove the declined preview creates no worktree/branch/commit and that authorized execution creates no push/cleanup.
- Prove a replacement repair uses a fresh worktree from the approved wave baseline rather than mutating/reviving a settled worker.
- Prove Git 2.43.0 applicability checks, write-ahead records, single integration ownership, clean crash confirmation, and `CHERRY_PICK_HEAD` blocking without automatic abort or any `main` ref/worktree mutation.

## Stop Conditions

- `depth-2-lifecycle-routing` and Ultra disagree on shared config or authority.
- Ready packet/hash/reload gate fails.
- The goal matches the documented secret-token predicate, is ambiguous enough to prevent a bounded DAG, or requires modifying governing authority.
- Fewer independent tasks is acceptable; overlapping ownership is not — serialize into later waves or stop.
- The authority extension is absent, stale, bypassable, or cannot prove complete reads.
- Any writable worker fails/times out, changes an unowned path, lacks a distinct worktree, or exceeds the approved envelope.
- A Critical/High finding remains after the one permitted replacement/re-review.
- The approved or derived wave baseline, candidate bytes, or integration OID/fingerprint drifts; patch applicability fails; `CHERRY_PICK_HEAD` exists; or a conflict/ambiguous crash state is possible.
- Mesh ownership/checkpoint state is ambiguous or multiple active matching runs exist.
- Any step would require cleanup, deletion, reset, rebase, stash, automatic conflict resolution, push, or a wider capability than approved.
- A post-check tracked write invalidates the final evidence.

## Open Questions

None. The operator approved the topology, mesh/artifact split, resume semantics, one authorization gate, adaptive pods, one repair round, Sol read-only policy, Main-owned candidate commits with isolated integration cherry-picks, and the Authority Receipt Gate.