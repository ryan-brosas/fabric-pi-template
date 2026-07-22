# State

## Current Status

Clean-slate. HEAD `d7d5237` (local + remote `main`/`master`). Milestone 1 done: `.pi/settings.json`
+ `.pi/fabric.json` created and verified. Milestone 2 static done: `.pi/prompts/supervise.md`
authored (council create/reconcile). Milestone 3 static done: all nine `.pi/prompts/*.md`
lifecycle prompts ported from `.opencode/command/*.md` (took all of each body, stripped only
OpenCode-only syntax, re-pointed to `.pi/artifacts/<slug>/`). Contract freeze applied:
external verification (ADR-006), nine-command scope, `/gate` deferred. Verification
fingerprint tools and runtime smoke remain.

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

## Blockers

Runtime smoke (prompt discovery, slug validation, review-child edit rejection, recursive
delegation rejection, `/ship` no-completion, `/verify` external-only) requires `/trust` the
project root + restart Pi. Static contracts encode all constraints (verified via the
milestone-3 static suite); runtime enforcement pending bootstrap.

## Active Decisions

Authority, routing, topology, and the council contract live in `AGENTS.md`; trade-offs
in `.pi/artifacts/pi-template/DECISIONS.md`. Summary only — do not edit here for authority:
- Hybrid per-session council (supervisor steers; advisors mailbox-only at lifecycle gates).
- 1 Makora worker/session; `extensions:true`; GPT read-only `extensions:false`.
- Markdown lifecycle artifacts; no kernel/schemas/manifests/receipts/CAS board.
- No `.pi/config.json`; dispatch params are per-call.
- External verification (ADR-006): `/verify` declares verified status externally only; no
  repository write after the final before/after fingerprint.

## Next Priorities

1. Gate workflow (separate, deferred) — `.pi/prompts/gate.md` (blocking `agents.ask()` to
   applicable advisors, validate each, one blocking `agents.ask(supervisor)` on conflict).
2. Verification fingerprint — `.pi/tools/` capture (HEAD, digests, file hashes).
3. Smoke — model resolution, Main native tools, review-child edit rejection, gate block
   on errored advisor, freshness invalidation, prompt discovery, slug validation. Requires
   `/trust` + restart.

## Verification Status

- `pi --approve --list-models` resolves `openai-codex/gpt-5.6-sol`,
  `openai-codex/gpt-5.4-mini`, `makora/zai-org/GLM-5.2-NVFP4` (all thinking=yes).
- `normalizeFabricConfig` 12/12 PASS against installed pi-fabric 0.22.4.
- JSON valid (`jq -e`) on `.pi/settings.json` + `.pi/fabric.json` + milestone-3 `prd.json`.
- Node v24.16.0 (>=24).
- Milestone 3 static suite: frontmatter 9/9; forbidden scan 9/9 CLEAN; source immutability
  exit=0; slug presence 5/5; `git diff --check` exit=0; per-command positive markers pass.
- Runtime child-spawn + prompt-discovery smoke pending `/trust` + restart.
- Per-artifact commit+push standing policy active.
