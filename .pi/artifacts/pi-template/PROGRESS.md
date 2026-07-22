# PROGRESS — Pi/Fabric Template (`pi-template`)

Per-iteration log: tried, failed, learned. Entry format:
`### YYYY-MM-DD - <title>` then `status: active | done | abandoned`.

### 2026-07-22 - Adversarial review → corrected architecture
status: done
Source-grounded review against installed Pi 0.81.1 and pi-fabric 0.22.4 produced 12
corrected findings. Most load-bearing:
- Makora needs `extensions:true` (live probe: `extensions:false` fails to resolve the
  Makora provider). Universal `extensions:false` would disable the only writable worker.
- Supervisor arbitration must be blocking `agents.ask()`, not `tell()` — failed directive
  runs resolve as `silent`+`error`.
- `fullCodeMode:false` is not deterministic unless `schema.mode:"off"` is pinned (inherited
  `"enforce"` forces full-code mode + disables subagents).
- Stock `fabric-supervisor` self-stops on "Goal verified complete" — must use custom
  instructions.
- `.pi/config.json` has no consumer in Pi 0.81.1 or Fabric 0.22.4 — removed everywhere.
- "One Makora per session" is a per-process semaphore, not a worktree write lock.
- `/night` standing-authorization block referenced deleted `git_transaction` machinery —
  removed.
- Haiku compaction unsupported — Fabric compaction is deterministic/LLM-free.

### 2026-07-22 - Repo reset to clean-slate
status: done
Orphan branch → `main`; single commit `dbf74b7` (605 files). Force-pushed `origin/main`
and `origin/master` (both now `dbf74b7`). Root `.gitignore` excludes `node_modules/`,
`.pi/fabric/`, `.pi/npm/`, `.pi/git/`, `.pi/sessions/`, `.fallow/`, logs. Authorized by
operator; destructive command recorded.

### 2026-07-22 - /init deep pass
status: done
Enriched `AGENTS.md` + `.opencode/{tech-stack,roadmap,state,user}.md` within their roles;
de-duplicated authority (single owner per theme). Created `.pi/.gitignore` and
`.pi/artifacts/pi-template/{PLAN,TODO,PROGRESS,DECISIONS}.md`. Cross-file check: no stale
`.pi/config.json` (only explicit "there is no" notes), no Haiku, no `/night` (except
changelog mention), no `agent()`-fan-out references.

### 2026-07-22 - Milestone 1: Pi project config
status: done
Created `.pi/settings.json` (Main `openai-codex`/`gpt-5.6-sol`/`max` + `packages:["npm:pi-fabric@0.22.4"]`)
and `.pi/fabric.json` (`fullCodeMode:false`, `schema.mode:"off"`, read-only default child tools,
`maxDepth:1`, `maxConcurrent:8`, `mesh.actorScope:"session"`, `memory.enabled:false`,
`compaction.engine:"fabric"`, `approvals.write/execute/network:"deny"`).

Two PLAN.md corrections applied in the same change (AGENTS rule: update encoding checks
with the policy): `approvals` values are `"allow"/"deny"` strings not booleans
(`config.d.ts:3`); `maxConcurrent` 4→8 for hybrid-council headroom (3 actors + Makora +
gatherers).

Verification:
- JSON valid: `jq -e .` PASS on both files.
- Fabric config normalization: imported installed pi-fabric 0.22.4 `dist/config.js`,
  `normalizeFabricConfig()` applied — 12/12 fields PASS (fullCodeMode, schema.mode,
  subagents.extensions, maxDepth, maxConcurrent, defaultTools, mesh.actorScope,
  memory.enabled, memory.indexToolOutput, compaction.engine, approvals.write,
  approvals.agent).
- Model resolution: `pi --approve --list-models` resolves `openai-codex/gpt-5.6-sol`,
  `openai-codex/gpt-5.4-mini`, `makora/zai-org/GLM-5.2-NVFP4` (all thinking=yes).
- Node: v24.16.0 (>=24).
- Project package install: `pi --approve` read `.pi/settings.json` and installed
  `pi-fabric@0.22.4` under `.pi/npm/` (gitignored, confirmed via `git check-ignore`).
- Config-verified, not runtime-spawned: review-child edit rejection and recursive
  delegation rejection are encoded (`defaultTools` read-only, `extensions:false`,
  `maxDepth:1`) but require an interactive `/trust`-ed Pi session to runtime-smoke;
  pending bootstrap.

### 2026-07-22 - Milestone 3: Lifecycle prompts (all nine)
status: done (static; runtime smoke pending `/trust`)

Ported all nine `.opencode/command/*.md` bodies to `.pi/prompts/*.md`, taking all of each
source body and stripping only OpenCode-only mechanics (`agent:` frontmatter, `task()`/
`question()`/`skill()`/`write()` pseudo-calls, `.active`/`spec.md`/`prd.json`,
`batch-implement`/`deep-research`/`audit-pattern` workflow routing, review matrices,
`review-state.json` loop, `/ui-slop-check`/`/compound` stale strings, legacy verify cache).
Re-pointed artifacts to `.pi/artifacts/<slug>/{PLAN,TODO,PROGRESS,DECISIONS}.md`.

Contract freeze (Plan 0, commits `bce5786`/`f7f66ba`/`6655607`): external verification
(ADR-006) — `/verify` declares verified status in its response/session transcript only; no
repository write after the final before/after fingerprint. Nine-command scope expanded in
all canonical docs. `/gate` deferred to a separate milestone.

Port commits:
- create: `4afa6da` + fix `d7d5237` (reword "1 agent" → "1 explore worker" to clear false
  `agent:` forbidden-match)
- plan: `66e3960`
- research: `384e493`
- fix: `674365f`
- ship: `11fff6b` (load-bearing authority port: serial writes, no terminal completion,
  operator-gate Git, verify is sole completion writer)
- verify: `5349087` (sole completion-evidence command: full fingerprint, external
  declaration only, no post-fingerprint write)
- init: `5bd9c2e`
- gc: `4c123f3`
- audit: `9877cf2`

Static suite (candidate evidence, pending final no-write verification):
- Frontmatter matrix: 9/9 PASS (node script validates exact keys per prompt).
- Forbidden scan: 9/9 CLEAN (`rg -q` of `agent:|task\(|question\(|skill\(|write\(|\.active|
  spec\.md|prd\.json|tasks\.json|audit-pattern|batch-implement|deep-research|
  review-state\.json|/ui-slop-check|/compound|progress\.md|audit\.md`).
- Source immutability: `git diff --exit-code -- .opencode/command/*.md` exit=0.
- Slug presence: 5/5 lifecycle prompts (`create`/`plan`/`research`/`ship`/`verify`)
  contain `<slug>`.
- `git diff --check`: exit=0.
- Per-command positive markers: all pass (duplicate check, research depth, PRD rigor,
  TDD, goal-backward, completeness/correctness/coherence, Fallow, idempotency, etc.).
- jq validation of prd.json: 12 tasks, max 3 files/task, serial deps, no stale key.

Not yet run: runtime prompt-discovery smoke (requires `/trust` + restart); structural
fingerprint tools (pending `.pi/tools/`).

### 2026-07-22 - Milestone 4: Canonical artifacts (audit + hardening)
status: done (implementation; final no-write verification PENDING — not VERIFIED)

Audit + hardening pass on the nine milestone-3 prompts. Operator resolutions (binding):
(1) `/create` is the sole slug-namespace creator; an established namespace = both `PLAN.md`
AND `TODO.md`; downstream lifecycle commands fail closed on a missing/partial namespace
(no adoption/overwrite/deletion); pre-`/create` `/research` is response-only.
(2) `/gc` is project-wide, slugless, response-only (no `<slug>`, no active/latest, no
lifecycle-artifact writes, no MEMORY.md write). Per-slug grading is separate future scope.

Changes (5 commits, `bebd044..bc4ae6a`, all pushed to `main` + `main:master`, fast-forward):
- A1 `5193d85`: corrected `.opencode/artifacts/milestone-4-canonical-artifacts/{spec,prd,plan}.md`
  to operator resolutions; prd restructured to A1-C3 task IDs + child_plan + exhaustive
  manifests + baseline-bound immutability + fail-closed validators + ID-based deps; persisted
  the 8-task serial plan to `plan.md`.
- A2 `8a6912d`: AGENTS.md + PLAN.md + DECISIONS.md — added Namespace ownership (fail-closed)
  and Two surfaces blocks; added ADR-007 (lifecycle state vs optional project memory;
  portability + privacy: missing memory non-blocking; `/init` sole scaffold establisher;
  `/verify` sole pre-fingerprint appender; memory distilled non-sensitive only).
- B1 `3896cf5`: create.md reordered Validate Slug before Duplicate Check (validation precedes
  any slug-derived access); added established/partial/absent distinction. plan.md + research.md
  added canonical slug regex + established-namespace guard; research response-only when
  namespace missing/partial; none of plan/research/ship/verify mkdir (create sole owner).
- B2 `25620dc`: ship.md + verify.md — replaced blanket "All artifact reads and writes are
  confined to .pi/artifacts/<slug>/" with two-surface wording; added established-namespace
  guard (require both PLAN.md and TODO.md); preserved completion-authority split.
- B3 `bc4ae6a`: gc.md — removed "active slug" inference + lifecycle DECISIONS.md read/write;
  project-wide slugless response-only; reads project memory if it exists, never writes it.

Candidate evidence (12/12 success criteria PASS; pending final no-write verification):
- Criterion 1 (slug regex precedes first access, 5 lifecycle prompts): PASS (node order check).
- Criterion 2 (/create sole namespace creator; plan/research/ship/verify never mkdir): PASS.
- Criterion 3 (plan/ship/verify require both PLAN.md and TODO.md): PASS.
- Criterion 4 (research response-only when namespace missing/partial): PASS.
- Criterion 5 (gc slugless, response-only, description-only frontmatter, no
  active/latest/<slug>/lifecycle-write/MEMORY-write): PASS.
- Criterion 6 (two-surface contract in AGENTS + PLAN + ADR-007): PASS.
- Criterion 7 (milestone-3 regression): frontmatter 9/9 PASS; forbidden scan 9/9 CLEAN
  (rg exit 1); slug presence 5/5 PASS.
- Criterion 8 (source immutability, baseline-bound to `bebd044`): `git diff --exit-code
  bebd0449eb501fe9e7dd5fa66781ad1f1613a459 -- .opencode/command/{audit,create,fix,gc,init,plan,research,ship,verify}.md`
  exit=0 (all 9 source commands byte-unchanged).
- Criterion 9 (target-heading preservation, 6 changed prompts): PASS (every baseline
  `##`/`###` heading in create/plan/research/ship/verify/gc remains verbatim).
- Criterion 10 (completion-authority split): ship "cannot declare terminal verified status";
  verify "sole...verified", "transcript only", "no repository write" — PASS.
- Criterion 11 (no .active/latest in the nine prompts): rg exit 1 (CLEAN) — PASS.
- Criterion 12 (prd graph bounded): jq PASS; A:2/B:3/C:3 child plans; max 3 files/task;
  ID-based deps point backward — PASS.
- `git diff --check`: exit=0.

Verification fingerprint (candidate; final no-write verification is Task C3):
- Source-command immutability baseline OID: `bebd0449eb501fe9e7dd5fa66781ad1f1613a459`.
- HEAD post-implementation: `bc4ae6aaaff94cd2eb36c53763b535f8e8367304` (local = remote main =
  remote master; pushed fast-forward, no force-push).
- Commit chain `bebd044..bc4ae6a`: 5193d85, 8a6912d, 3896cf5, 25620dc, bc4ae6a.
- Not yet run: final no-write fingerprint tuple + external VERIFIED declaration (Task C3);
  runtime smoke (prompt discovery, slug validation, `/ship` no-completion, `/verify`
  external-only) — pending `/trust` + restart; structural fingerprint tools — pending `.pi/tools/`.

### Verification fingerprint
- HEAD pre-init-deep-pass: `dbf74b7`
- HEAD post-init-deep-pass: `912b2db` (pushed to `origin/main` + `origin/master`,
  fast-forward — no force-push; incremental per per-artifact policy)
- HEAD pre-milestone-1: `912b2db`
- HEAD post-milestone-3-ports: `d7d5237` (pushed to `origin/main` + `origin/master`,
  fast-forward — no force-push)
- Checks run this pass: `jq -e` JSON validity (PASS); `normalizeFabricConfig` 12-field
  (PASS); `pi --approve --list-models` model resolution (PASS); `git check-ignore` runtime
  state (PASS); milestone-3 static suite (PASS as above).
- Not yet run: runtime child-spawn smoke (review-edit rejection, recursion rejection) —
  pending `/trust` + restart; structural checks (pending `.pi/tools/`); final no-write
  verification of milestone 3 (Task 4.3).
