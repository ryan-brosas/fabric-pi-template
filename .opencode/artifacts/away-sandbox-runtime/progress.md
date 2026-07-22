# Away Sandbox Runtime — /ship progress

## P0.1 — Settle ADR-013 and prior work — DONE 2026-07-23

- ADR-013 marker present (`DECISIONS.md:433`).
- Authorized operator push of 7 local mcp-research-lane commits to `origin/main` + `origin/main:master` (operator answer: "Authorize push to origin main+master").
- `git push origin main` → `a04a65c..5dd5e34` (fast-forward, no force).
- `git push origin main:master` → `a04a65c..5dd5e34`.
- Post-push: local `main` == `origin/main` == `origin/master` == `5dd5e347dea9a01385f6cac5433f2e533746a9de` (0 ahead / 0 behind).
- Baseline attributed at OID `5dd5e34`.

## P0.2 — Replace the stale sandbox contract — DONE 2026-07-23

- RED confirmed before rewrite: stale phrases (`unshare-user-try`, `real ledger`, `Credentials.*writer`, real ledger/Git broker full loop) present in old spec.md/prd.json.
- Rewrote `spec.md` to the corrected node-process child-wrapper design from `plan.md`: keeps `node-process` as the executor behind a pinned `process.execPath` wrapper (`executor-wrapper.mjs`); credentials moved OUT of the sandbox (exist only in trusted Pi host); strict `--unshare-user` (not fail-open try variant); real ledger/Git/GitHub full loop deferred to ADR-015 (autonomous-away-loop); `.pi/away-sandbox.json` assigned to A1; immutable startup-closure hashing (not mutable `.pi/fabric/**`); controller-derived profile selection (model never supplies lane); one assertion per invariant; protected paths compared against captured baseline hash.
- Rewrote `prd.json` to the corrected design: 14 tasks (P0.1, P0.2, A1, A2, A3, B1, B2, B3, C1, C2, C3, D1, D2, D3), corrected manifests (write_paths/protected_source_paths/runtime_protected_paths/shared_serial_ownership), `baseline_oid=5dd5e34...`, 12 success criteria, acyclic deps, three-file task cap.
- Captured `baseline.md`: OID `5dd5e34` + SHA-256 manifest of protected files (`.pi/fabric.json`, `.pi/settings.json`, AGENTS.md, DECISIONS.md, PLAN.md, all `.pi/prompts/*.md`, all `.opencode/command/*.md`); ADR-011/012/013 markers + prompt forbidden-token cleanliness verified at baseline.

### Deviation (P0.2 verify)

- The plan's P0.2 verify searched `prd.json` for the stale-phrase patterns, but the verify string is stored IN `prd.json` (self-reference: the check would always match itself and could never pass). Per AGENTS.md "a failing check may encode a superseded decision," the check's INTENT is "stale design gone from the contract." Fix: scope the stale-phrase `rg` to `spec.md` (the human contract) and validate `prd.json` structurally (valid JSON, 14 tasks, acyclic deps, `baseline_oid` set). prd.json was also reworded so the only remaining occurrence of the pattern strings is the verify meta line itself (the check definition, not a design assertion).

### Verification (P0.2 gate)

- `! rg -n 'unshare-user-try|real ledger|real Git broker|Credentials.*writer' spec.md` → no matches (PASS).
- `prd.json` valid JSON, 14 tasks, acyclic deps, `baseline_oid` set (PASS).
- All `implement` tasks ≤ 3 files (PASS).
- ADR-013 marker intact (PASS).

### Files

- `.opencode/artifacts/away-sandbox-runtime/spec.md` (rewritten)
- `.opencode/artifacts/away-sandbox-runtime/prd.json` (rewritten)
- `.opencode/artifacts/away-sandbox-runtime/baseline.md` (new)
- `.opencode/artifacts/away-sandbox-runtime/plan.md` (retained, already corrected by /plan)
- `.opencode/artifacts/away-sandbox-runtime/progress.md` (new)

### Notes

- NOT touched (concurrent agents' work): `.pi/fabric.json`, `.pi/settings.json`, `.opencode/state/session-summary.md`, `.opencode/artifacts/.active`. Per operator instruction "baseline captures current bytes," the concurrent edits to `.pi/fabric.json`/`.pi/settings.json` are folded in as the baseline; this run never reverts another agent's work. D3 will re-check these against `baseline.md`.
- Next: A1 (deterministic lane bootstrap: `bootstrap.ts` + `bootstrap.test.ts` + `.pi/away-sandbox.json`).

## P0.2 commit entanglement + baseline churn (recorded 2026-07-23)

- My `git add` staged my 5 P0.2 files; a concurrent agent then ran a commit (HEAD `f63a849`, message `fix(mcp-research-lane): address review findings`) that swept my 5 staged files into itself alongside that agent's `ship.md`/`DECISIONS.md`/`PLAN.md`/`mcp-research-lane/{plan,prd}` changes. My own `git commit -m` was then a no-op (nothing left staged). Per AGENTS.md I did NOT reset/amend/re-split the other agent's commit. All 5 of my P0.2 files (baseline.md, plan.md, prd.json, progress.md, spec.md) ARE committed in `f63a849`; provenance is entangled but content is correct and in history.
- **Baseline drift at HEAD `f63a849`** (concurrent agents, not me): `.pi/fabric.json`, `.pi/settings.json`, `DECISIONS.md`, `PLAN.md`, `ship.md` DRIFTED vs the P0.2 `baseline.md` capture. `AGENTS.md`, `create.md`, `verify.md` SAME. ADR-011/012/013 markers intact; prompt forbidden-token cleanliness clean.
- **D3 strategy decision (pending operator):** strict byte-equality of protected files against the frozen `baseline.md` is not achievable while concurrent agents actively edit + commit those same protected files. D3 must be **feature-scoped**: verify that *this feature's* commits did not touch protected files (`git log/diff` filtered to away-sandbox-runtime work), not absolute cleanliness. The original `git diff --exit-code -- .pi/fabric.json` success criterion can only pass if concurrent agents stop churning `.pi/fabric.json` by D3 time.
- Next: A1 (deterministic; creates only NEW files under `.pi/away-runtime/` + `.pi/away-sandbox.json` — unaffected by the protected-file churn).

## A1 — Deterministic lane bootstrap — DONE 2026-07-23

- TDD: wrote `bootstrap.test.ts` (RED) first; confirmed `ERR_MODULE_NOT_FOUND` for `./bootstrap.ts`. Then wrote the manifest + implementation → 16/16 GREEN. One mid-run fix was a **test expectation bug** (writer `host_call_refs` includes `away_list`; my expected array omitted it) — implementation was correct; fixed the expectation.
- `.pi/away-sandbox.json` (host-owned, versioned manifest): `schema:"away-sandbox/1"`, `version:1`; pinned versions grounded in the live environment — Node 24.16.0, pi 0.81.1 (`/home/ryan/.local/bin/pi`), pi-fabric 0.23.0, bwrap 0.9.0 (`/usr/bin/bwrap`), makora-provider 1.12.1. model_registry pins per-lane model+provider+thinking+provider_source (writer/verifier=makora `makora/zai-org/GLM-5.2-NVFP4` + makora provider `-e`; reviewer/local-explorer/external-scout=openai-codex built-in, no provider `-e`). 5 lanes (local-explorer, external-scout, writer, reviewer, verifier) with per-lane approvals + host_call_refs subsets; `host_call_risks` maps the 8 `away_*` refs to exact FabricRisk. `env_allowlist` + `env_deny_prefixes` (`PI_FABRIC_`/`PI_TRUST`/`PI_APPROVE`/`PI_PROJECT`). `limits` (cgroup + executor). `protected_paths` (from `baseline.md`) + `runtime_protected_paths` (from `prd.json`).
- `bootstrap.ts`: `loadManifest(path)` hashes raw manifest bytes (drift signal) + validates schema/version. `bootstrap(profileId, opts)` derives repoRoot from the manifest path (NEVER cwd), rejects unknown lanes, builds the synthetic fabric.json (node-process executor; approvals agent/execute/write/network denied per lane — only external-scout network allow; mcp/subagents/mesh/memory/ui disabled; `capture.risks` = exactly the lane's refs with exact risks; `schema.mode:"off"`; `compaction.engine:"fabric"`), writes it to the inert control cwd (`~/.local/state/pi-away/control`, overridable) and refuses to use the repo as control cwd, builds the allowlisted env (drops `PI_FABRIC_*`/`PI_TRUST`/etc.), and builds the exact Pi RPC argv (`pi_path`, `--no-approve --no-context-files --no-extensions --no-skills --no-prompt-templates --no-themes --tools fabric_exec`, explicit `-e` lane-extension (repo-resolved) + provider source, `--mode rpc --provider --model --thinking --print --no-session`).
- Adversarial property proven by tests: `PI_FABRIC_GRANTED_RISKS=write,execute,network,agent` + `PI_TRUST=1` + `EVIL_OVERRIDE` in processEnv does NOT widen approvals, alter argv, or change the synthetic fabric.json bytes; a fake malicious project (its own `.pi/away-sandbox.json` with `agent:allow`, fake `fabric.json`, `AGENTS.md`) at another path is never read — the host manifest wins; manifest tampering changes the hash (drift). Two clean runs produce byte-identical fabric.json + argv.

### Verification (A1 gate)

- `node --experimental-strip-types --test .pi/away-runtime/bootstrap.test.ts` → 16 tests, 16 pass, 0 fail (PASS).
- 3 A1 implementation files only (bootstrap.ts, bootstrap.test.ts, away-sandbox.json) — within the three-file cap.

### Files

- `.pi/away-runtime/bootstrap.ts` (new)
- `.pi/away-runtime/bootstrap.test.ts` (new)
- `.pi/away-sandbox.json` (new)
- `.opencode/artifacts/away-sandbox-runtime/progress.md` (A1 record appended)

### Notes

- Stray probe `.pi/_tsprobe/p.ts` was created during an ESM-stripping feasibility check; it is untracked and excluded from the A1 commit. **Operator permission requested** to remove it (per the no-delete-without-permission rule). `/tmp/tsprobe/p.ts` is an out-of-repo probe.
- The synthetic fabric.json's `--tools fabric_exec` allowlist + captured `away_*` refs reachability through fullCodeMode is a version-coupled Fabric behavior to be confirmed live at **A2/A3**; if `--tools fabric_exec` strips the captured `away_*` tools, A2 surfaces it and the argv/manifest adjusts. A1 only generates the deterministic argv.
- Next: **A2** (executor-wrapper.mjs + inner-guest.mjs + executor-sandbox.test.ts). Needs real bwrap in-env; probe `bwrap --unshare-user` strict feasibility first (bwrap 0.9.0 confirmed present). Then **A3** BLOCKING operator checkpoint.
