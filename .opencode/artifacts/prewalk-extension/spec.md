# Prewalk via native Fabric trajectory handoff (0.23.0)

> **Status:** implementation done (A1–B2 committed; C2 static no-write verify PASS) — C1 live dogfood PASS (`handedOff:true`, `completed:true`) · **ID:** prewalk-001 · **Created:** 2026-07-22
> **Baseline OID:** `bcbbda47ea5ad63b516cff0f8469d81614559834` (HEAD at re-scope)
> **Replaces:** the prior synthetic-router design (same slug) — see "Superseded approach" below.

> **Slug note:** the namespace is `prewalk-extension` for continuity; this revision adopts a
> native Fabric feature rather than building a custom extension, so no `.pi/extensions/prewalk/`
> code is produced. The slug is historical, not descriptive.

## Problem Statement

The prior revision of this spec designed a **synthetic-router Pi extension**
(`.pi/extensions/prewalk/`) to reproduce Stencil/OMP prewalk semantics, premised on
"pi-fabric 0.22.4 has no native prewalk primitive." That premise is now **false**:

- The host pi-fabric was upgraded to **0.23.0** (was 0.22.4). npm latest = 0.23.0,
  published 2026-07-22T08:07Z. Peer deps `>=0.80.6` (Pi 0.81.1 ✓), node `>=24` (v24.16.0 ✓).
- Commit **`ed08a16` "feat(agents): add trajectory handoff and prewalk"** (40 files,
  +2707/−59, parent `94976b6`) introduced two native primitives: explicit `agents.handoff()`
  and automatic `/fabric prewalk`. Both verified in the installed package source.
- Prewalk landed in 0.23.0 only (0.22.5 has no `prewalk/` dir or config key).

The operator chose to **adopt the native explicit `agents.handoff()` path** rather than
build a custom extension. This spec captures that decision and its implementation.

## Chosen path and why

**Adopt `fullCodeMode: true` and use explicit `agents.handoff()` inside `fabric_exec`
programs to hand the frontier trajectory off to Makora**, preserving ADR-009's per-call
safety. The handoff is trajectory-preserving: Fabric forks the finalized native
`fabric_exec` call/result pair and spawns the executor from that branch — the Makora
child sees the real frontier work, not a rewritten summary (`docs/agents.md:50-69`,
verified in `dist/prewalk/handoff.js`).

Why explicit handoff over automatic `/fabric prewalk`:
- **Preserves ADR-009.** `FabricPrewalkConfig = { model?: string }` only
  (`config.d.ts:37-39`); the automatic path builds args `{model, name, task?}` with no
  `extensions`/`tools` (`handoff.js:29-33`), so `runRequest` does not spread `extensions`
  (`agents-provider.js:536`) and `manager.spawn` resolves
  `extensions = recursive ? true : (request.extensions ?? config.extensions)` (`manager.js:347`)
  → inherits our `subagents.extensions: false` → **Makora fails to resolve** (the exact
  ADR-003/009 failure), and tools inherit the read-only `defaultTools` (no `edit`/`write`).
  Automatic prewalk would force a global reversal of ADR-009; explicit `agents.handoff()`
  forwards `extensions`/`tools`/`thinking` per call (`runRequest:517,536`) so the Makora
  executor gets `extensions:true` + the exact writable allowlist + `thinking:"max"` every
  time — ADR-009's per-call discipline, unchanged.
- **Faithful enough.** Native prewalk is deliberately coarser than Stencil/OMP: the first
  successful mutation marks the outer `fabric_exec` invocation, but every remaining call in
  that program runs before the executor starts (not literal one-edit; Fabric disclaims
  benchmark equivalence, `docs/agents.md:73`). It is trajectory-preserving via a real fork,
  which captures the "warm session inheritance" spirit without a custom router. No TODO
  gate (simpler than the prior spec's 5–9 item gate) — the first `pi.edit`/`pi.write`/
  `schema.commit` is the boundary.

**`fullCodeMode: true` is the one template-philosophy change.** Under full code mode Main
authors `fabric_exec` programs; Pi core tools move from Main's model-facing registry behind
`pi.*` inside `fabric_exec` (`docs/configuration.md:143-149`). Crucially, this is **isolated
to Main**: "Child agents continue using their allowed Pi tools directly, so parallel and
ambient setups do not route their coding operations back through Fabric code mode"
(`docs/configuration.md:167`). Therefore:
- ADR-009's read-only children (explore/scout/review/plan/debug, `extensions:false`,
  read-only tools) are **unaffected** — they use their own allowed tools directly.
- The direct Makora `agents.run({model, extensions:true, tools:[...], worktree:false})`
  dispatch (ADR-009 canonical lane) is **unaffected** — child dispatch is independent of
  Main's code mode.
- The advisory supervisor (persistent actor, `extensions:false`, read-only tools) is a
  child session and is **unaffected**.

So the change is scoped to Main's operating model plus the canonical contract docs; ADR-009's
safety posture (safe `subagents.extensions:false` default, read-only `defaultTools`,
per-call Makora `extensions:true` + exact writable allowlist) is preserved entirely.

## Scope (In/Out)

### In scope
- Flip `.pi/fabric.json` `fullCodeMode: false` → `true`. No other `fabric.json` change
  (`subagents.*`, `prewalk:{}`, `mesh`, `memory`, `compaction` untouched — ADR-009 preserved).
- ADR-010 in `DECISIONS.md`: adopt native prewalk via explicit handoff; `fullCodeMode`
  rationale; preserve ADR-009 per-call; record the superseded synthetic-router approach.
- `PLAN.md`: a canonical explicit `agents.handoff` block (inside a `fabric_exec` program)
  targeting Makora with `extensions:true` + exact writable allowlist + `thinking:"max"`, as a
  parallel prewalk lane beside the direct Makora `agents.run` lane; selective routing.
- `AGENTS.md`: worker topology — Main runs full code mode; the prewalk lane is Main-authored
  `fabric_exec` with explicit handoff to Makora; ADR-009 per-call preserved; no silent
  fallback; both lanes share the one blocking-writable-run ceiling.
- `tech-stack.md`: document `fullCodeMode:true` + the explicit-handoff route; note
  `prewalk.model` is unused (explicit handoff carries model/extensions/tools).
- `ship.md`: selective routing rule (prewalk handoff for novel/multi-file M–L; direct
  Makora `agents.run` for S/single-file mechanical) + the explicit-handoff path.
- A dogfood: run one prewalk handoff that performs a real desired edit via the new lane
  (after `/reload`/restart), proving the path end-to-end.

### Out of scope (non-goals)
- The synthetic-router extension — **not built**. `.pi/extensions/prewalk/` and
  `.pi/tools/verify-prewalk-log.*` from the prior spec are dropped (no files created).
- Automatic `/fabric prewalk` (would require reversing ADR-009 globally — rejected).
- A custom `prewalk_todo` tool or custom log validator (native handoff carries its own
  audit/result; no parent-side validator needed).
- `prewalk.model` config (explicit handoff carries the model; leave `prewalk:{}`).
- Any change to `subagents.extensions`, `subagents.defaultTools`, `.pi/settings.json`,
  the `.opencode/command/*.md` source bodies, or the read-only/supervisor lanes.
- A roadmap bookkeeping entry (separate concern; milestone-5 owns `.opencode/roadmap.md`).

## Sequencing constraint (hard)

**Milestone-5 is in flight** and owns the exact canonical files this spec must edit.
At re-scope time: `.pi/prompts/ship.md` is uncommitted (16 lines added — milestone-5 B1
active); `state.md` marks only milestone-4 done; `.active` = milestone-5; HEAD unchanged
at `bcbbda47`. Per ADR-002/009's single-writer policy, the canonical edits here **must
sequence after milestone-5 settles/commits**. Specifically:
- The `fullCodeMode` flip in `.pi/fabric.json` collides with milestone-5 A1's validator
  `git diff --exit-code HEAD -- .pi/fabric.json` (milestone-5 reconciled fabric.json to
  HEAD; a concurrent flip would re-dirty it and break that check).
- `ship.md` is milestone-5 B1's uncommitted working tree — editing it now risks clobbering.
- `AGENTS.md`, `PLAN.md`, `DECISIONS.md` are milestone-5-owned (A1/A2/B1).

Do not start `/ship` on this spec until milestone-5 reaches its settled/committed state
(its own C1/C2 or an explicit commit). When in doubt, re-check `git status --porcelain`
and `.opencode/state.md` before editing.

## Superseded approach (for the record)

The prior revision designed a project-local **synthetic `prewalk` provider** routing
GPT→Makora within one AgentSession to avoid `pi.setModel()`'s shared-settings race, with a
`prewalk_todo` gate, dynamic `promptGuidelines`, a fail-closed `auth.resolve()`, and a
parent-side log validator. That design was correct *for 0.22.4's gap* but is now redundant:
0.23.0 ships the native primitive, and the native explicit-handoff path preserves ADR-009
per-call without a custom router. The prior tasks (`.pi/extensions/prewalk/{state,router,index}.ts`,
`.pi/tools/verify-prewalk-log.*`) are **dropped**. The synthetic-router's load-bearing
insight — "don't reverse ADR-009 to get prewalk" — survives in the choice of explicit handoff
over automatic `/fabric prewalk`.

## Success Criteria

- Verify: `jq -e '.fullCodeMode == true' .pi/fabric.json`
- Verify: `jq -e '.subagents.extensions == false' .pi/fabric.json` (ADR-009 default preserved)
- Verify: `rg -q '^## ADR-010:' .pi/artifacts/pi-template/DECISIONS.md`
- Verify: `rg -q 'agents.handoff' .pi/artifacts/pi-template/PLAN.md && rg -q 'makora/zai-org/GLM-5.2-NVFP4' .pi/artifacts/pi-template/PLAN.md && rg -q 'extensions: true' .pi/artifacts/pi-template/PLAN.md` (canonical handoff block with per-call ADR-009 safety)
- Verify: `rg -qi 'full code mode|fullCodeMode' AGENTS.md && rg -qi 'prewalk|handoff' AGENTS.md` (worker topology documents Main code mode + the handoff lane)
- Verify: `rg -q 'fullCodeMode' .opencode/tech-stack.md` (tech-stack documents the flip)
- Verify: `rg -qi 'selective|prewalk.*novel|direct.*makora.*mechanical' .pi/prompts/ship.md` (selective routing encoded)
- Verify: `pi --approve --list-models` resolves `openai-codex/gpt-5.6-sol`, `openai-codex/gpt-5.4-mini`, and `makora/zai-org/GLM-5.2-NVFP4` (no model regression after upgrade + flip)
- Verify: `node -e 'const {normalizeFabricConfig}=require("/home/ryan/.pi/agent/npm/node_modules/pi-fabric/dist/config.js");const fs=require("fs");normalizeFabricConfig(JSON.parse(fs.readFileSync(".pi/fabric.json","utf8")));console.log("config parses under 0.23.0")'` (config valid under 0.23.0)
- Verify: `git diff --exit-code bcbbda47ea5ad63b516cff0f8469d81614559834 -- .pi/settings.json` (Main settings untouched)
- Verify: `rg -q 'prewalk.model is unused|prewalk\\.model' .opencode/tech-stack.md || true` (prewalk.model left unset; explicit handoff carries the model)
- Verify: prd graph bounded: `node -e 'const p=require("./.opencode/artifacts/prewalk-extension/prd.json");const ids=new Map(p.tasks.map((t,i)=>[t.id,i]));if(ids.size!==p.tasks.length)process.exit(1);const bc={};for(const[i,t]of p.tasks.entries()){if(t.files.length>3)process.exit(1);bc[t.child_plan]=(bc[t.child_plan]||0)+1;for(const d of t.depends_on){if(!ids.has(d)||ids.get(d)>=i)process.exit(1)}}for(const[,n]of Object.entries(bc)){if(n<2||n>3)process.exit(1)}'`

## Technical Context

- **0.23.0 upgrade verified:** host installed 0.23.0; npm latest 0.23.0; commit `ed08a16`
  "feat(agents): add trajectory handoff and prewalk" (40 files, +2707/−59). Peer deps
  `>=0.80.6` (Pi 0.81.1 ✓), node `>=24` (v24.16.0 ✓). Our `.pi/fabric.json` parses cleanly
  under 0.23.0's `normalizeFabricConfig` (no schema regression; `prewalk` defaults `{}`).
- **Explicit handoff API** (`docs/agents.md:48-69`): `agents.handoff({model, task?, name?,
  transport?, thinking?, tools?, timeoutMs?, extensions?, recursive?, schema?})` inside a
  `fabric_exec` program. `model` required; runner is Pi; `worktree` intentionally
  unavailable (implementation stays in the caller's workspace). Inside the guest it
  resolves `{scheduled:true, status:"deferred", boundary:"fabric_exec_end"}`; the outer
  result is replaced with `{handedOff, completed, status, agent, implementation, error?}`.
  "The source session is not switched or historically rewritten" — it's a fork-to-child.
- **Per-call forwarding** (`agents-provider.js:516-537`): `runRequest` spreads `thinking`
  (when `isFabricThinking`), `tools` (`stringArray`), and `extensions` (when boolean) from
  args. So explicit `agents.handoff({model, extensions:true, tools:[...], thinking:"max"})`
  reaches `manager.spawn` with those fields set, overriding the config default — preserving
  ADR-009 per-call. The automatic path omits them, hence its ADR-009 clash.
- **fullCodeMode scope** (`docs/configuration.md:143-167`): true (default) removes Pi core
  tools from Main's model-facing registry, exposes them via `pi.*` inside `fabric_exec`.
  Children use their own allowed tools directly (`:167`) — ADR-009 read-only lane and direct
  Makora `agents.run` dispatch are unaffected. `/fabric prewalk` (automatic) additionally
  requires `fullCodeMode:true` + `subagents.enabled` + `schema.mode !== "enforce"`
  (`commands/fabric.js:226-231`); explicit `agents.handoff` needs the `fabric_exec`
  boundary, which requires full code mode.
- **Milestone-5 contract present (committed):** ADR-009 (`DECISIONS.md:211-252`), safe
  default (`AGENTS.md:99`), one-writable-run (`AGENTS.md:103`), canonical Makora dispatch
  (`PLAN.md:110-134`), host-derived intake (`ship.md:135-149`, uncommitted). This spec adds
  a parallel prewalk lane **beside** the direct Makora lane and reuses the one
  blocking-writable-run ceiling.
- **Semantic fidelity note:** native prewalk is coarser than Stencil/OMP (first mutation
  marks the outer invocation; remaining calls in the fabric_exec program still run before
  the executor starts). Fabric disclaims benchmark equivalence (`docs/agents.md:73`). The
  trajectory is preserved via a real fork of the finalized `fabric_exec` call+result —
  faithful to "warm session inheritance," not a literal in-session model switch.

## Affected Files

Existing files modified (all after milestone-5 settles):
- `.pi/fabric.json` — flip `fullCodeMode: false` → `true` (one line; no other change).
- `.pi/artifacts/pi-template/DECISIONS.md` — append ADR-010 after ADR-009 (ends `:252`).
- `.pi/artifacts/pi-template/PLAN.md` — add a `### Canonical prewalk handoff dispatch` block
  (in a `fabric_exec` program) beside the Makora block (after `:134`, before
  `## Advisory Supervisor` at `:135`); add a prewalk row to the dispatch table (`:96-100`).
- `AGENTS.md` — extend the worker-topology paragraph (`:99`) with Main full code mode and
  the prewalk handoff lane sharing the one-writable-run ceiling; no silent fallback.
- `.opencode/tech-stack.md` — document `fullCodeMode:true` + the explicit-handoff route
  (after the writable-pool row at `:33`); note `prewalk.model` unused.
- `.pi/prompts/ship.md` — add `### Selective Routing` (prewalk handoff for novel/multi-file
  M–L; direct Makora for S/single-file) after Host-Derived Candidate Intake (after `:149`,
  before `### Checkpoint Protocol` at `:151`). **Highest collision with milestone-5 B1.**

No new files. Deliberate non-changes: `.pi/settings.json`, `subagents.*`, `prewalk:{}`,
the `.opencode/command/*.md` source bodies, the read-only/supervisor lanes.

## Tasks

### A1 — [config] Flip fullCodeMode and record ADR-010
**End state:** `.pi/fabric.json` has `fullCodeMode: true` and nothing else changed
(`subagents.extensions` still `false`, `defaultTools` still read-only — ADR-009 preserved);
`DECISIONS.md` has ADR-010 recording the native-handoff adoption, the `fullCodeMode`
rationale, ADR-009 per-call preservation, and the superseded synthetic-router approach.
```yaml
depends_on: []
parallel: false
conflicts_with: []
sequencing: after milestone-5 settles (fabric.json + DECISIONS.md are milestone-5-owned)
files:
  - .pi/fabric.json
  - .pi/artifacts/pi-template/DECISIONS.md
```
- Verify: `jq -e '.fullCodeMode == true and .subagents.extensions == false' .pi/fabric.json && rg -q '^## ADR-010:' .pi/artifacts/pi-template/DECISIONS.md`

### A2 — [contract] Canonical prewalk handoff dispatch block (PLAN.md)
**End state:** `PLAN.md` has a `### Canonical prewalk handoff dispatch` block showing a
`fabric_exec` program that does frontier work then calls `agents.handoff({model:
"makora/zai-org/GLM-5.2-NVFP4", extensions:true, tools:["read","grep","find","ls","edit","write"],
thinking:"max"})`, beside the direct Makora `agents.run` block; a prewalk row is added to the
dispatch table; selective routing is stated.
```yaml
depends_on: [A1]
parallel: false
conflicts_with: []
sequencing: after milestone-5 settles (PLAN.md is milestone-5 A2/B1-owned)
files:
  - .pi/artifacts/pi-template/PLAN.md
```
- Verify: `rg -q 'Canonical prewalk handoff dispatch' .pi/artifacts/pi-template/PLAN.md && rg -q 'agents.handoff' .pi/artifacts/pi-template/PLAN.md && rg -q 'makora/zai-org/GLM-5.2-NVFP4' .pi/artifacts/pi-template/PLAN.md && rg -q 'extensions: true' .pi/artifacts/pi-template/PLAN.md`

### B1 — [contract] Worker topology and tech-stack documentation
**End state:** `AGENTS.md` worker-topology documents Main full code mode and the prewalk
handoff lane (one writable worker, either direct Makora `agents.run` or Main-authored
`fabric_exec` with explicit handoff to Makora; sharing the one-writable-run ceiling; never
overlapping; no silent fallback; ADR-009 per-call preserved); `tech-stack.md` documents
`fullCodeMode:true` + the explicit-handoff route and notes `prewalk.model` unused.
```yaml
depends_on: [A2]
parallel: false
conflicts_with: []
sequencing: after milestone-5 settles (AGENTS.md is milestone-5 A1/A2-owned)
files:
  - AGENTS.md
  - .opencode/tech-stack.md
```
- Verify: `rg -qi 'full code mode|fullCodeMode' AGENTS.md && rg -qi 'prewalk|handoff' AGENTS.md && rg -q 'fullCodeMode' .opencode/tech-stack.md`

### B2 — [contract] Selective routing in ship.md
**End state:** `ship.md` has a `### Selective Routing` section (prewalk handoff for
novel/multi-file M–L implementation; direct Makora `agents.run` for S/single-file mechanical
work; both sharing the one-writable-run ceiling; never overlapping; no silent fallback),
placed after Host-Derived Candidate Intake and before Checkpoint Protocol. All existing
ship.md content (including milestone-5's host-derived intake) preserved.
```yaml
depends_on: [A1]
parallel: false
conflicts_with: []
sequencing: after milestone-5 B1 settles/commits ship.md (highest collision)
files:
  - .pi/prompts/ship.md
```
- Verify: `rg -qi 'selective|prewalk.*novel|direct.*makora.*mechanical' .pi/prompts/ship.md && rg -q 'Host-Derived Candidate Intake' .pi/prompts/ship.md`

### C1 — [checkpoint:human-action] Reload and dogfood the handoff lane
**End state:** after a human `/reload` or Pi restart, `pi --approve --list-models` resolves
all three models; one Main-authored `fabric_exec` program performs frontier work, an edit,
and an explicit `agents.handoff()` to Makora that completes a real desired edit (e.g.,
appends a short cross-reference note to a canonical doc); the handoff result shows
`handedOff:true, completed:true`. This is the first end-to-end live proof of the lane.
```yaml
depends_on: [B1, B2]
parallel: false
conflicts_with: []
files: []
```
- Verify: `pi --approve --list-models | awk '$1=="openai-codex" && $2=="gpt-5.6-sol"{sol=1} $1=="openai-codex" && $2=="gpt-5.4-mini"{mini=1} $1=="makora" && $2=="zai-org/GLM-5.2-NVFP4"{glm=1} END{exit !(sol && mini && glm)}'`; handoff result `completed === true` observed in the run transcript/dashboard
- **Frontier stage (live dogfood):** Main made this C1 evidence edit before scheduling the explicit trajectory handoff.
- **Executor stage (live dogfood):** Makora inherited the finalized frontier trajectory and completed this follow-on edit.
- **Observed outer result:** Fabric returned `handedOff: true`, `completed: true`, status `completed`, using executor `makora/zai-org/GLM-5.2-NVFP4`.
- **Repeat frontier stage (live dogfood):** Main made a second C1 evidence edit before scheduling a fresh explicit trajectory handoff.
- **Repeat executor stage (live dogfood):** A fresh Makora executor inherited the second finalized frontier trajectory and completed this follow-on edit.
- **Automatic prewalk frontier stage:** Main made this mutation without calling `agents.handoff()`; the armed `/fabric prewalk` path should take over at the Fabric boundary.
- **Automatic prewalk executor stage:** Makora inherited the automatically claimed frontier and completed this follow-on edit.
- **Automatic prewalk outer result:** Fabric reported `prewalk:true`, trigger `pi.edit`, and `handedOff:true`; the executor edit landed, but the run ended `completed:false`, `status:timed_out` after the 500,000-token child limit.

### C2 — [verify] No-regression and model resolution
**End state:** all success-criteria checks pass read-only: `fullCodeMode:true`, ADR-009
default preserved, ADR-010 present, PLAN handoff block present, AGENTS/tech-stack/ship
updated, all three models resolve, `.pi/fabric.json` parses under 0.23.0, Main settings
untouched. No silent fallback anywhere in the docs.
```yaml
depends_on: [C1]
parallel: false
conflicts_with: []
files: []
```
- Verify: the full success-criteria suite above runs green; `git diff --check`

## Risks

- **fullCodeMode philosophy change (highest):** Main's operating model changes — Main authors
  `fabric_exec` programs for all file work; Pi core tools move behind `pi.*`. This is a real
  shift for the template, not a toggle. Mitigated by: it's isolated to Main (children and
  the supervisor are unaffected per `configuration.md:167`), ADR-009 is preserved, and the
  direct Makora lane still works. If full code mode proves too heavy, the fallback is the
  prior synthetic-router approach (this spec's superseded section) — but that re-opens the
  0.22.4 gap that no longer exists.
- **Milestone-5 collision:** all canonical edits collide with active milestone-5 work.
  Mitigated by the hard sequencing constraint (do not `/ship` until milestone-5 settles).
  Re-check `git status --porcelain` and `.opencode/state.md` before editing.
- **Semantic coarseness vs Stencil/OMP:** native prewalk is not literal one-edit; remaining
  calls in the frontier `fabric_exec` program run before handoff. Acceptable per the
  operator's choice; documented in ADR-010 and PLAN so no one mistakes it for benchmark
  Stencil/OMP.
- **`prewalk.model` ambiguity:** leaving `prewalk:{}` is correct for the explicit-handoff
  path (the model is carried per-call), but a future operator might set `prewalk.model`
  expecting it to matter. Mitigated by a tech-stack note that `prewalk.model` is unused.
- **No silent fallback:** the docs must state the prewalk lane and the direct Makora lane
  never overlap and never silently fall back; a handoff failure is terminal for that
  invocation (Fabric returns it as the failed outer result, `docs/agents.md:94`).

## Open Questions

1. **Sequencing:** confirm whether to wait for milestone-5 to fully reach `/verify`/commit,
   or only until its uncommitted `ship.md` settles. Recommended: wait until milestone-5's
   shared files are committed (re-establishes the `git diff --exit-code HEAD -- .pi/fabric.json`
   baseline) before A1.
2. **Dogfood target (C1):** is a short cross-reference note in a canonical doc the right
   first real edit, or a different desired change? (A small, wanted, non-disposable edit
   that proves the lane end-to-end.)
3. **`.active` pointer:** currently `milestone-5-worker-topology-distrust`. Before `/ship`-ing
   this spec, re-point `.active` to `prewalk-extension`.

## Privacy and Security

- The handoff executor (Makora) receives the forked frontier `fabric_exec` call/result —
  i.e., the frontier trajectory. Fabric's own note: "do not hand off a trajectory
  containing secrets to a provider that should not receive them" (`docs/architecture.md:66`).
  Main must not put secrets/credentials into the frontier `fabric_exec` program for a
  prewalk task.
- No `bash`, no network tool, no recursive agents in the handoff (`extensions:true` is
  limited by the exact writable allowlist `read,grep,find,ls,edit,write` + `recursive`
  default false); ADR-009's capability posture is preserved per-call.
- The extension-free native path adds no new code surface to audit (unlike the prior
  synthetic router); the only change is config + docs.
- `prewalk.model` left unset; the executor model is explicit per call, not inferred from
  untrusted task text.
