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
