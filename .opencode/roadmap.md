# Roadmap

## Vision

A Pi-native coding template powered by `pi-fabric`: a thin, readable agent-driven
development baseline that other repositories can adopt. GPT-5.6-sol Main is the sole
scheduler, integrator, and commit authority; a persistent advisory supervisor steers
on drift; a bounded GLM worker pool implements. Lifecycle ergonomics are inspired by
`.opencode` (`/create` → optional `/plan` → `/ship` → `/verify`) but realized with Pi
prompts (full command bodies ported from `.opencode/command/`) and Markdown artifacts. Authority, routing, topology, and the council contract
live in `AGENTS.md`; model wiring in `.opencode/tech-stack.md`; the canonical contract in
`.pi/artifacts/pi-template/PLAN.md`.

## Target Users

- **Developers** adopting the template as the agent-driven development baseline for a new
  or existing repository.

## Success Criteria

- **Maintainability** — readable, self-contained Pi prompts (full command-body ports) and
  config; no hidden lifecycle state machines.
- **Stability / correctness** — host-derived evidence, worker distrust, verified commits;
  no silent model fallback across authority classes.
- **Ergonomics** — direct-first routing with delegation as a tool, optional council per
  task, frequent safely scoped verified commits.
- **Portability** — an adopted `.pi/` stays clean without the root `.gitignore`.

## Milestones

Each milestone is independently verifiable. Authority/topology decisions are recorded in
`DECISIONS.md`; this list is the product roadmap only.

1. **Pi project config** — `.pi/settings.json` (Main default provider/model/thinking) +
   `.pi/fabric.json` (`fullCodeMode:false`, `schema.mode:"off"`, read-only default child
   tools, `subagents.maxDepth:1`, `mesh.actorScope:"session"`, `mesh.enabled:true`,
   disabled memory-indexing, `compaction.engine:"fabric"`).
   - Acceptance: `pi --approve --list-models` resolves all three model IDs; Main retains
     native tools; a review child's edit attempt fails; recursive delegation is rejected.
2. **Advisory supervisor (session-scoped)** — a single native `agents.create` persistent
   actor per `AGENTS.md` (ambient supervisor; custom instructions, never self-stops). Create/
   reconcile via `.pi/prompts/supervise.md` (done — static). The earlier security/architecture
   advisor + gate design was dropped as redundant (ADR-008).
    - Acceptance: re-running setup reuses the ID; resume restores the actor with correct
      immutable fields; a second session gets a distinct ID; the supervisor steers on drift
      (reactive, ADR-008) and proactively at lifecycle boundaries via the explicit
      `proactive-supervisor/v1` handshake (ADR-012), with Main-mediated read-only research on
      `openai-codex/gpt-5.4-mini`; stays silent otherwise.
     - **MCP research lane (ADR-013):** the research lane is Main-mediated — `pi-mcp-adapter`/
       `pi-codex-search` are package-discovered Pi extensions removed by `--no-extensions`, so
       children stay `read/grep/find/ls`-only; Main scouts external context (Context7/Exa/Codex
       via `fabric_exec`'s internal MCP proxy + `capture.keepVisible` direct tools,
       `network:"allow"`) and explores the codebase via local-only children, distilling a
       ≤8 KiB cited packet. Task C done (capture.keepVisible committed `438adef`, all 5
       external tools live-verified; `codex_search` registers on Pi 0.81.1); G2 (live
       supervisor smoke) + J (final fingerprint) pending operator.
3. **Lifecycle prompts** — Main-owned prompts under `.pi/prompts/` porting **all nine**
   `.opencode/command/*.md` bodies (`audit`, `create`, `fix`, `gc`, `init`, `plan`,
   `research`, `ship`, `verify`): take all of each body, strip only OpenCode-only syntax,
   re-point to `.pi/artifacts/<slug>/`. Self-contained, no agent routing or pseudo-tool
   calls. The five lifecycle commands (`create`, `plan`, `ship`, `verify`, `research`)
   take an explicit validated `<slug>`; the four operational commands keep natural args.
   - **Implementation status:** done (static) — all nine prompts ported (commits
     `4afa6da`–`9877cf2` + fix `d7d5237`); static suite PASS (frontmatter 9/9, forbidden
     9/9 CLEAN, source immutable, slug presence 5/5). Runtime smoke + final no-write
     verification pending `/trust` + restart.
   - Acceptance: two concurrent sessions on different slugs stay disjoint; `/ship` cannot
     declare completion; `/verify` declares verified status externally only.
4. **Canonical artifacts** — `.pi/artifacts/<slug>/{PLAN,TODO,PROGRESS,DECISIONS}.md` as
   the sole lifecycle record (tracked). `/create` is the sole namespace creator (an
   established namespace requires both `PLAN.md` and `TODO.md`); downstream lifecycle
   commands fail closed on a missing/partial namespace (no adoption/overwrite/deletion);
   pre-`/create` `/research` is response-only. `/gc` is project-wide, slugless, and
   response-only. Two writable surfaces (ADR-007): lifecycle state (confined to the slug)
   vs optional project memory (`.opencode/artifacts/MEMORY.md`; missing = non-blocking; `/init`
   sole scaffold establisher; `/verify` sole pre-fingerprint appender). No `.active` pointer,
   no "latest".
   - **Implementation status:** done (implementation) — tasks A1-C2 complete (commits
     `5193d85`, `8a6912d`, `3896cf5`, `25620dc`, `bc4ae6a`, `8b79382`, this commit); static
     suite 12/12 success criteria PASS; final no-write verification pending (Task C3).
   - Acceptance: only `/verify` may declare verified status (externally); no repository
     write after the final before/after fingerprint (candidate evidence may be written to
     PROGRESS before the final pass).
5. **Worker topology + distrust** — 1 Makora GLM worker per session (ceiling; host runs
   4-5 sessions); `extensions:true` + exact writable tool allowlist; host-derived candidate
   bytes; single writer per worktree (blocking `agents.run()`, no writable spawn/parallel).
   - **Implementation status:** implementation done — verification pending (commits
     `bd1a746`, `bcbbda4`, this pass): `subagents.extensions:false` + ADR-009; canonical
     Makora `agents.run` dispatch block + 1-Makora enforcement; host-derived candidate
     intake in `/ship`; milestone-6 observational worker-policy smoke defined. Static suite
     V1-V8 PASS; final no-write verification pending (Task C2). Runtime smoke deferred to
     milestone 6.
   - Acceptance: two simultaneous implementation requests yield one running Makora;
     read-only GPT work overlaps; Main does not edit until the run settles.
6. **Verification + quality gates** — focused checks per change; `/verify` freshness
   fingerprint; `/verify` is the only phase allowed to claim completion.
   - Acceptance: a byte changed after a passing check invalidates the PASS.

## Risks / Dependencies

- Fabric's single semaphore cannot enforce the worker topology alone — the single-writer
  rule is operator/prompt policy in v1 (no atomic lease yet).
- Fabric is not a security sandbox — read-only tools are authority policy, not secret
  isolation; secrets live only in environment/global Pi auth.
- Cross-worktree sessions need a deliberate shared-mesh decision (default mesh root is
  worktree-local).
- `extensions:true` is mandatory for Makora; a universal `extensions:false` policy would
  disable the only writable worker.

## Non-goals

- No `/team` orchestrator or mandatory two-skill lifecycle.
- No lifecycle kernel, schemas, typed handoffs, candidate manifests, receipts, or CAS
  board.
- No fixed review matrix — evidence-based boundary review is tier-gated (ADR-011).
- No automatic branch creation, commits, push, or publication.
- No supervisor writes, delegation, lifecycle-state mutation, or final readiness
  authority.
