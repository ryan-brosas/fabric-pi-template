# Autonomous Away Loop — unattended Pi lifecycle with human-only merge

**Created:** 2026-07-22
**Status:** Draft
**ADR:** ADR-014 (next available; ADR-013 = mcp-research-lane must settle first)

## Problem Statement

### What problem are we solving?

`/supervise` only starts/reconciles the advisory supervisor actor. Advancing work still requires the operator to manually invoke `/create`, `/plan`, `/research`, `/ship`, `/verify` in sequence. There is no way to say "advance this bounded, project-grounded piece of work through the full lifecycle on its own, opening a PR, and stopping only for human merge."

The operator wants a combined `/supervise --away` workflow that runs the full lifecycle autonomously — `ideate → create → plan ↔ research → ship → verify → pr → loop` — with the only human checkpoint at merge.

### Why now?

The proactive supervisor (ADR-012), tier-gated review gates (ADR-011), prewalk handoff (ADR-010), and MCP research lane (ADR-013, in-flight) compose a mature lifecycle with read-only review, senior-engineer steering, and frontier→executor handoff. The remaining gap is automation: chaining those phases without a human pressing each slash command, while preserving every existing safety invariant.

### Who is affected?

- **Primary users:** the operator (this repo's developer), who wants unattended progress on roadmap-grounded work with human-only merge.
- **Secondary:** future adopters copying `.pi/` as a template — the away loop must ship under `.pi` with no `.opencode` runtime dependency.

---

## Scope

### In-Scope

- A Main-owned away controller that drives real Pi lifecycle prompts through Pi RPC (`pi --mode rpc`), where the RPC `prompt` command expands prompt templates.
- An exclusive OS lease + external append-only ledger keyed by repository identity, so at most one writable pipeline runs across Pi sessions.
- Retained worktrees (host-managed, never auto-deleted) for up to 3 path-disjoint PRs, each based on `origin/main`; exactly one active writer globally.
- An exact-argv Git/GitHub broker: retained worktree creation, exact-path stage/commit, exact feature-branch push, API-only PR create, deterministic PR polling, post-merge fast-forward sync.
- A no-write `/pr` phase that publishes only after terminal verification, with push ordered before the final fingerprint so PR bytes equal verified bytes.
- Roadmap-first ideation with outside-the-box project-grounded fallback; split local-explorer (no network) and external-scout (no filesystem) research children; Main-direct `codex_search`.
- A new `ideate.md` and `pr.md` prompt; away-mode envelope semantics added to `create`/`plan`/`research`/`ship`/`verify`; `/supervise --away` + `/away status|pause|resume|stop` UX.
- ADR-014 codifying the narrow grant and preserved invariants.
- Bounded budgets, repair cycles, retained-worktree cap, and safe-pause-on-exhaustion.

### Out-of-Scope

- Autonomous merging (human-only, always).
- Force-push, destructive Git restoration, `rm -rf`, worktree/branch deletion, arbitrary model-generated shell.
- Automatic dependency installation, schema pushes, package publication, or secret access.
- Resolving ambiguous product decisions or human checkpoints autonomously.
- Fabric's built-in ephemeral worktree cleanup (rejected — non-resumable, destructive).
- Dependency-stacked PRs (V1 PRs are independent and path-disjoint from `origin/main`).
- Unbounded self-improvement / unlimited spend (bounded, threshold-gated, cooldown).
- Any `.opencode` runtime dependency (`.opencode` is dev-scaffold only).
- Widening normal interactive session permissions (a dedicated away-only grant is required, not a global `.pi/fabric.json` change).

---

## Proposed Solution

### Overview

A Main-owned controller extension under `.pi/extensions/away/` holds an exclusive OS lease, persists versioned state outside repository bytes, and drives the real lifecycle prompts via Pi RPC. The supervisor remains a read-only senior-engineer adviser that opens each phase (ranks ideas, scouts direction); ADR-011 review gates remain the closer at each boundary. The controller advances on `agent_settled`, derives the next phase itself (never trusting model-supplied phase names), and queues exactly one continuation. A host-owned, hash-pinned Git/GitHub broker performs exact publication operations; the controller emits validated intents only.

### User Flow

1. Operator runs `/supervise --away [objective]` from a clean, synchronized root.
2. Controller runs PREFLIGHT (root guard, clean tree, tool/auth/branch-rule checks), reconciles the supervisor, then starts.
3. Controller IDEATEs (roadmap-first, supervisor ranks), RESERVE_PATHS, CREATE_WORKTREE, then drives CREATE → PLAN ↔ RESEARCH → SHIP.
4. After SHIP: FINALIZE_COMMIT (exact-path, clean status required) → PREVERIFY → PUSH_EXACT_HEAD → FINAL_VERIFY (fresh no-write against clean HEAD) → PR_CREATE (API-only, no repo write) → PR_MONITOR.
5. PR_MONITOR polls deterministically; CI/review fixes re-enter SHIP (max 2 repair cycles, consuming only allowlisted bounded PR/CI status fields — never raw comments/logs); human merge → SYNC_AND_LOOP; conflict/closed-unmerged/TTL → BLOCKED. Up to `maxOpenPullRequests` (default 3) features may sit in PR_MONITOR concurrently while exactly one new feature is authored (one active writer globally).
6. Operator can `/away pause|resume|stop` at any time. Stop retains state, branches, worktrees.

---

## Requirements

### Functional Requirements

#### Unattended lifecycle advancement

- **WHEN** `/supervise --away [objective]` is invoked from a clean synchronized root **THEN** the controller advances through the full state machine without further operator input until a PR is open or a safe-pause condition is hit.
- **WHEN** a phase settles (`agent_settled`) **THEN** the controller derives the next phase itself and queues exactly one continuation; it never trusts a model-supplied phase name.
- **WHEN** a safe-pause condition occurs (ambiguous decision, human checkpoint, new dependency, secret, destructive/schema action, budget exhaustion, no-progress cap) **THEN** the controller pauses safely and surfaces the reason; it never fabricates success or guesses an operator decision.

#### Single-writer and exclusivity

- **WHEN** a second root controller attempts to start **THEN** it is rejected by the OS lease keyed by the Git common directory.
- **WHEN** a feature pipeline is running **THEN** no second writable pipeline starts, even across Pi sessions; read-only ideation/research may fan out.
- **WHEN** the controller runs inside a Fabric child or actor (`PI_FABRIC_DEPTH`/`PI_FABRIC_PARENT_RUN`/`PI_FABRIC_ACTOR_ID` set) **THEN** it refuses to activate (root-only guard).

#### Publication binding to verified bytes

- **WHEN** SHIP completes **THEN** every intended byte is exact-path committed and staged/unstaged/untracked status is clean before PREVERIFY.
- **WHEN** the final commit is pushed **THEN** the broker pushes the exact commit OID to one exact feature ref and verifies the remote head OID equals local HEAD and base/repo identities match.
- **WHEN** FINAL_VERIFY runs **THEN** it runs a fresh no-write pass against the clean pushed HEAD and emits a strict transcript-only receipt (run/feature/nonce/head/fingerprint/status).
- **WHEN** `/pr` runs **THEN** it performs API-only PR creation, records URL/number only in external state, and writes no repository files; it never merges, force-pushes, closes PRs, deletes branches, or deletes worktrees.

#### Crash/restart safety

- **WHEN** the controller restarts **THEN** it rehydrates from the external ledger, reconciles Git refs and existing PRs, and resumes without repeating commits, pushes, or PR creation.
- **WHEN** a transition is stale, repeated, or out-of-order (nonce/revision mismatch) **THEN** it is rejected.

#### Ideation policy

- **WHEN** roadmap work exists **THEN** it is preferred over speculative ideation.
- **WHEN** the roadmap is exhausted/absent **THEN** 3-5 project-grounded ideas are generated across unbloat/architecture/UI-UX/performance/security/docs/DX, ranked by the supervisor.
- **WHEN** no candidate clears the threshold **THEN** cooldown occurs rather than manufactured work.

### Non-Functional Requirements

- **Security:** GitHub credentials stay inside exact-argv broker operations and never enter prompts or logs. Local explorers get filesystem reads but no network; external scouts get network but no filesystem; Main-direct `codex_search` gets only sanitized public queries. Away features cannot modify the controller, broker, approval policy, or lifecycle-policy files (protected paths).
- **Safety:** No merge, force-push, reset, clean, branch/worktree deletion, or arbitrary shell in the broker allowlist. Human-only merge enforced via GitHub branch rules + required human review (prompt policy alone is insufficient). Controller/broker code is hash-pinned for the run; no `/reload` while active.
- **Reliability:** Budget exhaustion, TTL, and no-progress caps pause safely without fabricating success. Retained-worktree cap pauses further work when reached (no auto-cleanup).
- **Portability:** Runtime lives under `.pi`; the away loop operates if `.opencode` is absent.

---

## Success Criteria

- [ ] `/supervise --away` starts the controller from a clean synchronized root; normal `/supervise` remains advisory-only.
  - Verify: `rg -n '\-\-away' .pi/prompts/supervise.md && rg -n 'extensions: false|extensions:false' .pi/prompts/supervise.md`
- [ ] Root guard rejects activation inside Fabric children/actors and rejects a second root via the OS lease.
  - Verify: `node --experimental-strip-types --test .pi/extensions/away/controller.test.ts`
- [ ] The controller drives a real lifecycle prompt via Pi RPC and advances on `agent_settled` with exactly one queued continuation.
  - Verify: `node --experimental-strip-types --test .pi/extensions/away/rpc.test.ts`
- [ ] At most one writable pipeline runs globally; up to 3 path-disjoint PRs may remain open.
  - Verify: `rg -n 'maxOpenPullRequests|maxActiveWriters' .pi/away.json && node --experimental-strip-types --test .pi/extensions/away/controller.test.ts`
- [ ] Push occurs before FINAL_VERIFY; PR bytes equal the verified HEAD (exact commit OID → push → remote-OID check → final verify → API-only PR).
  - Verify: `rg -n 'PUSH_EXACT_HEAD|FINAL_VERIFY|PR_CREATE' .pi/extensions/away/controller.ts && rg -n 'no.write|no repository write|API-only' .pi/prompts/pr.md`
- [ ] `/pr` never merges, force-pushes, deletes branches/worktrees, or writes repository files.
  - Verify: `! rg -n 'merge|force.push|delete|rm -rf|reset --hard' .pi/prompts/pr.md && rg -n 'no repository write|transcript only' .pi/prompts/pr.md`
- [ ] Crash/restart does not repeat a commit, push, or PR creation (nonce/revision guard).
  - Verify: `node --experimental-strip-types --test .pi/extensions/away/controller.test.ts`
- [ ] Ideation is roadmap-first with split local/external research lanes and cooldown when no candidate qualifies.
  - Verify: `rg -n 'roadmap' .pi/prompts/ideate.md && rg -n 'local|filesystem|network' .pi/extensions/away/ideation.ts && node --experimental-strip-types --test .pi/extensions/away/ideation.test.ts`
- [ ] ADR-014 codifies the narrow grant and preserves human-only merge, Main-as-sole-integrator, supervisor-advisory, `/verify` authority, one-writer, and no normal-session permission widening.
  - Verify: `rg -n '^## ADR-014: Autonomous away lifecycle$' .pi/artifacts/pi-template/DECISIONS.md && rg -n 'human.only.merge|sole integrator|advisory' .pi/artifacts/pi-template/DECISIONS.md`
- [ ] No capability widening: away broker has no `bash`/arbitrary-shell/`fabric_exec` exposed to children; children stay `extensions:false`.
  - Verify: `! rg -n 'fabric_exec|bash' .pi/extensions/away/git.ts .pi/extensions/away/github.ts && rg -n 'extensions:false|extensions: false' .pi/extensions/away/rpc.ts`
- [ ] Existing manual lifecycle behavior, ADR-011 review markers, ADR-012 supervisor hard limits, and ADR-013 MCP lane all remain intact.
  - Verify: `rg -n '^## Phase 10A: Spec Review Gate$|^## Phase 8A: Planning Review Gate$|^### Tier-Gated Diff Review$|^### Phase 5A: Advisory Evidence Review$' .pi/prompts/create.md .pi/prompts/plan.md .pi/prompts/ship.md .pi/prompts/verify.md && rg -n 'never dispatch|never edit|never certify|never.*stop' .pi/prompts/supervise.md && rg -n 'resolve-library-id|web_search_exa' .pi/prompts/create.md`
- [ ] A dry-run preflight mutates neither repository bytes nor refs.
  - Verify: `node --experimental-strip-types --test .pi/extensions/away/host.test.ts`

---

## Technical Context

### Existing Patterns

- ADR-012 proactive supervisor: persistent `extensions:false` read-only GPT-5.6 Sol actor, `proactive-supervisor/v1` two-round handshake, advisory always (`supervise.md:47-162`). The away controller keeps this actor as opener; it does not give it dispatch/write authority.
- ADR-011 tier-gated review gates at `/create`/`/plan`/`/ship`/`/verify` boundaries — the closer; preserved as the blocking layer.
- ADR-010 prewalk handoff + `fullCodeMode:true` (Main authors `fabric_exec`); away workers receive only the transition protocol, never publication authority.
- ADR-013 MCP research lane (in-flight): `context7`+`exa` MCP in the `extensions:false` read-only allowlist; `codex_search` Main-direct. Away ideation reuses this split.
- Pi RPC mode (`pi --mode rpc`): JSONL commands/events; the `prompt` command expands prompt templates (`pi-coding-agent/docs/rpc.md:41-76`) — the only inspected mechanism that invokes real lifecycle prompts programmatically.
- Pi extension persistence: `pi.appendEntry` custom entries survive restart, do not enter LLM context, reconstruct via `ctx.sessionManager.getEntries()` (`docs/extensions.md:1437-1452`) — audit/resume mirror, not the project-wide lock.
- `agent_settled` = no automatic continuation remains (`docs/extensions.md:558-571`) — the pump advance point.

### Key Files

- `.pi/prompts/supervise.md:47-162` — supervisor contract to preserve (opener role, hard limits).
- `.pi/prompts/ship.md:425-435` — currently advertises `candidateNextPhases:["verify"]` and says PR integration is undeveloped (the gap this feature fills).
- `.pi/prompts/verify.md:181-201` — ADR-006 final no-write pass; push must precede it.
- `.pi/fabric.json:1-41` — `fullCodeMode:true` but `write`/`execute`/`network` are `deny`; the blocking approval-profile question (Open Question 1).
- `.pi/npm/node_modules/pi-fabric/dist/core/approval-controller.js:16-22` — `deny` throws; away workers need a dedicated grant.

### Affected Files

```yaml
files:
  - .pi/extensions/away/index.ts          # /away command, root guards, lifecycle hooks
  - .pi/extensions/away/controller.ts     # pure versioned state machine + scheduling
  - .pi/extensions/away/state.ts          # external ledger, lease, nonce, receipts
  - .pi/extensions/away/rpc.ts            # Pi RPC lifecycle-prompt driver
  - .pi/extensions/away/protocol.ts       # away envelope + transition-intent contract
  - .pi/extensions/away/git.ts            # exact-argv retained-worktree + Git operations
  - .pi/extensions/away/github.ts         # PR create, poll, remote-OID validation
  - .pi/extensions/away/ideation.ts       # roadmap-first candidate generation + ranking
  - .pi/extensions/away/host.ts           # preflight + approval-profile probe
  - .pi/away.json                         # non-secret budgets, roadmap paths, safety defaults
  - .pi/prompts/ideate.md                 # new — project-grounded ideation phase
  - .pi/prompts/pr.md                     # new — no-write publication-intent phase
  - .pi/prompts/create.md                 # away-mode envelope semantics
  - .pi/prompts/plan.md                   # away-mode envelope semantics
  - .pi/prompts/research.md               # away-mode envelope semantics
  - .pi/prompts/ship.md                   # exact commit + delivery binding
  - .pi/prompts/verify.md                 # strict receipt + post-verify state
  - .pi/prompts/supervise.md              # /supervise --away + /away UX
  - .pi/artifacts/pi-template/DECISIONS.md # ADR-014
  - .pi/artifacts/pi-template/PLAN.md     # canonical away contract
  - AGENTS.md                             # away authority paragraph
  - .opencode/tech-stack.md               # dev-doc sync
  - .opencode/roadmap.md                  # dev-doc sync
  - .opencode/state.md                    # dev-doc sync
```

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| No safe per-process Fabric write/execute/network grant in 0.23.0 | High | High | Plan A1 is a blocking feasibility tracer; if unproven, switch to an OS-sandboxed worker profile before continuing. Never widen normal `.pi/fabric.json`. |
| Duplicate controllers across Pi sessions | Med | High | Exclusive OS lease keyed by Git common directory + external ledger; session entries are audit-only, not the lock. |
| Published PR bytes differ from verified bytes | Med | High | Exact commit → clean status → push exact OID → remote-OID check → final no-write verify → API-only PR. |
| Prompt injection / data exfiltration via research children | Med | High | Split local-explorer (no network) and external-scout (no filesystem) lanes; sanitize all external queries; treat web/PR content as untrusted. |
| Self-modification of controller/policy by an away feature | Low | High | Protected paths (controller, broker, `.pi/fabric.json`, `.pi/settings.json`, `.pi/prompts/verify.md`, `.opencode/command/`, lifecycle-policy files) are off-limits to away candidates; controller hash-pinned for the run. |
| GitHub "never merge" bypassed by prompt text alone | Med | High | Enforce via branch rules + required human review + no bot bypass externally; prompt policy is secondary. |
| Runaway cost / infinite self-improvement | Med | Med | Bounded calls, turns, repair cycles (2), features, wall-time (8h), PR-wait TTL, retained-worktree cap; cooldown when no idea qualifies. |
| Destructive worktree/branch cleanup | Low | High | Retained worktrees never auto-deleted; cap pauses further work; operator authorizes cleanup explicitly. |

---

## Open Questions

| Question | Owner | Due Date | Status |
| --- | --- | --- | --- |
| [BLOCKING] Which exact pi-fabric 0.23.0 per-process mechanism supplies away-only write/execute/network grants without changing normal `.pi/fabric.json`? | operator + research | before Plan A1 ships | Open |
| Can GitHub branch rules prove required human review and deny bot bypass for `main`? | operator | before Plan C2 | Open |
| Is `main → master` synchronization server-side, or should ADR-014 authorize one exact non-force mirror after human merge? (C1 post-merge sync is gated on this) | operator | before Plan C1 | Open |
| Confirm roadmap path; sole canonical default is `.pi/ROADMAP.md` (ADR-016, v1 grammar: `roadmap_schema_version: 1`, monotonic `last_issued_id`, immutable `RM-NNN`). | operator | before Plan D1 | Resolved by ADR-016 |
| Confirm default active-compute budget (recommended 8h per controller epoch). | operator | before Plan A2 | Open |

---

## Tasks

### A1: Prove the privilege boundary (preflight + approval-profile probe) [implement]

A `/away preflight --dry-run` command proves an away-only process can obtain write/execute/network authority without modifying tracked `.pi/fabric.json` or widening normal sessions; it mutates neither repository bytes nor refs; the root guard rejects Fabric children/actors; A1 asserts the ADR-013 prerequisite is present and HEAD is clean/synchronized. **A1 failure is BLOCKED** — if no safe per-process grant exists in 0.23.0, a separate follow-up PRD scopes the OS-sandbox fallback; A1 does not silently switch architectures.

**Metadata:**

```yaml
depends_on: []
parallel: false
files:
  - .pi/extensions/away/index.ts
  - .pi/extensions/away/host.ts
  - .pi/extensions/away/host.test.ts
```

**Verification:**

- `rg -n '^## ADR-013: MCP research lane$' .pi/artifacts/pi-template/DECISIONS.md && test -z "$(git status --porcelain)"`
- `node --experimental-strip-types --test .pi/extensions/away/host.test.ts`
- `git diff --check`

### A2: Add durable state and scheduling [implement]

A pure versioned state reducer (`controller.ts`) plus an external append-only ledger + OS lease (`state.ts`) keyed by repository identity, with revision/nonce validation, running/paused/blocked/stopped scheduler states, and budget + one-writer enforcement. Restart replay does not repeat commits, pushes, or PR creation.

**Metadata:**

```yaml
depends_on: ["A1"]
parallel: false
files:
  - .pi/extensions/away/controller.ts
  - .pi/extensions/away/state.ts
  - .pi/away.json
```

**Verification:**

- `node --experimental-strip-types --test .pi/extensions/away/controller.test.ts`
- Unit cases: duplicate roots, stale nonce, restart replay, budget exhaustion, writer serialization.

### A3: Prove Pi RPC phase execution [implement]

Prove against Pi 0.81.1 that the RPC `prompt` request expands `/create`, `/plan`, etc., `agent_settled` is observed, one continuation is queued, restart resumes the same session, and a feature worker cannot obtain publication authority.

**Metadata:**

```yaml
depends_on: ["A2"]
parallel: false
files:
  - .pi/extensions/away/rpc.ts
  - .pi/extensions/away/rpc.test.ts
  - .pi/extensions/away/protocol.ts
```

**Verification:**

- `node --experimental-strip-types --test .pi/extensions/away/rpc.test.ts`

### B1: Add away-mode semantics to authoring phases [implement]

`create.md`, `plan.md`, `research.md` receive a trusted phase/nonce envelope from the controller, use deterministic discovery/risk defaults, reject existing/partial namespaces and unresolved decisions, return material research to PLAN, reject candidates needing human checkpoints/new deps/secrets/destructive/schema actions, and end with a nonce-bound transition intent. Manual behavior unchanged.

**Metadata:**

```yaml
depends_on: ["A3"]
parallel: false
files:
  - .pi/prompts/create.md
  - .pi/prompts/plan.md
  - .pi/prompts/research.md
```

**Verification:**

- `rg -n 'away-mode envelope' .pi/prompts/create.md .pi/prompts/plan.md .pi/prompts/research.md`
- `rg -n '<slug>' .pi/prompts/create.md .pi/prompts/plan.md .pi/prompts/research.md`
- `! rg -n 'agent:|task\(|question\(|skill\(|write\(|\.active|spec\.md|prd\.json|review-state\.json' .pi/prompts/*.md`
- `git diff --check`

### B2: Define the delivery contract in ship/verify/pr prompts [implement]

`ship.md`/`verify.md`/`pr.md` (new) **define the prompt contract**: ship performs no arbitrary Git/GitHub commands (the broker commits exact approved paths); verify emits a strict transcript-only receipt; `pr.md` is no-write and produces only a validated publication intent (no merge/force/delete/reset). The **push-precedes-fingerprint ordering is implemented and tested in C1** (`controller.ts`/`git.ts`), not here; B2 defines the contract the controller enforces.

**Metadata:**

```yaml
depends_on: ["B1"]
parallel: false
files:
  - .pi/prompts/ship.md
  - .pi/prompts/verify.md
  - .pi/prompts/pr.md
```

**Verification:**

- `test -f .pi/prompts/pr.md`
- `rg -n 'cannot declare' .pi/prompts/ship.md && rg -n 'sole.*verified|transcript only|no repository write' .pi/prompts/verify.md`
- `rg -n 'no repository write|API-only' .pi/prompts/pr.md`
- `! rg -n 'gh pr merge|force.push|reset --hard|rm -rf|branch -D' .pi/prompts/pr.md`
- `git diff --check`

### B3: Expose the combined UX [implement]

`/supervise --away [objective]` reconciles the supervisor then starts the controller; `/away status|pause|resume|stop` manages it. Normal `/supervise` remains actor-only.

**Metadata:**

```yaml
depends_on: ["B2"]
parallel: false
files:
  - .pi/prompts/supervise.md
  - .pi/extensions/away/index.ts
  - .pi/extensions/away/protocol.ts
```

**Verification:**

- `rg -n '\-\-away' .pi/prompts/supervise.md && rg -n 'never dispatch|never edit|never certify' .pi/prompts/supervise.md`
- `rg -n 'proactive-supervisor/v1' .pi/prompts/supervise.md`
- `git diff --check`

### C1: Implement exact Git/worktree operations [implement]

A broker allowlist: read-only Git identity/status/ref queries, exact-ref fetch, retained worktree creation from `origin/main`, exact-path staging, commit creation, push of an exact feature commit to one exact ref, and post-merge fast-forward sync (gated on the sync-policy open-question resolution — Open Question 3). The controller implements and tests the **push-precedes-final-fingerprint ordering** (push exact OID → remote-OID check → final no-write verify). No arbitrary args, no cleanup/branch-deletion/force/reset/clean. Retained worktrees live under an XDG state directory and are never auto-deleted.

**Metadata:**

```yaml
depends_on: ["B3"]
parallel: false
files:
  - .pi/extensions/away/git.ts
  - .pi/extensions/away/git.test.ts
  - .pi/extensions/away/controller.ts
```

**Verification:**

- `node --experimental-strip-types --test .pi/extensions/away/git.test.ts`
- `! rg -n 'reset --hard|clean -fd|rm -rf|force.push|branch -D' .pi/extensions/away/git.ts`
- `rg -n 'PUSH_EXACT_HEAD|FINAL_VERIFY|push.*before.*verif' .pi/extensions/away/controller.ts`

### C2: Implement GitHub publication and monitoring [implement]

Exact GitHub API operations (not `gh pr create` implicit-push behavior). Before PR creation require: expected repo identity, `base=main`, remote feature head equals verified local head, branch protection + human-review policy present, no existing mismatched PR. Poll deterministically without model turns. Store PR URL/number only in external controller state. Repair consumes only allowlisted bounded PR/CI status fields, never raw comments/logs (sanitization boundary against prompt injection). The broker performs no merge operation.

**Metadata:**

```yaml
depends_on: ["C1"]
parallel: false
files:
  - .pi/extensions/away/github.ts
  - .pi/extensions/away/github.test.ts
  - .pi/prompts/pr.md
```

**Verification:**

- `node --experimental-strip-types --test .pi/extensions/away/github.test.ts`
- `! rg -n 'gh pr merge|gh merge|PUT .*merge|reset --hard|force.push|branch -D|rm -rf' .pi/extensions/away/github.ts`
- `rg -n 'sanit|allowlist|bounded.*status' .pi/extensions/away/github.ts`

### C3: Add multi-PR scheduling and repair [implement]

Max 3 open PRs, exactly one active writer, path reservation + overlap rejection, independent branches from `origin/main`, CI/review repair priority (max 2 cycles, consuming only allowlisted bounded status fields), BLOCKED on closed-unmerged/changed-head/conflict/TTL, human merge → ref sync + reservation release + next ideation. Multiple features may sit in PR_MONITOR concurrently up to `maxOpenPullRequests` while one new feature is authored.

**Metadata:**

```yaml
depends_on: ["C2"]
parallel: false
files:
  - .pi/extensions/away/controller.ts
  - .pi/extensions/away/controller.test.ts
  - .pi/away.json
```

**Verification:**

- `node --experimental-strip-types --test .pi/extensions/away/controller.test.ts`
- `rg -n 'maxOpenPullRequests|maxActiveWriters|maxVerifyRepairCycles' .pi/away.json`

### D1: Implement roadmap-first ideation [implement]

`ideate.md` (new) + `ideation.ts`: roadmap items outrank speculative ideas; the sole canonical roadmap is `.pi/ROADMAP.md` (ADR-016 v1 grammar: `roadmap_schema_version: 1`, monotonic `last_issued_id`, immutable `RM-NNN`); eligibility is restricted to Ready cards with `Autonomy: away-ok` and `Open decisions: none`; `runtime_protected_paths` (the controller, broker, `.pi/fabric.json`, `.pi/settings.json`, `.pi/prompts/verify.md`, `DECISIONS.md`, `PLAN.md`, `AGENTS.md`, `.opencode/command/`, and the init packet — managed `AGENTS.md` boilerplate region + `.pi/{ROADMAP,user,tech-stack,state,memory}.md`) are rejected as away candidates (no self-modification, no roadmap mutation — ideation reads `.pi/ROADMAP.md` read-only and never writes it; reservations/completion live in the external ledger); feature creation uses source-backed `/create <slug> --from .pi/ROADMAP.md#RM-NNN` preserving provenance (path, anchor, whole-file SHA-256, RM-ID); open-PR path collisions rejected; external scouts never get filesystem access; local explorers never get network; no qualifying idea → cooldown.

**Metadata:**

```yaml
depends_on: ["C3"]
parallel: false
files:
  - .pi/prompts/ideate.md
  - .pi/extensions/away/ideation.ts
  - .pi/extensions/away/ideation.test.ts
```

**Verification:**

- `node --experimental-strip-types --test .pi/extensions/away/ideation.test.ts`
- `rg -n 'roadmap' .pi/prompts/ideate.md`

### D2: Codify ADR-014 [contract]

`ADR-014: Autonomous away lifecycle` authorizes only: retained worktree/feature-branch creation, exact-path commits, exact feature-branch pushes, PR create/update + CI repair, bounded post-merge main→master sync if server-side sync is unavailable. Preserves: human-only merge, no destructive cleanup, Main as sole integrator, supervisor advisory, `/verify` authority + freshness, one active writer, no normal-session permission widening.

**Metadata:**

```yaml
depends_on: ["D1"]
parallel: false
files:
  - .pi/artifacts/pi-template/DECISIONS.md
  - .pi/artifacts/pi-template/PLAN.md
  - AGENTS.md
```

**Verification:**

- `rg -n '^## ADR-014: Autonomous away lifecycle$' .pi/artifacts/pi-template/DECISIONS.md`
- `rg -n 'human.only.merge' .pi/artifacts/pi-template/DECISIONS.md`
- `rg -n 'sole integrator' .pi/artifacts/pi-template/DECISIONS.md`
- `rg -n 'advisory' .pi/artifacts/pi-template/DECISIONS.md`
- `rg -n 'one.active.writer' .pi/artifacts/pi-template/DECISIONS.md`
- `rg -n 'permission widening' .pi/artifacts/pi-template/DECISIONS.md`
- `git diff --check`

### D3: Synchronize repository documentation [contract]

Dev-doc sync only (the shipped away runtime operates if `.opencode` is absent): document the away loop + ADR-014 in `tech-stack.md`, `roadmap.md`, `state.md`.

**Metadata:**

```yaml
depends_on: ["D2"]
parallel: false
files:
  - .opencode/tech-stack.md
  - .opencode/roadmap.md
  - .opencode/state.md
```

**Verification:**

- `rg -n 'ADR-014|autonomous away|away loop' .opencode/tech-stack.md .opencode/roadmap.md .opencode/state.md`
- `git diff --check`

---

## Notes

- **Prerequisite:** ADR-013 (`mcp-research-lane`) must settle first — its C1 is currently uncommitted (AGENTS.md + PLAN.md edits) and ADR-013 is not yet appended to `DECISIONS.md`. Plan A1's preflight requires a clean, synchronized control worktree, which naturally gates on ADR-013 completion. Do not begin Plan A until `/ship mcp-research-lane` is verified and pushed.
- **Baseline OID** (post-ADR-013 settle): to be captured at A1 start.
- **Effort:** XL — approximately 5-8 engineering days plus GitHub policy setup and a one-time dogfood.
- **Dogfood (gated final acceptance checkpoint):** the unit tests + greps above do not prove the controller, broker, and prompts are wired together. Before declaring this feature done, run one small roadmap-backed doc feature through the full loop end-to-end (after explicit operator authorization): PREFLIGHT → … → PR_CREATE → human merge → ref sync → return to ideation. Retain the dogfood worktree + branch (do not delete). A hermetic full-loop integration test (temporary repo + fake GitHub endpoint) is recommended as a `/plan` refinement so the wiring is provable without a live merge.
- **Research basis:** the state machine, capability matrix, and safety contract were established during the preceding `/plan`-equivalent research phase (source-grounded against pi-fabric 0.23.0 + Pi 0.81.1 installed sources). This spec encodes those findings; a fresh-eyes review pass surfaced and the spec was corrected for: ADR-013 prerequisite gating, manifest/test reconciliation, push-before-verify task ownership, file-existence guards + scoped forbidden-op checks, per-invariant ADR assertions, protected-path expansion, sanitization boundary, sync-policy ordering, and PR_MONITOR concurrency.
