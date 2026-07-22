# Plan: Prewalk via native Fabric trajectory handoff (0.23.0)

> **Spec:** `spec.md` (same dir) — full design, rationale, superseded synthetic-router record.
> **PRD:** `prd.json` (same dir) — task graph.
> **Status:** ready to execute. Upstream blocker (milestone-5) settled at `2a8b487` (pushed).
> **`.active`:** re-pointed to `prewalk-extension` at plan time.

## Goal

Unlock native pi-fabric 0.23.0 prewalk in this template by flipping `fullCodeMode:true`
and documenting the explicit `agents.handoff()` lane to Makora, preserving ADR-009 per-call
safety. No custom code.

## Non-goals

- No synthetic-router extension, no `.pi/extensions/prewalk/`, no custom log validator.
- No automatic `/fabric prewalk` (breaks ADR-009 — rejected).
- No change to `subagents.*`, `prewalk:{}`, `.pi/settings.json`, read-only/supervisor lanes.
- No reconciling the concurrent `subagents.model: FP8` default (concurrent work; left as-is).

## Decisions resolved at plan time

- **Handoff target model: `makora/zai-org/GLM-5.2-NVFP4`** — canonical across ADR-009/PLAN/
  AGENTS/tech-stack; both FP8 and NVFP4 resolve under 0.23.0 (`pi --approve --list-models`).
  The handoff is explicit per-call, so the `subagents.model` default (concurrently FP8) is
  irrelevant to it. Use NVFP4 for consistency; leave the FP8 default untouched.
- **In-scope tech-stack version correction: `0.22.4 → 0.23.0`** — tech-stack.md lines 15, 24
  still say 0.22.4 (stale). The handoff is a 0.23.0-only feature; documenting it next to a
  stale version is contradictory, so B1 corrects the version in the same edit.

## Execution waves (serial; each task ≤3 files)

### Wave A — config + decision
- **A1** — flip `.pi/fabric.json` `fullCodeMode: false → true` (line 2 only; leave all
  concurrent changes — `compaction.engine`, `subagents.model: FP8`, `executor` — untouched);
  append ADR-010 after ADR-009 (`DECISIONS.md:252`).
  - RED: `jq -e '.fullCodeMode == true' .pi/fabric.json` → currently false (fails); 
    `rg -q '^## ADR-010:' .pi/artifacts/pi-template/DECISIONS.md` → absent (fails).
  - GREEN: both pass.
  - files: `.pi/fabric.json`, `.pi/artifacts/pi-template/DECISIONS.md`
- **A2** (after A1) — `PLAN.md`: add a prewalk row to the dispatch table (`:96-100`); add
  `### Canonical prewalk handoff dispatch` block after the Makora block (`:133`, before
  `### Milestone 6` at `:135`); state selective routing.
  - RED: `rg -q 'Canonical prewalk handoff dispatch' .pi/artifacts/pi-template/PLAN.md` → absent.
  - GREEN: `rg -q 'agents.handoff' ... && rg -q 'makora/zai-org/GLM-5.2-NVFP4' ... && rg -q 'extensions: true' ...`
  - files: `.pi/artifacts/pi-template/PLAN.md`

### Wave B — authority docs + routing
- **B1** (after A2) — `AGENTS.md` worker-topology (`:99`): Main full code mode + prewalk
  handoff lane sharing the one-writable-run ceiling, no silent fallback. `tech-stack.md`:
  version 0.22.4→0.23.0 (lines 15, 24); document `fullCodeMode:true` + explicit-handoff route
  after the writable-pool row (`:33`); note `prewalk.model` unused.
  - RED: `rg -qi 'full code mode|fullCodeMode' AGENTS.md` → absent; `rg -q 'fullCodeMode' .opencode/tech-stack.md` → absent.
  - GREEN: both present; `rg -q '0.23.0' .opencode/tech-stack.md`.
  - files: `AGENTS.md`, `.opencode/tech-stack.md`
- **B2** (after A1; collides with milestone-5 ship.md — milestone-5 settled, safe) —
  `ship.md`: add `### Selective Routing` after Host-Derived Candidate Intake (`:149`),
  before `### Checkpoint Protocol` (`:151`).
  - RED: `rg -qi 'selective|prewalk.*novel|direct.*makora.*mechanical' .pi/prompts/ship.md` → absent.
  - GREEN: present; `rg -q 'Host-Derived Candidate Intake' .pi/prompts/ship.md` (preserved).
  - files: `.pi/prompts/ship.md`

### Wave C — proof + verify
- **C1** `checkpoint:human-action` (after B1, B2) — human `/reload` or Pi restart; then
  `pi --approve --list-models` resolves all three models; one Main-authored `fabric_exec`
  program does frontier work, an edit, and `agents.handoff(...)` to Makora completing a real
  desired edit; handoff result `handedOff:true, completed:true`.
  - files: [] (no repo writes; runtime proof)
- **C2** (after C1) — no-write: run the full success-criteria suite (spec.md:134-147);
  `git diff --check`. `/ship` records; does NOT declare VERIFIED (`/verify`-owned per ADR-006).
  - files: []

## Commit cadence

Per-task commit, scoped to that task's files only (never `git add .`). Exclude concurrent
`fabric.json`/`settings.json`/`session-summary.md` from prewalk commits except A1's one-line
`fullCodeMode` edit in `fabric.json` (which must be staged precisely — use `git add -p` or
explicit path staging so the concurrent changes to the same file are NOT staged).

## Risks (see spec.md:298-319)

- **fullCodeMode philosophy change (highest):** Main authors `fabric_exec` for all file work.
  Isolated to Main; children/supervisor unaffected (`configuration.md:167`).
- **`fabric.json` staging precision:** A1 edits one line in a concurrently-dirty file. Stage
  only the `fullCodeMode` hunk, not the concurrent `compaction`/`model`/`executor` changes.
- **Semantic coarseness:** native prewalk is not literal one-edit Stencil/OMP; documented in
  ADR-010 so no one mistakes it for benchmark equivalence.

## Verification (full suite — C2)

```
jq -e '.fullCodeMode == true' .pi/fabric.json
jq -e '.subagents.extensions == false' .pi/fabric.json
rg -q '^## ADR-010:' .pi/artifacts/pi-template/DECISIONS.md
rg -q 'agents.handoff' .pi/artifacts/pi-template/PLAN.md && rg -q 'makora/zai-org/GLM-5.2-NVFP4' .pi/artifacts/pi-template/PLAN.md && rg -q 'extensions: true' .pi/artifacts/pi-template/PLAN.md
rg -qi 'full code mode|fullCodeMode' AGENTS.md && rg -qi 'prewalk|handoff' AGENTS.md
rg -q 'fullCodeMode' .opencode/tech-stack.md
rg -qi 'selective|prewalk.*novel|direct.*makora.*mechanical' .pi/prompts/ship.md
pi --approve --list-models | grep -F 'makora/zai-org/GLM-5.2-NVFP4'
git diff --check
git diff --exit-code bcbbda47ea5ad63b516cff0f8469d81614559834 -- .pi/settings.json
```
