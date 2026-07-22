# Proactive Supervisor Implementation Plan

> **For Claude:** Implement this plan task-by-task.

**Goal:** Reliably obtain advisory senior-engineering direction before lifecycle transitions, with Main-mediated `gpt-5.4-mini` research while the supervisor remains `extensions:false`, read-only, and unable to dispatch.

**Discovery Level:** 3 — architectural behavior, ADR supersession, lifecycle coordination, and version-specific Fabric actor semantics.

**Effective Review Level:** 3 — cross-subsystem authority and concurrency contract.

**Context Budget:** Three child plans, each targeting ~40-50% context.

---

## Research Corrections to the Current PRD (A1 must apply)

1. Replace best-effort `agent_settled` boundary inference with the user-approved explicit blocking handshake.
2. Cover `/create -> /ship`, `/research`, and namespace-dependent research transitions.
3. Replace invalid `agents.tell(supervisorId, results)` positional call with object-form `agents.ask({id,message,data})`.
4. Direct protocol responses must use `action:"silent"` with structured `data`; otherwise `delivery:"steer"` forwards unvalidated responses to Main before `ask` resolves (`manager.js:734-758`).
5. Preserve the ABSOLUTE **never dispatches** rule — not merely "never dispatches writable work."
6. Remove the unsupported "yield automatically" claim; Fabric uses one FIFO semaphore (`semaphore.js:1-53`, `manager.js:214`).
7. Validate `gpt-5.4-mini` resolves and run an observational protocol smoke.
8. Project-pinned Fabric `0.23.0` is authoritative (`.pi/settings.json:6`, `.pi/npm/...`). The global user store contains `0.23.1`; do not implement from that version's behavior without confirming parity.

---

## Must-Haves

### Observable Truths

1. After `/create`, `/plan`, `/research`, or `/ship` completes, Main attempts the supervisor handshake before reporting or entering the next phase.
2. The supervisor can return no advice, direct direction advice, or one bounded research request.
3. A research request launches exactly one read-only `gpt-5.4-mini` child and returns a correlated, sanitized summary to the same session-local actor.
4. No unvalidated protocol response is automatically steered into Main.
5. The supervisor remains `extensions:false`, read-only, non-recursive, unable to dispatch, edit, integrate, or mutate lifecycle state.
6. Supervisor advice remains advisory; independently confirmed Critical/High defects and binding-authority violations retain their existing blocking semantics under Main.
7. ADR-011 review gates remain closers auditing finished artifacts; ADR-012's supervisor handshake is the opener for what comes next.

### Required Artifacts

| Artifact | Provides | Path |
|---|---|---|
| Corrected binding specification | Explicit handshake and protocol contract | `.opencode/artifacts/proactive-supervisor/spec.md` |
| Corrected executable graph | Seven-task A-C graph and validators | `.opencode/artifacts/proactive-supervisor/prd.json` |
| Implementation plan | TDD task steps and dependency waves | `.opencode/artifacts/proactive-supervisor/plan.md` |
| Supervisor behavior | Ambient and direct-message protocol instructions | `.pi/prompts/supervise.md` |
| Create boundary producer | Post-review handshake | `.pi/prompts/create.md` |
| Plan boundary producer | Post-review handshake | `.pi/prompts/plan.md` |
| Research boundary producer | Namespace-aware handshake | `.pi/prompts/research.md` |
| Ship boundary producer | Post-close handshake before output | `.pi/prompts/ship.md` |
| Authority decision | ADR-012 and ADR-008 forward reference | `.pi/artifacts/pi-template/DECISIONS.md` |
| Canonical runtime contract | Protocol, routing, authority, failure behavior | `.pi/artifacts/pi-template/PLAN.md` |
| Operator constitution | Main/supervisor responsibilities | `AGENTS.md` |
| Synchronized summaries | Model wiring and project status | `.opencode/{tech-stack,roadmap,state}.md` |

### Key Links

| From | To | Via | Primary risk |
|---|---|---|---|
| Lifecycle prompt | Supervisor actor | Exact local ID + `agents.ask` | Wrong/remote actor targeted |
| Supervisor response | Main protocol driver | `action:"silent"` + versioned `data` | Unvalidated response auto-delivered |
| Research request | Mini gatherer | Exact `agents.run` contract | Capability widening or wrong model |
| Mini result | Supervisor | Second correlated `agents.ask` | Mismatched/stale request |
| ADR-011 closer | ADR-012 opener | Ordered prompt phases | Advice arrives after next phase starts |
| Actor definition | Safety boundary | `extensions:false` + exact tools | Supervisor gains Fabric recursion |
| Validated advice | Main authority | Worker Distrust disposition | "Advisory" incorrectly bypasses a real blocker |

---

## Protocol Contract (proactive-supervisor/v1)

### Phase-complete request (Main -> supervisor, round 1)

```text
agents.ask({
  id,                                   // session-local supervisor actor id; never canonical name over mesh
  message,
  data: {
    protocol: "proactive-supervisor/v1",
    kind: "phase-complete",
    requestId,                          // unique per boundary
    slug,
    completedPhase,                     // "create" | "plan" | "research" | "ship"
    candidateNextPhases,                // namespace-state-derived (see spec)
    namespaceState,                     // "absent" | "established" | "partial"
    artifactPaths,
    allowedPaths                        // explicit non-secret allowlist
  }
})
```

### Direct actor responses (always `action:"silent"`)

```text
action: "silent"
data: {
  protocol: "proactive-supervisor/v1",
  requestId,                            // must match the request
  kind: "no-advice" | "direction-steer" | "research-request",
  ...                                   // direction-steer: {direction}; research-request: {topic, focus, scope}
}
```

`action:"message"` is RESERVED for ambient `agent_settled`/`tool_error` steering only. Using it for
direct protocol replies auto-delivers unvalidated advice before `ask` resolves (`manager.js:734-758`).

### Research dispatch (Main -> gpt-5.4-mini, at most one per boundary)

```text
agents.run({
  task:   "<bounded role (scout/explore) and question; encode role in task; no role field>",
  name:   "supervisor-research-<phase>",
  runner: "pi",
  model:  "openai-codex/gpt-5.4-mini",
  thinking: "max",
  extensions: false,
  recursive: false,
  tools:  ["read", "grep", "find", "ls"],
  worktree: false
})
```

Only `status === "completed"` counts as successful research. Synthesize a summary <=8 KiB, with cited
paths, no raw logs/credentials/secret-bearing content.

### Research feedback (Main -> supervisor, round 2)

```text
agents.ask({
  id,
  message,
  data: {
    protocol: "proactive-supervisor/v1",
    kind: "research-result",
    requestId,                          // same as round 1
    status,                             // "completed" | "failed"
    summary,                            // <=8 KiB sanitized
    sources                             // path list
  }
})
```

Actor returns `action:"silent"` with final `direction-steer` or `no-advice`. Main validates and
surfaces accepted advice itself.

Unknown kinds, protocol mismatches, or requestId mismatches are ignored with a warning.

---

## Dependency Graph

```text
A1 Correct spec/PRD + write plan.md
  └─> A2 Supervisor protocol (supervise.md)
       └─> B1 Create/plan handshakes
            └─> B2 Research/ship handshakes
                 └─> C1 ADR-012 + AGENTS + PLAN
                      └─> C2 Project summaries
                           └─> C3 Static/runtime verification
```

All waves are serial (one writable run per worktree).

---

# Plan A — Binding Contract and Supervisor

## Task A1 — Correct the specification and PRD; write plan.md

**Files:**
- `.opencode/artifacts/proactive-supervisor/spec.md`
- `.opencode/artifacts/proactive-supervisor/prd.json`
- `.opencode/artifacts/proactive-supervisor/plan.md`

**Needs:** Settled baseline `dd0bf96`.
**Creates:** Corrected seven-task contract and plan on disk.

### TDD steps

1. **RED:** Prove the existing graph was still six tasks and lifecycle prompts remain protected (pre-edit snapshot).
2. **RED:** Confirm the old spec contained ambient-boundary inference and the invalid positional feedback call.
3. Rewrite spec.md around the explicit handshake, `proactive-supervisor/v1`, and the silent-response rule.
4. Replace the PRD graph with seven tasks (A=2, B=2, C=3); move create/plan/research/ship to write_paths; keep verify.md protected.
5. Write plan.md to disk (this plan).
6. Keep `.active` = `proactive-supervisor` (do not touch in this task — `.active` was re-pointed at /create).

### Verify

```bash
test "$(cat .opencode/artifacts/.active)" = 'proactive-supervisor'
node -e 'const p=require("./.opencode/artifacts/proactive-supervisor/prd.json");const ids=new Map(p.tasks.map((t,i)=>[t.id,i]));const counts={};if(p.tasks.length!==7||ids.size!==7)process.exit(1);for(const [i,t] of p.tasks.entries()){if(t.files.length>3)process.exit(1);counts[t.child_plan]=(counts[t.child_plan]||0)+1;for(const d of t.depends_on){if(!ids.has(d)||ids.get(d)>=i)process.exit(1)}}if(counts.A!==2||counts.B!==2||counts.C!==3)process.exit(1)'
! rg -n 'consistent with ADR-008|ambient event snapshot indicates' .opencode/artifacts/proactive-supervisor/spec.md
rg -n 'Explicit Boundary Handshake|proactive-supervisor/v1|action:"silent"' .opencode/artifacts/proactive-supervisor/spec.md
git diff --check
```

**Risk:** Editing from the obsolete six-task graph makes later verification meaningless.

---

## Task A2 — Implement the supervisor-side protocol (supervise.md)

**Files:** `.pi/prompts/supervise.md`

**Needs:** A1.
**Creates:** Protocol-aware, still read-only supervisor.

### TDD steps

1. **RED:** Confirm `### Boundary-Proactive Direction Steer` and `### Main-Mediated Research Protocol` headings do not exist.
2. Read the canonical actor block fresh; preserve every configured field (model/tools/events/responseMode/extensions/delivery/triggerTurn).
3. Update the embedded instructions:
   - retain reactive drift/blocker/missing-verification behavior;
   - recognize direct `phase-complete` and `research-result` envelopes;
   - use `action:"silent"` for every direct protocol response;
   - use `action:"message"` only for ambient reactive steering;
   - reuse protocol `proactive-supervisor/v1` and requestId;
   - allow one research request per boundary;
   - remain direction-focused, never artifact-audit focused.
4. Preserve EACH hard limit independently: never dispatch (absolute), never edit, never integrate, never mutate lifecycle state, never certify readiness, never self-stop.
5. Add the two new sections after the canonical instructions, before Reconcile Algorithm.
6. Keep the actor configuration block unchanged.

### Verify

```bash
rg -n '^### Boundary-Proactive Direction Steer$' .pi/prompts/supervise.md
rg -n '^### Main-Mediated Research Protocol$' .pi/prompts/supervise.md
rg -n 'Main-mediated|proactive-supervisor/v1|action:"silent"' .pi/prompts/supervise.md
! rg -n 'steers Main ONLY on material drift' .pi/prompts/supervise.md
rg -ni 'never dispatch' .pi/prompts/supervise.md
rg -ni 'never.*edit|never edit' .pi/prompts/supervise.md
rg -ni 'never certify' .pi/prompts/supervise.md
rg -ni 'never.*self-stop|never \{action:"stop"\}' .pi/prompts/supervise.md
node -e 'const s=require("fs").readFileSync(".pi/prompts/supervise.md","utf8");for(const x of ["openai-codex/gpt-5.6-sol","extensions: false","responseMode: \"directive\"","delivery","triggerTurn","tools: [\"read\",\"grep\",\"find\",\"ls\"]"]){if(!s.includes(x))process.exit(1)}'
node -e 'const s=require("fs").readFileSync(".pi/prompts/supervise.md","utf8");const m=/^---\n([\s\S]*?)\n---\n/.exec(s);if(!m||!/description:/.test(m[1]))process.exit(1)'
! rg -n 'agent:|task\(|question\(|skill\(|write\(|\.active|spec\.md|prd\.json|review-state\.json' .pi/prompts/supervise.md
git diff --check
```

**Risk:** Using `action:"message"` for direct replies bypasses Main's protocol validation.

---

# Plan B — Explicit Lifecycle Producers

## Task B1 — Add create and plan handshakes

**Files:**
- `.pi/prompts/create.md`
- `.pi/prompts/plan.md`

**Needs:** A2.

### TDD steps

1. **RED:** Confirm `## Phase 10B: Supervisor Boundary Handshake` and `## Phase 8B: Supervisor Boundary Handshake` are absent.
2. Insert create's handshake after Phase 10A and before Phase 11.
3. Insert plan's handshake after Phase 8A and before Phase 9.
4. Resolve exactly one session-local `supervisor` actor ID; absent/stopped/ambiguous -> warn and continue.
5. Apply the protocol driver: create candidates = `plan`, `research`, `ship`; plan candidates = `research`, `ship`.
6. Validate silent protocol data; perform at most one mini research hop.
7. State explicitly that the blocking wait orders transport only; the actor has no independent blocking authority.

### Verify

```bash
rg -n '^## Phase 10A: Spec Review Gate$' .pi/prompts/create.md
rg -n '^## Phase 10B: Supervisor Boundary Handshake$' .pi/prompts/create.md
rg -n '^## Phase 11: Report$' .pi/prompts/create.md
rg -n '^## Phase 8A: Planning Review Gate$' .pi/prompts/plan.md
rg -n '^## Phase 8B: Supervisor Boundary Handshake$' .pi/prompts/plan.md
rg -n '^## Phase 9: Report$' .pi/prompts/plan.md
rg -n 'proactive-supervisor/v1|agents\.ask|gpt-5\.4-mini|action:"silent"' .pi/prompts/create.md .pi/prompts/plan.md
node -e 'const fs=require("fs");for(const [f,h] of [[".pi/prompts/create.md",["## Phase 10A: Spec Review Gate","## Phase 10B: Supervisor Boundary Handshake","## Phase 11: Report"]],[".pi/prompts/plan.md",["## Phase 8A: Planning Review Gate","## Phase 8B: Supervisor Boundary Handshake","## Phase 9: Report"]]]){const s=fs.readFileSync(f,"utf8");let p=-1;for(const x of h){const n=s.indexOf(x);if(n<=p)process.exit(1);p=n}}'
git diff --check
```

**Risk:** Handshake placement before review convergence opens the next phase on stale artifacts.

---

## Task B2 — Add research and ship handshakes

**Files:**
- `.pi/prompts/research.md`
- `.pi/prompts/ship.md`

**Needs:** B1.

### TDD steps

1. **RED:** Confirm `### Phase 5: Supervisor Boundary Handshake` and `## Phase 6A: Supervisor Boundary Handshake` are absent.
2. Insert research's handshake after Phase 4 Document and before ## Output.
3. Derive research candidates from namespace state: absent -> `create`; established -> `plan`, `ship`; partial -> no next phase + operator-recovery context.
4. Insert ship's handshake after Phase 6 Close and before ## Output.
5. Ship advertises only `verify` (PR integration deferred; no PR lifecycle prompt exists).
6. Reuse exactly the same versioned protocol and mini dispatch as B1.

### Verify

```bash
rg -n '^### Phase 4: Document$' .pi/prompts/research.md
rg -n '^### Phase 5: Supervisor Boundary Handshake$' .pi/prompts/research.md
rg -n '^## Output$' .pi/prompts/research.md
rg -n 'namespaceState|absent|established|partial' .pi/prompts/research.md
rg -n '^## Phase 6: Close$' .pi/prompts/ship.md
rg -n '^## Phase 6A: Supervisor Boundary Handshake$' .pi/prompts/ship.md
rg -n 'proactive-supervisor/v1|agents\.ask|gpt-5\.4-mini|research-result|requestId' .pi/prompts/research.md .pi/prompts/ship.md
rg -q 'cannot declare (terminal )?(verified status|completion)' .pi/prompts/ship.md
rg -n '^### Tier-Gated Diff Review$' .pi/prompts/ship.md
node -e 'const fs=require("fs");for(const [f,h] of [[".pi/prompts/research.md",["### Phase 4: Document","### Phase 5: Supervisor Boundary Handshake","## Output"]],[".pi/prompts/ship.md",["## Phase 6: Close","## Phase 6A: Supervisor Boundary Handshake","## Output"]]]){const s=fs.readFileSync(f,"utf8");let p=-1;for(const x of h){const n=s.indexOf(x);if(n<=p)process.exit(1);p=n}}'
git diff --check
```

**Risk:** Treating pre-create research as followed by plan/ship violates namespace ownership.

---

# Plan C — Authority, Synchronization, and Proof

## Task C1 — Record ADR-012 and canonical authority

**Files:**
- `.pi/artifacts/pi-template/DECISIONS.md`
- `.pi/artifacts/pi-template/PLAN.md`
- `AGENTS.md`

**Needs:** B2.

### TDD steps

1. **RED:** Confirm ADR-012 and proactive-supervisor markers are absent.
2. Add ADR-012 after ADR-011; add ADR-008 forward reference "Superseded in part by ADR-012".
3. Record: partial supersession of reactive-only steering; ABSOLUTE no-dispatch; silent direct-message protocol; Main-mediated one-hop research; opener/closer separation; transport wait vs advisory authority; validated Critical/High findings still block under existing Main authority.
4. Update only the supervisor paragraph in AGENTS.md (94-97); leave lifecycle paragraph at 99 untouched.
5. Add `### Proactive Supervisor (ADR-012)` near the existing Advisory Supervisor section in PLAN.md.

### Verify

```bash
rg -n '^## ADR-012: Proactive supervisor boundary handshake$' .pi/artifacts/pi-template/DECISIONS.md
rg -n 'supersed.*ADR-008|ADR-012' .pi/artifacts/pi-template/DECISIONS.md
rg -n 'Superseded in part by ADR-012' .pi/artifacts/pi-template/DECISIONS.md
rg -n '^## ADR-011: Tier-gated lifecycle review gates$' .pi/artifacts/pi-template/DECISIONS.md
rg -n 'boundary-proactive|Main-mediated|never dispatches' AGENTS.md
rg -n 'extensions: false|extensions:false' AGENTS.md
rg -n 'Proactive Supervisor|ADR-012' .pi/artifacts/pi-template/PLAN.md
rg -n 'opener|closer' .pi/artifacts/pi-template/PLAN.md
rg -n 'Main-mediated|research-request|round-trip' .pi/artifacts/pi-template/PLAN.md
rg -n 'Critical/High.*block|validated.*block' AGENTS.md .pi/artifacts/pi-template/PLAN.md
git diff --check
```

**Risk:** "Advisory" must not erase existing safety and authority blockers.

---

## Task C2 — Synchronize project summaries

**Files:**
- `.opencode/tech-stack.md`
- `.opencode/roadmap.md`
- `.opencode/state.md`

**Needs:** C1.

### TDD steps

1. **RED:** Confirm ADR-012/Main-mediated markers are absent from the three summary files.
2. Update the supervisor tier description in tech-stack.md without changing its model or extensions; document the mini gatherer's exact read-only dispatch and local-resource scope.
3. Update roadmap.md supervisor line to reflect the explicit boundary handshake.
4. Update state.md to record proactive-supervisor status and ADR-012.
5. Do not rewrite unrelated milestone history; leave the ADR-011 lifecycle block in tech-stack.md (50-59) untouched.

### Verify

```bash
rg -n 'ADR-012|boundary-proactive|Main-mediated|proactive-supervisor' .opencode/tech-stack.md .opencode/roadmap.md .opencode/state.md
rg -n 'openai-codex/gpt-5.4-mini' .opencode/tech-stack.md
git diff --check
```

**Risk:** Summary documents must not imply the supervisor directly spawns children.

---

## Task C3 — Static closure and runtime protocol smoke

**Files:** none

**Needs:** C2.
**Checkpoint:** `/reload`, then `/supervise` to reapply instructions safely.

### Static verification

1. Validate the seven-task PRD graph.
2. Verify project-pinned Fabric `0.23.0`; treat global `0.23.1` as non-authoritative.
3. Resolve `gpt-5.6-sol`, `gpt-5.4-mini`, and `GLM-5.2-NVFP4` through `pi --approve --list-models` (model-column grep, not joined provider/model).
4. Assert every new heading exists exactly once and in order.
5. Assert the exact actor configuration and EACH hard limit separately.
6. Preserve ADR-011 headings and ship/verify authority phrases; confirm verify.md has NO handshake.
7. Compare protected paths against `dd0bf96`: `.pi/fabric.json`, `.pi/settings.json`, `.pi/prompts/verify.md`, `.opencode/command/`.
8. Run the complete forbidden-token scan and `git diff --check`.

### Runtime smoke

1. Capture the complete before fingerprint (HEAD, staged, unstaged, untracked).
2. Run `/reload`, then `/supervise`; retain the returned session-local actor ID.
3. Execute one direct protocol smoke through `fabric_exec`:
   - first `agents.ask` uses a unique requestId and explicitly requests a bounded research-request response;
   - assert `action:"silent"` and matching protocol/requestId;
   - run the exact mini dispatch; assert `status === "completed"` and actual model `gpt-5.4-mini`;
   - synthesize an allowlisted summary under 8 KiB;
   - send the second `agents.ask` with `kind:"research-result"` and the same requestId;
   - assert final silent `direction-steer` or `no-advice` with the same requestId.
4. Inspect actor messages/log to confirm ordered request -> result -> final response.
5. Capture the after fingerprint; it must equal before.
6. Do not invoke mutating lifecycle commands during this no-write smoke.

### Verify

```bash
git diff --check
node -p 'require("./.pi/npm/node_modules/pi-fabric/package.json").version' | rg -x '0\.23\.0'
pi --approve --list-models | rg -F 'gpt-5.6-sol'
pi --approve --list-models | rg -F 'gpt-5.4-mini'
pi --approve --list-models | rg -F 'zai-org/GLM-5.2-NVFP4'
! rg -n 'agent:|task\(|question\(|skill\(|write\(|\.active|spec\.md|prd\.json|review-state\.json' .pi/prompts/*.md
rg -n '^## Phase 10A: Spec Review Gate$' .pi/prompts/create.md
rg -n '^### Tier-Gated Diff Review$' .pi/prompts/ship.md
rg -n '^### Phase 5A: Advisory Evidence Review$' .pi/prompts/verify.md
! rg -n 'Supervisor Boundary Handshake' .pi/prompts/verify.md
git diff --exit-code dd0bf9605bb9968b42768a9b5017650f5a6199cd -- .pi/fabric.json .pi/settings.json .pi/prompts/verify.md .opencode/command
```

**Risk:** The runtime smoke must prove the protocol, not merely that the actor answered something.

---

## Failure Behavior

- No, stopped, or ambiguous supervisor actor: warn, skip handshake, continue.
- Actor request fails or times out: warn and continue; no fabricated advice.
- Unknown response kind or correlation mismatch: ignore, warn, continue.
- Mini run fails: send a sanitized failed research result; await final actor response; never treat partial text as completed research.
- More than one research request for a boundary: reject the second; continue without another child.
- Validated Critical/High defect or binding-authority violation: stop under existing Main authority, not because the actor declared itself blocking.
- Any post-review candidate mutation: existing ADR-011 freshness and convergence rules still apply.

## Privacy and Security

- Ambient research is local-only: no network, shell, write, recursion, or extensions.
- Every request carries explicit non-secret path allowlists.
- Never transmit environment files, credentials, tokens, keys, PII, or raw tool logs.
- Store only bounded summaries with source paths.
- Direct actor replies remain silent until Main validates them.
- Exact session-local actor ID is mandatory; never route by canonical name over mesh.

## Non-Goals / Deferred

- Direct supervisor dispatch or `extensions:true`.
- Cross-session supervisor awareness.
- Blocking supervisor authority.
- Network-capable ambient research.
- A PR lifecycle transition (ship advertises verify only).
- Updating the stale `supervise.md` 0.22.4 field matrix (NOTICED BUT NOT TOUCHING unless separately scoped).

## Constitutional Compliance

**PASS** — Seven tasks; every writable task touches at most three files. No new dependencies. No
file deletion. No destructive Git operation or broad staging instruction. No capability widening.
No secret-bearing path access. All writable work remains serial. Verification and runtime smoke
are bound to an unchanged fingerprint.

## Plan Summary

- **Discovery Level:** 3
- **Effective Review Level:** 3
- **Observable truths:** 7
- **Required artifact groups:** 11
- **Key links:** 7
- **Child plans:** 3 (A=2, B=2, C=3)
- **Dependency waves:** 7 serial waves (A1 -> A2 -> B1 -> B2 -> C1 -> C2 -> C3)
- **Tasks:** 7
- **Target plan location:** `.opencode/artifacts/proactive-supervisor/plan.md`
- **Next step:** `/ship proactive-supervisor` (execute this plan wave-by-wave)
