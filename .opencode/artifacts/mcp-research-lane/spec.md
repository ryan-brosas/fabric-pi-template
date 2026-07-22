# Main-Mediated MCP Research Lane — Context7/Exa/Codex for trusted Main; local-only children

> **Status:** re-planned (child-direct design invalidated by exact-version evidence) · **ID:** mrl-001 · **Created:** 2026-07-22 · **Revised:** 2026-07-23
> **Baseline OID (stale — do not diff against):** `a04a65c5db5b3946c1649fc8bec15fe5140f7ccf` — superseded by fresh feature-start hash capture (see `plan.md` Task B)

## Problem Statement

The read-only research lane dispatches children with `tools:["read","grep","find","ls"]` and `extensions:false`. The original spec proposed extending that allowlist with four Context7/Exa MCP tool names so children gain web/doc lookup, with `codex_search` staying Main-direct. Exact-version source inspection disproved the core premise:

- Pi removes package-discovered extensions under `--no-extensions` (`resource-loader.js:267-270,351-354`).
- Fabric passes `--no-extensions` for every `extensions:false` child (`.pi/npm/node_modules/pi-fabric/dist/worker.js:321-333`).
- `pi-mcp-adapter` (Context7/Exa reach Pi as MCP direct tools) and `pi-codex-search` are BOTH package-discovered Pi extensions (`pi.extensions` in their `package.json`). They are filtered out of `extensions:false` children entirely.
- Adding the four MCP names to a child's `--tools` allowlist only adds unknown names; Pi ignores unknown active tools (`agent-session.js:626-645`). Children gain no capability.
- Full-code mode (`fullCodeMode:true`) captures and hides extension tools by default; `capture.keepVisible` is the exact-name mechanism that retains specific extension tools in Main's direct registry (`pi-fabric/docs/configuration.md:173-207`, `dist/capture/interceptor.js:97-110`).

The committed A1/A2/B1 prompt edits (commits `2c0dad9`, `1a6b9c0`, `7201882`) are therefore functionally no-ops and must be reworked.

## Chosen design — Main-mediated research

Trusted Main owns all external research; delegated children stay strictly local.

1. **Main-mediated external acquisition.** Main reaches Context7/Exa primarily via `fabric_exec`'s internal MCP proxy (`mcp.<server>.<tool>`, enabled by `approvals.network:"allow"`), and additionally via the `capture.keepVisible`-retained direct-tool names (`context7_resolve-library-id`, `context7_query-docs`, `exa_web_search_exa`, `exa_web_fetch_exa`) plus `codex_search`. The security boundary is the child dispatch (`extensions:false`), not Main's network posture: children get neither `fabric_exec`, the MCP proxy, `codex_search`, nor any network path.
2. **Sanitize and bound.** Main treats all external content as prompt-injection-capable untrusted data, independently validates citations, discards injected instructions, and distills a non-secret cited packet <=8192 bytes.
3. **Local-only handoff.** Main launches children with exactly `tools:["read","grep","find","ls"]`, `extensions:false`, `recursive:false`, `worktree:false`, supplying only the distilled packet. Gather phases may fan out local children in parallel after Main gathers external evidence; the supervisor handshake stays ONE local-only gather.
4. **Capability-aware fallback.** Context7 (docs), Exa (search/fetch), and Codex (cited search) are not interchangeable. If one is unavailable, use only a source that can produce the evidence the query requires; otherwise disclose `partial`/`local-only`, or `blocked` when L2/L3 `source-check-required` cannot be satisfied.
5. **ADR-013** records the Main-mediated design, the exact-version evidence, and Main's direct-network trust boundary.

### Exact tool names (registry-proven)

The exact registered Context7/Exa direct-tool names were registry-proven live: `context7_resolve-library-id`, `context7_query-docs`, `exa_web_search_exa`, `exa_web_fetch_exa` (server-prefixed per `pi-mcp-adapter` `types.ts:431-437`, confirmed via live `/mcp tools`). `pi-codex-search@0.1.5` declares peers `^0.79.10` which exclude Pi 0.81.1 on paper, but `codex_search` registers at runtime (confirmed via live `/codex-search-settings status` `enabled=true`). Task C is done (`capture.keepVisible` committed `438adef`, all 5 external tools live-verified by the operator). Remaining: G2 (live supervisor smoke) + J (final fingerprint).

## Rejected alternatives

### Child-direct MCP (original Option A — INVALIDATED)

Giving `extensions:false` children the four MCP names assumes MCP survives `--no-extensions`. It does not: `pi-mcp-adapter` is a package-discovered extension removed by `--no-extensions`. The committed allowlist edits are no-ops. Rejected by exact-version evidence, not preference.

### `extensions:true` children (Option B)

Giving children `extensions:true` so `codex_search`/MCP load would also register `fabric_exec` and grant `pi.bash`/`pi.write`/`agents.*`. Safety would hinge on the `--tools` allowlist filtering `fabric_exec` on the `agents.run` child path — unproven, and a wrong assumption is a real ADR-008/009 boundary breach. Blast radius too high. Rejected.

### Generic `mcp` proxy exposure

`pi-mcp-adapter` registers a generic `mcp` proxy that can connect, authenticate, discover, and invoke arbitrary configured MCP servers (`index.ts:254-271`). Exposing it via `capture.keepVisible` is broader than this feature. Not in the primary plan; only via explicit operator acceptance + ADR.

## Scope (In/Out)

### In scope
- `.pi/fabric.json`: add `capture.keepVisible` with the proven exact external tool names (`plan.md` Task C).
- Correct the already-committed invalid research dispatches in `.pi/prompts/{supervise,create,plan,research,ship}.md` to the Main-mediated protocol (rework A1/A2/B1).
- ADR-013 in `.pi/artifacts/pi-template/DECISIONS.md`; canonical contract in `.pi/artifacts/pi-template/PLAN.md`; research paragraph in `AGENTS.md`.
- `.opencode/{tech-stack,roadmap,state}.md` synchronized.
- `.opencode/artifacts/mcp-research-lane/{spec,prd}.md` reconciled to Main-mediated (this reset).

### Out of scope (non-goals)
- Network or extension access for children.
- Network access for children (Main uses `approvals.network:"allow"` for its `fabric_exec` research; children stay network-isolated via `extensions:false`).
- Dynamically connecting arbitrary MCP servers.
- Treating read-only children as offline or secret-isolation sandbox.
- Reworking the stale `supervise.md` 0.22.4 field matrix (NOTICED BUT NOT TOUCHING).
- Project-pinning duplicate MCP/Codex packages in `.pi/settings.json` (Pi combines project + global package lists; `pi-mcp-adapter`/`pi-codex-search` are globally installed).

## Sequencing

`proactive-supervisor` shipped at HEAD `a04a65c`; ADR-012 at `DECISIONS.md:370`. ADR-013 is next available. Shared files are free. Execution is wave-by-wave per `plan.md`; Task C is done (`capture.keepVisible` committed `438adef`); G2 (live supervisor smoke) + J (final fingerprint) are the remaining operator checkpoints.

## Milestone-5 / lifecycle regression invariants (must preserve)

- `supervise.md` + 4 lifecycle prompt frontmatter `description` (+ `argument-hint` where present).
- `<slug>` token in create/plan/ship/verify/research.
- No forbidden OpenCode-pseudocode tokens (`task(`, `question(`, `skill(`, `write(`, `.active`, `spec.md`, `prd.json`, `review-state.json`). `agents.run`/`agents.ask` are NOT forbidden.
- `ship.md` keeps "cannot declare...verified status/completion".
- `verify.md` keeps "sole...verified | transcript only | no repository write".
- ADR-011 review-gate markers (Phase 10A, Phase 8A, Tier-Gated Diff Review, Phase 5A) remain.
- ADR-012 supervisor handshake phases (10B, 8B, research 5, 6A) remain, with `action:"silent"` direct-response discipline and `proactive-supervisor/v1` protocol.
- Supervisor's four hard limits (never dispatch / never integrate-or-edit / never certify / never stop) and `extensions:false` actor config unchanged.

## Privacy and Security

- Research queries contain public technology questions only. No `.env`, keys, credentials, token files, global MCP configuration, or raw repository payloads are read or transmitted.
- Main gains narrow direct network tools; children gain none. Child tools limit side effects, not what repository data the configured model provider can receive.
- `exa`/`context7` carry API keys in MCP config env, never echoed in task text or findings.
- Research summaries stay <=8 KiB, non-secret, with source paths/citations.
- External content is prompt-injection-capable untrusted data; instructions from retrieved content are discarded.

## Failure Behavior

- Direct MCP tool absent/not registered: operator enables exactly those direct tools interactively and restarts Pi; otherwise block (`plan.md` Task B checkpoint).
- `codex_search` auth/peer incompatibility: fall back to Context7/Exa for cited search; if incompatible with Pi 0.81.1, accept MCP-only scope (operator disposition).
- One MCP capability unavailable: use a capability-appropriate surviving source; otherwise `partial`.
- All external unavailable: `local-only` if research was optional; `blocked` if L2/L3 `source-check-required` cannot be satisfied.
- Sensitive/unbounded query: `rejected`.
- Oversized result: distill below 8192 bytes; never pass raw output through a file or child prompt.

## Risks

- **Direct MCP name drift (medium, MITIGATED):** names are server-prefixed and registry-proven via live `/mcp tools` (context7_resolve-library-id, context7_query-docs, exa_web_search_exa, exa_web_fetch_exa), not guessed.
- **`pi-codex-search@0.1.5` peer compat (medium, RESOLVED):** declares `^0.79.10` peers but `codex_search` registers at runtime (live `/codex-search-settings status`: enabled=true); scope stays full.
- **Generic `mcp` over-exposure (low, gated):** avoided by exposing only exact direct-tool names; operator gate for the proxy alternative.
- **Concurrent work (low):** `.pi/fabric.json` has legitimate concurrent model/compaction/executor changes; edit surgically, never restore/stash others' work.
