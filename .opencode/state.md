# State

## Current Status

Clean-slate, reset to `dbf74b7 chore: fresh start — Pi/Fabric template clean-slate`
(local + remote `main`/`master`). The `/init` deep pass enriched the authority docs and
created the canonical implementation contract under `.pi/artifacts/pi-template/`.

Established this pass:
- `AGENTS.md` — applied the corrected architecture: removed `/night` and `.pi/config.json`
  and Haiku-compaction references; added Makora `extensions:true`, single-writer-per-worktree,
  per-slug lifecycle artifacts, `/verify` freshness, custom-supervisor (never self-stop), and
  blocking-`ask` gate mechanics.
- `.opencode/tech-stack.md`, `.opencode/roadmap.md`, `.opencode/state.md`, `.opencode/user.md`
  de-duplicated against `AGENTS.md` (authority lives there).
- `.pi/.gitignore` — runtime state only (`/fabric/ /npm/ /git/ /sessions/`); artifacts tracked.
- `.pi/artifacts/pi-template/{PLAN,TODO,PROGRESS,DECISIONS}.md` — canonical contract.

## Blockers

None. Bootstrap prerequisite for runtime use: `/trust` the project root, then restart Pi
(untrusted projects ignore `.pi/settings.json`, packages, prompts, and `.pi/fabric.json`).

## Active Decisions

Authority, routing, topology, and the council contract live in `AGENTS.md`; trade-offs
in `.pi/artifacts/pi-template/DECISIONS.md`. Summary only — do not edit here for authority:
- Hybrid per-session council (supervisor steers; advisors mailbox-only at lifecycle gates).
- 1 Makora worker/session; `extensions:true`; GPT read-only `extensions:false`.
- Markdown lifecycle artifacts; no kernel/schemas/manifests/receipts/CAS board.
- No `.pi/config.json`; dispatch params are per-call.

## Next Priorities

1. Create `.pi/settings.json` (Main `defaultProvider`/`defaultModel`/`defaultThinkingLevel`;
   pin `npm:pi-fabric@0.22.4`).
2. Create `.pi/fabric.json` (`fullCodeMode:false`, `schema.mode:"off"`, read-only default
   child tools, `subagents.maxDepth:1`, `mesh.actorScope:"session"`, `mesh.enabled:true`,
   `memory.indexToolOutput:false`, `compaction.engine:"fabric"`, finite limits).
3. Author `.pi/prompts/supervise.md` (native supervisor + advisor create/inspect,
   session-scoped, supervisor-only steer, custom instructions — never self-stop).
4. Author `.pi/prompts/gate.md` (lifecycle-gate workflow: blocking `agents.ask()` to
   applicable advisors, validate each, one blocking `agents.ask(supervisor)` on conflict;
   mailbox-only advisors, no host events).
5. Author thin lifecycle prompts: `.pi/prompts/{create,plan,ship,verify,research}.md`
   (explicit `<slug>`; self-contained; no agent routing).
6. Smoke-test: model IDs resolve, Main retains native tools, review child edit fails,
   gate blocks on errored advisor, `/verify` freshness invalidates on byte change.

## Verification Status

- `pi --approve --list-models` resolves `openai-codex/gpt-5.6-sol`,
  `openai-codex/gpt-5.4-mini`, `makora/zai-org/GLM-5.2-NVFP4` (host provider auth).
- No `.pi` runtime config/prompt files exist yet — runtime smoke pending milestone 1-2.
- Pending per-artifact commit+push (standing policy: commit and push after completing
  each artifact).
