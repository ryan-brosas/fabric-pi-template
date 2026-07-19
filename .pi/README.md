# Fabric-Pi — Fabric-first agentic coding on Pi

This `.pi` profile is Fabric-first: Fabric (the `fabric_exec` tool surface) is
the orchestration brain — the primary session plans, routes, dispatches, steers,
and integrates all delegated work through Fabric, while direct execution
remains the default for small, known work.

## Layout

- Role contracts in `.pi/agents/`, routed through Fabric by `.pi/config.json`
- Lifecycle commands as prompt templates in `.pi/prompts/` (nine commands plus `/team`)
- Agent Skills in `.pi/skills/`
- Native Pi extensions in `.pi/extensions/`
- Workflows, templates, and shared context in `.pi/workflows/`, `.pi/templates/`, and `.pi/*.md`
- Model, compaction, permission, formatter, and watcher behavior in Pi settings/config/extensions

## Operator commands

| Command | Purpose |
|---|---|
| `/init` | Initialize project guidance, stack context, roadmap/state, or user preferences. |
| `/create` | Create a lite or full specification and executable tasks. |
| `/plan` | Add detailed goal-backward planning for complex work. |
| `/ship` | Execute, verify, review, and close the active work. |
| `/verify` | Check completeness, correctness, and artifact coherence. |
| `/fix` | Reproduce, isolate, fix, and verify a defect. |
| `/research` | Run direct or multi-angle research. |
| `/audit` | Audit a cross-cutting code pattern. |
| `/gc` | Run Fallow/structural quality analysis. |
| `/team` | Run a supervised team (plan → implement → verify → review) looping until a goal predicate passes. |

`/team "<goal>"` surfaces the operator goal to the team's `fabric_exec` turn as
a named string (`π.goal`) the program reads — not a manual paste or capture —
and binds it into an executable `state.goal` predicate, a shell command that
exits 0 only when the goal is genuinely met. The team loop stops when
`state.checkGoal` passes or a hard cap trips (a cycle count plus per-teammate
`timeoutMs` and a total token budget); it never loops unbounded. The primary
(Opus 4.8 high) is the sole integrator: it gates every phase, reads every diff,
and verifies before integrating.

Pseudocode snippets shown in prompts are semantic examples. Pi bindings are
explicit at the top of every prompt: `task()` maps to bounded
Fabric dispatch, `question()` maps to operator interaction, and `skill()` maps
to a Pi Agent Skill.

## Ten-minute golden path

Greenfield: `/init` seeds project guidance, then `/create "<description>"` produces a spec plus tasks (the plan-acceptance stop lives here), then `/ship` executes, verifies, and closes the work (the ask-before-commit/push stop lives here). All artifacts land under `.pi/artifacts/<slug>/`.

Brownfield: `/init` auto-detects existing code and stack. When the area is unfamiliar, run `/research` (or `/audit` for a cross-cutting pattern) first, then `/create` to scope the change and `/ship` to close it.

## Active work lifecycle

`.pi/artifacts/.active` holds the current work slug. Resume: read `.active`, then the artifact directory it names. Switch: update `.active` to another slug — never delete or overwrite existing artifact directories.

## Eight role routes

| Role | Route | Authority |
|---|---|---|
| build | Makora GLM 5.2 (alt Umans GLM 5.2) | Bounded implementation lane (senior engineer) |
| debug | GLM lanes | Read-only root-cause diagnosis |
| explore | GLM lanes | Read-only local code search |
| general | Makora GLM 5.2 (alt Umans GLM 5.2) | Small bounded implementation |
| plan | claude-bridge/claude-opus-4-8 (medium thinking) | Primary/advisory architecture and decomposition |
| review | GLM lanes | Read-only correctness/security review |
| scout | GLM lanes | Read-only external research with Context7 and grep.app |
| vision | Makora Kimi | Read-only multimodal/UI review |

Fabric subagent dispatch defaults to `makora/zai-org/GLM-5.2-NVFP4` (`fabric.json` `subagents.model`). Implementation runs GLM 5.2 on the Makora pool with alternate lane `umans/umans-glm-5.2` (both in `config.json` `dispatch.implementation_models`). The reasoning role `plan` runs `claude-bridge/claude-opus-4-8` at medium thinking (alternate `claude-bridge/claude-fable-5`); `review` and `debug` run the GLM lanes. Read-only fan-out (explore, scout) uses the same GLM lanes; compaction support runs `claude-bridge/claude-haiku-4-5` (Claude models are reached only through the Claude Bridge provider).

## Fabric orchestration

The brain loop is Fabric: the primary session plans a turn, routes each unit of
work to a role contract, dispatches bounded subagents, steers drift with
`agents.steer`, queues post-completion messages with `agents.followUp`, and reads
plus verifies worker diffs before integrating (workers are leaves at `maxDepth`
1). The implementation pool is the GLM pool — up to 8 concurrent GLM 5.2 workers
split across `makora/zai-org/GLM-5.2-NVFP4` (cap 6) and `umans/umans-glm-5.2`
(cap 2).
The reasoning tier is read-only: plan runs `claude-bridge/claude-opus-4-8` at
medium thinking (alternate `claude-bridge/claude-fable-5`, reached only through
the Claude Bridge provider); review and debug run the GLM lanes, which also
handle read-only fan-out (explore, scout). Compaction support runs
`claude-bridge/claude-haiku-4-5`.
In `/team`, every cycle is mechanically gated through research, addressed mesh actor cross-review, plan, implementation, verification, review, integration, and goal check. Mesh uses durable topic `fabric-pi-<slug>` plus a primary-owned compare-and-swap audit board at `fabric-pi/<slug>/board`; host run records and event logs—not worker claims—authorize transitions. Phase receipts also chain a durable CAS-guarded `state.transition` ledger (auditable via `state.history`, re-runnable via `state.verify`); ROOT integration runs as an atomic `schema.hypothesize → verify → commit` file transaction with pre-image guards and rollback; and implementation children are spawned governed (status-polled, deadline-steered via `agents.steer`). Runtime limits live in `.pi/fabric.json`; routes and
models live in `.pi/config.json`. See `.pi/docs/fabric-tuning.md` for tuning. Alongside one-shot workers, the primary can create persistent conversing mailbox actors (`agents.create`/`ask`/`tell`) that collaborate and converse over mesh topics; the primary remains sole integrator.

## Native extensions

- `guard.ts` — permission policy, secret-path protection, destructive command gates, pipe-to-shell blocking, and Conventional Commits.
- `diagnostics.ts` — installed-only TypeScript/Rust/Go/Python checks, full/changed Fallow analysis, aislop formatting, oxfmt behavior, and globally debounced post-edit diagnostics; missing tools are skipped without downloads.
- `research-tools.ts` — native `context7` and `grepsearch` tools with Pi output truncation.
- `pi-codex-search` — pinned project package adding `codex_search` through the existing OpenAI Codex login; standalone webpage actions remain disabled by default.
- `skill-mcp/` — skill-scoped MCP discovery, includeTools filtering, calls, status, disconnect, and shutdown cleanup.

## Setup

1. Start Pi in the repository and trust the project.
2. Ensure Makora, Umans, and Claude Bridge resolve the models in `.pi/settings.json`. The enabled Bridge set is Fable 5, Sonnet 5, Opus 4.8 (the newest installed Opus catalog entry), and Haiku 4.5 (`claude-bridge/claude-haiku-4-5`).
3. Project settings declare `npm:@monotykamary/pi-vcc`, `npm:pi-fabric`, and pinned `npm:pi-codex-search@0.1.5` as Pi packages (matching the `.pi/npm` cache). Do not additionally npm-install Fabric locally. `codex_search` reuses `/login openai-codex`; it needs no separate token.
4. pi-vcc has no project-local config surface: compaction thresholds live in the user-global `~/.pi/agent/pi-vcc-config.json`. Keep entries there for the enabled model set (makora/umans GLM 5.2, claude-bridge).
5. Run:

```bash
.pi/tools/structural-check.sh
node .pi/scripts/verify-manifest.mjs
pi --approve --list-models
```

After editing any shipped template file, reseal the release surface with
`node .pi/scripts/generate-manifest.mjs` (it composes the verifier's walk),
then re-run `verify-manifest.mjs` to confirm a clean boundary.

## Known Pi boundary

Pi project settings do not own user-global keybindings. The profile registers
Ctrl+K compaction locally, but it does not silently overwrite the operator's
global command-list or session-navigation keys. Pi's `/tree` supplies native
session-tree navigation.
