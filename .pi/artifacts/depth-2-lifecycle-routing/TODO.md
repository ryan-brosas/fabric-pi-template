# TODO — Depth-2 Lifecycle Routing (`depth-2-lifecycle-routing`)

Executable task list synchronized with `PLAN.md`. `/create` changes lifecycle artifacts only; runtime implementation remains untouched.

### 2026-07-23 - Depth-2 lifecycle routing
status: active

#### A1 [architecture] Record ADR-017 and canonical contracts
- [ ] Canonical PLAN/DECISIONS define the corrected Main → Sol → Mini reasoning flow, Main approval boundary, Main → GLM write flow, exact limits, review semantics, and supersession of mutation-first prewalk.
- **criteria:** `[SC1, SC6, SC7]`
- **depends_on:** `[]`
- **parallel:** `false`
- **conflicts_with:** `[B1, C1, R1, L1, E1]`
- **files:** [`.pi/artifacts/pi-template/PLAN.md`, `.pi/artifacts/pi-template/DECISIONS.md`]
- **Verify:** `rg -n '^## ADR-017: Depth-2 lifecycle routing$' .pi/artifacts/pi-template/DECISIONS.md && rg -n 'Main approval boundary|Mini fan-out|read-only prewalk|fresh Verify Sol' .pi/artifacts/pi-template/PLAN.md`

#### B1 [managed-authority] Synchronize managed routing authority
- [ ] State transitions to partial/reload-required before fixture/init/AGENTS managed regions become byte-identical with ADR-017; no recursive execution occurs.
- **criteria:** `[SC1, SC8]`
- **depends_on:** `[A1]`
- **parallel:** `false`
- **conflicts_with:** `[A1, C1, B2, R1, L1, E1]`
- **files:** [`.pi/state.md`, `.opencode/artifacts/pi-native-init/boilerplate.md`, `.pi/prompts/init.md`, `AGENTS.md`]
- **serial_substeps:** set partial/reload-required first; update fixture and init source; update AGENTS last; stop.
- **Verify:** verify state is partial/reload-required and the three managed interiors are byte-identical; do not run lifecycle commands.

#### C1 [config] Write target config and checks while packet is partial
- [ ] Target `.pi/fabric.json` and routing/evidence check modes are written before reload so the next Pi context and generated tech stack observe the same topology.
- **criteria:** `[SC1, SC2, SC6]`
- **depends_on:** `[B1]`
- **parallel:** `false`
- **conflicts_with:** `[B1, B2, R1]`
- **files:** [`.pi/fabric.json`, `.opencode/tool/structural-check.sh`]
- **Verify:** run the SC2 source command only; no recursive smoke until B2 restores ready state.

#### B2 [reload] Reload target config and restore ready packet
- [ ] After the operator runs `/reload`, `/init --refresh` regenerates tech-stack facts from target config and writes ready/hash state last.
- **criteria:** `[SC1, SC2, SC8]`
- **depends_on:** `[C1]`
- **parallel:** `false`
- **conflicts_with:** `[B1, C1, R1]`
- **files:** [`.pi/state.md`, `.pi/tech-stack.md`]
- **Verify:** run SC8 exactly and confirm `/fabric prewalk --status` reports off; any partial/reload-required result blocks R1.

#### R1 [runtime-proof] Prove bounded Fabric behavior after reload
- [ ] Exact 0.24.3 runtime evidence covers depth, accepted Mini lineage, log/audit attribution, mutation-free Sol, depth rejection, effective prewalk off, three exact models, and root handoff before prompt migration.
- **criteria:** `[SC2, SC3, SC4]`
- **depends_on:** `[B2]`
- **parallel:** `false`
- **conflicts_with:** `[A1, B1, C1, B2, L1, E1]`
- **files:** [`.pi/artifacts/depth-2-lifecycle-routing/PROGRESS.md`]
- **Verify:** run SC2, SC3, and SC4 exactly. If audit refs cannot prove the no-write/no-network Sol phase, stop.

#### L1 [lifecycle] Route create, research, and plan through Sol
- [ ] Main retains guards/writes and ADR-011 dispositions while one recursive Sol runs at most one Mini fan-out; pre-create research stays response-only.
- **criteria:** `[SC4, SC6, SC7]`
- **depends_on:** `[R1]`
- **parallel:** `false`
- **conflicts_with:** `[R1, E1]`
- **files:** [`.pi/prompts/create.md`, `.pi/prompts/research.md`, `.pi/prompts/plan.md`]
- **Verify:** `bash .opencode/tool/structural-check.sh --lifecycle-routing`

#### E1 [execution] Add Main-gated GLM routing and fresh verification
- [ ] `/ship` applies the deterministic route, preapproves one task/path envelope, settles Sol before one Main-owned GLM run, records actual writer evidence, and `/verify` starts fresh after host checks.
- **criteria:** `[SC5, SC6, SC7, SC9]`
- **depends_on:** `[L1]`
- **parallel:** `false`
- **conflicts_with:** `[L1]`
- **files:** [`.pi/prompts/ship.md`, `.pi/prompts/verify.md`]
- **Verify:** `bash .opencode/tool/structural-check.sh --lifecycle-routing && bash .opencode/tool/structural-check.sh --validate-routing-evidence .pi/artifacts/depth-2-lifecycle-routing/PROGRESS.md`

#### V1 [acceptance] Exercise all criteria on one fingerprint
- [ ] Every SC check, current-byte L3 review/disposition, generated-code-quality review, and fresh `/verify` completes without a post-check mutation.
- **criteria:** `[SC1, SC2, SC3, SC4, SC5, SC6, SC7, SC8, SC9]`
- **depends_on:** `[E1]`
- **parallel:** `false`
- **conflicts_with:** `[]`
- **files:** `[]`
- **Verify:** run SC2, SC3, SC4, SC5, SC6, SC7, SC8, and SC9 in `PLAN.md` order against one unchanged candidate fingerprint.