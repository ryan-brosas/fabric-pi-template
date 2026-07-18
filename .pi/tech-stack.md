# Tech Stack — new-system

Auto-detected by `/init` on 2026-07-17. This workspace authors a Pi profile; it
has no application runtime. Regenerate with `/init`.

## Workspace type

Pi profile authoring workspace. No compiler, no root package manager, no CI.
Deliverable: a copyable `.pi/` profile at `project/.pi/`.

## Runtime

| Component | Version / source | Notes |
|---|---|---|
| Pi | ≥ 0.80.10 (observed `pi --version`) | Host agent runtime |
| Node | ≥ 20 | Required for Fabric, providers, MCP servers |
| npm/npx | present | Package install for Pi packages |

## Content formats

- Markdown — instructions, slash-command prompts, agent role files, skills
- YAML — `project/.pi/config.yml` (routing policy)
- JSON — `project/.pi/settings.json`, `fabric.json`, `mcp.json`,
  `.template-manifest.json`, `.version`

## Pinned packages (`project/.pi/settings.json`)

| Package | Pin |
|---|---|
| pi-fabric | `npm:pi-fabric@0.18.0` (also GitHub source, autoload:false) |
| pi-mcp-adapter | `npm:pi-mcp-adapter@2.11.0` |
| pi-makora-provider | git @ bcdc8eab660b6ffb7f997a10856c9cfb3e42ed17 |
| pi-umans-provider | git @ 70f9c4bfa35852d7bdc30969863397efe1d4cb07 |
| pi-claude-bridge | 0.6.2 (global, not yet portable in settings) |

## Enabled models (`project/.pi/settings.json`)

- `makora/zai-org/GLM-5.2-NVFP4` (build/primary)
- `umans/umans-glm-5.2` (implementation)
- `openai-codex/gpt-5.6-sol` (plan)
- `openai-codex/gpt-5.3-codex-spark`
- `claude-bridge/claude-sonnet-5` (host-resolvable, not enabled/portable yet)

## Profile version

`project/.pi/.version` → `pi-coding-profile 1.2.0`

## Commands

| Action | Command | Notes |
|---|---|---|
| Build | — | Authoring only; no compiler |
| Test | fresh Pi session smoke | Per `project/.pi/commands/ship.md` |
| Lint | whole-boundary manifest verifier | `project/.pi/.template-manifest.json` |
| CI | — | None |

## Existing AI rules

- `.pi/AGENTS.md` — Pi host agent rules
- `project/AGENTS.md` — profile authoring control plane (authority)
- `project/.pi/AGENTS.md` — portable profile kernel

## Profile policy (profile-owned, not Fabric)

Fabric reads only `~/.pi/agent/fabric.json` and `<project>/.pi/fabric.json`. The
following are profile-owned and enforced via `config.yml` + profile code, never
as Fabric `fabric.json` fields:

- **Provider caps**: UMANS 8 + Makora 6 simultaneous max (0.18.0 has no
  provider-specific semaphores; `subagents.maxConcurrent:16` is the single
  global one).
- **Routing**: role-to-model maps live in `config.yml` (machine-readable) and
  `skills/fabric-roles/SKILL.md` (functional contracts).
- **Recursion gate**: `maxDepth:1` (Fabric default is 2) keeps "Fabric
  subagents never spawn Fabric subagents" runtime-enforced.
- **Actor policy**: at most one advisory actor; actor activations consume the
  same `subagents.maxConcurrent` semaphore as one-shot subagents.
- **Terminology**: "Fabric subagent" family replaces the profile's old
  "writer" label. Upstream Fabric uses subagent/agent/worker/actor.

## Fabric 0.18.0 verified facts

- `SubagentRunStatus`: `queued|running|completed|failed|stopped|timed_out` —
  no `budget_exceeded` or `token_limit` status. Budget exhaustion throws an
  `Error`; token limit terminates with `status:"timed_out"` + token-limit
  error string.
- `budgetUsd:0` and `maxTokensPerChild:0` both *disable* their ceilings (not
  "ceiling = 0"). Set positive values to enable.
- `budgetUsd` is best-effort under concurrency; the race-free count ceiling is
  `maxPerExecution` (currently 200).
- No native Claude runner (`runner:"claude"`, `subagents.claude`,
  `subagents.runner` are 0.19+). Claude via `pi-claude-bridge` only.
