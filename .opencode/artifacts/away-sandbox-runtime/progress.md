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
