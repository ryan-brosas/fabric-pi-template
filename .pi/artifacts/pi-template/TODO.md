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
status: done
- [x] Create `.pi/settings.json` (Main defaults + `npm:pi-fabric@0.22.4`).
- [x] Create `.pi/fabric.json` (`fullCodeMode:false`, `schema.mode:"off"`, read-only
      default child tools, `maxDepth:1`, `mesh.actorScope:"session"`, disabled memory
      indexing, `compaction.engine:"fabric"`, finite limits).
- [x] Verify: `pi --approve --list-models` resolves all three IDs; `normalizeFabricConfig`
      12/12 PASS; JSON valid.
- [x] Commit+push.
- [ ] Runtime smoke (pending `/trust` + restart): review-child edit fails; recursive
      delegation rejected.

### 2026-07-22 - Milestone 2: Advisory council
status: done
- [x] Author `.pi/prompts/supervise.md` (create/inspect supervisor + advisors,
      session-scoped, custom supervisor instructions — never self-stop).
- [x] Static verify: frontmatter `description`-only; no forbidden patterns; ADR-005
      session-restore correction.
- [x] Commit+push (`29bd75f`).
- [ ] Runtime verify (pending `/trust` + restart): re-run setup reuses IDs; resume
      restores correct immutable fields; second session gets distinct IDs.

### 2026-07-22 - Milestone 3: Lifecycle prompts (all nine)
status: done
- [x] Contract freeze (Plan 0): external verification in AGENTS/PLAN/DECISIONS; nine-command
      scope in roadmap/state/tech-stack; spec/prd restructured to 12 bounded serial tasks.
- [x] Port `/create` (commit `4afa6da` + fix `d7d5237`).
- [x] Port `/plan` (commit `66e3960`).
- [x] Port `/research` (commit `384e493`).
- [x] Port `/fix` (commit `674365f`).
- [x] Port `/ship` (commit `11fff6b`).
- [x] Port `/verify` (commit `5349087`).
- [x] Port `/init` (commit `5bd9c2e`).
- [x] Port `/gc` (commit `4c123f3`).
- [x] Port `/audit` (commit `9877cf2`).
- [x] Static suite: frontmatter 9/9; forbidden scan 9/9 CLEAN; source immutability exit=0;
      slug presence 5/5; `git diff --check` exit=0.
- [ ] Runtime smoke (pending `/trust` + restart): prompt discovery, slug validation,
      `/ship` no-completion, `/verify` external-only.

### 2026-07-22 - Milestone 4: Canonical artifacts (audit + hardening)
status: done (implementation; final no-write verification pending)
- [x] A1: Correct spec/prd + persist plan.md (commit `5193d85`).
- [x] A2: Formalize canonical contract + ADR-007 (AGENTS/PLAN/DECISIONS) (commit `8a6912d`).
- [x] B1: Harden create/plan/research (commit `3896cf5`).
- [x] B2: Align ship/verify (commit `25620dc`).
- [x] B3: Make gc project-wide slugless response-only (commit `bc4ae6a`).
- [x] Static suite: 12/12 success criteria PASS; milestone-3 regression intact;
      source immutability against `bebd044`; heading preservation 6/6; `git diff --check` exit=0.
- [ ] C3: Final no-write static verification (external declaration only) — pending.

### 2026-07-22 - Roadmap milestone 5 — worker topology + distrust
status: done (implementation; final no-write verification pending)
- [x] A1: Pin `subagents.extensions:false` safe default + ADR-009 (fabric.json, AGENTS,
      DECISIONS) (commit `bd1a746`).
- [x] A2: Pin canonical Makora `agents.run` dispatch block + 1-Makora enforcement in
      PLAN + AGENTS (commit `bcbbda4`).
- [x] B1: Encode host-derived candidate intake in ship.md + milestone-6 observational
      worker-policy smoke in PLAN.md.
- [x] B2: Record candidate evidence (TODO.md, PROGRESS.md, state.md — this entry).
- [ ] C1: Align binding spec/prd/roadmap (implementation done — verification pending).
- [ ] C2: Final no-write static verification (external declaration only) — pending.
- [ ] Runtime smoke (milestone 6): two concurrent writable → one runs; read-only overlaps;
      Main edit refused. Requires `/trust` + restart.

### 2026-07-22 - Milestone 5: Verification fingerprint
status: pending
- [ ] Add `.pi/tools/` fingerprint capture (HEAD, staged/unstaged digests, untracked
      manifest, file hashes).
- [ ] Verify: a byte change after a PASS invalidates it.
- [ ] Commit+push.

### 2026-07-22 - Milestone 6: Smoke
status: pending
- [ ] Model resolution, Main native tools, review-child edit rejection, freshness
      invalidation, prompt discovery, slug validation.
