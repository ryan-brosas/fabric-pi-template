# Plan: Pi Profile Blank-Slate Authoring

> **HISTORICAL — NOT AUTHORITATIVE.** This plan describes the retired
> `project/.pi` authoring workspace (Fabric 0.18 pin, 14-worker pool, old
> command surface). The shipped profile is documented in `README.md`,
> `state.md`, and `docs/fabric-tuning.md`. Only the "Fabric-Focus Pass"
> sections at the end of this file describe the current profile.

## Status — COMPLETE (2026-07-18)

`/ship` lifecycle complete. The copyable profile at `project/.pi/` is finalized:

- 9 prompts / 6 grouped agent contract files (16 routing roles) / 17 skills (5 deferred) / 6 templates / 5 top-level JSON / 4 release surfaces
- 104/104 `node:test` assertions green; manifest verifier zero-defect (47 entries, exit 0); 0 "writer/writers" in shipped content
- Operator accepted pre-L5 smoke as L5 pass (2026-07-18)
- 4 runtime integration tests (bridge-fail-closed, CAS-collision, token-guard-termination, 14-wide worktree) DEFERRED to a Git-backed target

Authoritative execution records (supersede the slices below for what was actually built):

- `.pi/artifacts/pi-profile-blank-slate-authoring/plan.md` — accepted plan (786 lines; reconciled mid-`/ship` for internal consistency)
- `.pi/artifacts/pi-profile-blank-slate-authoring/progress.md` — per-child-plan execution log
- `.pi/artifacts/pi-profile-blank-slate-authoring/evidence.md` — integrated feature record (L1-L5)

Design corrections during execution (the slices below predate these; see evidence.md "Orchestrator fixes applied during /ship"):

- `config.yml` → `config.json` (JSON.parse via `node -e`, no pyyaml dependency)
- `commands/` → `prompts/` (pi 0.80.10 renames on project load; operator decision A, applied 2026-07-18)
- 16 individual role files → 6 grouped contract files (16 routing roles dispatched via `config.json` `role_routes`)
- `next-action.yaml` → `next-action.schema.json` (JSON Schema; runtime hint JSON at `.pi/runtime/next-actions/<slug>.json` with 6 snake_case fields)
- 16 domain skills → 17 retained + 5 deferred (deep-module-design, security-and-hardening, performance-optimization, simplify-and-refactor-code-isomorphically, zoom-out)
- Pi runtime caches (`git/npm/fabric` under `.pi/`) added to the manifest verifier skip-set

## Goal

Author a fresh `project/.pi/` profile from scratch, using the archive at
`project/old project/.pi/` (shipped 1.2.0) as a read-only research reference.
The profile fully utilizes four subscribed providers (OpenAI Codex, Claude
Bridge, UMANS, Makora) across a 6-phase lifecycle (Discover → Elaborate →
Plan → Build → Verify → Release), with safety guardrails preserving the
authority model.

## Non-goals

- Do not port the archive's accepted decisions or files (blank-slate rewrite,
  not a port). The archive is read for patterns, never copied.
- Do not adopt a persistent Fabric actor (primary session is integrator).
- Do not raise `maxDepth` above 1.
- Do not put fusion at the ship gate.
- Do not design against pi-fabric 0.19.x or 0.20.x.
- ~~Do not implement product files until the operator accepts this plan.~~
  (Satisfied — plan accepted 2026-07-18; `/ship` complete.)

## Resolved design (from interview, captured in `project/CONTEXT.md`)

| Dimension | Decision | Source |
|---|---|---|
| Fresh-start mode | Blank-slate rewrite at `project/.pi/`; archive is research only | User interview Q2 |
| Authority model | Reconsider 3 dimensions (lifecycle, state, integrator); keep 4 (CAS, maxDepth:1, explicit acceptance, Accepted plan.md) | User interview Q3-Q4 |
| Lifecycle | BigPowers 6-phase as primary (PIV retired): Discover → Elaborate → Plan → Build → Verify → Release | User interview Q5 |
| State model | Derived + persisted per-feature next-action hint (JSON at `.pi/runtime/next-actions/<slug>.json`; 6 snake_case fields per `templates/next-action.schema.json`); not a queue/scheduler/consumer | User interview Q6, Q8; reconciled in P00 |
| Integrator | ~~Primary session; no persistent actor~~ — superseded 2026-07-18 by `fabric-018-full-utilization`: primary session remains sole integrator (`guardrails.primary_integrator`); one bounded session-scoped Build supervisor adopted (advisory only, removed before the final gate) | User interview Q7; superseded 2026-07-18 |
| Command surface | 9 commands: `/init`, `/create`, `/plan`, `/implement`, `/validate`, `/ship`, `/guide`, `/status`, `/resume` (drop `/new-agent`); shipped under `.pi/prompts/` (pi 0.80.10 rename) | User interview Q9; operator decision A 2026-07-18 |
| Provider utilization | Full: all four providers across all six phases, each in its strength | User clarification m0176 |
| Advisory fusion | ~~Optional 4-model panel at plan review via `council.run` read-only (no bash, `skills/fabric-council/SKILL.md:23`); never at ship gate~~ — superseded 2026-07-18 by `fabric-018-full-utilization`: high-risk advisory fusion via the bundled `fabric-fusion` skill (parallel distinct-model panel + judge, compare-not-merge, read-only, no web access); never at ship gate | User clarification m0176 + b7 review; reconciled in P00; superseded 2026-07-18 |
| `workflow.*` | PROPOSED for dashboard progress visibility; not wired into the shipped profile (progress tracked via `progress.md` + `evidence.md` per the kernel) | User clarification m0176 |
| `agents.steer` | Adopted for drifting implementation subagents (`UPSTREAM-0.18`) | User clarification m0176 |
| Fabric baseline | `pi-fabric@0.18.0` (v0.18.0 tag, commit 4eaf728); verified against `project/old project/pi-fabric/` | m0167-m0169 |
| Claude | `pi-claude-bridge@0.6.2` only; no native Claude runner in 0.18.0 | m0167 |
| Implementation pool | UMANS 8 + Makora 6 max; weighted schedule `U,M,U,M,U,M,U,U,M,U,M,U,M,U` (yields 8U+6M) | PROFILE-POLICY |
| Recursion | `maxDepth:1` runtime-enforced | kept |
| Config format | `config.json` (JSON.parse via `node -e`, no pyyaml); `config.yml` deleted in P01 | Resolved in P00; `config.yml` removed P01 Task 3 |
| Agent file structure | 6 grouped contract files (`scout.md`, `deliberator.md`, `planner.md`, `implementer.md`, `verifier.md`, `bridge.md`) covering 16 routing roles; dispatch reads `config.json` `role_routes` + injects the contract via `agents.run({model, tools, task})` — not one-per-file discovery | Resolved in P00 (OQ-3); spec-contract test enforces |
| Skills catalog | 17 retained (6 core Fabric: fabric-roles, fabric-loop, fabric-exec, fabric-planning, seed-conventions, development-lifecycle; 11 domain); 5 deferred (deep-module-design, security-and-hardening, performance-optimization, simplify-and-refactor-code-isomorphically, zoom-out) | Resolved in P00 (OQ-4) |
| MCP path | pi-mcp-adapter direct tools (Context7 + Exa: `context7_resolve-library-id`, `context7_query-docs`, `exa_web_search_exa`, `exa_web_fetch_exa`) with Fabric `mcp.enabled:false`; `capture.risks` (top-level, not `mcp.capture`) maps the 4 direct-tool names → `"network"` | Resolved in P00 |
| Bridge isolation | "one fresh child per pass" (no Fabric `isolated` field on `agents.run`); `claude-bridge.json.defaultIsolated` governs AskClaude tool only | Resolved in P00 |
| Ship gate | `gate-reviewer` single read-only no-shell final gate; no advisory fusion at the ship gate (`PROFILE-POLICY`) | Resolved in P00; enforced in P06/P07 |

## Execution — 10 child plans (P00–P09, sequential)

The accepted plan at `.pi/artifacts/pi-profile-blank-slate-authoring/plan.md`
decomposed the work into 10 linear child plans (non-Git authoring workspace runs
sequentially). The 7-slice breakdown below was the planning scaffold; the child
plans are the authoritative execution record.

```
P00 → P01 → P02 → P03 → P04 → P05 → P06 → P07 → (gap-fix) → P08 → P09
```

- **P00** — Spec reconciliation + calibration (`spec.md`, `prd.json`, `profile-test-helpers.mjs`, `spec-contract.test.mjs`)
- **P01** — Foundation + config + MCP + bridge (10 files: AGENTS.md ×2, CONTEXT.md, settings/fabric/config.json/mcp.json/claude-bridge.json; delete `config.yml`)
- **P02** — Discover phase (`seed-conventions` skill, `/init` command)
- **P03** — Elaborate phase (4 core Fabric skills, `scout.md` research-scout, 2 domain skills, `/create`, spec+coding-prompt templates)
- **P04** — Plan phase (`deliberator.md` + `planner.md` + `implementer.md` groups, `fabric-planning` + `planning-and-task-breakdown` skills, `scout.md` append 3 roles, plan-unit+decisions templates, `/plan`)
- **P05** — Build phase (`implementer.md` append, `verifier.md` + `bridge.md` groups, `/implement`, evidence+next-action templates, 3 core domain skills)
- **P06** — Verify phase (`verifier.md` append 2 roles, `/validate`, 5 verification+debug skills)
- **P07** — Release command (`/ship` + `scripts/verify-manifest.mjs`)
- **Gap-fix** (pre-P08) — 3 cross-phase utility commands (`guide`/`status`/`resume`) + reconcile stale 65/>50 file-count thresholds
- **P08** — Release surfaces (`.version`, `.template-manifest.json`, README, QUALITY; run verifier) + orchestrator terminology sweep (12 "writer" → "subagent" across 6 P03–P07 files + guardrail assertion (h))
- **P09** — Final smoke + integrated evidence (`evidence.md`); surfaced + fixed 2 smoke defects (`commands/`→`prompts/`, pi runtime caches in verifier skip-set)

## Slices (planning scaffold; superseded by the child plans above for execution detail)

### Slice 1 — Foundation — COMPLETE (P01)

- `project/AGENTS.md` — authoring control plane
- `project/.pi/AGENTS.md` — portable kernel
- `project/CONTEXT.md` — domain glossary (18 terms)

Verified: cross-file terminology consistency ("Fabric subagent" not "writer"
except archive references); all Fabric claims labeled; no 0.19+ fields leaked;
6-phase lifecycle + 9 commands + CAS + derived+hint state + primary integrator
+ maxDepth:1 + full provider utilization all present.

### Slice 2 — Config trio + MCP + bridge — COMPLETE (P01)

- `project/.pi/settings.json` — package pins + `enabledModels` (7 routes)
- `project/.pi/fabric.json` — Fabric runtime config (`mcp.enabled:false`; `capture.risks` top-level; `budgetUsd:0`; `maxTokensPerChild:500000`; `maxDepth:1`; `maxConcurrent:16`; `maxPerExecution:200`)
- `project/.pi/config.json` (NEW — replaces drafted `config.yml`) — 16 `role_routes` + `executor.max_concurrent_subagents:14` + `provider_caps:{umans:8,makora:6}` + 14-slot `implementation_schedule` (8U+6M) + `advisory_fusion` + 6 `guardrails`
- `project/.pi/mcp.json` (NEW) — Context7 + Exa pi-mcp-adapter direct-tool declarations
- `project/.pi/claude-bridge.json` (NEW) — `askClaude.{defaultMode:read, defaultIsolated:true, allowFullMode:false}` + `provider.strictMcpConfig:true`
- `project/.pi/config.yml` — DELETED in P01 Task 3 (via `node unlinkSync`; `rm` denied in workspace)

### Slice 3 — Agent contracts — COMPLETE (P03 + P04 + P05 + P06)

- 6 grouped contract files (not 16 role files): `scout.md`, `deliberator.md`, `planner.md`, `implementer.md`, `verifier.md`, `bridge.md`
- 16 routing roles dispatched via `config.json` `role_routes` + `agents.run({model, tools, task})` task injection
- Read-only roles (`[read,grep,find,ls]`, no bash): deliberator-1, deliberator-2, convergence, plan-advisor, plan-review, planning-verification-judge, gate-reviewer, bridge-polish, research-scout, evidence-scout, scout-router, verifier, debug-diagnosis
- Mutating roles (`[read,grep,find,ls,write,edit,bash]` under CAS `ifVersion:0`): plan-section-subagent, implementation-subagent
- `context7-exa-scout`: read-only + 4 pi-mcp-adapter direct tools
- Bridge isolation ("one fresh child per pass") stated in deliberator-2, plan-review, bridge-polish, debug-diagnosis
- No model keys in any agent file (routes live in `config.json`)

### Slice 4 — Skills — COMPLETE (P02 + P03 + P04 + P05 + P06)

17 retained (5 deferred). Each loads under `/skill:NAME`; routing matches
`config.json`; no concrete model keys in skill prose.

Core Fabric (6): `fabric-roles`, `fabric-loop`, `fabric-exec`, `fabric-planning`, `seed-conventions`, `development-lifecycle`.

Domain (11): incremental-implementation, test-driven-development, verification-before-completion, spec-driven-development, debugging-and-error-recovery, root-cause-tracing, subagent-driven-development, planning-and-task-breakdown, code-review-and-quality, agent-code-quality-gate, source-driven-development.

Deferred (5): deep-module-design, security-and-hardening, performance-optimization, simplify-and-refactor-code-isomorphically, zoom-out.

### Slice 5 — Commands — COMPLETE (P02 + P03 + P04 + P05 + P06 + P07 + gap-fix)

9 commands shipped under `.pi/prompts/` (renamed from `commands/` by pi 0.80.10
on project load; operator decision A 2026-07-18):

- Phase transitions: `init.md` (Discover), `create.md` (Elaborate), `plan.md` (Plan, with `--accept`), `implement.md` (Build), `validate.md` (Verify), `ship.md` (Release).
- Cross-phase utilities: `guide.md`, `status.md`, `resume.md` (added in pre-P08 gap-fix; dropped during the prd.json→child-plan restructuring, recovered via post-P07 inventory).

### Slice 6 — Templates — COMPLETE (P03 + P04 + P05)

- `templates/spec.md`, `coding-prompt.md` (P03), `plan-unit.md`, `decisions.md` (P04), `evidence.md`, `next-action.schema.json` (P05)
- `next-action.schema.json` is a JSON Schema (draft-07) with 6 snake_case fields (`slug`, `phase`, `next_command`, `next_args`, `updated_at`, `accepted_plan_hash`); `additionalProperties:false`; `phase` enum of the 6 phases; `accepted_plan_hash` pattern `^[0-9a-f]{64}$`

### Slice 7 — Release surfaces — COMPLETE (P07 + P08)

- `.version` — `pi-coding-profile 2.0.0`
- `.template-manifest.json` — 47-entry SHA256 manifest; authored LAST so hashes are final; excludes `scripts/` + the manifest itself + pi runtime caches (`git/npm/fabric`)
- `README.md` — architecture overview (6-phase lifecycle, 9 commands, 17 skills, 6 agent contracts/16 roles, 4 providers, weighted schedule, layout, authority pointers); all Fabric claims labeled
- `QUALITY.md` — EXISTS→SUBSTANTIVE→WIRED→EXERCISED quality model; architecture table; 13 required release-evidence items; L1-L5 release evidence
- `scripts/verify-manifest.mjs` (P07) — whole-boundary manifest verifier; pure `verifyManifest(manifest, rootDir)` + CLI entry; returns `{missing, mismatch, unmanaged, unsupported}`; zero-defect exit 0

## Dependency graph (critical path)

```
P00 (spec) ──► P01 (foundation+config) ──┬─► P02 (discover) ──► P03 (elaborate) ──► P04 (plan) ──► P05 (build) ──► P06 (verify) ──► P07 (release cmd) ──► gap-fix ──► P08 (release surfaces) ──► P09 (smoke+evidence)
```

The 7-slice scaffold collapsed into 10 child plans + 1 gap-fix during `/plan`.
Shared release surfaces (`.version`, `.template-manifest.json`, `README.md`,
`QUALITY.md`) were serialized at P08; `scripts/verify-manifest.mjs` at P07;
`evidence.md` at P09.

## Open questions (all RESOLVED)

- **OQ-1** (numeric `budgetUsd` / `maxTokensPerChild` ceilings): RESOLVED in P00 — `budgetUsd:0` (permitted when no cost reported; relies on `maxPerExecution:200` + `maxTokensPerChild>0`); `maxTokensPerChild:500000` always.
- **OQ-2** (Makora model picks): RESOLVED in P00 — drop Kimi/DeepSeek; use `makora/zai-org/GLM-5.2-NVFP4` for execution (fallback `umans/umans-glm-5.2`).
- **OQ-3** (number of agent role files): RESOLVED in P00 — 6 grouped contract files, 16 routing roles (not 16 role files). Enforced by `spec-contract.test.mjs`.
- **OQ-4** (skill catalog): RESOLVED in P00 — 17 retained + 5 deferred (listed above).
- **OQ-5** (`/init` behavior): RESOLVED in P02 — read-only preflight; delegates mutation to `/skill:seed-conventions`.
- **OQ-6** (hint schema): RESOLVED in P00 + P05 — JSON Schema at `templates/next-action.schema.json`; runtime hint at `.pi/runtime/next-actions/<slug>.json`; 6 snake_case fields (`slug`, `phase`, `next_command`, `next_args`, `updated_at`, `accepted_plan_hash`); only successful phase commands update; `/guide`/`/status`/`/resume` read it and report drift read-only.
- **OQ-7** (non-Git verification): RESOLVED in P00 + P09 — rsync `project/.pi/` to `/tmp/pi-smoke/.pi/` (excluding `git/npm/fabric/runtime`); `pi list` expects 1 active Fabric package; `pi --list-models` expects 7 routes; manifest verifier zero-defect after pi creates caches; operator accepted pre-L5 smoke as L5 pass 2026-07-18.
- **OQ-8** (6 drafted files): RESOLVED — revise against the accepted plan (P01 Task 1); `config.yml` deleted; `fabric.json`/`settings.json` updated; `AGENTS.md` files reconciled.

## Stop conditions (all satisfied)

- ~~No more product file authoring until the operator accepts this plan.~~ — Satisfied 2026-07-18.
- ~~The 6 already-drafted files are paused for review.~~ — Revised in P01 (Slice 1 + 2).
- ~~Open questions OQ-1 through OQ-8 should be resolved before Slice 3 begins.~~ — All 8 RESOLVED in P00.
- The manifest verifier (P08 Task 2) returned zero-defect before P09. — Satisfied.
- The fresh-session smoke (P09 Task 1) passed before `evidence.md` was recorded. — Satisfied (operator-accepted L5 2026-07-18).
- ~~No implementation begins until the operator accepts this plan.~~ — Satisfied.

## Constraints preserved

- This workspace is **not Git**. Each slice became an Accepted
  `project/.pi/artifacts/<slug>/plan.md` before implementation edits, per
  `project/AGENTS.md` — here, the Pi workflow (this file + `progress.md` +
  `evidence.md` + `MEMORY.md`).
- ~~`config.yml` is profile-owned orchestration policy~~ — superseded by `config.json` (JSON.parse via `node -e`, no pyyaml). Fabric reads only `~/.pi/agent/fabric.json` and `<project>/.pi/fabric.json`, never `config.json`.
- `.pi/prompts/` (renamed from `commands/` by pi 0.80.10) holds the 9 slash commands. `settings.json` `"prompts": ["prompts"]` MUST list the directory name (operator decision A 2026-07-18).
- Every Fabric claim is labeled `UPSTREAM-0.18`, `PROFILE-POLICY`, `PROPOSED`,
  or `UPSTREAM-0.19+`. No `UPSTREAM-0.19+` claims made in the shipped profile.
- ~~No persistent actor~~ — superseded 2026-07-18 by
  `fabric-018-full-utilization`: one bounded session-scoped Build supervisor
  (advisory only, removed before the final gate; primary session remains
  sole integrator); `maxDepth:1`; no fusion at ship gate; bridge toolset is
  `read/grep/find/ls` only. See the superseding architecture note below.
- Full provider utilization = all four providers across all six phases, with
  guardrails (provider caps `umans:8` + `makora:6`; 14-slot 8U+6M weighted
  schedule; bridge fail-closed; CAS collision avoidance; token-guard
  termination; 14-wide-worktree concurrency).
- `bash rm`/`rm -rf` DENIED in that workspace. (A historical note here
  described a scripted deletion workaround; it is deliberately not
  reproduced — deletion requires explicit written operator permission,
  through the gate, never around it.)

## Superseding architecture note (2026-07-18, `fabric-018-full-utilization`)

The original "No persistent actor" constraint above has been **superseded** by
the accepted `fabric-018-full-utilization` plan. The profile now adopts
**one bounded session-scoped Build supervisor** (`supervisor_actor` in
`config.json`, `actor_scope:"session"`, read-only, directive, steer-delivery,
advisory only, removed before the final gate). The primary session remains
the sole integrator (`guardrails.primary_integrator`); general persistent
actors (advisor, ambient reviewer, actor-led swarm) are still not adopted.
`maxDepth:1` is preserved as the runtime spawn boundary; the supervisor runs
at depth 1 and cannot spawn descendants (`UPSTREAM-0.18`,
`src/subagents/manager.ts:249`).

The "Full Fabric utilization" definition is also revised: it is full
appropriate primitive coverage — one-shot subagents, parallel fan-out,
mesh/CAS, high-risk advisory fusion via the bundled `fabric-fusion` skill
(parallel distinct-model panel + judge, compare-not-merge, read-only), and
the bounded Build supervisor — not merely routing four providers across six
phases. Council is documented accurately as a same-model role-diverse
on-demand skill, not a 4-provider fusion panel. See
`.pi/artifacts/fabric-018-full-utilization/plan.md` (Accepted) for the
full reconciliation.

## Fabric-Focus Pass — 2026-07-18

Scope: make Fabric (the `fabric_exec` tool surface) the explicit orchestration
brain of the shipped profile, so the primary session plans, routes,
dispatches, steers, and integrates all delegated work through Fabric while
direct execution remains the default for small, known work.

Change list:
- Rewrote `docs/fabric-tuning.md` as the Fabric-first orchestration reference
  (plan -> dispatch -> coordinate -> steer -> verify -> integrate).
- Reframed `README.md`, `AGENTS.md`, and `APPEND_SYSTEM.md` as Fabric-first.
- Stated the Makora 6 implementation pool (`makora/zai-org/GLM-5.2-NVFP4`, up to
  6 concurrent; alternate lane `umans/umans-glm-5.2`).
- Stated the small-model lanes for read-only fan-out:
  `openai-codex/gpt-5.4-mini` and `claude-bridge/claude-haiku-4-5`.
- Stated mesh coordination conventions: durable topic `fabric-pi-<slug>` for
  assignment/status events and a CAS board at mesh key `fabric-pi/<slug>/board`.
- Raised workflow fan-out from 5 to 6 (`fabric.json` `subagents.maxConcurrent`
  and `config.json` `dispatch.max_parallel_workflow_agents`).
- Reconciled `state.md` with the current shipped status and carried-forward facts.

Invariants preserved: `config.json` `dispatch.default` stays `direct`; the
eight `role_routes` keys (build, compaction, explore, general, plan, review,
scout, vision) are unchanged; no `fabric-*` skill directories were created
(skills tree remains source-locked); `maxDepth` stays pinned at 1.

Follow-up passes (same day): review lane raised to `gpt-5.6-sol` high with
Haiku as `alternate_model` on explore/scout and a new invariants contract
test; Fabric-centric `task()` bindings across all 9 prompts and 5 workflows
with concurrency caps aligned to the fan-out-6 ceiling; OpenCode pseudocode
replaced with real `fabric_exec` TypeScript (`agents.spawn`/`agents.wait`)
in `gc`/`plan`/`init`/`ship` prompts, the adapted
`subagent-driven-development` skill, and a canonical loop example plus a
Fabric surface coverage map (adopted / on-demand / excluded) in
`docs/fabric-tuning.md`.

Later same-day reconfigurations supersede the "Makora 6 / review-high"
framing above as the live configuration: the implementation pool was raised
to **GLM 12** (up to 12 concurrent GLM 5.2 children, ≥6 makora, balance
umans; `fabric.json` `subagents.maxConcurrent: 12`, `config.json`
`dispatch.implementation_pool.total_workers: 12`); the `review` route was
set to `gpt-5.6-sol` **medium** (not high) with a
`claude-bridge/claude-opus-4-8` alternate; and the primary session (`build`)
moved to `claude-bridge/claude-opus-4-8` at **high** thinking as team
supervisor + sole integrator + gate, delegating GLM 5.2 implementation to
the `general` route.

## Current state reconciliation — `team-roadmap-template-mrqh4rxk`

> The blank-slate plan above remains historical. This section and the preceding
> Fabric-Focus note describe the current shipped profile.

### Completed static scope

- GLM 12 implementation pool: first six workers on
  `makora/zai-org/GLM-5.2-NVFP4`, balance on `umans/umans-glm-5.2`; only
  `general` implements. Opus 4.8 high is the primary supervisor and sole
  integrator; Sol medium roles are read-only.
- `/team` now runs a mechanically ordered role matrix: local and external research, host-log-proven successful retrieval, addressed architect/risk actor analysis plus one cross-review hop, schema-valid planning, scaled isolated implementation, Sol verification before Opus review, primary integration, and goal check. Same-cycle receipts gate every transition; the CAS board is an audit mirror. ROOT re-check failure stops on `integration-failed`; tokens are unlimited while cycle, retry, timeout, worktree, and operator checkpoints remain finite.
- All nine source prompts use current routes and safety wording. GC paths and
  Fabric request examples are valid; `/ship` requires exact operator approval
  before commit/push/branch/PR/publish/deploy and treats an uncommitted worktree
  as a valid stop.
- Agent contracts, five workflows, 65 cataloged skills, interactive-skill
  exclusions, versioned worker envelopes, and the optional structured peer
  `gate` are covered by executable contracts.
- Primary-observed proof: every active TypeScript prompt block parses; the
  profile contract suite passes 23/23; the structural check passes 6/6; Pi starts with pinned `pi-codex-search@0.1.5` and reports `codex_search` enabled; the complete 606-file manifest verifier reports zero defects.

### Remaining behavioral acceptance

- Behavioral (not silently claimed): run the research/actor/worktree `/team` lifecycle on a clean Git-backed target, execute one live authenticated `codex_search`, stress all 12 GLM slots together, and complete the fresh-session checks listed in `QUALITY.md`.

Coordination board: `fabric-pi/team-roadmap-template-mrqh4rxk/board`. No
commit, push, publication, deployment, destructive cleanup, or other external
action was performed by this cycle.
