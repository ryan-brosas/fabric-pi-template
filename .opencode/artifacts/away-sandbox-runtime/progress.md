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

---

## A2 — Real NodeProcessRuntime sandbox tracer (DONE, committed <TBD>)

### End state reached

- The writable `process.execPath` seam (the make-or-break A2 question) is PROVEN live: Fabric 0.23.0's `NodeProcessRuntime` unconditionally spawns `spawn(process.execPath, ['--max-old-space-size=<mb>','--input-type=module','--eval', NODE_PROCESS_CHILD_SOURCE], {stdio:['ignore','ignore','ignore','ipc']})` (node-process-runtime.js:29); there is NO config field to pin a wrapper, but `process.execPath` is writable+configurable on Node 24, so the C1 launcher reassigns it to the wrapper before Fabric boots. Pinned wrapper = the SCRIPT node runs (shebang `#!/usr/bin/env node`); Fabric's argv becomes `process.argv.slice(2)`, node never evals the child-source, and the shebang wrapper holds the Fabric ipc fd (probed). This matches `plan.md`'s anticipation of the writable-execPath seam exactly (not a deviation).
- `executor-wrapper.mjs` validates the exact Fabric argv shape (4 elements: `--max-old-space-size=<posInt>`, `--input-type=module`, `--eval`, child-source) and the child-source SHA-256, then launches the verbatim child-source inside strict bubblewrap (`--unshare-user` STRICT — never `--unshare-user-try`; + pid/ipc/uts/net namespaces; `--die-with-parent`) with MINIMAL binding (node binary + ldd-resolved libs + ld-linux + inner-guest.mjs only — NO full rootfs, NO /etc, NO /home, NO repo, NO creds). Bridges Fabric node-ipc ↔ sandbox stdin/stdout JSON-line; filters every host-call by effective ref (Fabric's `__resolvedCallRef`: `fabric.$call` → `args.ref`) against the lane's allowlisted `host_call_refs`; enforces frame discipline (malformed/oversized/duplicate-id/forged-result/post-result/unknown-frame terminate; unknown refs reject in-guest without forwarding); fsyncs a terminal attestation file BEFORE forwarding the result to Fabric.
- `inner-guest.mjs` is a trusted transport shim loaded via `--import` inside bwrap BEFORE the verbatim child-source (`--eval`). It re-binds Fabric's node-ipc transport (`process.send`→stdout, `process.on("message")`→stdin readline, `process.connected` getter, `process.disconnect`) onto stdin/stdout JSON-line, with a pending-buffer so the `execute` frame arriving during `--import` (before the child-source registers its handler) is not dropped. The verbatim child-source runs UNMODIFIED (zero drift from the pinned value digest).
- Credentials stay OUT of the sandbox: bwrap `--clearenv` + minimal `--setenv PATH /usr/bin --setenv LANG C.UTF-8`; the inner guest sees NO credential env, NO `PI_AWAY_*` control vars, NO `PI_FABRIC_*`. Host tools (`away_read` etc.) run in the trusted host (the wrapper parent), which CAN read — that is intended (the guest reads via filtered host calls, never directly).

### Adversarial properties proven by tests (25/25)

- vm escape in Fabric's `vm.createContext` (Node 24, `codeGeneration:{strings:true}`) does NOT reach the host: `({}).constructor.constructor("return process")()` → `ReferenceError: process is not defined`; `return this`/`return globalThis` return the vm sandbox, not the host. So the model's ONLY host communication is the fabric API → well-formed `call` frames. bwrap is defense-in-depth: the confinement harness runs a malicious vm-escape guest (reaches a real process) inside the wrapper's exact `buildBwrapArgs` and proves `/etc/passwd` → ENOENT, repo manifest → ENOENT, `fetch` → failed (no net ns for writer), env has no creds/PI_AWAY_*/PI_FABRIC_*, `/bin/sh` → ENOENT (no /bin bound), `/proc` shows only guest-namespace PIDs.
- Ref filtering: `tools.call({ref:"away_read"})` is forwarded to the host (host sees `fabric.$call` with `args.ref=away_read`); `tools.call({ref:"agents.run"})` is rejected in-guest (host NEVER sees `agents.run`; the guest's call rejects with `denied ref`).
- argv/digest rejection: malformed argv → error result `...argv...` + non-zero exit; tampered child-source → error result `...digest...` + non-zero exit; correct digest → proceeds to spawn the sandbox.
- Cancellation: `AbortSignal` → result `terminationReason:"aborted"`; the wrapper's `process.on("disconnect")` kills the bwrap child (`--die-with-parent`).
- fsync attestation: an attestation file is written+fsynced in `PI_AWAY_ATTEST_DIR` before the result is forwarded (content: lane, terminationReason, forwardedRefs, deniedRefs, fsynced:true).

### Verification (A2 gate)

- `node --experimental-strip-types --test .pi/away-runtime/executor-sandbox.test.ts` → 25 tests, 25 pass, 0 fail (PASS), deterministic across 2 consecutive runs (~3.5s each). A1 regression check: 16/16 still PASS.
- 3 A2 implementation files only (executor-wrapper.mjs, inner-guest.mjs, executor-sandbox.test.ts) — within the three-file cap.

### Files

- `.pi/away-runtime/executor-wrapper.mjs` (new) — pinned execPath target; validate argv+digest, spawn strict bwrap, bridge+filter+discipline+fsync; exports pure helpers + PINNED_CHILD_SOURCE_DIGEST.
- `.pi/away-runtime/inner-guest.mjs` (new) — transport shim (node-ipc ↔ stdin/stdout JSON-line).
- `.pi/away-runtime/executor-sandbox.test.ts` (new) — 25 tests: drift guard, pure helpers, real-runtime seam (happy/ref-filter/attestation/abort), direct-wrapper rejection, direct-bwrap confinement.
- `.opencode/artifacts/away-sandbox-runtime/progress.md` (A2 record appended)

### Notes / decisions

- **Child-source digest pin = the VALUE, not the file.** Fabric passes `NODE_PROCESS_CHILD_SOURCE` (the imported value, 2838 chars, sha256 `ee0bb190...`) via `--eval`, NOT the .js source file (2948 bytes, sha256 `d7755589...`). The wrapper validates `sha256(argv[3])` against `PINNED_CHILD_SOURCE_DIGEST = ee0bb190...`. The drift-guard test imports the value (not reads the file) and compares. A concurrent pi-fabric reinstall changes the value → drift-guard fails → re-pin (B1/ADR-014 freezes the version). (An earlier m0067 "drift" alarm was a false comparison of file-digest vs value-digest; they were never equal — file ≠ value.)
- `--tools fabric_exec` captured-`away_*` reachability (A1 flag) is NOT exercised by A2 (A2 tests call `tools.call` directly through the real child-source's `fabric.$call` routing, which the wrapper filters on `args.ref`). Full `--tools fabric_exec` + `capture.risks` end-to-end is confirmed at **A3** (real Fabric through the wrapper + authenticated Makora smoke).
- Frame-discipline (malformed/oversized/dup-id/forged-result/unknown-ref) is tested via pure-function logic + the confinement harness's vm-escape path (defense-in-depth); the verbatim child-source cannot produce adversarial frames (no `process.send` access from the vm). Live adversarial framing is re-validated at A3.
- Stray debug files `err1.txt`, `err2.txt`, `err3.txt` were created in the repo root during A2 bwrap probes; they are untracked and excluded from the A2 commit. Together with the A1 stray `.pi/_tsprobe/`, **operator permission requested** to remove all four (no-delete-without-permission rule).
- Next: **A3** BLOCKING operator checkpoint (bwrap userns + cgroup v2 + real Fabric NodeProcessRuntime through the wrapper + authenticated Makora smoke WITHOUT credential/network egress + before/after fingerprint; STOP permanently if any fails). Surface A3 + the D3 feature-scoped-vs-absolute-baseline decision to the operator at that gate.

---

## A3 — Live feasibility checkpoint (BLOCKING) — PASS

Operator-authorized (4 decisions at the gate): (a) live Makora smoke now (externally visible provider call + credentials), (b) D3 = feature-scoped baseline verification, (c) remove 4 stray files, (d) push main + master now. A3 `files:[]` — checkpoint, evidence only.

### Gate results (all 6 PASS — A3 PASSES)

- **A3-1 bwrap strict userns: PASS.** `bwrap --unshare-user --unshare-pid --unshare-ipc --unshare-uts --unshare-net --die-with-parent --ro-bind / / --proc /proc --dev /dev -- echo STRICT_OK` → exit 0. `--unshare-user` strict (NOT fail-open `--unshare-user-try`) works unprivileged.
- **A3-2 cgroup v2 delegation + enforcement: PASS.** cgroup2fs; user delegated subtree `/sys/fs/cgroup/user.slice/user-1000.slice/user@1000.service` (`Delegate=yes`, `DelegateControllers=cpu memory pids`, `subtree_control=cpu memory pids`). systemd 255, `systemd-run --user` available. Enforcement proven: `TasksMax=1` → libuv thread fork aborts (`uv_thread_create`, status ABRT); `TasksMax=64` → succeeds. `MemoryMax=20M` + touched alloc (`.fill(1)`) → oom-kill (status KILL, peak 20.0M); `MemoryMax=1G` → completes 500MB. `CPUWeight` settable. Enforcement mechanism for B2: `systemd-run --user --wait --pipe --collect -p TasksMax=/MemoryMax=/CPUWeight=` (service mode; `--scope` hangs on long-running children). Caveat: direct `cgroup.procs` cross-domain write fails (shell outside the delegated subtree) — B2 runs under `user@1000.service` or via `systemd-run --user`.
- **A3-3 real Fabric 0.23.0 NodeProcessRuntime through the wrapper: PASS.** Re-ran `node --experimental-strip-types --test .pi/away-runtime/executor-sandbox.test.ts` live → 25/25 pass (drift guard intact: child-source value digest `ee0bb190...` stable). The writable-`process.execPath` seam (Fabric unconditionally spawns `process.execPath`; the C1 launcher reassigns it to the wrapper before Fabric boots) is proven end-to-end.
- **A3-4 authenticated Makora parent-provider request without logging/forwarding the credential: PASS.** `/tmp/a3_makora.mjs` reads `~/.pi/agent/auth.json` `makora.key` internally (NEVER printed) and POSTs to `https://inference.makora.com/v1/chat/completions` (`model: zai-org/GLM-5.2-NVFP4`, `max_tokens: 512` so reasoning finishes then content emits) → HTTP 200, `choices[0].message.content = "A3_OK"`, usage 19+19=38 tokens. Credential used host-side only; never forwarded to the sandbox.
- **A3-5 inner guest no cred env + no net: PASS.** `/tmp/a3_sandbox.mjs` runs a probe INSIDE strict bwrap (the wrapper's `buildBwrapArgs` for the writer lane: `--unshare-user` strict + `--unshare-net` + minimal binding + `--clearenv`). Report: `/home/ryan/.pi/agent/auth.json` → **ENOENT** (CREDENTIAL UNREACHABLE); `/home/ryan/.pi` → ENOENT; `/etc/passwd` → ENOENT (no host /etc); repo manifest `/home/ryan/repo/swastika/.pi/away-sandbox.json` → ENOENT (repo not bound); env = `{LANG, PATH, PWD}` (no credential vars, no `PI_AWAY_*`/`PI_FABRIC_*`); `fetch` → `TypeError: fetch failed` (net namespace denied for writer lane). NOTE: `/home/ryan` is listed and contains `.nvm` ONLY because the node binary is bound at `/home/ryan/.nvm/versions/node/v24.16.0/bin/node` (bwrap creates that directory path for the bind) — it is NOT the host home contents; the credential path `/home/ryan/.pi/...` is ENOENT.
- **A3-6 before/after fingerprint (feature-scoped): PASS.** HEAD unchanged (`b30abe7` == origin/main == origin/master). Feature commits `7316fd9` (A1) and `0115fc9` (A2) touched ONLY `.pi/away-runtime/*` + `.pi/away-sandbox.json` + `progress.md` — NO protected path leak (verified clean against `.pi/fabric.json`, `.pi/settings.json`, `AGENTS.md`, `.pi/artifacts/pi-template/DECISIONS.md`, `.pi/artifacts/pi-template/PLAN.md`, `.opencode/state/session-summary.md`, `.opencode/artifacts/.active`). The smoke (Makora + sandbox) ran in `/tmp` and added no repo files. Working-tree churn (`.active`, `.pi/fabric.json`, `.pi/settings.json`, `session-summary.md`, mcp-research-lane/*, untracked workspaces) is concurrent agents — not mine, not staged.

### Cleanup (operator-authorized)

- Removed the 4 authorized stray files: `.pi/_tsprobe/p.ts`, `err1.txt`, `err2.txt`, `err3.txt` (verified gone). Empty `.pi/_tsprobe/` directory remains (harmless; rmdir needs permission per the no-delete rule).
- Push (authorized): `git push origin main` (5dd5e34..b30abe7) then `git push origin main:master`. 5 commits published = A1 `7316fd9` + A2 `0115fc9` + 3 concurrent mcp-research-lane fixes. origin/main=origin/master=HEAD=`b30abe7`, 0 ahead/0 behind.

### Scratch (out of repo, left per no-delete rule; /tmp)

- `/tmp/a3_makora.mjs` (real Makora call), `/tmp/a3_makora_debug.mjs` (response-shape inspector), `/tmp/a3_sandbox.mjs` (bwrap confinement probe), `/tmp/a3_diag.mjs` (bwrap binding diagnostic), `/tmp/a3_pids.mjs`, `/tmp/a3_mem.mjs`, `/tmp/a3_pids_scope.mjs`, `/tmp/a3_mem_scope.mjs` (A3-2 cgroup probes from b5). Empty probe cgroup `/sys/fs/cgroup/user.slice/user-1000.slice/user@1000.service/away_a3_probe` left (harmless; rmdir needs permission).

### Decisions frozen at A3

- **D3 = feature-scoped** (operator). Strict byte-equality of protected files vs the frozen `baseline.md` is unachievable while concurrent agents continuously churn protected files; D3 verifies THIS feature's commits did not touch protected paths, not absolute baseline equality. A3-6 used the feature-scoped fingerprint.
- **A3-4 = deterministic** (chose host-side real Makora call + live sandbox-isolation proof over a full-pi-loop) to avoid model-unreliability (Makora may not reliably call `fabric_exec`); faithful to the safety property (authenticated request runs host-side; credential structurally unreachable from the sandbox).

### Next

- A3 PASSES → **B1** Freeze ADR-014 authority (DECISIONS.md + PLAN.md + AGENTS.md pin pi-fabric 0.23.0 + child-source value digest `ee0bb190d5af47ff6ee99a0dd5874889b44b0857db23b897b4c57c88956793fb` + the writable-`process.execPath` seam + cgroup-v2 systemd delegation + strict `--unshare-user`). STOP permanently was NOT triggered — no weaker wrapper.

## B1 — Freeze ADR-014 authority

**Files:** `.pi/artifacts/pi-template/DECISIONS.md` (ADR-014 appended, line 510), `.pi/artifacts/pi-template/PLAN.md` (`### Away Sandbox Runtime (ADR-014)` section, line 360), `AGENTS.md` (away-runtime authority paragraph, line 216). 3-file cap honored.

**Done — ADR-014 codified, invariants preserved separately:**
- `## ADR-014: Away sandbox runtime` (exact heading) recorded with full ADR body: Context (`node-process` not a sandbox; `docs/configuration.md:10-12`, `subagents/manager.js:824-828`, `approval-controller.js:1-22`, `config.js:374-395`), Decision (host-pinned bubblewrap runtime under `.pi/away-runtime/`; pin per-lane `process.execPath` to trusted wrapper).
- **Tested seam + version coupling recorded:** writable-`process.execPath` seam (Fabric 0.23.0 `NodeProcessRuntime` unconditionally `spawn(process.execPath, [...])` at `node-process-runtime.js:29`; no config field pins a wrapper; launcher reassigns the writable+configurable `process.execPath` before Fabric boots; A2-proven). Child-source digest pin = the VALUE sha256 `ee0bb190d5af47ff6ee99a0dd5874889b44b0857db23b897b4c57c88956793fb` (2838-char imported value, NOT the `.js` file); frozen to pi-fabric 0.23.0.
- **Credentials in the trusted parent, only generated node-process sandboxed:** strict bubblewrap (`--unshare-user` STRICT, never `--unshare-user-try`; PID/mount/IPC/UTS/net; minimal binding — node+libs+ld-linux+inner-guest+/proc+/dev+/tmp only; `--clearenv` env={PATH,LANG}); credential at `~/.pi/agent/auth.json` not bound → ENOENT (A3-proven). Non-scout lanes no net; external-scout net-but-no-FS-no-cred. Cgroup-v2 systemd delegation (`systemd-run --user --wait --pipe --collect -p TasksMax=/MemoryMax=/CPUWeight=`; `--scope` unsuitable).
- **Invariants each preserved separately** (DECISIONS.md ADR-014 Authority block): real OS sandbox not node-process-as-boundary; host-controlled lanes; no model dispatch (never raw `agents.*`); default-deny closure; human-only merge; Main sole integrator; `/verify` authority+freshness (verifier reuses launcher, exact remote OID checkout, read-only, no net/creds, broker-controlled argv, stale PASS invalidated by any change); no destructive cleanup; no normal-session widening (opt-in away lane; normal sessions unaffected).
- **Block conditions:** missing wrapper attestation, strict userns, cgroup support, or closure hash each block execution — no weaker fallback, no fail-open userns, no fabricated success.
- **ADR-015 forward dependency** recorded (autonomous-away-loop adds the real ledger/Git/GitHub crash-replay full loop on top of this foundation; this feature defers that loop).
- **Alternatives** recorded: (a) node-process as boundary, (b) fail-open `--unshare-user-try`, (c) wrapper via Fabric config (no such field in 0.23.0), (d) credentials into sandbox env — all rejected.

**Verify (prd.json B1):** `rg -n '^## ADR-014: Away sandbox runtime$' .pi/artifacts/pi-template/DECISIONS.md && rg -n 'Away Sandbox Runtime|ADR-014' .pi/artifacts/pi-template/PLAN.md AGENTS.md` → exit 0 (DECISIONS.md:510 heading; PLAN.md:360 `### Away Sandbox Runtime (ADR-014)`; AGENTS.md:216 `**Away Sandbox Runtime (ADR-014).**`). PASS.

**Regression:** A1 16/16, A2 25/25 — live re-run on current bytes; the ADR-014 "A1/A2/A3-proven" claims hold. No code changed by B1 (doc/pin only).

**Next:** B2 (Immutable closure + resource limits — `.pi/away-runtime/closure.ts` + `resources.ts` + `confinement.test.ts`; cgroup-v2 systemd enforcement; TDD).

## B2 — Immutable closure + resource limits

**Files:** `.pi/away-runtime/closure.ts` (new), `.pi/away-runtime/resources.ts` (new), `.pi/away-runtime/confinement.test.ts` (new). 3-file cap honored (A1/A2 files unchanged — reused via import).

**Done — closure + cgroup primitives:**
- **closure.ts:** `canonicalize(p)` (rejects relative; realpathSync). `resolveClosure(manifestPath, laneId, opts?)` → `{manifestPath,laneId,inputs[],hash}`; inputs derived from manifest + repoRoot (`dirname(manifestPath)/..`): manifest, `exec_path_override` (wrapper), inner-guest.mjs (sibling), `extensions.lane_extension`, `pi_path`, node binary (`opts.nodeBinary ?? process.execPath`), `bwrap_path`, fabric runtime + child-source (`stripLineSuffix` strips `:NN`), `provider_source` (if non-null), `extraPaths`. Each input `{declared, canonical, exists, hash(sha256 file bytes|null)}`. `requireAll:true` throws if missing. `hash` = sha256 over sorted `(canonical,exists,hash)` tuples. `verifyClosure(manifestPath,laneId,expectedHash,opts?)` → `{ok,actual,expected,drift[]}` — FORCES `requireAll:false` (disappeared input = DRIFT, not throw); drift = disappeared inputs (or full set on content drift). Reused `bootstrap.ts` `loadManifest`.
- **resources.ts:** `buildCgroupArgs(limits)` → `["systemd-run","--user","--wait","--pipe","--collect","-p","TasksMax=<pid>","-p","MemoryMax=<mem>","-p","CPUWeight=<cpu>"]` (service mode; no `--scope`, unsuitable for long-running children). `buildSandboxSpawnArgs(limits,{realNode,libs,innerGuestPath,network,guestArgs,bwrapPath})` → `[...buildCgroupArgs,"--",bwrapPath,...buildBwrapArgs(...)]` (reuses A2 `buildBwrapArgs`: strict `--unshare-user`, never `--unshare-user-try`, `--die-with-parent`, `--clearenv`). `runInCgroup(limits,argv,opts?)` → spawnSync the FULL argv with `argv[0]` as command. `countFiles(dir)`, `measureDirBytes(dir)`, `listCgroupProcs(cgroupPath)`. **Documented:** bwrap `--size` rejected in setuid mode → hard storage = cgroup `MemoryMax` (tmpfs page cache charged → oom-kill, A3-proven); `cgroup_storage_bytes` + `max_file_count` = post-run accounting (quota-backed verification via countFiles/measureDirBytes, used by C2/C3 attestation), NOT a hard kernel limit.
- **B2 layering:** B2 cannot modify `executor-wrapper.mjs` (A2 file, outside cap), so resources.ts provides the cgroup-wrapping PRIMITIVE + the live test proves enforcement standalone. Wiring `runInCgroup`/`buildSandboxSpawnArgs` into the wrapper's actual spawn path (cgroup covers bwrap+inner) is a LATER wave (C1/C2) within their caps.

**Root cause + fix (live test bug):** generous/detached tests first returned status:1 with polkit `"Interactive authentication required"`. Root cause = `runInCgroup` called `spawnSync("systemd-run", args)` where `args` ALREADY began with `systemd-run` (from `buildCgroupArgs`) → bogus leading positional → malformed transient-unit start → polkit denial. The pids/mem tests passed as FALSE POSITIVES (they assert non-zero, which the polkit denial satisfied). Fix: `runInCgroup` now spawns `fullArgv[0]` + `fullArgv.slice(1)`; `buildCgroupArgs`/`buildSandboxSpawnArgs` unchanged (full argv with `systemd-run` first, per test contract `args[0]==="systemd-run"` and directly spawnable as `spawnSync(argv[0],argv.slice(1))`). After fix the generous test returns status 0, confirming systemd-run runs the unit correctly.

**Verify (prd.json B2):** `node --experimental-strip-types --test .pi/away-runtime/confinement.test.ts` → **19/19 pass** (2 consecutive runs identical; deterministic). Tests: closure resolve real manifest (3), canonical/symlink (2), requireAll (3), drift (2), buildCgroupArgs (2), buildSandboxSpawnArgs (2), quota (1), live cgroup enforcement (4: pids TasksMax=1 → node aborts via `uv_thread_create` 1.22s; mem MemoryMax=20M + `.fill(1)` → oom-kill 1.25s; generous MemoryMax=1G → completes 75ms; detached child reaped 91ms). PASS.

**Regression:** A1 16/16, A2 25/25 — live re-run on current bytes; B2 touched only `resources.ts` `runInCgroup` + the new files (A1/A2 files unchanged).

**Next:** B3 (Host-derived dispatch + staging — `.pi/away-runtime/dispatch.ts` + `staging.ts` + `dispatch.test.ts`; host-derived candidate paths + staging host tool; TDD).

## B3 — Host-derived dispatch and staging

**Files:** `.pi/away-runtime/dispatch.ts`, `.pi/away-runtime/staging.ts`, `.pi/away-runtime/dispatch.test.ts` (3-file cap honored).

**Done:**
- TDD RED→GREEN. RED: modules absent (`ERR_MODULE_NOT_FOUND`, 1 fail). Wrote `dispatch.ts` + `staging.ts` → 29/30 → fixed 2 test-harness bugs → 30/30.
- **dispatch.ts** (pure; no Fabric spawn — that is C1's launcher): `deriveProfile(phase, manifest)` maps a trusted `ControllerPhase` (`explore|research|implement|review|verify`) → one of the 5 fixed lane ids via the host-owned `PHASE_TO_LANE` table; unknown phase → `unknown profile` thrown before Fabric. `dispatch(phase, envelope, manifest)` strips `lane` from the untrusted envelope (host re-derives; a model-supplied lane value that is not a known lane id → `unknown profile`), then rejects every model-supplied capability field (`lane/model/provider/runner/extensions/tools/cwd/env/args/binaries/binary/risks/agents/approvals`) → `model-supplied capability rejected`. `resolveSourceView(repoRoot, requested, protectedPaths, runtimeProtectedPaths)` resolves a model-requested path against the read-only source root: rejects absolute paths, lexical path escape, escaping symlinks (per-component `realpathSync` walk), and protected/runtime-protected paths (file match or dir-prefixed entry, e.g. `.pi/prompts/`). `isProtected(relPath, …)` matcher + `normalizeRelative` helper exported.
- **staging.ts**: `reserveStagingPath(declaredRel, stagingRoot)` binds a declared write target to an EXACT reserved staging file under the inert staging root; rejects undeclared (empty), absolute, and path-prefix expansion (`..`). `stageWrite(reservation, content)` is atomic (temp file in same dir → `writeSync`+`fsyncSync` → `renameSync` → dir `fsyncSync`); the model cannot choose an arbitrary path — the reservation is host-bound. `WriterToken` is held for the lane run; `beginWrite`/`endWrite` track in-flight; `settle()` resolves once in-flight drains; `release()` (post-settlement) gates `commitStaged`/`discardStaged` (blocked while held); `beginWrite` after release is rejected (cancellation barrier). `commitStaged` atomically renames staged → real host destination; `discardStaged` unlinks staged scratch. `validateCandidates(candidates, reservations, stagingRoot)` validates post-run candidate paths+hashes against the reserved set before results are exposed (outside-reservations / missing / hash-mismatch rejected).
- **Verify gate literal cleanliness:** `dispatch.ts` contains none of `agents.run`, `agents.spawn`, `agents.handoff` (the prd `! rg -n 'agents\.run|agents\.spawn|agents\.handoff'` gate). Raw subagent dispatch is denied by listing the bare capability field `agents` in `MODEL_CAPABILITY_FIELDS` (the host firewall A2/C2 additionally denies non-bridge refs at the IPC layer). A node test reads `dispatch.ts` source and asserts the three literals are absent.

**NOTICED BUT NOT TOUCHING (A1 latent defect, out of B3 scope):** `bootstrap.ts` `CANONICAL_MANIFEST_PATH` uses `dirname(new URL(".", import.meta.url).pathname)` which (Node trailing-slash semantics) resolves one level too high → `repo-root/away-sandbox.json` instead of `.pi/away-sandbox.json`. The no-arg `loadManifest()`/`bootstrap()` default is therefore broken; A1/A2/A3/B2 tests pass because they pass explicit manifestPaths (computed via `import.meta.dirname`). `dispatch.test.ts` likewise passes an explicit path. This does not affect B3 correctness (the C1 launcher will pass explicit paths) but should be fixed in A1 if the no-arg default is ever relied upon.

**Test-harness bugs fixed:** (1) `loadManifest()` no-arg hit the A1 latent defect → passed explicit `join(import.meta.dirname, "..", "away-sandbox.json")`. (2) The verify-gate test used the same trailing-slash `dirname(URL)` expression → resolved to `.pi/dispatch.ts` (ENOENT); switched to `import.meta.dirname`. Removed the now-unused `resolve`/`dirname` (node:path) imports.

**Verify (prd.json B3):** `node --experimental-strip-types --test .pi/away-runtime/dispatch.test.ts && ! rg -n 'agents\.run|agents\.spawn|agents\.handoff' .pi/away-runtime/dispatch.ts` → **PASS**. Tests: 30 (deriveProfile phase→lane mapping 3, lane role refs 1, unknown phase 1, PHASE_TO_LANE completeness 1, dispatch lane-strip 2, model-supplied-unknown-lane 1, model-supplied-capability 1, isProtected 1, resolveSourceView normal 1, path-escape 1, absolute 1, symlink-escape 1, protected 1, reserveStagingPath 4, stageWrite 2, validateCandidates 4, WriterToken 4, verify-gate-literal-cleanliness 1). 2 consecutive runs identical (deterministic). Gate-clean confirmed.

**Regression:** A1 16/16, A2 25/25, B2 19/19 — live re-run on current bytes; B3 added only the 3 new files (A1/A2/B2 files unchanged).

**Next:** C1 (Dedicated Pi RPC lane launcher — `.pi/away-runtime/launcher.ts` + `rpc.ts` + `launcher.test.ts`; raw-buffer LF-only RPC parser; start Pi from inert control cwd with exact A1 argv/env; bind one immutable profile to one single-use lane process; pins `process.execPath` via trusted preload; rejects reload/project-resource loading/model switching/profile reuse; deterministic fake-provider settlement).

## C1 — Dedicated Pi RPC lane launcher

**Files:** `.pi/away-runtime/launcher.ts`, `.pi/away-runtime/rpc.ts`, `.pi/away-runtime/launcher.test.ts` (3-file cap honored).

**Done:**
- TDD RED→GREEN. RED: `ERR_MODULE_NOT_FOUND` for `rpc.ts` (modules absent). Implemented `rpc.ts` (framing) → 26/28 → fixed oversized-line check + real event-shape extraction → 28/28 → added `RpcDispatcher` (wrong IDs + early exit) per plan §C1 step 1 → 34/34.
- **rpc.ts** = raw-buffer LF-only parser mirroring pi's `modes/rpc/jsonl.js` framing exactly: `RpcFramedReader` uses `StringDecoder("utf8")` for chunked UTF-8, splits ONLY on `\n` (U+2028/U+2029 inside JSON strings are NOT separators — deliberately not Node readline), strips exactly ONE trailing `\r` (CRLF tolerance; bare `\r` preserved), rejects oversized COMPLETE records (line length > maxRecordBytes → error + continue) AND unterminated-oversized records (post-loop buffer check), flushes a trailing unterminated record on `end()`. `parseRpcLine` returns the object for valid JSON objects, null for non-JSON / non-object (non-JSON lines ignored, not fatal — mirrors rpc-client.js `catch{}`). `serializeCommand(cmd)` → `${JSON.stringify(cmd)}\n` buffer. `RpcDispatcher` (parser-level consumer): resolves pending command promises on matching response ids, surfaces unknown-id responses as `wrongId` (never fatal), streams non-response records as `event`, and rejects every still-pending command with an `rpc: stream closed before response (early process exit)` error when the stream closes (oversized frame → reader error → dispatcher close → pending rejected).
- **launcher.ts**: `launch(opts)` → `Launcher{argv, env, execPathPin, controlCwd, closureHash, markUsed, assertUnused, assertCommandAllowed, send, run, events}`. Reuses A1 `bootstrap()` for the exact argv/env/controlCwd/fabric.json + B2 `resolveClosure()` for the closure hash. **execPath pin:** writes `<controlCwd>/.away-execpath-preload.mjs` (`process.execPath = <wrapper>`) and sets `env.NODE_OPTIONS = --import <preload>` (default `pinExecPath:true`) — the A2/A3-proven writable-execPath seam (pi is a node script, so the preload reassigns `process.execPath` to the trusted wrapper before pi/Fabric boots); `pinExecPath:false` skips it (used by the integration test, which tests the rpc settlement path, not the sandbox). **closure gate:** `resolveClosure(requireAll:false)` then hard-checks the CRITICAL inputs (everything EXCEPT the `lane_extension` C2 forward ref — it still contributes to the hash so its later appearance registers as drift, but does not block launch at C1); missing critical input → `closure: missing required input: ...`. **command gate (default-deny):** `ALLOWED_COMMANDS = {prompt, abort, steer, follow_up, get_state, get_available_models, get_available_thinking_levels, get_session_stats, get_messages, get_commands, get_last_assistant_text}`; everything else (set_model, cycle_model, switch_session, new_session, bash, compaction, ...) → `forbidden command (immutable profile): <type>` before reaching pi. **single-use:** `run()` throws if already used, sets `used=true` in `finally` (so a consumer throw still marks consumed + waits for exit, never orphans the lane process). `run(cb)` spawns pi with `argv[0]`+`argv.slice(1)` in controlCwd with the built env + `stdio:[pipe,pipe,pipe]`, wires `RpcDispatcher` on stdout (events → queue/waiters; `end` → drain waiters), closes stdin on cb completion (pi shuts down on EOF per rpc-mode.js), waits for exit. `events()` async iterator backed by eventQueue + waiters (done when procExited + queue empty).
- **launch() reuses, does not duplicate:** A1 `bootstrap()` (argv/env/controlCwd/fabric.json/repoRoot), A1 `loadManifest()` (manifest refs for execPathPin + lane_extension), B2 `resolveClosure()` (closure hash + inputs), A2 `executor-wrapper.mjs` (the pinned execPath target — referenced, not imported). No new version pins, no new manifest fields.

**Real-event-shape discovery (the mid-run correction):** pi streams `message_update` events carrying an `assistantMessageEvent` field (NOT `partial.text`): `text_delta` → `.assistantMessageEvent.delta`; `text_end` → `.assistantMessageEvent.content`; the final assistant `message_end` → `message.content[0].text`. The integration test extracts text from all three. (The b12 grounding described "message_update(text_delta ...)" without the exact field; the live dump confirmed `assistantMessageEvent` is the carrier.)

**Verify (prd.json C1):** `node --experimental-strip-types --test .pi/away-runtime/launcher.test.ts` → **PASS**. Tests: 34 (rpc framing 8, parseRpcLine 3, serializeCommand 1, RpcDispatcher wrong-IDs+early-exit 6, launcher construction 8, single-use+gate 6, real-pi-fake-provider settlement 1 + 1 skip guard). 2 consecutive runs identical (deterministic, ~34s incl. real pi). The integration test spawns real pi 0.81.1 in an inert temp control cwd with a `-e` fake-provider fixture (inline `EventStream` yielding a fixed "A3_OK" assistant message) + a noop lane extension + a synthetic manifest (faux provider, exec_path_override/pi_fabric_path pointed at absolute real paths so the closure resolves; `pinExecPath:false`), sends a `prompt` over rpc.ts, collects events until `agent_settled`, and asserts the deterministic "A3_OK" reply arrived via `assistantMessageEvent.delta`/`.content` + final `message.content[0].text`.

**Regression:** A1 16/16, A2 25/25, B2 19/19, B3 30/30 — live re-run on current bytes; C1 added only the 3 new files (A1/A2/B2/B3 files unchanged).

**NOTICED BUT NOT TOUCHING (carried from B3):** `bootstrap.ts` `CANONICAL_MANIFEST_PATH` trailing-slash latent defect (no-arg default resolves one level too high). C1's launcher passes explicit manifestPaths (via the test) / will receive them from the C1+ controller, so it is unaffected; the C1 launcher does NOT rely on the no-arg default. Fix remains an A1 follow-up.

**Next:** C2 (Lane extension, host tools, and attestation — `lane-extension.ts` + `attestation.ts` + `lane-extension.test.ts`; register uniquely-named `away_*` tools, deny ordinary write/shell/agent/compaction/schema refs; validate every arg against profile+reservation; staged atomic writes w/ in-flight barrier; fsync terminal evidence before Fabric success; reject settlement while bridge work or sandbox processes remain active).

---

### A1/C1 bugfix — synthetic fabric config was inert (deviation, applied before C2)

**Operator decision (this session):** trust the inert control cwd (vs env-only config). Surface cause: operator opened `.pi/fabric.json` and asked whether fabric config belongs in the extension rather than the project root.

**Root cause — three coupled defects in A1 `bootstrap.ts`, all making the synthetic fabric config inert (the whole away-sandbox's `fullCodeMode`/`capture.risks`/`keepVisible` was not applied; under the A1 argv shape `getAllTools()` returned `[]` — no `fabric_exec` at all):**
1. `--no-extensions` keeps ONLY explicit `-e` paths (`pi resource-loader.js:267`) and drops the `packages`-discovered `npm:pi-fabric`, so `fabric_exec` never registered. Fix: add explicit `-e <repoRoot>/<pi_fabric_path>/dist/index.js` (package main). **Live-proven:** with the A1 shape `getAllTools()=[]`; adding `-e pi-fabric` → `getAllTools()=["fabric_exec"]`.
2. `bootstrap.ts` wrote the synthetic fabric.json to `join(controlCwd,"fabric.json")` (bare root). pi-fabric reads ONLY `<agentDir>/fabric.json` (global) or `<cwd>/.pi/fabric.json` (project, `pi-fabric dist/config.js:376,380`), never the bare root. Fix: write to `join(controlCwd,".pi","fabric.json")` + `mkdirSync(<controlCwd>/.pi)`.
3. The project fabric.json is read only when `projectTrusted` (`config.js:379`). A1 used `--no-approve` → `projectTrustOverride=false` (`pi args.js:166`) → untrusted → project config skipped, only global applied. Fix: `--approve` → `projectTrustOverride=true` → `resolveProjectTrusted` returns it before any UI prompt (`pi dist/core/project-trust.js:19`), non-interactive. The control cwd is host-owned + inert (only this fabric.json), so trusting it is safe; `--approve` does not hang/install/fail there (C1 integration test confirms: clean 2.6s settlement). The per-lane-`PI_CODING_AGENT_DIR` alternative was rejected: it relocates `auth.json` (`config.js:429`) and breaks the A3-proven Makora credential path.

**This is the "version-coupled behavior to confirm at A2/A3" that A1 flagged and A2/A3 never actually confirmed** (A2 tested `tools.call` directly; A3 tested Makora + bwrap, not config loading). ADR-014 makes no `--no-approve`/`-e`/argv claim, so no ADR/PLAN/AGENTS change is needed.

**Files (4 — cross-task bugfix, recorded as a deviation from the per-task 3-file cap):** `.pi/away-runtime/bootstrap.ts` (`buildArgv`: `--no-approve`→`--approve` + `-e pi-fabric` first; `bootstrap()`: fabric.json path→`.pi/fabric.json` + mkdir), `.pi/away-runtime/bootstrap.test.ts` (`--approve`; writer `-e` count 2→3 incl pi-fabric; reviewer `-e` count 1→2), `.pi/away-runtime/launcher.test.ts` (`--no-approve`→`--approve` assertion + comment), `.opencode/artifacts/away-sandbox-runtime/progress.md`.

**Verify:** `bootstrap.test.ts` 16/16, `launcher.test.ts` 34/34 (incl. real-pi integration: `--approve` + now-loaded pi-fabric + `.pi/fabric.json` at the read path settles `A3_OK` deterministically). Regression: A2 25/25, B2 19/19, B3 30/30 — unchanged (they don't use bootstrap argv/fabric.json path). Total 124/124 across away-runtime suites.

**Verification scope note:** the config-VALUES-applied question (capture.risks routing `away_*` via `tools.call`) is a D1 integration proof; it is not distinctly observable here because the global `~/.pi/agent/fabric.json` already sets `fullCodeMode:true` + `keepVisible:["fabric_exec"]` (matching the synthetic config's observable fields) and `--tools fabric_exec` masks the capture distinction in `getAllTools()`. The config-read is a direct source chain (`config.js:380` read ← `config.js:379` trust ← `args.js:163` `--approve` ← `project-trust.js:19` override); C1 confirms pi loads + settles under the corrected argv. D1 tests the capture routing end-to-end.

**Next:** C2 (Lane extension, host tools, and attestation — `lane-extension.ts` + `attestation.ts` + `lane-extension.test.ts`; register uniquely-named `away_*` tools, deny ordinary write/shell/agent/compaction/schema refs; validate every arg against profile+reservation; staged atomic writes w/ in-flight barrier; fsync terminal evidence before Fabric success; reject settlement while bridge work or sandbox processes remain active).

### C2 — Lane extension, host tools, and attestation

**Files (committed <TBD>):**
- `.pi/away-runtime/lane-extension.ts` (new) — `createLaneExtension(ctx)` factory + `default registerAwayLane(pi)` entrypoint.
- `.pi/away-runtime/attestation.ts` (new) — extension-side terminal attestation (allowlisted-key receipt, atomic fsync, wrapper-receipt reader).
- `.pi/away-runtime/lane-extension.test.ts` (new) — 35 tests across 8 suites.
- `.pi/away-runtime/confinement.test.ts` (modified — cross-task stale-check fix; see deviation below).

**Done:**
- `createLaneExtension(ctx)` loads the manifest, derives the lane profile + its `host_call_refs` allowlist, and registers ONLY the lane's allowlisted `away_*` tools (per-lane firewall at registration). Ordinary write/shell/agent/compaction/schema refs are NEVER registered (the A2 wrapper's ref-filter is the second layer at the IPC boundary).
- Every tool validates its args: `validateParams` rejects any key outside the per-tool allowlist (so model-supplied capability fields — `mode`, `recursive`, `force`, `argv`, `args`, `shell`, `command`, `model`, `lane`, `tools`, `agents`, … — are uniformly rejected); `requireString` rejects missing/empty.
- `away_read`/`away_list`/`away_search`: read-only source view via B3 `resolveSourceView` (rejects absolute/escape/symlink/protected). `away_search` is a bounded `statSync` walk capped by `manifest.limits.max_file_count`, matches truncated at 100.
- `away_stage_write`: rejects protected targets + path-prefix expansion; `token.beginWrite`/`endWrite` bracket the atomic `stageWrite` (in-flight mutation barrier); stores the reservation in a per-run `Map<rel, Reservation>`.
- `away_commit_staged`/`away_discard_staged`: B3 `commitStaged`/`discardStaged` enforce the settlement gate (`assertSettled` → "writer token held" while not released); commit moves staged → `repoRoot/rel` (host-controlled dest), rejectIfProtected at commit time too.
- `away_run_verify`: accepts a `commandId` only; rejects model-supplied `argv`/`args`/`shell`/`command`; validates `commandId ∈ ctx.commandCatalog` when a catalog is bound. Execution deferred to C3 (verifier.ts + command-catalog.ts).
- `away_attest`: single-use (`attested` flag → "already attested (stale nonce)" on second call); rejects while `token.inFlight > 0` ("bridge work in flight"); requires the wrapper to have fsynced its receipt for THIS lane with `fsynced:true` (`readWrapperReceipt`, else "wrapper has not fsynced terminal evidence (sandbox active)"); validates `outcome ∈ {completed,failed,aborted}`; builds the terminal receipt (profile/closure/childSourceDigest hashes + limits + outcome + wrapperReceiptPath/wrapperFsynced) and fsyncs it via `writeTerminalAttestation`.
- `attestation.ts`: receipt key set is an ALLOWLIST (`assertReceiptSafe` rejects any key outside it — no prompts/source/credentials/logs can be smuggled); atomic write+fsync+rename+dir-fsync; filename prefix `extension-receipt-` (distinct from the wrapper's `attest-`); `readWrapperReceipt` finds the lex-greatest `attest-*.json` matching `lane + fsynced:true`.

**Deviation (cross-task stale-check fix, recorded):** landing C2's `lane-extension.ts` made the real-manifest closure resolve the lane-extension input as present+hashed, superseding the B2 assertion `confinement.test.ts:246-247` ("lane-extension absent at B2"). Per AGENTS.md "a failing check may encode a superseded decision," the check was stale, not the change: updated the real-manifest test to assert lane-extension is present+hashed (C2 resolved the forward ref). The fixture-based test (`confinement.test.ts:328`, `makeFixture({laneExtMissing:true})`) — which genuinely proves `requireAll:false` tolerates an absent forward ref — is unchanged. This is a 5-file C2 commit (3 new C2 + the stale-check fix + progress.md); the 3-file cap is for new task deliverables, and the stale-check fix is the mandatory same-change encoding update (AGENTS.md Verification).

**Verify:** `lane-extension.test.ts` 35/35 (deterministic across 2 runs). Full regression 159/159 (A1 16, A2 25, B2 19, B3 30, C1 34 incl. real-pi, C2 35). `node --experimental-strip-types --test .pi/away-runtime/*.test.ts` clean.

**NOTICED BUT NOT TOUCHING:** full capture-routing end-to-end (model calls `tools.call({ref:"away_read"})` → Fabric `fabric.$call` → captured `away_read` execute → result) is a D1 integration proof, not distinctly observable in C2's isolation tests (C2 registers + tests the tools as a module; pi's `pi.registerTool` capture under `fullCodeMode:true` + the A2 wrapper ref-filter are the layers D1 exercises live).

**Next:** C3 (Candidate verifier sandbox — `verifier.ts` + `command-catalog.ts` + `verifier.test.ts`; accept command IDs never model-supplied argv; immutable exact-OID evidence tree without `.git`/hardlinks; quota-bounded writable execution clone; mount deps+defs read-only; pre/post manifest comparison; bind OID+commandID+manifests+limits+exitResult into the verifier receipt).

## C3 — Candidate verifier sandbox

**Files:**
- `.pi/away-runtime/command-catalog.ts` (new)
- `.pi/away-runtime/verifier.ts` (new)
- `.pi/away-runtime/verifier.test.ts` (new)

**Done:**
- `command-catalog.ts`: immutable host-owned `CommandCatalog` = `Record<id, CommandDef{id,binary,argv,cwd?}>`; `validateCatalog` (rejects non-objects, mismatched id/key, non-string binary/argv, dup ids); `lookupCommand` (throws `unknown command`); `hashCatalog` (sha256 of canonical sorted-key JSON). The catalog command's argv is in sandbox-mount coords (e.g. `/src/test.ts`); the model only ever supplies a `commandId` (C2 `away_run_verify` already rejects model-supplied argv/args/shell/command) — broker-controlled exact argv.
- `verifier.ts`:
  - `materializeEvidenceTree(repoPath, oid, destDir)`: `git archive <oid> | tar -x -C destDir` — exact-OID, NO `.git`, NO hardlinks (probed: extracted files get independent inodes; mutating the copy does not touch the source repo).
  - `buildManifest(dir, maxFiles)`: sha256 over sorted `(relpath, sha256(content))` of all regular files; bounded by maxFiles (throws if exceeded). `buildInputManifest({evidenceDir, catalogFile, depsDir, maxFiles})`: combined sha256 of evidence + catalog + deps (the inputs the pre/post comparison checks).
  - `buildVerifierBwrapArgs`: strict `--unshare-user` (never `--unshare-user-try`), `--unshare-pid/ipc/uts/net` (verifier: no network, ever), `--die-with-parent`; evidence tree bound ro at `/src` (a subdirectory, NOT `/` — binding it as `/` makes the rootfs read-only and bwrap cannot mkdir the mount points for the binary/libs/scratch binds), deps ro at `/deps`, the catalog DIRECTORY ro at `/catalog` (a dir bind so the whole tree is read-only — a file bind leaves the parent dir writable), writable scratch tmpfs at `/scratch` (quota-bounded by the wrapping cgroup `MemoryMax`), `--proc /proc --dev /dev --tmpfs /tmp`, `--clearenv --setenv PATH /usr/bin --setenv LANG C.UTF-8` (no credentials), `--chdir <cwd>`, `-- <commandBinary> <argv>`. The command runs as PID 1 in the PID namespace, so a detached descendant is SIGKILLed when the command exits (PID namespace destroyed) — no descendants survive.
  - `verify(opts)`: validate catalog + lookup commandId (rejects unknown + binary mismatch); write catalog to a host `catalog/` dir; materialize the exact-OID evidence tree; compute the pre input manifest; resolve the command binary's libs (`lddResolve`); run the command under a cgroup-wrapped strict bwrap (`runInCgroup` → `systemd-run --user --wait --pipe --collect -p TasksMax/MemoryMax/CPUWeight`); compute the post input manifest; `manifestMatch = pre === post`; outcome = completed (exit 0 + match) / aborted (signal/timeout) / failed (else); build + fsync the verifier receipt.
  - `VerifierReceipt` (allowlisted keys only — never prompts/source/credentials/logs): `schema:"away-verifier-receipt/1", oid, commandId, catalogHash, depsHash, preManifest, postManifest, manifestMatch, limits, exitStatus, exitSignal, outcome, timestamp`. `assertVerifierReceiptSafe` rejects extra keys + bad schema/outcome. `writeVerifierAttestation` atomic (temp+write+fsync+rename+dir-fsync), filename `verifier-receipt-<ts>-<rand>.json` (distinct from wrapper `attest-` + extension `extension-receipt-`). Command stdout/stderr are returned by `verify()` for diagnostics but NEVER persisted in the receipt.
  - Reuse (no duplication): `lddResolve` (executor-wrapper.mjs), `runInCgroup`/`buildManifest` accounting (resources.ts), `Limits` (bootstrap.ts), catalog (command-catalog.ts). The receipt's atomic-fsync pattern mirrors attestation.ts but with a verifier-specific key set (attestation.ts is a C2 file outside C3's cap; the verifier receipt needs OID/commandID/manifests/exitResult fields the C2 TerminalReceipt lacks).
- `verifier.test.ts` (29 tests): buildVerifierBwrapArgs (7: strict userns/no-try, unshare pid/ipc/uts/net + no share-net, die-with-parent+clearenv, evidence/catalog/scratch mounts, binary+libs binds, chdir+exact-argv, empty-argv reject); buildManifest+buildInputManifest (4: stable, content-change, maxFiles throw, combined-input); command-catalog (5: unknown throws, known def, bad argv, missing binary, hash stable+change); assertVerifierReceiptSafe (3: well-formed, extra key rejected, bad schema/outcome); materializeEvidenceTree (3: no-.git+exact-OID-content, independent-inodes+repo-untouched, bad-OID throws); verify real cgroup+bwrap (6: malicious-probe confinement [no creds/no net/no source mutation/no catalog mutation/scratch writable/manifestMatch/completed/descendant-reaped-fast], exit0 completed, exit3 failed, unknown commandId, binary mismatch, receipt fsynced+allowlisted-keys); verify-gate (1: no destructive git strings in verifier.ts).

**Verify:** `verifier.test.ts` 29/29 (deterministic across 2 runs). prd verify gate PASS (`node --test verifier.test.ts && ! rg -n 'reset --hard|clean -fd|rm -rf|force.push|branch -D' verifier.ts`). Full regression 188/188 (A1 16, A2 25, B2 19, B3 30, C1 34 incl. real-pi, C2 35, C3 29).

**Deviation (rootfs-vs-subdir binding + file-vs-dir catalog bind, resolved during TDD):** the first design bound the evidence tree as the sandbox ROOTFS (`/`). bwrap rejected it — `Can't mkdir parents for /home/.../node: Read-only file system` (and `Can't mkdir /scratch`) — because a ro rootfs blocks creating mount points for later binds. Reverted to the A2 pattern: evidence bound at `/src` (subdirectory), catalog bound as a DIRECTORY at `/catalog` (a file bind left the parent dir writable and the malicious probe could write `/catalog/x`; a dir bind makes the whole `/catalog` read-only). Both were diagnosed by reproducing the exact bwrap argv in /tmp + capturing stderr; both are real confinement properties (a candidate must not reach host paths via the rootfs or write the catalog tree), not test-only bugs.

**NOTICED BUT NOT TOUCHING:** the malicious-probe test proves confinement + descendant-reaping + completed-outcome in ONE real `verify()` call (the probe spawns a detached long-lived child then exits as PID 1; a surviving child would hang the cgroup `--wait` until the 20s test timeout → aborted, so returning fast + completed proves the child was SIGKILLed). Cgroup pid/memory ENFORCEMENT is already proven live in B2; C3 reuses `runInCgroup`. Full capture-routing end-to-end (the verifier invoked by a real `away_run_verify` host-call through Fabric capture) is D1.

**Next:** D1 (Hermetic sandbox integration — `integration.test.ts` + `fake-provider.ts` + `fixtures.ts`; real launcher + RPC parser + Fabric node-process runtime + wrapper + host-call firewall + staging + verifier; fake only provider output + clock; writer + reviewer profiles + external-scout no-filesystem; crash injection around wrapper startup/calls/writes/result-fsync/verifier-completion; no duplicate application / no surviving descendant / no protected-path change).
