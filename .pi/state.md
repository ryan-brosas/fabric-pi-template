# State

## Current

- The fabric-pi `.pi` profile is the OpenCode-to-Pi semantic port of
  `/home/ryan/repo/new-system/.opencode` (see `README.md` and `PORT-MAP.md`).
  Static port complete; behavioral acceptance per `QUALITY.md` is pending.
- The prior blank-slate authoring plan recorded in `roadmap.md` is historical
  and COMPLETE; the `project/.pi` authoring workspace it describes is not the
  design authority for this shipped profile.
- On 2026-07-18 a Fabric-focus pass made Fabric the explicit orchestration
  brain of the shipped profile:
  - Rewrote `docs/fabric-tuning.md` as the Fabric-first orchestration reference
    (plan -> dispatch -> coordinate -> steer -> verify -> integrate).
  - Reframed `README.md`, `AGENTS.md`, and `APPEND_SYSTEM.md` as Fabric-first:
    the primary session plans, routes, dispatches, steers, and integrates all
    delegated work through the `fabric_exec` tool surface; direct execution
    remains the default for small, known work.
  - Stated the Makora 6 implementation pool
    (`makora/zai-org/GLM-5.2-NVFP4`, up to 6 concurrent; alternate lane
    `umans/umans-glm-5.2`).
  - Stated the small-model lanes for read-only fan-out (explore, scout,
    compaction support): `openai-codex/gpt-5.4-mini` and
    `claude-bridge/claude-haiku-4-5` (Claude only via the Claude Bridge
    provider, never a native Claude runner). Review is not a small-model
    lane: the `review` route runs on `openai-codex/gpt-5.6-sol` (raised to
    high 2026-07-18, then set to medium with a `claude-bridge/claude-opus-4-8`
    alternate later that day).
  - Stated mesh coordination conventions: durable topic `fabric-pi-<slug>`
    carries assignment and status events; a compare-and-swap shared-state
    board lives at mesh key `fabric-pi/<slug>/board`; the primary publishes
    assignments, workers report status, the primary verifies and integrates.
  - Raised workflow fan-out from 5 to 6 (`fabric.json`
    `subagents.maxConcurrent` and `config.json`
    `dispatch.max_parallel_workflow_agents`).

- Later on 2026-07-18, three follow-up passes completed the Fabric-centric
  surface:
  - Review-lane policy: `review` route raised to high thinking on
    `openai-codex/gpt-5.6-sol`; small-model lanes narrowed to
    explore/scout/compaction support; Haiku wired as `alternate_model` on
    `explore` and `scout`; invariants locked by a new contract test.
  - Prompts and workflows made Fabric-centric: uniform `task()` binding
    (role -> pool/lane/review mapping, mesh conventions) across 9 prompts and
    5 workflows; workflow concurrency caps aligned to the fan-out-6 ceiling.
  - Real Fabric TypeScript: OpenCode `task()` pseudocode replaced with
    `fabric_exec` `agents.spawn`/`agents.wait` blocks in `gc`, `plan`,
    `init`, and `ship` prompts; canonical loop-in-TypeScript added to
    `docs/fabric-tuning.md`; dispatch example added to the adapted
    `subagent-driven-development` skill; Fabric surface coverage map
    (adopted / on-demand / excluded) added to `docs/fabric-tuning.md`.

- Incident (2026-07-18, corrected record): after the operator removed the
  child token ceiling (`maxTokensPerChild: 0` = unlimited), the invariants
  test still encoded the old 500k backstop rule. The primary later misread
  the resulting test failure as a worker scope violation and briefly
  restored 500k against the operator's decision. Root cause: the policy
  change and its encoding test were not updated together. Fixed: 0
  reinstated, test accepts 0-as-unlimited, decision-vs-check rule added to
  `AGENTS.md` Verification. The build worker is not confirmed to have
  touched `fabric.json`.

- Follow-up (2026-07-18): the operator authorized adopting persistent conversing mailbox actors over the mesh as the peer-collaboration layer, superseding the prior "no persistent actor / advisory-only supervisor" constraint. The primary remains sole integrator; actors are leaves (`maxDepth` 1) that converse via `agents.create`/`ask`/`tell` and mesh topics. Verified against pi-fabric 0.21.5 (`ActorManager`, `MeshStore`, `GlobalActorRegistry`). The unprovisioned Umans alternate lane was removed from `config.json` `dispatch.implementation_models` and docs because no `umans` provider resolves in `pi --list-models`.

- Follow-up (2026-07-18, model tiers): reconfigured role routing into three tiers. Implementation: `build`/`general` on `makora/zai-org/GLM-5.2-NVFP4` with alternate `umans/umans-glm-5.2` (the umans provider now resolves in `pi --list-models`; re-added to `dispatch.implementation_models`). Reasoning (plan/review/debug): `openai-codex/gpt-5.6-sol` at medium thinking (lowered from high) with Claude alternates `claude-bridge/claude-opus-4-8` and `claude-bridge/claude-fable-5`; added a new `debug` route + `.pi/agents/debug.md` (read-only root-cause diagnosis). Small fan-out (explore/scout/compaction): `openai-codex/gpt-5.4-mini` with alternate `claude-bridge/claude-haiku-4-5`. `vision` unchanged on Makora Kimi. NOTE: `build` stays on GLM (it is the implementation primary that also orchestrates dispatch); if the primary orchestrator host model itself should move to Sol/Opus, that is a `settings.json` `defaultModel` change — a separate decision.

- Profile evolution (2026-07-18 evening, operator): added the `debug` role
  (read-only root-cause diagnosis, sol medium, opus-4-8 alternate), adopted
  persistent conversing mailbox actors (`config.json` `actors` block +
  `agents/actor.md`), set `review` to medium thinking with an opus-4-8
  alternate, and revised `general.md`/`scout.md`. Tests, manifest, and
  stale annotations aligned to encode these decisions.

- Follow-up (2026-07-18, Opus supervisor): adopted Option A — the primary session (`build`, mode `primary`) now runs `claude-bridge/claude-opus-4-8` at `high` thinking, always-on for this project (`settings.json` `defaultProvider: claude-bridge`, `defaultModel: claude-opus-4-8`, `defaultThinkingLevel: high`; `role_routes.build` updated to match). The primary is the team supervisor + sole integrator + gate (senior engineer). GLM 5.2 implementation is delegated to the `general` route teammates, not done by the primary, when a team runs. Implementation pool raised to GLM 12 (up to 12 concurrent GLM 5.2 children, ≥6 makora, balance umans; `fabric.json` `maxConcurrent: 12`, `config.json` caps at 12). Verified: opus resolves as host model; 4-wide concurrent makora+umans GLM dispatch works; full 12-wide provider rate limits not yet stress-tested.

- Current cycle (2026-07-18, `team-roadmap-template-mrqh4rxk`): static implementation and all primary release gates are complete.
  - **Live routes:** Opus 4.8 high is the primary supervisor/sole integrator;
    `general` is the only implementation route, using the GLM 12 pool (first
    six Makora, balance Umans); plan/review/debug are Sol medium and read-only.
  - **Mechanically gated `/team`:** every cycle requires local explore plus external scout research, a host-log-proven successful research tool call and URL reference, addressed architect/risk actor analysis plus one cross-review hop, schema-valid planning, isolated implementation, Sol verification before Opus dispatch, primary-only integration, and `state.checkGoal`. Same-cycle receipts authorize transitions; the CAS board only mirrors evidence. Failed post-integration checks stop on `integration-failed`, while an unmet goal stops at `checkpoint-required`.
  - **Prompt surface:** all nine source prompts now describe GLM 12, Sol medium,
    contract injection, explicit skills, and untrusted worker output. GC uses
    `.pi/extensions` / `.pi/prompts` / `.pi/skills`; init/plan/GC Fabric
    examples use valid request fields; `/ship` permits an uncommitted stop and
    obtains exact operator authorization before Git or external actions.
  - **Agents/workflows/skills:** route contracts match config; reasoning roles
    cannot implement; workflows use canonical routes/states/safety; all 65 skill
    entrypoints are cataloged exactly once; interactive brainstorming is
    primary-only and gates commits.
  - **Primary evidence:** all TypeScript prompt blocks parse; `node --test .pi/tests/profile-contracts.test.mjs` passes 23/23; `.pi/tools/structural-check.sh` passes 6/6; Pi starts with pinned `pi-codex-search@0.1.5`, whose status command reports `codex_search` enabled; the complete 606-file static manifest verifier reports zero defects.
  - **Not claimed:** the new research/actor/worktree `/team` loop has not been run end-to-end on a clean Git-backed target; a live authenticated `codex_search` query and a full 12-wide provider stress test remain unexecuted. Coordination board:
    `fabric-pi/team-roadmap-template-mrqh4rxk/board`.

- Local diagnostics runtime (excluded from the copyable static manifest): pinned TypeScript 7.0.2, Fallow 3.6.0, Aislop 0.13.1, Ruff 0.15.22, and Mypy 2.3.0 are installed under `.pi/runtime/diagnostics-tools`; the extension resolves those bins explicitly. Go 1.22.2 is available from system `PATH`; Cargo remains absent.

## Next priorities

- On a clean Git-backed target, run one live `/team "<goal>"` cycle to prove
  named strings, successful research-log proof, addressed actor cross-review, worktree creation/diff capture, audit-board transitions, exact command authorization, Sol-before-Opus ordering, primary integration, and goal termination. The current authoring workspace is not Git-backed, so this is
  behavioral acceptance rather than a static blocker.
- Stress-test all 12 GLM slots together; four-wide Makora+Umans dispatch is the
  current observed provider evidence.
- Complete the fresh-session behavioral acceptance in `QUALITY.md` (guards,
  prompt leverage, summary persistence, diagnostics, research, and skill MCP).
- Keep the 23-test contract suite, structural check, and manifest verifier green
  after every static-surface edit.
- Improvement backlog remains at mesh key `fabric-pi/fabric-focus/backlog`;
  deferred guard/verifier robustness items stay backlog work, not hidden claims.

## Verified facts (carry forward)

- Pi Fabric is declared unpinned as `npm:pi-fabric` in `settings.json`;
  the installed cache under `.pi/npm/` currently resolves to `pi-fabric@0.21.5`.
  (The `0.18.0` pin recorded earlier belonged to the historical authoring
  workspace, not this shipped profile.)
- No native Claude runner; Claude is reached only through the Claude Bridge
  provider (`claude-bridge/claude-haiku-4-5` and the wider Bridge set).
- Fabric mesh `put` provides CAS via `ifVersion`; `ifVersion:0` = create-only.
  This underpins the `fabric-pi/<slug>/board` shared-state board.
- Primary session (depth 0) can call the Fabric `mcp` provider directly via
  `tools.call({ ref: 'mcp.<server>.<tool>' })`. Verified live (2026-07-18):
  `mcp.exa.web_search_exa`/`web_fetch_exa`, `mcp.context7.resolve-library-id`/
  `query-docs`, plus verified-callable `mcp.tilth.*` (structural code intelligence; its file
  scope is the MCP server's launch cwd). `mcp.openaiDeveloperDocs.*` and
  `mcp.firecrawl.*` are listed but not separately verified; `mcp.$servers` also
  lists oracle and process_triage. A listed server is not necessarily functional
  (agent-mail was listed yet uninstalled) — verify before relying.
- Depth-1 children (subagents and actors) are NOT exposed the `mcp` provider: a child granted `mcp.exa.*` reported no MCP interface. Children can use native extension tools granted by name (`context7`, `grepsearch`, `codex_search`). Context7 and grep.app child dispatch are observed (the earlier grep.app 429 was service rate-limiting); the pinned Codex tool is registered project-locally, while a live query remains pending. The primary remains the MCP/arbitrary-URL broker; never grant `mcp.*` refs to children.
- Custom-provider CHILD dispatch works, but ONLY with `extensions: true`
  (root-caused and fixed 2026-07-18). makora/umans/claude-bridge are
  package-based providers (`pi-makora-provider`, `pi-umans-provider`,
  `pi-claude-bridge` in the user-global `packages`), registered at pi startup
  by their extension packages; they are NOT in the `~/.pi/agent/models-store.json`
  cache (which holds only anthropic, openai-codex, xiaomi). A child spawned with
  `extensions: false` never loads those packages, so it fails with
  `No models match pattern` for every custom-provider model — while `openai-codex`
  still resolves (built-in/OAuth, no package needed). With `extensions: true`,
  the provider packages load and the models resolve. Verified: makora GLM, umans
  GLM, and claude-bridge Opus all dispatch as children with `extensions: true`;
  all fail with `extensions: false`. `fabric.json` `subagents.extensions` is
  already `true`, so DEFAULT dispatch works. RULE: never dispatch a
  makora/umans/claude-bridge child (subagent or actor) with `extensions: false`.
  (An earlier note here claiming "child dispatch resolves only openai-codex" was
  WRONG — an artifact of probes that passed `extensions: false`.) Consequence:
  the GLM implementer teammate (`general` route), `vision` (Kimi), and
  claude-bridge reasoning alternates all work as child teammates today; the
  autonomous team can be fully multi-provider.
- This profile pins `maxDepth: 1` in `fabric.json`, so workers are leaves and
  cannot spawn descendants.
