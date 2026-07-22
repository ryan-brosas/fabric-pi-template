# Milestone 3 — Lifecycle Prompts Implementation Plan

> **For Claude:** Implement this plan task-by-task.

**Goal:** Ship all nine `.opencode/command/*.md` lifecycle bodies as self-contained Pi prompts under `.pi/prompts/`, preserving all runnable procedure while removing only unsupported OpenCode mechanics.

**Discovery Level:** 0 — internal port, no new dependencies. Deep local inspection was required because nine long command bodies carry conflicting Git, concurrency, artifact, and verification semantics.

**Context Budget:** ~50% per child plan; five serial waves.

**Slug regex:** `^(?=.{1,64}$)[a-z0-9]+(?:-[a-z0-9]+)*$` — reject empty/absolute/slash/dot-segment/uppercase/leading-trailing-hyphen/double-hyphen before any filesystem access.

## Constraints

- Port all nine command bodies: `audit`, `create`, `fix`, `gc`, `init`, `plan`, `research`, `ship`, `verify`.
- Preserve every runnable phase, table, guard, report, stop condition, quality check.
- Manual section-by-section edits only; no transformation scripts (`AGENTS.md:48-54`).
- Max three tasks per child plan; max three modified files per task.
- Writable work is always serial (single-writer rule, `AGENTS.md:105`).
- Five lifecycle prompts require an explicit validated `<slug>`; four operational prompts keep natural args.
- No shared `.active` pointer in Pi runtime prompts.
- `/ship` cannot declare completion; `/verify` is the sole completion writer and emits final `VERIFIED` only in its response/session transcript after a stable fingerprint — no repository write after the final fingerprint.
- `/gate` remains deferred to a separately created milestone.
- No branch/worktree/stash actions inside prompts; commits/pushes are operator-authorized, exact-path.

## Must-Haves

### Observable Truths

1. Pi exposes all nine commands with valid frontmatter and argument contracts.
2. Every command retains all substantive behavior from its OpenCode lifecycle body.
3. No prompt contains OpenCode-only pseudo-calls, routing workflows, shared artifact pointers, or stale command invocations.
4. Lifecycle commands reject invalid/path-like slugs before filesystem access and confine all artifact access beneath the selected slug.
5. Writable work, commits, and pushes are serial, exact-path, operator-authorized.
6. `/ship` records implementation without terminal completion authority.
7. `/verify` rejects stale/partial/skipped/timed-out/mutation-invalidated evidence and emits final evidence externally.

### Required Artifacts

| Group | Paths | Provides |
|---|---|---|
| Inception prompts | `.pi/prompts/{create,plan,research}.md` | Spec, planning, research |
| Execution prompts | `.pi/prompts/{fix,ship,verify}.md` | Debug, implementation, completion proof |
| Operations prompts | `.pi/prompts/{init,gc,audit}.md` | Init, quality, audit |
| Authority contract | `AGENTS.md`, `.pi/artifacts/pi-template/{PLAN,DECISIONS}.md` | Slug, concurrency, completion rules |
| Product/status docs | `.opencode/{roadmap,state,tech-stack}.md` | Nine-command scope, milestone state |
| Active feature | `.opencode/artifacts/milestone-3-lifecycle-prompts/{spec.md,prd.json}`, `.opencode/artifacts/.active` | Executable task graph, acceptance |
| Lifecycle evidence | `.pi/artifacts/pi-template/{TODO,PROGRESS}.md` | Candidate implementation evidence |

### Key Links

| From | To | Via | Risk |
|---|---|---|---|
| Nine OpenCode commands | Nine Pi prompts | Per-section KEEP/ADAPT/STRIP ledger | Over-stripping runnable behavior |
| `<slug>` arg | `.pi/artifacts/<slug>/` | Strict regex + path confinement | Traversal or cross-session collision |
| `/create` | `/plan` | `PLAN.md`, `TODO.md` | Incompatible artifact shape |
| `/research` | `/create`/`/plan` | `PROGRESS.md` | Research advances lifecycle |
| `/ship` | `/verify` | Candidate evidence | Ship claims completion early |
| `/verify` | External declaration | Stable before/after fingerprint | Evidence write invalidates itself |
| Git op | Owned task paths | Exact-path stage+commit | Concurrent `.pi/fabric.json` captured |

## Port Contract (per command)

| Prompt | Preserve | Required adaptation |
|---|---|---|
| `audit` | Pattern args, search procedure, severity report, fixes, correct examples | Direct investigation; response-only report; no `.active`/inferred write |
| `create` | Duplicate check, research depth, PRD rigor, task format, validation, workspace readiness | `<slug> <description>`; write `PLAN/TODO`; refuse existing slug; workspace=inspection only — no stash/branch/worktree |
| `fix` | Reproduce→isolate→root cause→fix→verify→report | Translate skill calls; detect project toolchain, not npm-only |
| `gc` | Fallow scan, quality grades, structural assessment, recommendations | No auto-install/PR; missing optional tooling = named PARTIAL/BLOCKED |
| `init` | All modes, idempotency, detection, questions, previews, outputs, skill guidance | Translate pseudo-calls to direct Main/operator steps; no blind overwrite/network install |
| `plan` | Institutional research, discovery, goal-backward, dependencies, TDD, compliance | `<slug>`; hard 2–3 tasks, ≤3 files/task; waves order writes, do not parallelize |
| `research` | Complexity routing, source hierarchy, confidence, stops, report | `<slug> <topic> [--quick\|--thorough]`; write `PROGRESS.md`; never terminal status |
| `ship` | Guards, task loop, checkpoints, TDD, commit discipline, full gates, UI checks, goal-backward, operator close | `<slug>`; serialize writes; operator-gate Git; no review matrix/loop; never declare completion |
| `verify` | Args, completeness, correctness, coherence, report modes | `<slug> [path\|all] [--quick] [--full] [--fix]`; remove legacy cache + `--no-cache`; quick/skipped cannot VERIFIED; `--fix` restarts baseline; final evidence external, no post-fingerprint write |

### Artifact map

| Command | Writes |
|---|---|
| `/create <slug> ...` | `PLAN.md`, `TODO.md` |
| `/plan <slug>` | `PLAN.md`, `TODO.md`; `DECISIONS.md` for material tradeoffs |
| `/research <slug> ...` | `PROGRESS.md` |
| `/ship <slug>` | `TODO.md`, `PROGRESS.md`, `DECISIONS.md`; never verified status |
| `/verify <slug> ...` | No final repository write; external final result only |
| `/audit`, `/fix` | Response/code changes only |
| `/gc` | Existing quality output where available; no invented Pi artifact |
| `/init` | Root `AGENTS.md` and established `.opencode` context files |

## Dependency Graph

```
Plan 0 (contract freeze):  0.1 -> 0.2 -> 0.3
Plan 1 (inception):        1.1 -> 1.2 -> 1.3        (needs 0.3)
Plan 2 (execution):        2.1 -> 2.2 -> 2.3        (needs 1.3)
Plan 3 (operations):      3.1 -> 3.2 -> 3.3        (needs 2.3)
Plan 4 (closure):          4.1 -> 4.2 -> 4.3        (needs 3.3)
```
All waves serial under single-writer rule.

## Standard Prompt-Port Loop (Tasks 1.1–3.3)

1. **RED:** Run that prompt's positive-marker test; must fail (target absent). If target exists unexpectedly, stop and inspect — never overwrite blindly.
2. Re-read the authoritative `.opencode/command/<name>.md` fresh.
3. Process one source section at a time: copy `KEEP` content; manually rewrite `ADAPT` content; remove only ledger-approved `STRIP` content.
4. **GREEN:** Run frontmatter, positive-marker, forbidden-pattern, slug/artifact, and command-specific safety checks.
5. Review source-to-target diff; exact-path commit and push (`main` then `main:master`).

No bulk transformation scripts.

## Tasks

### Plan 0 — Freeze Contracts

#### Task 0.1 — Correct binding runtime authority
- **needs:** none · **creates:** authoritative nine-command, slug, external-verification contract · **checkpoint:** no
- **files:** `AGENTS.md`, `.pi/artifacts/pi-template/PLAN.md`, `.pi/artifacts/pi-template/DECISIONS.md`
- **TDD:**
  1. RED: confirm current text still says `/verify` writes terminal status or persists a final fingerprint in-repo.
  2. Update all three: external-only final verification; forbid post-fingerprint writes; freeze nine-command full-body scope; document slug confinement + same-slug drift blocking; mark `/gate` separate/deferred.
  3. GREEN: all three agree on ship/verify authority; no stale "five thin prompts" text.
  4. Review only these three diffs; exact-path commit `docs(contract): ...`; push.

#### Task 0.2 — Align project roadmap and status
- **needs:** 0.1 · **creates:** accurate nine-command milestone/portability narrative · **checkpoint:** no
- **files:** `.opencode/roadmap.md`, `.opencode/state.md`, `.opencode/tech-stack.md`
- **TDD:**
  1. RED: search for `thin`, five-command lists, old milestone numbering, "reference/superseded" framing.
  2. Replace with nine authoritative lifecycle commands and current milestone boundaries; note `/gate` separate and milestone-2 runtime smoke pending.
  3. GREEN: all nine names occur; stale framing absent.
  4. Exact-path commit; push.

#### Task 0.3 — Make the active PRD executable
- **needs:** 0.2 · **creates:** bounded serial tasks + deterministic acceptance checks · **checkpoint:** no
- **files:** `.opencode/artifacts/milestone-3-lifecycle-prompts/spec.md`, `.opencode/artifacts/milestone-3-lifecycle-prompts/prd.json`, `.opencode/artifacts/.active`
- **TDD:**
  1. RED: show monolithic nine-file task, stale `source_reference_readonly` key, broken `$f`/`rg` checks.
  2. Add a KEEP/ADAPT/STRIP ledger covering every `##`/`###` source section (reference appendix).
  3. Replace the 3-task monolith with bounded per-group tasks (inception/execution/operations + contract + closure), each ≤3 files, serial deps.
  4. Replace prose/"returns no matches" checks with executable Node/`rg` checks and explicit expected exit codes; distinguish `rg` exit 1 (clean) from exit 2 (error).
  5. Remove `source_reference_readonly` framing; reframe as lifecycle source bodies being ported.
  6. `jq -e` validates; `.active` contains only `milestone-3-lifecycle-prompts`; exact-path commit; push.

### Plan 1 — Inception Lifecycle

#### Task 1.1 — Port `/create`
- **needs:** 0.3 · **file:** `.pi/prompts/create.md` · **checkpoint:** no
- **markers:** duplicate check, research depth, PRD rigor, lite/full formats, task format, validation, workspace safety, conversion, report
- **adapt:** `<slug> <description>`; init `PLAN/TODO`; refuse existing slug; no stash/branch/worktree

#### Task 1.2 — Port `/plan`
- **needs:** 1.1 · **file:** `.pi/prompts/plan.md` · **checkpoint:** no
- **markers:** institutional research, discovery level, goal-backward, observable truths, artifacts, key links, dependencies, task standards, compliance gate
- **adapt:** `<slug>`; 2–3 tasks, ≤3 files/task; waves = ordering only

#### Task 1.3 — Port `/research`
- **needs:** 1.2 · **file:** `.pi/prompts/research.md` · **checkpoint:** no
- **markers:** complexity detection, direct execution, source priority, confidence levels, stopping rules, documentation, output
- **adapt:** `<slug> <topic> [--quick\|--thorough]`; write `PROGRESS.md`; never terminal status; sideways

### Plan 2 — Execution and Completion Authority

#### Task 2.1 — Port `/fix`
- **needs:** 1.3 · **file:** `.pi/prompts/fix.md` · **checkpoint:** no
- **markers:** reproduce, isolate, root cause, minimal fix, verify, two-failure escalation, rejected alternatives
- **adapt:** discover actual project check commands; not npm-only

#### Task 2.2 — Port `/ship`
- **needs:** 2.1 · **file:** `.pi/prompts/ship.md` · **checkpoint:** no
- **markers:** guards, task loop, checkpoints, TDD, exact-path commit protocol, stop conditions, full verification, UI checks, goal-backward verification, operator close, report
- **adapt:** `<slug>`; serial writes; no review matrix/`review-state.json` loop; no `/ui-slop-check`/`/compound`; operator-gate Git; terminal result = "implementation recorded; run `/verify`", never completed/verified

#### Task 2.3 — Port `/verify`
- **needs:** 2.2 · **file:** `.pi/prompts/verify.md` · **checkpoint:** no
- **markers:** input selection, baseline, completeness, correctness, coherence, full report, fingerprint comparison, external declaration
- **adapt:** `<slug> [path\|all] [--quick] [--full] [--fix]`; remove legacy cache + `--no-cache`; quick/skipped cannot VERIFIED; `--fix` mutates then fresh baseline; changed fingerprint invalidates; no repo write after final fingerprint

### Plan 3 — Project Operations

#### Task 3.1 — Port `/init`
- **needs:** 2.3 · **file:** `.pi/prompts/init.md` · **checkpoint:** no
- **markers:** idempotency, argument modes, project detection, previews, AGENTS update, tech-stack generation, planning context, user profile, output, skill guidance
- **adapt:** natural flags; pseudo-questions/writes → direct interaction; no blind overwrite/install/network

#### Task 3.2 — Port `/gc`
- **needs:** 3.1 · **file:** `.pi/prompts/gc.md` · **checkpoint:** no
- **markers:** Fallow scan, existing grades, domain grades, structural assessment, findings, recommendations, report
- **adapt:** locally available tooling only; missing tooling = explicit PARTIAL/BLOCKED; no auto-install/PR/publication

#### Task 3.3 — Port `/audit`
- **needs:** 3.2 · **file:** `.pi/prompts/audit.md` · **checkpoint:** no
- **markers:** pattern input, occurrences, affected files, severities, recommended fixes, correct examples
- **adapt:** direct search/review/synthesis; response-only report; no `.active`/inferred artifact write

### Plan 4 — Coherence and Final Verification

#### Task 4.1 — Run candidate suite and record pending evidence
- **needs:** 3.3 · **files:** `.pi/artifacts/pi-template/TODO.md`, `.pi/artifacts/pi-template/PROGRESS.md`, `.opencode/state.md` · **checkpoint:** no
- 1. Run the complete static suite. 2. Record commands/exit codes/limitations + "pending final no-write verification". 3. Mark all nine implementations complete but verification pending. 4. Exact-path commit; push.

#### Task 4.2 — Close OpenCode feature implementation state
- **needs:** 4.1 · **files:** `.opencode/artifacts/milestone-3-lifecycle-prompts/spec.md`, `.opencode/artifacts/milestone-3-lifecycle-prompts/prd.json`, `.opencode/roadmap.md` · **checkpoint:** no
- 1. Mark each bounded PRD task complete without claiming `VERIFIED`. 2. Confirm acceptance criteria match implemented behavior. 3. Re-run `jq`, ledger, task/file-cap validation. 4. Exact-path commit; push.

#### Task 4.3 — Final no-write verification
- **needs:** 4.2 · **files:** none · **checkpoint:** no
- 1. Confirm clean expected Git state + source-command immutability. 2. Capture initial fingerprint. 3. Run every validator, comparing fingerprint after each. 4. `git diff --check`. 5. Confirm local `HEAD` equals remote `main` and `main:master` mirror. 6. Capture final fingerprint. 7. Emit `VERIFIED` + evidence in response/transcript only — no edit/stage/commit/push after.

## Common Validators

### Frontmatter matrix

| Prompt | Frontmatter |
|---|---|
| `gc` | `description` only |
| `audit` | `description`, `argument-hint: "<pattern>"` |
| `create` | `description`, `argument-hint: "<slug> <description>"` |
| `fix` | `description`, `argument-hint: "<description of bug or error>"` |
| `init` | `description`, `argument-hint: "[--deep] [--context\|--user\|--all]"` |
| `plan` | `description`, `argument-hint: "<slug>"` |
| `research` | `description`, `argument-hint: "<slug> <topic> [--quick\|--thorough]"` |
| `ship` | `description`, `argument-hint: "<slug>"` |
| `verify` | `description`, `argument-hint: "<slug> [path\|all] [--quick] [--full] [--fix]"` |

### Required negative scan (every target)

`agent:` frontmatter; literal `task()`/`question()`/`skill()`/`write()`; `.active` + OpenCode lifecycle paths; `batch-implement`/`deep-research`/`audit-pattern`; review matrices + `review-state.json`; `/ui-slop-check`/`/compound`; legacy stamps/log/cache + `--no-cache`; writable parallel-dispatch; automatic stash/branch/worktree/install/PR/commit/push. For `rg` negatives: exit 1 = clean; exit ≥2 = error (not pass).

### Preservation proof

- Freeze initial hashes of all nine `.opencode/command/*.md`.
- `git diff --exit-code -- .opencode/command` clean.
- Every source `##`/`###` section has exactly one ledger classification.
- Per-command positive semantic-marker checks.
- Reject both unchanged raw source copied verbatim AND skeletal targets missing substantive phases.

### Final fingerprint

Capture/compare: `HEAD`; staged binary-diff digest; unstaged binary-diff digest; nonignored untracked-file manifest with content hashes; hashes of all verified prompt/contract/spec/status files. Any difference after a check invalidates the run.

## Failure Behavior and Stop Conditions

Stop immediately when:
- slug invalid/unconstrained/resolves outside namespace;
- `/create` encounters existing slug;
- same-slug artifacts change during a command;
- an authoritative command body changes after ledger freeze;
- a task exceeds three files or a plan exceeds three tasks;
- a RED check unexpectedly passes;
- any GREEN/ledger/preservation/forbidden-pattern check fails;
- optional tooling unavailable with no approved fallback;
- a required check fails/times out/skipped/mutates tracked evidence;
- a commit includes unowned paths or authorization absent;
- a push partially fails or remote OIDs mismatch;
- `.pi/fabric.json` appears in a staged diff for this milestone.

Preserve partial work; report exact blocker; no cleanup/revert/delete/silent substitution.

## Constitutional Compliance

PASS after Plan 0 corrections: no broad staging; no destructive Git/forced publication; no file deletion; no new dependency; ≤3 files/task; serial writes; exact-path commits; concurrent `.pi/fabric.json` untouched; final proof bound to unchanged bytes, emitted externally.

## Open Questions

None. The copy-and-strip approach, 9-command scope, Pi-layer contract, completion-authority split, external-verification decision, and freshness rule are all operator-approved and documented in binding contracts. `/gate` is explicitly deferred.
