# PROGRESS — Pi/Fabric Template (`pi-template`)

Per-iteration log: tried, failed, learned. Entry format:
`### YYYY-MM-DD - <title>` then `status: active | done | abandoned`.

### 2026-07-22 - Adversarial review → corrected architecture
status: done
Source-grounded review against installed Pi 0.81.1 and pi-fabric 0.22.4 produced 12
corrected findings. Most load-bearing:
- Makora needs `extensions:true` (live probe: `extensions:false` fails to resolve the
  Makora provider). Universal `extensions:false` would disable the only writable worker.
- Supervisor arbitration must be blocking `agents.ask()`, not `tell()` — failed directive
  runs resolve as `silent`+`error`.
- `fullCodeMode:false` is not deterministic unless `schema.mode:"off"` is pinned (inherited
  `"enforce"` forces full-code mode + disables subagents).
- Stock `fabric-supervisor` self-stops on "Goal verified complete" — must use custom
  instructions.
- `.pi/config.json` has no consumer in Pi 0.81.1 or Fabric 0.22.4 — removed everywhere.
- "One Makora per session" is a per-process semaphore, not a worktree write lock.
- `/night` standing-authorization block referenced deleted `git_transaction` machinery —
  removed.
- Haiku compaction unsupported — Fabric compaction is deterministic/LLM-free.

### 2026-07-22 - Repo reset to clean-slate
status: done
Orphan branch → `main`; single commit `dbf74b7` (605 files). Force-pushed `origin/main`
and `origin/master` (both now `dbf74b7`). Root `.gitignore` excludes `node_modules/`,
`.pi/fabric/`, `.pi/npm/`, `.pi/git/`, `.pi/sessions/`, `.fallow/`, logs. Authorized by
operator; destructive command recorded.

### 2026-07-22 - /init deep pass
status: done
Enriched `AGENTS.md` + `.opencode/{tech-stack,roadmap,state,user}.md` within their roles;
de-duplicated authority (single owner per theme). Created `.pi/.gitignore` and
`.pi/artifacts/pi-template/{PLAN,TODO,PROGRESS,DECISIONS}.md`. Cross-file check: no stale
`.pi/config.json` (only explicit "there is no" notes), no Haiku, no `/night` (except
changelog mention), no `agent()`-fan-out references.

### Verification fingerprint
- HEAD pre-init-deep-pass: `dbf74b7`
- HEAD post-init-deep-pass: `5d257c4` (pushed to `origin/main` + `origin/master`,
  fast-forward — no force-push; incremental per per-artifact policy)
- Checks run this pass: `rg` cross-file stale-reference scan (PASS).
- Not yet run: `pi --approve --list-models` for this worktree (pending milestone 1),
  structural checks (pending `.pi/tools/`).
