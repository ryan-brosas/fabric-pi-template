# PLAN — Depth-2 Lifecycle Routing (`depth-2-lifecycle-routing`)

**Status:** specified — executable; `/plan depth-2-lifecycle-routing` is recommended before `/ship` because this changes binding architecture.
**Discovery Level:** 3 — Deep research covered local surfaces, exact Fabric semantics, verification, OpenCode role adaptation, and adversarial review.
**Effective Review Level:** 3 — max(discovery 3, risk floor 3 for recursion, concurrency, capability routing, external evidence, and cross-subsystem lifecycle contracts).

## Problem Statement

The model tiers exist, but routing is contradictory and too broad. Binding authority says every worker is a `maxDepth:1` leaf and Main is the only scheduler (`AGENTS.md:89,106`), while live `.pi/fabric.json:20-22` currently permits depth 6, concurrency 32, and 16 children per execution. Lifecycle review children remain `recursive:false` Sol runs (`.pi/prompts/create.md:342-350`, `.pi/prompts/plan.md:414-423`, `.pi/prompts/verify.md:185-193`), and `/ship` routes implementation directly to Makora (`.pi/prompts/ship.md:181-204`).

Five broad audit workers recently terminated at 515k–618k cumulative tokens, and several Makora workers reached the 600000 ms timeout. Raising limits would amplify repeated context ingestion rather than fix routing.

## Goal

Use GPT-5.6 Sol for bounded lifecycle synthesis, supported by focused GPT-5.4 Mini leaves at depth 2; return that synthesis to Main for approval, then let Main route exactly one serial Makora GLM 5.2 implementation worker and finish with fresh Sol verification over host-derived evidence.

## Scope

### In scope

- Main at depth 0; recursive Lifecycle Sol at depth 1; nonrecursive Mini leaves at depth 2; reject depth 3.
- GLM remains a nonrecursive depth-1 sibling dispatched only by Main after Sol settles and Main approves the exact objective and 1–3-path envelope.
- GPT-5.4 Mini is the ordinary child default; Sol and GLM pass exact per-call parameters.
- Target at most five Mini launches per Sol phase through one fan-out call with no child retry; Main enforces this as a post-settlement lineage acceptance rule, while `maxConcurrent:5` and `maxPerExecution:5` are the available per-process/per-`fabric_exec` hard caps.
- Keep `maxTokensPerChild:500000` and `timeoutMs:600000`; control normal usage with compact packets, result/tool ceilings, and 1–3-file GLM tasks.
- Main owns guards, external retrieval, lifecycle writes, task/path approval, host checks, candidate intake, finding adjudication, and integration.
- OpenCode-inspired roles: Explore maps local evidence, Scout analyzes a Main-supplied external packet, Review reports evidence-ranked defects, Sol synthesizes, GLM implements.
- Read-only Sol prewalk for routed tasks, followed by a Main-owned explicit GLM handoff with no Main/Sol implementation mutation before it.
- Fresh Sol `/verify` run with no implementation transcript.
- Preserve ADR-011 review semantics: raw findings reach Main; Main reopens evidence; validated Critical/High findings and L2/L3 source obligations are dispositioned before progress.
- Reconcile config, prompts, canonical authority, managed boilerplate, generated packet facts, and structural checks.

### Out of scope

- Unbounded recursion, recursive production Mini/GLM workers, dynamic role/model selection, autonomous teams, or supervisor orchestration.
- Sol launching a writable child, parallel writers, writable `spawn`, multiple GLM runs at once, or a first implementation edit by Sol/Main.
- A cross-session write lock; one root per writable worktree remains policy-enforced.
- Mini access to MCP, Codex, browser, shell, write, mesh, or Fabric.
- Raising/disabling token limits, changing pi-fabric, compatibility shims, automatic prewalk, typed handoff schemas, or new lifecycle-state files.
- Roadmap, away-runtime, commit, push, or deployment changes.

## Observable Truths

1. Each routed lifecycle reasoning phase starts at most one recursive Sol worker at depth 1.
2. A Sol phase launches at most five Mini leaves total, retries included; every production Mini is nonrecursive at depth 2.
3. Mini Explore/Review are local read-only leaves; Mini Scout is packet-only with no tools.
4. Sol returns synthesis and raw findings to Main without mutation or writable dispatch.
5. Main validates completed statuses, cumulative budgets, raw findings, exact task, and path envelope before starting one GLM sibling.
6. GLM is the sole implementation writer; Main runs checks and derives candidates after it settles.
7. `/verify` uses a new Sol run/session with no implementation transcript; formal findings retain ADR-011 authority semantics.
8. Depth 3, unexpected models, over-budget results, failed partial text, and silent capability widening are rejected.
9. Config, AGENTS, init copies, canonical artifacts, prompts, tech stack, and state describe one topology.

## Proposed Solution

### Routing graph

```text
Main (depth 0; sole scheduler, authority, and integrator)
├─ Lifecycle Sol (depth 1; recursive, read-only phase reasoner)
│  ├─ Mini Explore (depth 2; local read-only leaf)
│  ├─ Mini Scout (depth 2; packet-only leaf)
│  └─ Mini Review (depth 2; local read-only leaf)
├─ GLM Implementer (depth 1; one serial writable leaf after Main approval)
└─ Fresh Verify Sol (new depth-1 run)
   └─ Optional bounded Mini Explore/Review leaves (depth 2)
```

The supervisor stays outside this tree and never dispatches.

### Runtime defaults and exact dispatch roles

- Disable automatic prewalk with an own, non-null, non-array, plain empty `prewalk:{}` object; use explicit Main-owned handoff only and record effective `/fabric prewalk --status` as off after reload.
- Set `subagents.extensions:false`, `model:"openai-codex/gpt-5.4-mini"`, `thinking:"max"`.
- Set `maxDepth:2`, `maxConcurrent:5`, `maxPerExecution:5`.
- Preserve `timeoutMs:600000` and `maxTokensPerChild:500000`.
- Lifecycle Sol: `runner:pi`, `model:openai-codex/gpt-5.6-sol`, `thinking:max`, `recursive:true`, effective `extensions:true`, native `read,grep,find,ls`, `worktree:false`.
- Mini Explore/Review: `runner:pi`, `model:openai-codex/gpt-5.4-mini`, `thinking:max`, `extensions:false`, `recursive:false`, `read,grep,find,ls`, `worktree:false`.
- Mini Scout: same Mini fields, but empty tools and packet-only input.
- GLM: `runner:pi`, `model:makora/zai-org/GLM-5.2-NVFP4`, `thinking:max`, `extensions:true`, `recursive:false`, `read,grep,find,ls,edit,write`, `worktree:false`; no shell/network.
- Formal non-fanout reviews remain fresh nonrecursive Sol unless a phase explicitly requires bounded Mini support.

Fabric 0.24.3 forces `extensions:true` and injects `fabric_exec` for recursive Pi (`.pi/npm/node_modules/pi-fabric/dist/subagents/manager.js:355-394,841-843`). Lifecycle Sol is therefore policy/audit constrained, not sandboxed. Its native tool allowlist and prompt prohibit write/execute/network/writable dispatch, and Main fingerprints the worktree before/after the Sol phase before any GLM starts.

### Mini fan-out bounds

`maxPerExecution` counts calls only inside one `fabric_exec` invocation (`dist/execution-service.js:68-80`) and resets on the next invocation. Pi-fabric 0.24.3 exposes no phase-scoped pre-launch counter, so this feature does not claim a host-enforced five-launch lifecycle ceiling.

The production contract is one Sol-authored Mini fan-out `fabric_exec` per phase and no child retry:

- Deep: five leaves.
- Standard: three leaves.
- Minimal: one leaf.
- Skip: no Mini.

Main rejects a settled lineage with more than five Mini descendants, but that audit occurs after spend. The larger real pre-settlement worst case is repeated five-child invocations until Sol reaches its 500000-token or 600000 ms guard; eliminating that requires a pi-fabric phase counter and is out of scope. A failed Mini is not retried: Main performs the missing analysis directly and records research as partial.

Only `status === "completed"` is usable. Explore/Review results must be ≤6 KiB, ≤4 tool calls, and ≤200k cumulative tokens; Scout is ≤6 KiB with zero tools. Failed/over-budget text is non-authoritative.

### Main approval boundary and deterministic `/ship` routing

Every writable run handles exactly one TODO task; a `/ship` invocation may process several tasks only as serial Main-controlled iterations.

- **Direct GLM:** exactly one existing file, Effective Review Level ≤1, no new file, no external/source uncertainty, no cross-file key link, and no security/concurrency/public-contract risk.
- **Sol prewalk then GLM:** every other task, including 2–3 files, new files, M/L/novel work, cross-file links, or Effective Review Level ≥2.

For routed work:

1. Main captures the candidate baseline and approves an immutable end state, exact 1–3 paths, non-goals, verification recipe, and cumulative Mini budget.
2. Lifecycle Sol runs read-only Mini work and returns its synthesis plus raw child findings/results; it cannot hand off or dispatch GLM.
3. Main reopens cited evidence, rejects invalid/over-budget results, dispositions Critical/High findings, and either approves an exact GLM task within the original envelope or stops.
4. Main schedules one explicit trajectory-preserving GLM handoff. The Main session already contains the settled Sol result, and the handoff task repeats the approved objective/path envelope.
5. After GLM settles, Main inspects host-derived bytes and worker logs, runs checks, and performs the current-byte ADR-011 review.

This preserves meaningful depth 2 for cheap evidence gathering while keeping writable scheduling and pre-mutation approval with Main.

### Evidence, audit, and single writer

Main supplies an external packet ≤8 KiB with question, exact-version relevance, source URL/path, access date, facts, conflicts, uncertainty, and path allowlist. Mini Scout has no tools. Installed 0.24.3 source outranks newer upstream `main`.

A no-write routing smoke records a structured `routing-smoke/1` evidence block in `PROGRESS.md`: parent relationships, inferred depths, models, statuses, usage totals, output bytes, tool-call counts, cumulative Mini launches/retries, expected depth-limit error, handoff completion, before/after fingerprint, and relevant Fabric audit refs. `agents.list({scope:"lineage"})` exposes nested records; nested run log paths derive from `dist/subagents/manager.js:95-119`, and worker event streams retain tool names (`dist/worker.js:572-624`). R1 must prove the audit payload exposes enough nested refs to reject Sol write/execute/network/writable-dispatch activity. If not, the feature stops.

Sol phase fingerprints must be identical because GLM has not started yet. Actual implementation runs then provide the writer proof: one GLM, allowed `edit/write` tools only, exact owned-path delta, no overlapping Main write. No synthetic scratch mutation or cleanup is required.

### Review and lifecycle confinement

- `/create`, `/plan`, and `/ship` preserve raw findings and require Main to reopen every cited `path:line`; validated Critical/High findings block or receive explicit evidence-backed disposition at all levels.
- At L2/L3, `source-check-required` blocks until Main supplies exact-version authority and reruns the review.
- `/verify` remains advisory by reviewer authority; independently validated defects still produce `NEEDS WORK` under Main.
- No reviewer certifies readiness or emits a score.
- Pre-`/create` `/research` is response-only. It writes `PROGRESS.md` only for an established namespace; project-memory writes remain explicit, distilled, and optional.
- `/ship` final review checks scope traceability, duplication, dead/unwired behavior, invented APIs, compatibility shims, error swallowing, and mock-only evidence.

## Success Criteria

### SC1 Authority and config before recursion

ADR-017, managed authority, target Fabric config, and structural checks are written while state is partial; the operator then reloads and refreshes ready state/tech-stack facts before any recursive smoke or migrated prompt executes.

**Verify:** three-way boilerplate/hash command in SC8; inspect task order `A1 -> B1 -> C1 -> B2 -> R1`.

### SC2 Bounded runtime defaults

Config resolves to depth 2, concurrency 5, five calls per `fabric_exec`, Mini ordinary defaults, 500k/600000 limits, and automatic prewalk off. The source check requires `prewalk` to be an own plain empty object; R1 records the effective post-reload status as off.

**Verify:** `node -e 'const c=require("./.pi/fabric.json"),s=c.subagents,p=c.prewalk,own=Object.prototype.hasOwnProperty.call(c,"prewalk");if(!own||p===null||Array.isArray(p)||typeof p!=="object"||Object.getPrototypeOf(p)!==Object.prototype||Object.keys(p).length||s.maxDepth!==2||s.maxConcurrent!==5||s.maxPerExecution!==5||s.extensions!==false||s.model!=="openai-codex/gpt-5.4-mini"||s.thinking!=="max"||s.maxTokensPerChild!==500000||s.timeoutMs!==600000)process.exit(1)'` and validate `prewalk_status:"off"` in the post-reload `routing-smoke/1` evidence.

### SC3 Exact depth and handoff evidence

A mutation-free smoke proves Sol depth 1, Mini depth 2, expected depth-3 rejection, all three exact models, root-visible GLM handoff completion, effective prewalk off, and unchanged fingerprint.

**Verify:** `models="$(pi --approve --list-models | awk 'NR>1 {print $1"/"$2}')"; printf '%s\n' "$models" | rg -qx 'openai-codex/gpt-5\.6-sol' && printf '%s\n' "$models" | rg -qx 'openai-codex/gpt-5\.4-mini' && printf '%s\n' "$models" | rg -qx 'makora/zai-org/GLM-5\.2-NVFP4' && bash .opencode/tool/structural-check.sh --validate-routing-evidence .pi/artifacts/depth-2-lifecycle-routing/PROGRESS.md`

### SC4 Mini acceptance bounds

Structured evidence shows the accepted lineage has ≤5 Mini launches and one fan-out call; every accepted Mini is completed and within numeric tool/output/token limits; failed text is non-authoritative. This is an audit acceptance bound, not a pre-launch phase counter.

**Verify:** `bash .opencode/tool/structural-check.sh --validate-routing-evidence .pi/artifacts/depth-2-lifecycle-routing/PROGRESS.md`

### SC5 Main approval and single writer

Each implementation run has a preapproved objective/path envelope, settled Sol phase, Main disposition, one GLM writer, exact owned-path delta, and no overlap.

**Verify:** `bash .opencode/tool/structural-check.sh --validate-routing-evidence .pi/artifacts/depth-2-lifecycle-routing/PROGRESS.md && git diff --check`

### SC6 Deterministic lifecycle routing and confinement

Prompts encode exact roles, route predicate, one-task-per-writable-run, response-only pre-create research, completed-only integration, and no Sol writable dispatch.

**Verify:** `bash .opencode/tool/structural-check.sh --lifecycle-routing`

### SC7 Review integrity and fresh verification

`/create`, `/plan`, and `/ship` preserve raw findings and Main dispositions; source obligations block at L2/L3; `/verify` starts fresh, remains advisory by reviewer authority, and writes nothing after final fingerprint.

**Verify:** `bash .opencode/tool/structural-check.sh --lifecycle-routing`

### SC8 Packet and regression hygiene

Managed copies match, ready state/hash is restored after reload/refresh, and changed bytes have no whitespace errors.

**Verify:** `node -e 'const fs=require("node:fs"),c=require("node:crypto"),a="<!-- pi:init:boilerplate:start -->",b="<!-- pi:init:boilerplate:end -->",x=p=>{const s=fs.readFileSync(p,"utf8"),i=s.indexOf(a),j=s.indexOf(b,i+a.length);return Buffer.from(s.slice(i+a.length,j))},v=[x("AGENTS.md"),x(".pi/prompts/init.md"),x(".opencode/artifacts/pi-native-init/boilerplate.md")];if(!v[0].equals(v[1])||!v[1].equals(v[2]))process.exit(1);const h=c.createHash("sha256").update(v[0]).digest("hex"),st=fs.readFileSync(".pi/state.md","utf8");if(!st.includes("initialization_status: ready")||!st.includes("context_reload_required: false")||!st.includes(h))process.exit(1)' && git diff --check`

### SC9 Objective generated-code quality

The final Main-adjudicated review finds no untraceable scope, duplicate router, dead/unwired behavior, speculative wrapper, invented API, compatibility shim, swallowed error, or mock-only acceptance evidence.

**Verify:** inspect current-byte `/ship` review dispositions in `PROGRESS.md`, then run `/verify depth-2-lifecycle-routing`.

## Technical Context

- Pi 0.81.1; Node 24.16.0; pi-fabric 0.24.3; exact Sol/Mini/GLM model keys (`.pi/tech-stack.md`).
- Depth and recursive injection: `dist/subagents/manager.js:284-394,841-843`.
- `maxPerExecution` is per Fabric execution: `dist/execution-service.js:68-80`.
- Handoff is deferred once per `fabric_exec`, returns executor completion, and terminates source inference: `dist/execution-service.js:209-220`, `dist/prewalk/handoff.js:44-91`, `dist/index.js:247-269`, `dist/fabric-exec-tool.js:520-578`.
- Run records expose status/model/turns/toolCalls/usage/nested records: `dist/subagents/types.d.ts`; nested logs and tool events: `dist/subagents/manager.js:95-119`, `dist/worker.js:572-624`.
- Upstream corroboration: `https://github.com/monotykamary/pi-fabric/blob/main/docs/agents.md` and `docs/configuration.md`; installed source wins.
- OpenCode role references: `.opencode/agent/{explore,scout,review,plan,build,general}.md`; do not copy shell access, auto-fixes, multiwriter batches, or context spillover.
- Live config moved concurrently to depth 6/concurrency 32/Sol defaults during discovery. `/ship` must re-read and preserve unrelated work.
- Broad Minis reproduced 500k failures; strict short-call retries completed around 52k–125k cumulative tokens.

## Affected Files

- `.pi/fabric.json`
- `.opencode/tool/structural-check.sh`
- `.pi/prompts/create.md`
- `.pi/prompts/research.md`
- `.pi/prompts/plan.md`
- `.pi/prompts/ship.md`
- `.pi/prompts/verify.md`
- `.pi/artifacts/pi-template/PLAN.md`
- `.pi/artifacts/pi-template/DECISIONS.md`
- `.opencode/artifacts/pi-native-init/boilerplate.md`
- `.pi/prompts/init.md`
- `AGENTS.md`
- `.pi/tech-stack.md`
- `.pi/state.md`

## Review Profile

- **Language/framework:** Markdown contracts, JSON config, Bash checks; Pi 0.81.1, Node 24.16.0, pi-fabric 0.24.3.
- **Local authorities:** `AGENTS.md`; ADR-009/010/011/012/013/016; canonical PLAN; this PLAN; ready-packet, review, and single-writer rules.
- **Required source packet:** installed 0.24.3 files cited in Technical Context; local OpenCode roles; version-mismatched upstream only as corroboration.
- **Required checks:** routing structural mode, numeric routing-evidence validator, model listing, no-write depth/handoff smoke, actual candidate writer evidence, three-way packet/hash gate, `git diff --check`, and fresh `/verify`.
- **Overlays:** architecture/capability safety, concurrency, token performance, exact-version correctness, and objective generated-code quality. Reject invented per-call token controls, duplicate routers, compatibility shims, hidden state, mock-only runtime proof, or sandbox claims.

## Tasks

### A1 [architecture] Record ADR-017 and canonical contracts

Canonical PLAN/DECISIONS define the corrected Main → Sol → Mini reasoning flow, Main approval boundary, Main → GLM write flow, exact limits, review semantics, and supersession of mutation-first prewalk.

- **criteria:** `[SC1, SC6, SC7]`
- **depends_on:** `[]`
- **parallel:** `false`
- **conflicts_with:** `[B1, C1, R1, L1, E1]`
- **files:** [`.pi/artifacts/pi-template/PLAN.md`, `.pi/artifacts/pi-template/DECISIONS.md`]
- **Verify:** `rg -n '^## ADR-017: Depth-2 lifecycle routing$' .pi/artifacts/pi-template/DECISIONS.md && rg -n 'Main approval boundary|Mini fan-out|read-only prewalk|fresh Verify Sol' .pi/artifacts/pi-template/PLAN.md`

### B1 [managed-authority] Synchronize managed routing authority

State transitions to partial/reload-required before fixture/init/AGENTS managed regions become byte-identical with ADR-017; no recursive execution occurs.

- **criteria:** `[SC1, SC8]`
- **depends_on:** `[A1]`
- **parallel:** `false`
- **conflicts_with:** `[A1, C1, B2, R1, L1, E1]`
- **files:** [`.pi/state.md`, `.opencode/artifacts/pi-native-init/boilerplate.md`, `.pi/prompts/init.md`, `AGENTS.md`]
- **serial_substeps:** set partial/reload-required first; update fixture and init source; update AGENTS last; stop.
- **Verify:** verify state is partial/reload-required and the three managed interiors are byte-identical; do not run lifecycle commands.

### C1 [config] Write target config and checks while packet is partial

Target `.pi/fabric.json` and routing/evidence check modes are written before reload so the next Pi context and generated tech stack observe the same topology.

- **criteria:** `[SC1, SC2, SC6]`
- **depends_on:** `[B1]`
- **parallel:** `false`
- **conflicts_with:** `[B1, B2, R1]`
- **files:** [`.pi/fabric.json`, `.opencode/tool/structural-check.sh`]
- **Verify:** run the SC2 source command only; no recursive smoke until B2 restores ready state.

### B2 [reload] Reload target config and restore ready packet

After the operator runs `/reload`, `/init --refresh` regenerates tech-stack facts from target config and writes ready/hash state last.

- **criteria:** `[SC1, SC2, SC8]`
- **depends_on:** `[C1]`
- **parallel:** `false`
- **conflicts_with:** `[B1, C1, R1]`
- **files:** [`.pi/state.md`, `.pi/tech-stack.md`]
- **Verify:** run SC8 exactly and confirm `/fabric prewalk --status` reports off; any partial/reload-required result blocks R1.

### R1 [runtime-proof] Prove bounded Fabric behavior after reload

Exact 0.24.3 runtime evidence covers depth, accepted Mini lineage, log/audit attribution, mutation-free Sol, depth rejection, effective prewalk off, three exact models, and root handoff before prompt migration.

- **criteria:** `[SC2, SC3, SC4]`
- **depends_on:** `[B2]`
- **parallel:** `false`
- **conflicts_with:** `[A1, B1, C1, B2, L1, E1]`
- **files:** [`.pi/artifacts/depth-2-lifecycle-routing/PROGRESS.md`]
- **Verify:** run SC2, SC3, and SC4 exactly. If audit refs cannot prove the no-write/no-network Sol phase, stop.

### L1 [lifecycle] Route create, research, and plan through Sol

Main retains guards/writes and ADR-011 dispositions while one recursive Sol runs at most one Mini fan-out; pre-create research stays response-only.

- **criteria:** `[SC4, SC6, SC7]`
- **depends_on:** `[R1]`
- **parallel:** `false`
- **conflicts_with:** `[R1, E1]`
- **files:** [`.pi/prompts/create.md`, `.pi/prompts/research.md`, `.pi/prompts/plan.md`]
- **Verify:** `bash .opencode/tool/structural-check.sh --lifecycle-routing`

### E1 [execution] Add Main-gated GLM routing and fresh verification

`/ship` applies the deterministic route, preapproves one task/path envelope, settles Sol before one Main-owned GLM run, records actual writer evidence, and `/verify` starts fresh after host checks.

- **criteria:** `[SC5, SC6, SC7, SC9]`
- **depends_on:** `[L1]`
- **parallel:** `false`
- **conflicts_with:** `[L1]`
- **files:** [`.pi/prompts/ship.md`, `.pi/prompts/verify.md`]
- **Verify:** `bash .opencode/tool/structural-check.sh --lifecycle-routing && bash .opencode/tool/structural-check.sh --validate-routing-evidence .pi/artifacts/depth-2-lifecycle-routing/PROGRESS.md`

### V1 [acceptance] Exercise all criteria on one fingerprint

Every SC check, current-byte L3 review/disposition, generated-code-quality review, and fresh `/verify` completes without a post-check mutation.

- **criteria:** `[SC1, SC2, SC3, SC4, SC5, SC6, SC7, SC8, SC9]`
- **depends_on:** `[E1]`
- **parallel:** `false`
- **conflicts_with:** `[]`
- **files:** `[]`
- **Verify:** run SC2, SC3, SC4, SC5, SC6, SC7, SC8, and SC9 in order against one unchanged candidate fingerprint.
## Risks

- Recursive Sol is policy/audit constrained, not sandboxed, because 0.24.3 forces Fabric.
- The five-Mini phase target is policy plus post-settlement audit, not a host pre-launch bound; repeated five-child Fabric invocations remain possible until the Sol token/time guard.
- Single writer remains a per-root policy, not an atomic worktree lock.
- Nested audit payload may be insufficient for write provenance; R1 fails closed if so.
- Token caps are global, not per-role; Mini acceptance limits apply after settlement.
- AGENTS changes require `/reload` plus `/init --refresh` before recursive work.
- Concurrent config/check edits require fresh reads and surgical integration.
- Any post-check write invalidates review/verification evidence.

## Spec Review Integration

Round 1 findings were accepted and integrated: authority now precedes recursive proof; exact-version handoff/log sources and runtime evidence are required; Main gates the GLM task after Sol settlement; Sol and GLM phases are separated for attributable fingerprints; ADR-011 dispositions and pre-create research confinement are explicit; route selection is deterministic; and every task maps to SC identifiers with numeric evidence validation.

Round 2 findings were accepted and integrated: config/check source now precedes reload/tech-stack refresh; the five-Mini target is explicitly audit-only because 0.24.3 has no cross-execution counter; `prewalk` must be an own plain empty object with post-reload status off; and model availability uses three independent exact assertions.

## Technical Gates

R1 must demonstrate that exact 0.24.3 lineage/log evidence exposes enough parent, model, status, usage, and nested Fabric audit detail to prove a mutation-free Sol phase and expected depth rejection. If not, stop and present an enforcement design rather than claiming host enforcement.

## Stop Conditions

- Authority is not reloaded/ready before R1.
- Exact 0.24.3 cannot prove depth rejection, log/audit attribution, model resolution, or root-visible handoff completion.
- The design would require pi-fabric changes, wider Mini capabilities, Sol writable dispatch, shell/network GLM, depth 3, or multiple writers.
- Managed copies diverge, a source obligation remains unresolved, or concurrent owned bytes change.