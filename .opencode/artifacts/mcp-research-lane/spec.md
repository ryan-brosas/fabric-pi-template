# MCP Research Lane — context7+exa MCP for read-only children; Main-direct codex_search

> **Status:** proposed · **ID:** mrl-001 · **Created:** 2026-07-22
> **Baseline OID:** `a04a65c5db5b3946c1649fc8bec15fe5140f7ccf` (HEAD after proactive-supervisor shipped+pushed)

## Problem Statement

The read-only research lane (supervisor handshake research in `/create` Phase 10B, `/plan` Phase 8B,
`/research` Phase 5, `/ship` Phase 6A; plus the `/create` Phase 4, `/plan` Phase 3, `/research` gather
phases) dispatches read-only children with `tools:["read","grep","find","ls"]`. These children cannot
reach web or library docs — the allowlist excludes MCP tools, and the children run `extensions:false`
so the `codex_search` Pi extension does not load for them.

Meanwhile the Pi environment has three search tools installed:
- **`codex_search`** (`pi-codex-search` 0.1.5, a Pi extension in the global `settings.json` packages)
  reuses the ChatGPT Plus/Pro Codex subscription, returns citations, and is the best web search.
  It is a **package-discovered extension tool** registered via `pi.registerTool` on `session_start`,
  so `--no-extensions` (from `extensions:false`) filters it out (`resource-loader.js:267,351`).
  **Only Main (extensions loaded, `fullCodeMode:true`) can use `codex_search`.**
- **`context7`** (`resolve-library-id`, `query-docs`) and **`exa`** (`web_search_exa`, `web_fetch_exa`)
  are **MCP servers** in `~/.pi/agent/mcp.json`. MCP loads from a separate config, independent of
  `--no-extensions`. But `--tools` is an allowlist that "applies to built-in, extension, and custom
  tools" (`args.js:245-246`) — MCP tools are custom tools, so the current allowlist **excludes** them.

The fix is mechanical for MCP: add the four MCP tool names to the read-only `tools` allowlist; keep
`extensions:false`, `recursive:false`, `worktree:false`. Children stay read-only (no `bash`, no
recursion, no `fabric_exec`) and gain web/doc lookup. `codex_search` cannot go into `extensions:false`
children, so it stays **Main-direct**: Main runs `codex_search` itself when it wants the premium
ChatGPT-subscription search with citations; delegated read-only children use `context7`+`exa`.

## Chosen design (Option A — safe, no capability widening)

1. **Extend the read-only research allowlist** from `["read","grep","find","ls"]` to
   `["read","grep","find","ls","resolve-library-id","query-docs","web_search_exa","web_fetch_exa"]`
   in: the four supervisor handshake research dispatches (`create` 10B, `plan` 8B, `research` 5,
   `ship` 6A), the `supervise.md` mini-research dispatch, and the gather-phase guidance
   (`/create` Phase 4, `/plan` Phase 3, `/research`).
2. **Parallel fan-out for gather phases** (already partly present: `/create` Deep = 3-5 agents,
   `/research` Multi-Angle = parallel scouts). Keep/enhance parallel dispatch; MCP tools make each
   parallel child richer. The supervisor handshake stays **one** gather (a single direction
   question) but MCP-equipped.
3. **Main-direct `codex_search`**: document the convention that Main uses `codex_search` directly
   (it has extensions loaded) for premium web search with citations; this is NOT delegated to
   `extensions:false` children because `codex_search` is a Pi extension blocked by `--no-extensions`.
4. **ADR-013** records: MCP-equipped parallel read-only research lane (context7+exa) preserving
   `extensions:false`; `codex_search` Main-direct; no capability widening.

## Why not `extensions:true` children (rejected Option B)

Giving children `extensions:true` so `codex_search` loads would also register `fabric_exec`
(`index.js:655`). Safety would hinge on the `--tools` allowlist filtering out `fabric_exec`
(supported by `args.js:246` + `index.js:905` early-return when `fabric_exec` not in
`getActiveTools()`), but that filter is not runtime-proven on the `agents.run` child path, and a
wrong assumption grants the child `pi.bash`/`pi.write`/`agents.*` — a real ADR-008/009 boundary
breach. The blast radius is too high for an unproven claim. Option A achieves the same research
richness without touching the boundary.

## Scope (In/Out)

### In scope
- Extend the read-only `tools` allowlist with `resolve-library-id`, `query-docs`,
  `web_search_exa`, `web_fetch_exa` in: `.pi/prompts/supervise.md` (handshake mini-research),
  `.pi/prompts/create.md` (Phase 4 gather + Phase 10B handshake), `.pi/prompts/plan.md`
  (Phase 3 gather + Phase 8B handshake), `.pi/prompts/research.md` (gather + Phase 5 handshake),
  `.pi/prompts/ship.md` (Phase 6A handshake).
- Document Main-direct `codex_search` in `.pi/prompts/supervise.md` + the four lifecycle prompts.
- ADR-013 in `.pi/artifacts/pi-template/DECISIONS.md`; canonical research-lane contract in
  `.pi/artifacts/pi-template/PLAN.md`; research paragraph in `AGENTS.md`.
- `.opencode/tech-stack.md`, `.opencode/roadmap.md`, `.opencode/state.md` synchronized.

### Out of scope (non-goals)
- `extensions:true` for read-only children (rejected — capability-widening risk, Option B).
- Adding `websearch_codex` as an MCP server (codex_search is a Pi extension, not MCP; it stays
  Main-direct).
- Wiring `tilth` (cached MCP, not in `mcp.json`) — would need a `mcp.json` entry first; deferred.
- Changing the supervisor's actor configuration (`extensions:false` read-only posture preserved).
- Parallel fan-out for the supervisor handshake (stays one gather; it's a single direction question).
- The stale `supervise.md` 0.22.4 field matrix (still NOTICED BUT NOT TOUCHING).

## Sequencing (no blockers)

`proactive-supervisor` shipped+pushed (HEAD `a04a65c`); ADR-012 present at DECISIONS.md:370. This
feature takes **ADR-013** (next available). Shared files (`supervise.md`, `create.md`, `plan.md`,
`research.md`, `ship.md`, `AGENTS.md`, `DECISIONS.md`, `PLAN.md`, `tech-stack.md`, `roadmap.md`,
`state.md`) are all free.

## Milestone-5 / lifecycle regression invariants (must preserve)

- `supervise.md` + 4 lifecycle prompt frontmatter `description` (+ `argument-hint` where present).
- `<slug>` token in create/plan/ship/verify/research.
- No forbidden OpenCode-pseudocode tokens (`task(`, `question(`, `skill(`, `write(`, `.active`,
  `spec.md`, `prd.json`, `review-state.json`). `agents.run`/`agents.ask` are NOT forbidden.
- `ship.md` keeps "cannot declare...verified status/completion".
- `verify.md` keeps "sole...verified | transcript only | no repository write".
- ADR-011 review-gate markers (Phase 10A, Phase 8A, Tier-Gated Diff Review, Phase 5A) remain.
- ADR-012 supervisor handshake phases (10B, 8B, research 5, 6A) remain, with `action:"silent"`
  direct-response discipline and `proactive-supervisor/v1` protocol.
- Supervisor's four hard limits (never dispatch / never integrate-or-edit / never certify / never
  emit stop) and `extensions:false` actor config unchanged.

## Privacy and Security

- MCP tools are capability policy, not secret isolation; the path allowlist + secret-exclusion
  discipline (ADR-011) still applies to research packets.
- `exa`/`context7` carry API keys in `mcp.json` env, never echoed in task text or findings.
- Research summaries stay ≤8 KiB, non-secret, with source paths (ADR-012 discipline preserved).
- `codex_search` reuses the OpenAI Codex subscription credential; Main never asks the user for a
  token (the extension handles auth).

## Failure Behavior

- MCP server unavailable / tool not registered: the child proceeds with `read/grep/find/ls` only;
  research is best-effort (same as ADR-012 "research is best-effort, never blocking").
- `codex_search` auth not configured: Main falls back to `exa`/`context7` for web search.
- MCP tool name drift (server renamed): the allowlist entry silently no-ops; verify catches it
  via the `pi --approve --list-models` and tool-resolution smoke.

## Risks

- **MCP tool name drift (medium):** `resolve-library-id`/`query-docs`/`web_search_exa`/`web_fetch_exa`
  are the names in `mcp-cache.json` today; a server rename would silently break the allowlist.
  Mitigation: the names are stable upstream (context7 3.2.3, exa 3.2.1) and the verify smoke
  checks the cache.
- **Parallel fan-out cost (low):** more concurrent children, but bounded by `maxConcurrent:8` and
  `maxPerExecution:16`; research children are cheap (`gpt-5.4-mini`).
- **codex_search Main-only limits parallelism (low):** Main running `codex_search` directly is
  serial for that one tool, but Main can fire `codex_search` + `context7` + `exa` in one turn
  (parallel tool calls) for a quick lookup.
