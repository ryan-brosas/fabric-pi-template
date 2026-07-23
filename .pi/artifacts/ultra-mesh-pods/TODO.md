# TODO — Ultra Mesh Pods (`ultra-mesh-pods`)

Executable task list synchronized with `PLAN.md`. `/create` changes lifecycle artifacts only; no Ultra runtime, config, authority, extension, Git, or implementation behavior has been changed yet.

### 2026-07-23 - Ultra mesh pods
status: active

#### D1 [dependency] Reconcile depth-2 shared headroom
- [ ] The depth-2 feature keeps its five-Mini standard policy while accepting global child headroom 12 and an Ultra-only six-worktree exception, with synchronized PLAN/TODO criteria.
- **criteria:** `[SC1, SC4, SC10]`
- **depends_on:** `[]`
- **parallel:** `false`
- **conflicts_with:** `[A1, C1]`
- **files:** [`.pi/artifacts/depth-2-lifecycle-routing/PLAN.md`, `.pi/artifacts/depth-2-lifecycle-routing/TODO.md`]
- **Verify:** `rg -n 'maxConcurrent:12|five-Mini|Ultra' .pi/artifacts/depth-2-lifecycle-routing/{PLAN,TODO}.md`

#### A1 [architecture] Record ADR-018 and canonical Ultra contract
- [ ] Canonical authority defines reserved namespaces, leased mesh ownership, one authorization, adaptive pods, worktree isolation, read-only Sol, GLM-only writes, isolated Main-owned integration that never updates `main`, and the narrow standard-mode exception.
- **criteria:** `[SC1, SC2, SC3, SC4, SC8, SC10]`
- **depends_on:** `[D1]`
- **parallel:** `false`
- **conflicts_with:** `[D1, B1, C1, U1]`
- **files:** [`.pi/artifacts/pi-template/PLAN.md`, `.pi/artifacts/pi-template/DECISIONS.md`]
- **Verify:** `rg -n '^## ADR-018: Opt-in Ultra mesh pods$' .pi/artifacts/pi-template/DECISIONS.md && rg -n 'ultra-run-|Authority Receipt Gate|six.*worktree|serial.*cherry' .pi/artifacts/pi-template/PLAN.md`

#### B1 [managed-authority] Synchronize the Ultra policy exception
- [ ] State becomes partial/reload-required before the fixture, init source, and managed AGENTS interior become byte-identical with the ADR-018 exception; standard mode remains serial.
- **criteria:** `[SC1, SC3, SC5, SC8, SC10]`
- **depends_on:** `[A1]`
- **parallel:** `false`
- **conflicts_with:** `[A1, G1, C1, B2]`
- **files:** [`.pi/state.md`, `.opencode/artifacts/pi-native-init/boilerplate.md`, `.pi/prompts/init.md`, `AGENTS.md`]
- **serial_substeps:** set partial/reload-required first; update fixture and init source; update AGENTS last; stop before lifecycle/runtime execution.
- **Verify:** verify partial/reload-required state and byte-identical managed interiors; do not run `/ultra`.

#### G1 [security] Build and test the Authority Receipt Gate
- [ ] A project extension enforces bounded manifest paging/hashes, applicable authority consumption, exact read roots and writable paths, containment, drift rejection, and pre-access/pre-mutation blocking only for Ultra writer tasks.
- **criteria:** `[SC5, SC6]`
- **depends_on:** `[B1]`
- **parallel:** `false`
- **conflicts_with:** `[B1, C1, B2]`
- **files:** [`.pi/extensions/authority-receipt/index.ts`, `.pi/extensions/authority-receipt/index.test.ts`]
- **Verify:** `node --experimental-strip-types --test .pi/extensions/authority-receipt/index.test.ts`

#### C1 [config] Encode safe shared defaults and Ultra validators
- [ ] Fabric defaults become Mini/read-only/depth-2 with headroom 12 and per-execution 16, while structural checks validate standard/Ultra separation and typed `ultra-evidence/1` runtime evidence.
- **criteria:** `[SC1, SC2, SC4, SC10, SC11]`
- **depends_on:** `[G1]`
- **parallel:** `false`
- **conflicts_with:** `[D1, A1, B1, G1, B2]`
- **files:** [`.pi/fabric.json`, `.opencode/tool/structural-check.sh`]
- **Verify:** run the SC4 config assertion and `bash .opencode/tool/structural-check.sh --ultra-routing`; no recursive/writable smoke before reload.

#### B2 [reload] Reload the target topology and restore ready state
- [ ] After operator `/reload`, `/init --refresh` regenerates tech-stack facts and writes ready/hash state last; all three models and the authority extension resolve.
- **criteria:** `[SC1, SC4, SC5, SC11]`
- **depends_on:** `[C1]`
- **parallel:** `false`
- **conflicts_with:** `[B1, G1, C1, U1]`
- **files:** [`.pi/state.md`, `.pi/tech-stack.md`]
- **Verify:** three-way managed-region/hash gate, exact model command from SC11, and a non-mutating extension-load probe.

#### U1 [control-plane] Add goal, namespace, mesh, artifact, and approval preflight
- [ ] `/ultra` validates byte/secret/model identity, establishes or resumes one reserved run through the exact lease/CAS state machine, checkpoints PLAN/TODO, computes a conflict-free DAG, and obtains one immutable preview authorization before any writable effect.
- **criteria:** `[SC2, SC3, SC9, SC10]`
- **depends_on:** `[B2]`
- **parallel:** `false`
- **conflicts_with:** `[A1, B2, U2, U3]`
- **files:** [`.pi/prompts/ultra.md`, `.pi/prompts/create.md`, `.pi/prompts/plan.md`, `.pi/prompts/research.md`, `.pi/prompts/ship.md`, `.pi/prompts/verify.md`, `.pi/prompts/gc.md`]
- **Verify:** `bash .opencode/tool/structural-check.sh --ultra-routing` plus table-driven `ultra-evidence/1` cases for input bounds/secrets, hash collision, lease reclaim/refusal, checkpoint crash, exact-one resume, authorized abandon, drift/reauthorization, and declined no-write preflight.

#### U2 [execution] Prove adaptive isolated pod candidates and bounded repair
- [ ] The command launches only ready path-disjoint GLM worktrees, audits authority/results, runs adaptive Mini and fresh Sol candidate review, and permits one fresh replacement candidate per pod.
- **criteria:** `[SC4, SC5, SC6, SC7, SC11]`
- **depends_on:** `[U1]`
- **parallel:** `false`
- **conflicts_with:** `[U1, U3]`
- **files:** [`.pi/prompts/ultra.md`, `.pi/artifacts/ultra-mesh-pods/PROGRESS.md`]
- **Verify:** extension tests plus the preview-named `/tmp/pi-ultra-fixture-<run-id>/repo` two-pod fixture and `bash .opencode/tool/structural-check.sh --validate-ultra-evidence .pi/artifacts/ultra-mesh-pods/PROGRESS.md`; retain/report its repository, branches, worktrees, commits, and logs.

#### U3 [integration] Prove Main-owned commits, resume, and fresh Sol integration
- [ ] Main commits accepted worktrees, write-ahead/CAS preflights and serially cherry-picks them into a retained run-specific integration worktree, derives dependent-wave baselines, performs one bounded integration repair, never updates `main`, and resumes or blocks deterministically without post-fingerprint writes.
- **criteria:** `[SC2, SC7, SC8, SC9, SC10, SC11]`
- **depends_on:** `[U2]`
- **parallel:** `false`
- **conflicts_with:** `[U1, U2, V1]`
- **files:** [`.pi/prompts/ultra.md`, `.pi/artifacts/ultra-mesh-pods/PROGRESS.md`]
- **Verify:** capture Git 2.43.0, exercise clean and `CHERRY_PICK_HEAD` crash-state fixture cases against the source packet, then run `bash .opencode/tool/structural-check.sh --validate-ultra-evidence .pi/artifacts/ultra-mesh-pods/PROGRESS.md && git diff --check`.

#### V1 [acceptance] Verify the complete Ultra contract on one fingerprint
- [ ] All criteria, current-byte L3 review/dispositions, generated-code-quality review, exact model/runtime proof, regression checks, and fresh `/verify` complete without a later tracked write.
- **criteria:** `[SC1, SC2, SC3, SC4, SC5, SC6, SC7, SC8, SC9, SC10, SC11, SC12]`
- **depends_on:** `[U3]`
- **parallel:** `false`
- **conflicts_with:** `[U3]`
- **files:** `[]`
- **Verify:** run SC1–SC12 checks in order against one unchanged candidate fingerprint, then `/verify ultra-mesh-pods`.