# Fabric-Pi — Fabric-first OpenCode behavior on Pi

This `.pi` profile is Fabric-first: Fabric (the `fabric_exec` tool surface) is
the orchestration brain — the primary session plans, routes, dispatches, steers,
and integrates all delegated work through Fabric, while direct execution
remains the default for small, known work. Its behavioral heritage is a
semantic port of `/home/ryan/repo/new-system/.opencode`. It does **not** use
`/home/ryan/repo/new-system/project/.pi` as design authority.

## Source mapping

The OpenCode → Pi/Fabric mapping, in short:

- OpenCode agents → seven role contracts in `.pi/agents/`, routed through Fabric by `.pi/config.json`
- OpenCode commands → nine source Pi prompt templates plus the port-added `/team` lifecycle prompt in `.pi/prompts/`
- OpenCode Agent Skills → `.pi/skills/`
- OpenCode plugins and custom tools → native Pi extensions in `.pi/extensions/`
- OpenCode workflows/templates/context → `.pi/workflows/`, `.pi/templates/`, and `.pi/*.md`
- OpenCode model, compaction, permission, formatter, and watcher settings → Pi settings/config/extensions

The previous generated Fabric-Pi profile is preserved under
`/home/ryan/repo/swastika/.migration-backup/`. Generated-only duplicate agents,
prompts, skills, and templates were moved out of the active `.pi` tree.

## Operator commands

| Command | Purpose |
|---|---|
| `/init` | Initialize project guidance, stack context, roadmap/state, or user preferences. |
| `/create` | Create a lite or full specification and executable tasks. |
| `/plan` | Add detailed goal-backward planning for complex work. |
| `/ship` | Execute, verify, review, and close source-defined work. |
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

OpenCode snippets shown in source-derived prompts are semantic examples. Pi
bindings are explicit at the top of every prompt: `task()` maps to bounded
Fabric dispatch, `question()` maps to operator interaction, and `skill()` maps
to a Pi Agent Skill.

## Ten-minute golden path

Greenfield: `/init` seeds project guidance, then `/create "<description>"` produces a spec plus tasks (the plan-acceptance stop lives here), then `/ship` executes, verifies, and closes the work (the ask-before-commit/push stop lives here). All artifacts land under `.pi/artifacts/<slug>/`.

Brownfield: `/init` auto-detects existing code and stack. When the area is unfamiliar, run `/research` (or `/audit` for a cross-cutting pattern) first, then `/create` to scope the change and `/ship` to close it.

## Active work lifecycle

`.pi/artifacts/.active` holds the current work slug (see `config.json` `artifacts.active`). Resume: read `.active`, then the artifact directory it names. Switch: update `.active` to another slug — never delete or overwrite existing artifact directories.

## Nine role routes — seven source contracts, the compaction support route, and the port-added `debug` route

| Role | Route | Authority |
|---|---|---|
| build | Claude Opus 4.8 high | Primary supervisor, sole integrator, gate (senior engineer) |
| compaction | OpenAI mini (alt Haiku) | Support model intent; pi-vcc/Pi owns compaction runtime |
| debug | OpenAI Sol medium (alt Claude Opus/Fable) | Read-only root-cause diagnosis |
| explore | OpenAI mini (alt Haiku) | Read-only local code search |
| general | Makora GLM 5.2 (alt Umans GLM 5.2) | Small bounded implementation |
| plan | OpenAI Sol medium (alt Claude Opus/Fable) | Primary/advisory architecture and decomposition |
| review | OpenAI Sol medium (alt Claude Opus/Fable) | Read-only correctness/security review |
| scout | OpenAI mini (alt Haiku) | Read-only external research with Context7, grep.app, and Codex web search |
| vision | Makora Kimi | Read-only multimodal/UI review |

Fabric subagent dispatch defaults to `makora/zai-org/GLM-5.2-NVFP4` (`fabric.json` `subagents.model`). Implementation runs GLM 5.2 on the Makora pool with alternate lane `umans/umans-glm-5.2` (both in `config.json` `dispatch.implementation_models`). Reasoning roles (plan, review, debug) run on `openai-codex/gpt-5.6-sol` at medium thinking with Claude alternates `claude-bridge/claude-opus-4-8` and `claude-bridge/claude-fable-5`. Read-only fan-out (explore, scout, compaction support) uses small-model lanes `openai-codex/gpt-5.4-mini` and `claude-bridge/claude-haiku-4-5` (Claude models are reached only through the Claude Bridge provider).

## Fabric orchestration

The brain loop is Fabric: the primary session plans a turn, routes each unit of
work to a role contract, dispatches bounded subagents, steers drift with
`agents.steer`, queues post-completion messages with `agents.followUp`, and reads
plus verifies worker diffs before integrating (workers are leaves at `maxDepth`
1). The implementation pool is "GLM 12" — up to 12 concurrent GLM 5.2 workers
split across `makora/zai-org/GLM-5.2-NVFP4` and `umans/umans-glm-5.2` (both GLM 5.2),
with at least 6 on makora.
The reasoning tier — plan, review, debug — runs on `openai-codex/gpt-5.6-sol` at
medium thinking with Claude alternates `claude-bridge/claude-opus-4-8` and
`claude-bridge/claude-fable-5`. Small-model lanes handle read-only fan-out
(explore, scout, compaction support): `openai-codex/gpt-5.4-mini` and
`claude-bridge/claude-haiku-4-5`, reached only through the Claude Bridge provider.
In `/team`, every cycle is mechanically gated through research, addressed mesh actor cross-review, plan, implementation, Sol verification, Opus review, integration, and goal check. Mesh uses durable topic `fabric-pi-<slug>` plus a primary-owned compare-and-swap audit board at `fabric-pi/<slug>/board`; host run records and event logs—not worker claims—authorize transitions. Runtime limits live in `.pi/fabric.json`; routes and
models live in `.pi/config.json`. See `.pi/docs/fabric-tuning.md` for tuning. Alongside one-shot workers, the primary can create persistent conversing mailbox actors (`agents.create`/`ask`/`tell`) that collaborate and converse over mesh topics; the primary remains sole integrator.

## Native extensions

- `guard.ts` — source permission policy, secret-path protection, destructive command gates, pipe-to-shell blocking, and Conventional Commits.
- `prompt-leverage.ts` — transforms substantive user prompts through the source seven-block framing.
- `session-summary.ts` — persistent intent, artifact trail, decisions, next steps, context injection, and compaction persistence.
- `diagnostics.ts` — installed-only TypeScript/Rust/Go/Python checks, full/changed Fallow analysis, aislop formatting, source oxfmt behavior, and globally debounced post-edit diagnostics; missing tools are skipped without downloads.
- `research-tools.ts` — native `context7` and `grepsearch` tools with Pi output truncation.
- `pi-codex-search` — pinned project package adding `codex_search` through the existing OpenAI Codex login; standalone webpage actions remain disabled by default.
- `skill-mcp/` — skill-scoped MCP discovery, includeTools filtering, calls, status, disconnect, and shutdown cleanup.
- `tui-bindings.ts` — source Ctrl+K compaction behavior.

## Setup

1. Start Pi in the repository and trust the project.
2. Ensure Makora, Umans, OpenAI Codex, and Claude Bridge resolve the models in `.pi/settings.json`. The enabled Bridge set is Fable 5, Sonnet 5, Opus 4.8 (the newest installed Opus catalog entry), and Haiku 4.5 (`claude-bridge/claude-haiku-4-5`).
3. Project settings declare `npm:@monotykamary/pi-vcc`, `npm:pi-fabric`, and pinned `npm:pi-codex-search@0.1.5` as Pi packages (matching the `.pi/npm` cache). Do not additionally npm-install Fabric locally. `codex_search` reuses `/login openai-codex`; it needs no separate token.
4. pi-vcc has no project-local config surface: compaction thresholds live in the user-global `~/.pi/agent/pi-vcc-config.json`. Keep entries there for the enabled model set (makora/umans GLM 5.2, openai-codex, claude-bridge).
5. Run:

```bash
.pi/tools/structural-check.sh
node .pi/scripts/verify-manifest.mjs
pi --approve --list-models
```

## Known Pi boundary

Pi project settings do not own user-global keybindings. The port registers
Ctrl+K compaction locally, but it does not silently overwrite the operator's
global command-list or session-navigation keys. Pi's `/tree` supplies native
session-tree navigation.
