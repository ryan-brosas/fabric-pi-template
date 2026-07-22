# State

## Current Status

Clean-slate at `90bb667` (local + remote `main`/`master`). Milestone 1 done: `.pi/settings.json`
+ `.pi/fabric.json` created and verified. The advisory council, lifecycle prompts, and
verification tools remain.

This pass:
- `AGENTS.md` + `.opencode/{tech-stack,roadmap,state,user}.md` + `.pi/.gitignore` +
  `.pi/artifacts/pi-template/{PLAN,TODO,PROGRESS,DECISIONS}.md` (init deep pass).
- `.pi/settings.json` + `.pi/fabric.json` (milestone 1): Main defaults + pi-fabric pin;
  fullCodeMode:false, schema.mode:off, read-only default child tools, maxDepth:1,
  mesh.actorScope:session, memory disabled, fabric compaction.

## Blockers

Runtime smoke (review-child edit rejection, recursive delegation rejection) requires
`/trust` the project root + restart Pi. Config encodes both constraints (verified via
`normalizeFabricConfig` 12/12 PASS); runtime enforcement pending bootstrap.

## Active Decisions

Authority, routing, topology, and the council contract live in `AGENTS.md`; trade-offs
in `.pi/artifacts/pi-template/DECISIONS.md`. Summary only — do not edit here for authority:
- Hybrid per-session council (supervisor steers; advisors mailbox-only at lifecycle gates).
- 1 Makora worker/session; `extensions:true`; GPT read-only `extensions:false`.
- Markdown lifecycle artifacts; no kernel/schemas/manifests/receipts/CAS board.
- No `.pi/config.json`; dispatch params are per-call.

## Next Priorities

2. Advisory council — `.pi/prompts/supervise.md` (create/inspect supervisor + advisors,
   session-scoped, custom supervisor instructions — never self-stop).
3. Lifecycle gate workflow — `.pi/prompts/gate.md` (blocking `agents.ask()` to applicable
   advisors, validate each, one blocking `agents.ask(supervisor)` on conflict).
4. Lifecycle prompts — `.pi/prompts/{create,plan,ship,verify,research}.md` (explicit
   `<slug>`; self-contained; no agent routing).
5. Verification fingerprint — `.pi/tools/` capture (HEAD, digests, file hashes).
6. Smoke — model resolution, Main native tools, review-child edit rejection, gate block
   on errored advisor, freshness invalidation.

## Verification Status

- `pi --approve --list-models` resolves `openai-codex/gpt-5.6-sol`,
  `openai-codex/gpt-5.4-mini`, `makora/zai-org/GLM-5.2-NVFP4` (all thinking=yes).
- `normalizeFabricConfig` 12/12 PASS against installed pi-fabric 0.22.4.
- JSON valid (`jq -e`) on `.pi/settings.json` + `.pi/fabric.json`.
- Node v24.16.0 (>=24).
- Runtime child-spawn smoke pending `/trust` + restart.
- Per-artifact commit+push standing policy active.
