# TODO — Pi/Fabric Template (`pi-template`)

Live task list for building the `.pi/` runtime. Slices mirror `PLAN.md`. Entry format:
`### YYYY-MM-DD - <title>` then `status: active | done | abandoned | updated: <date>`.

### 2026-07-22 - Init deep pass (docs + canonical contract)
status: done
- AGENTS.md: removed `/night`, `.pi/config.json`, Haiku compaction; added Makora
  `extensions:true`, single-writer-per-worktree, per-slug lifecycle, `/verify` freshness,
  custom-supervisor, blocking-ask gate mechanics, Repository section.
- `.opencode/{tech-stack,roadmap,state,user}.md`: de-duplicated against AGENTS.
- `.pi/.gitignore`: runtime state only; artifacts tracked.
- `.pi/artifacts/pi-template/{PLAN,TODO,PROGRESS,DECISIONS}.md`: canonical contract.

### 2026-07-22 - Milestone 1: Pi project config
status: active
- [ ] Create `.pi/settings.json` (Main defaults + `npm:pi-fabric@0.22.4`).
- [ ] Create `.pi/fabric.json` (`fullCodeMode:false`, `schema.mode:"off"`, read-only
      default child tools, `maxDepth:1`, `mesh.actorScope:"session"`, disabled memory
      indexing, `compaction.engine:"fabric"`, finite limits).
- [ ] Verify: `pi --approve --list-models` resolves all three IDs; Main retains native
      tools; a review child edit fails; recursive delegation rejected.
- [ ] Commit+push.

### 2026-07-22 - Milestone 2: Advisory council
status: pending
- [ ] Author `.pi/prompts/supervise.md` (create/inspect supervisor + advisors,
      session-scoped, custom supervisor instructions — never self-stop).
- [ ] Verify: re-run setup reuses IDs; resume restores correct immutable fields; second
      session gets distinct IDs.
- [ ] Commit+push.

### 2026-07-22 - Milestone 3: Lifecycle gate workflow
status: pending
- [ ] Author `.pi/prompts/gate.md` (blocking `agents.ask()` to applicable advisors,
      validate each, one blocking `agents.ask(supervisor)` on conflict).
- [ ] Verify: errored/silent advisor blocks the gate; no duplicate steer loop.
- [ ] Commit+push.

### 2026-07-22 - Milestone 4: Lifecycle prompts
status: pending
- [ ] Author `.pi/prompts/{create,plan,ship,verify,research}.md` (explicit `<slug>`;
      self-contained; no agent routing or pseudo-tool calls).
- [ ] Verify: two sessions on different slugs stay disjoint; `/ship` cannot write
      verified status.
- [ ] Commit+push.

### 2026-07-22 - Milestone 5: Verification fingerprint
status: pending
- [ ] Add `.pi/tools/` fingerprint capture (HEAD, staged/unstaged digests, untracked
      manifest, file hashes).
- [ ] Verify: a byte change after a PASS invalidates it.
- [ ] Commit+push.

### 2026-07-22 - Milestone 6: Smoke
status: pending
- [ ] Model resolution, Main native tools, review-child edit rejection, gate block on
      errored advisor, freshness invalidation.
