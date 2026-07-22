# Milestone 5 — Worker topology + distrust (audit + hardening)

> **Status:** implementation done — final no-write verification pending · **ID:** ms5-001 · **Created:** 2026-07-22
> **Roadmap item:** `5. Worker topology + distrust` (`.opencode/roadmap.md:74-78`)
> **Approach (operator-approved):** audit + hardening pass. The worker-topology + distrust contract is mostly encoded (AGENTS.md:99/101/103, PLAN.md dispatch table, `.pi/fabric.json`). This spec audits that encoding for residual gaps, hardens it, pins the load-bearing pieces that are currently under-specified, and defines the runtime smoke (which runs in milestone 6, operator-gated on `/trust` + restart). Same shape as milestone 4.

## Operator Resolutions (binding, approved)

Two load-bearing design decisions surfaced by the audit. Both were operator-approved during `/ship`; the recommended answer in each case matches what AGENTS already states.

1. **`subagents.extensions` default — APPROVED: pin `false`.** `.pi/fabric.json` `subagents.extensions` is pinned `false` (safe read-only default; Makora overrides `true` per-call). This makes the AGENTS rule deterministic instead of per-call-dependent. (Was `true` — unstaged through milestones 3-4; resolved in A1, commit `bd1a746`.) Recorded as ADR-009.
2. **Makora `bash` in the writable allowlist — APPROVED: exclude `bash`.** The Makora writable allowlist is the exact set `read,grep,find,ls,edit,write` — no shell, no network. Without `bash`, the worker only edits and Main runs all verification commands (host-derived evidence). This matches AGENTS.md ("Main reads the diff and verifies") and the no-ambient-bash distrust posture. If a worker genuinely needs to run a command, Main dispatches a separate bounded `bash`-capable one-shot with an exact argv. (Resolved in A2, commit `bcbbda4`.)

## Problem Statement

Roadmap milestone 5 requires the worker topology + distrust contract to be **enforced**: 1 Makora GLM worker per session (ceiling); `extensions:true` + exact writable tool allowlist; host-derived candidate bytes; single writer per worktree. A read-only audit of the already-encoded contract found six residual gaps:

1. **`subagents.extensions:true` contradicts AGENTS.** `.pi/fabric.json:13` defaults one-shot children to `extensions:true`, so read-only GPT children inherit `fabric_exec`/`agents.*`/`mesh.*` unless every dispatch explicitly passes `extensions:false`. The AGENTS rule "GPT council and read-only children use `extensions:false`" is per-call-dependent and fragile. Resolution: pin the default to `false` (operator decision #1).
2. **Makora writable allowlist not pinned.** PLAN.md:99 calls it "exact allowlist" but never enumerates it; `bash` inclusion is load-bearing and undecided (operator decision #2). A future Makora dispatch could pass the wrong tool set with no encoded contract to catch it.
3. **No canonical per-call Makora dispatch shape.** AGENTS/PLAN say "every dispatch passes exact params at the call site," but there is no canonical `agents.run` args block for the Makora lane. A dispatch could omit `thinking:"max"` or pass `extensions:false` (which fails to resolve the Makora provider) with no check to catch it.
4. **1-Makora enforcement mechanism not stated.** Fabric's `subagents.maxConcurrent` (currently 8) is a **single shared semaphore** across writable and read-only tiers — it cannot enforce "1 Makora" while allowing parallel read-only gatherers. The 1-Makora ceiling is actually enforced by **Main's discipline of issuing at most one blocking `agents.run()` for writable work at a time** — but that is not stated. A reader could wrongly assume `maxConcurrent` enforces it.
5. **Single-writer-per-worktree is policy, not host-enforced.** AGENTS.md:103 already labels this honestly ("operator/prompt policy, not host-enforced — label it honestly"). The gap: no smoke is defined to demonstrate the discipline holds, and the `.pi/fabric.json` `extensions` change is uncommitted. Milestone 5 defines the smoke (milestone 6 runs it).
6. **"Host-derived candidate bytes" is prose, not encoded.** AGENTS.md:101 says candidate paths/bytes are host-derived (Git status/diff/hash), never worker self-report. But `ship.md` has no encoded intake step that makes Main recompute paths/hashes from the worktree rather than trusting the worker's reported changed-paths.

The audit confirmed these are NOT gaps: the extension split itself (Makora `extensions:true`, GPT `false`) is correctly stated (AGENTS.md:99, PLAN.md:102-105); `maxDepth:1` (workers are leaves) is pinned in `.pi/fabric.json:14` and AGENTS.md:101; read-only `defaultTools` is pinned (`.pi/fabric.json:18`); approvals `write/execute/network:"deny"` blocks autonomous fabric_exec mutation (`.pi/fabric.json:6-9`); the no-kernel/no-manifests/no-receipts/no-CAS-board posture is encoded (AGENTS.md:101).

## Scope

**In:**
- Resolve `subagents.extensions` default + record ADR-009 (operator decision #1).
- Pin the canonical Makora writable tool allowlist (operator decision #2) + a canonical per-call Makora dispatch block in PLAN.md.
- State the 1-Makora enforcement mechanism (Main's one-blocking-writable-run discipline, not `maxConcurrent`) in AGENTS.md + PLAN.md.
- Encode host-derived candidate intake in `ship.md` (Main recomputes paths/hashes from the worktree; never trusts worker self-report).
- Define the worker-topology runtime smoke in PLAN.md (runs in milestone 6): two simultaneous implementation requests yield one running Makora; read-only GPT work overlaps; Main does not edit until the run settles.
- Commit the `.pi/fabric.json` resolution (the `extensions` change has been unstaged through milestones 3-4).
- Verify with executable fail-closed checks + the milestone-3/4 regression suite.

**Out:**
- No `.pi/tools/` fingerprint capture (milestone 6).
- No runtime smoke execution (milestone 6; requires `/trust` + restart).
- No custom host-side semaphore extension or atomic single-writer lease (clean-slate rejects; v1 stays operator/prompt policy, honestly labeled).
- No change to the nine lifecycle prompts' procedural content beyond the `ship.md` candidate-intake addition.
- No new lifecycle prompts.

## Proposed Solution

1. **Extensions default (fail-safe).** Pin `subagents.extensions:false` in `.pi/fabric.json`. Read-only children inherit the safe default; Makora overrides `true` per-call. Record ADR-009 (safe default + per-call exception, mirroring ADR-003's extension-split logic).
2. **Makora allowlist + dispatch block.** Pin the concrete writable allowlist in PLAN.md (`read,grep,find,ls,edit,write` — no `bash`). Add a canonical Makora `agents.run` args block to PLAN.md so every writable dispatch is identical: `runner:"pi", model:"makora/zai-org/GLM-5.2-NVFP4", thinking:"max", extensions:true, recursive:false, tools:[<pinned allowlist>], worktree:false`.
3. **1-Makora enforcement (honest mechanism).** Add to AGENTS.md + PLAN.md: the 1-Makora ceiling is enforced by Main issuing at most one blocking `agents.run()` for writable work at a time; `maxConcurrent` bounds total children across tiers, not the writable pool. Read-only `spawn`/parallel fan-out may overlap the writable run up to `maxConcurrent`.
4. **Host-derived candidate intake.** Add a step to `ship.md` Phase 3 (task loop): after a worker settles, Main recomputes the candidate changed-path set and per-file hashes from the worktree (`git status`, `git diff`, `git hash-object`); the worker's reported paths are advisory only, never the basis for staging.
5. **Worker-topology smoke (defined, runs in milestone 6).** Define in PLAN.md: (a) dispatch two concurrent writable `agents.run` and assert only one runs (second queues/blocks); (b) dispatch read-only `spawn` children overlapping a running Makora and assert they overlap; (c) attempt a Main edit while a writable run is active and assert it is refused by policy (smoke documents the policy; not host-enforced).
6. **No regression.** The milestone-3/4 static suites (frontmatter, forbidden scan, source immutability, slug, completion authority, canonical namespace) must still pass.

## Success Criteria

All checks executable and fail-closed. Source-immutability baseline-bound against `bebd0449eb501fe9e7dd5fa66781ad1f1613a459` (the clean-slate baseline).

1. **Verify (extensions default):** `subagents.extensions` is `false` in `.pi/fabric.json` — `jq -e '.subagents.extensions == false' .pi/fabric.json`.
2. **Verify (Makora allowlist pinned):** PLAN.md contains the concrete Makora tool allowlist (not just the words "exact allowlist") — `node -e '<assertion: PLAN.md contains a pinned tools array for the Makora lane>'`.
3. **Verify (Makora dispatch block):** PLAN.md contains a canonical Makora `agents.run` args block with `extensions:true` + `thinking:"max"` — `rg -q 'makora/zai-org/GLM-5.2-NVFP4' .pi/artifacts/pi-template/PLAN.md && rg -q 'extensions.*true' .pi/artifacts/pi-template/PLAN.md`.
4. **Verify (1-Makora enforcement stated):** AGENTS.md + PLAN.md state the 1-Makora ceiling is enforced by Main's one-blocking-writable-run discipline (not maxConcurrent) — `rg -qi 'one blocking|at most one.*agents\.run|writable run at a time' AGENTS.md .pi/artifacts/pi-template/PLAN.md`.
5. **Verify (host-derived intake):** `ship.md` contains a candidate-intake step where Main recomputes paths/hashes from the worktree (not worker self-report) — `rg -qi 'host-derived|recomputes|git hash-object|git status' .pi/prompts/ship.md`.
6. **Verify (smoke defined):** PLAN.md defines the worker-topology smoke (two concurrent writable → one runs; read-only overlaps; Main edit refused) — `rg -qi 'two.*implementation requests|one running|read-only.*overlap' .pi/artifacts/pi-template/PLAN.md`.
7. **Verify (ADR-009):** DECISIONS.md has ADR-009 — `rg -q '^## ADR-009:' .pi/artifacts/pi-template/DECISIONS.md`.
8. **Verify (no regression, milestone-3/4):** frontmatter 9/9; forbidden scan CLEAN; source immutable vs `bebd044`; no `.active`/latest in 9 prompts; completion-authority split; canonical namespace (create sole owner, plan/ship/verify require PLAN+TODO, gc slugless).
9. **Verify (source command bodies unchanged):** `git diff --exit-code bebd0449eb501fe9e7dd5fa66781ad1f1613a459 -- .opencode/command/{audit,create,fix,gc,init,plan,research,ship,verify}.md`.
10. **Verify (prd graph bounded):** `jq -e` validates prd.json; 2-3 tasks per child plan; ≤3 files/task; ID-based deps backward.

## Technical Context

**Already encoded (audit baseline):**
- `AGENTS.md:99` Worker topology — 1 Makora/session; extension split; GPT read-only tiers; no `.pi/config.json`.
- `AGENTS.md:101` Worker distrust — host-derived candidate bytes; workers leaves `maxDepth:1`; no kernel/manifests/receipts/CAS.
- `AGENTS.md:103` Single writer per worktree — blocking `agents.run()`; no writable spawn/parallel; Main doesn't edit until settle; **honestly labeled operator/prompt policy**.
- `PLAN.md:96-108` Dispatch table + extension split + "writable work is blocking".
- `.pi/fabric.json` — `maxDepth:1`, `maxConcurrent:8`, `maxPerExecution:16`, `timeoutMs:600000`, read-only `defaultTools`, `approvals.write/execute/network:"deny"`, `budgetUsd:10`, `maxTokensPerChild:500000`.

**Binding contracts:**
- `AGENTS.md:99-103` (worker topology + distrust + single writer).
- `.pi/fabric.json` (child defaults + budgets).
- `.pi/artifacts/pi-template/PLAN.md:91-108` (dispatch rules).
- ADR-003 (extension split), ADR-002 (per-session worktrees), ADR-006 (external verification).

**Baseline OID:** `bebd0449eb501fe9e7dd5fa66781ad1f1613a459` (source-command immutability).

## Affected Files

**Manifests (exhaustive, exact-path staging):**
- Plan A1: `.pi/fabric.json`, `AGENTS.md`, `.pi/artifacts/pi-template/DECISIONS.md` (ADR-009)
- Plan A2: `.pi/artifacts/pi-template/PLAN.md`, `AGENTS.md` (AGENTS shared serial with A1)
- Plan B1: `.pi/prompts/ship.md`, `.pi/artifacts/pi-template/PLAN.md` (PLAN shared serial with A2)
- Plan B2: `.pi/artifacts/pi-template/TODO.md`, `.pi/artifacts/pi-template/PROGRESS.md`, `.opencode/state.md`
- Plan C1: `.opencode/artifacts/milestone-5-worker-topology-distrust/spec.md`, `.opencode/artifacts/milestone-5-worker-topology-distrust/prd.json`, `.opencode/roadmap.md`
- Plan C2: `[]` (no-write verification, external declaration only)

**Protected source paths (9, never modified):** `.opencode/command/{audit,create,fix,gc,init,plan,research,ship,verify}.md`.

## Tasks

Bounded serial tasks across three child plans (A: 2, B: 2, C: 2). Every task ≤3 files. Full graph in `prd.json`.

### Child Plan A — Contract

**A1 [contract] Resolve extensions default + ADR-009 (3 files).** Pin `subagents.extensions:false` in `.pi/fabric.json`; align AGENTS.md to state the default is false (read-only) with Makora per-call `true`; add ADR-009. Commit `docs(contract): milestone 5 — pin extensions default + ADR-009`.

**A2 [contract] Pin Makora allowlist + dispatch block + 1-Makora enforcement (2 files).** Pin the concrete Makora writable allowlist in PLAN.md; add the canonical per-call Makora `agents.run` args block; state the 1-Makora enforcement mechanism (Main's one-blocking-writable-run discipline, not `maxConcurrent`); mirror the enforcement line in AGENTS.md. Commit `docs(contract): milestone 5 — pin Makora allowlist + enforcement mechanism`.

### Child Plan B — Hardening

**B1 [harden] Host-derived candidate intake + smoke definition (2 files).** Add the host-derived candidate-intake step to `ship.md` (Main recomputes paths/hashes from the worktree; worker self-report is advisory). Define the worker-topology smoke in PLAN.md (two concurrent writable → one runs; read-only overlaps; Main edit refused by policy). Commit `fix(pi): milestone 5 — host-derived intake + worker-topology smoke`.

**B2 [evidence] Record candidate evidence (3 files).** Run every A/B validator + the milestone-3/4 regression suite; record commands/exit codes/limitations in TODO/PROGRESS/state; mark milestone 5 implementation done but final no-write verification PENDING. Commit `docs(pi): milestone 5 — record candidate evidence (pending final no-write verify)`.

### Child Plan C — Closure

**C1 [close] Close implementation state (2 files).** Mark A1-B2 complete; C2 pending external no-write verification; roadmap milestone 5 → implementation-done/verification-pending. Commit `docs(create): milestone 5 — close implementation state (verification pending)`.

**C2 [verify] Final no-write static verification (0 files; external declaration only).** Capture fingerprint tuple; run all validators read-only; compare after each; declare **Milestone 5 statically VERIFIED** in the response/session transcript only. No repository write after the baseline fingerprint. Runtime smoke remains milestone 6.

## Risks

- **`.pi/fabric.json` concurrent change.** The `extensions:true` has been unstaged through milestones 3-4. Resolving it to `false` commits that file (finally). Risk: another agent re-flips it. Mitigation: ADR-009 records the decision; the success criterion checks the value.
- **Excluding `bash` from Makora.** If a worker genuinely needs to run a command during implementation, the no-`bash` allowlist blocks it. Mitigation: Main dispatches a separate bounded `bash`-capable one-shot with exact argv; the worker only edits. If this proves too slow in practice, revisit at milestone 6 smoke.
- **1-Makora is policy, not host-enforced.** The smoke can only *document* the policy, not prove host enforcement. Mitigation: label honestly (AGENTS.md:103 already does); an atomic lease is a deliberate non-goal in v1.

## Open Questions

None remaining. Both operator decisions were resolved during `/ship`:
1. **Extensions default** — APPROVED: pin `false` (matches AGENTS; A1 commit `bd1a746`; ADR-009).
2. **Makora `bash`** — APPROVED: exclude (stronger distrust, Main verifies; A2 commit `bcbbda4`).
