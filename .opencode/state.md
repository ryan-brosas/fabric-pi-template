# State

## Current Status

Clean-slate. HEAD `bc4ae6a` (local + remote `main`/`master`). Milestone 1 done: `.pi/settings.json`
+ `.pi/fabric.json` created and verified. Milestone 2 static done: `.pi/prompts/supervise.md`
authored (council create/reconcile). Milestone 3 static done: all nine `.pi/prompts/*.md`
lifecycle prompts ported from `.opencode/command/*.md` (took all of each body, stripped only
OpenCode-only syntax, re-pointed to `.pi/artifacts/<slug>/`). Milestone 4 implementation done:
canonical-artifact hardening — `/create` sole namespace owner (established = PLAN+TODO,
downstream fail-closed), `/gc` project-wide slugless response-only, two-surface contract
(ADR-007: lifecycle state vs optional project memory). Milestone 5 implementation done — verification pending: worker topology + distrust hardened — `subagents.extensions:false`
safe default + ADR-009, canonical Makora `agents.run` dispatch block + 1-Makora enforcement,
host-derived candidate intake in `/ship`, milestone-6 observational worker-policy smoke.
Verification fingerprint tools and runtime smoke remain (milestone 6).

This pass:
- `AGENTS.md` + `.opencode/{tech-stack,roadmap,state,user}.md` + `.pi/.gitignore` +
  `.pi/artifacts/pi-template/{PLAN,TODO,PROGRESS,DECISIONS}.md` (init deep pass).
- `.pi/settings.json` + `.pi/fabric.json` (milestone 1): Main defaults + pi-fabric pin;
  fullCodeMode:false, schema.mode:off, read-only default child tools, maxDepth:1,
  mesh.actorScope:session, memory disabled, fabric compaction.
- `.pi/prompts/supervise.md` (milestone 2): council create/reconcile, custom supervisor.
- `.pi/prompts/{audit,create,fix,gc,init,plan,research,ship,verify}.md` (milestone 3):
  all nine lifecycle prompts, self-contained, explicit `<slug>` on the five lifecycle
  commands, serial writes, `/ship` no-completion, `/verify` sole external completion writer.
- Milestone 4 (`bebd044..bc4ae6a`, 5 commits): AGENTS/PLAN/DECISIONS ADR-007 + namespace
  ownership + two surfaces; create/plan/research slug-regex + established-namespace guard +
  research response-only; ship/verify two-surface wording + established-namespace guard;
  gc project-wide slugless response-only. 12/12 success criteria PASS (pending final
  no-write verification).

## Blockers

Runtime smoke (prompt discovery, slug validation, review-child edit rejection, recursive
delegation rejection, `/ship` no-completion, `/verify` external-only) requires `/trust` the
project root + restart Pi. Static contracts encode all constraints (verified via the
milestone-3 + milestone-4 static suites); runtime enforcement pending bootstrap.

## Active Decisions

Authority, routing, topology, and the council contract live in `AGENTS.md`; trade-offs
in `.pi/artifacts/pi-template/DECISIONS.md`. Summary only — do not edit here for authority:
- Single advisory supervisor (ambient; steers on drift; stays silent otherwise). The earlier
  advisor + gate design was dropped as redundant (ADR-008).
- 1 Makora worker/session; `extensions:true`; GPT read-only `extensions:false`.
- Markdown lifecycle artifacts; no kernel/schemas/manifests/receipts/CAS board.
- No `.pi/config.json`; dispatch params are per-call.
- External verification (ADR-006): `/verify` declares verified status externally only; no
  repository write after the final before/after fingerprint.
- Canonical namespace (ADR-007): `/create` sole owner; established = PLAN+TODO; downstream
  fail-closed; `/gc` project-wide slugless response-only; two writable surfaces (lifecycle
  state confined vs optional project memory; missing memory non-blocking).

## Next Priorities

1. Milestone 4 final no-write static verification (Task C3): capture fingerprint tuple,
   run all validators read-only, declare VERIFIED externally only — no repo write after.
2. Verification fingerprint — `.pi/tools/` capture (HEAD, digests, file hashes).
3. Smoke — model resolution, Main native tools, review-child edit rejection, freshness
   invalidation, prompt discovery, slug validation. Requires `/trust` + restart.

## Verification Status

- `pi --approve --list-models` resolves `openai-codex/gpt-5.6-sol`,
  `openai-codex/gpt-5.4-mini`, `makora/zai-org/GLM-5.2-NVFP4` (all thinking=yes).
- `normalizeFabricConfig` 12/12 PASS against installed pi-fabric 0.23.0.
- JSON valid (`jq -e`) on `.pi/settings.json` + `.pi/fabric.json` + milestone-3 `prd.json`
  + milestone-4 `prd.json`.
- Node v24.16.0 (>=24).
- Milestone 3 static suite: frontmatter 9/9; forbidden scan 9/9 CLEAN; source immutability
  exit=0; slug presence 5/5; `git diff --check` exit=0; per-command positive markers pass.
- Milestone 4 static suite (pending final no-write verification): 12/12 success criteria
  PASS (slug-regex ordering 5/5; `/create` sole owner; plan/ship/verify require PLAN+TODO;
  research response-only; gc slugless response-only; two-surface ADR-007; milestone-3
  regression intact; source immutability baseline-bound to `bebd044` exit=0; target-heading
  preservation 6/6; completion-authority split; no .active/latest; prd graph A:2/B:3/C:3);
  `git diff --check` exit=0; local HEAD = remote main = remote master = `bc4ae6a`.
- Runtime child-spawn + prompt-discovery smoke pending `/trust` + restart.
- Lifecycle review gates (ADR-011): milestone-5 + prewalk-extension shipped; lifecycle-review-gates A1-C2 implementation done, C3 static verify pending.
- Per-artifact commit+push standing policy active.
