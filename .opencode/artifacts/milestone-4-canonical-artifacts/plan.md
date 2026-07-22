# Milestone 4 — Canonical Artifacts Implementation Plan

**Slug:** `milestone-4-canonical-artifacts`
**Baseline OID:** `bebd0449eb501fe9e7dd5fa66781ad1f1613a459`
**Discovery:** Level 0 external / Deep local
**Effort:** L
**Mode:** Direct execution (serial; single-writer rule forbids writable fan-out)

## Operator Resolutions (binding)

1. **Namespace ownership.** `/create` is the SOLE slug-namespace creator. Established namespace = both `PLAN.md` AND `TODO.md` exist. Downstream lifecycle commands (`/plan`, `/ship`, `/verify`) validate the slug then **fail closed** if the namespace is missing/partial — they never `mkdir` or adopt. Pre-`/create` `/research` runs read-only and returns findings in the response only (no `PROGRESS.md` or memory write). Empty/partial namespaces block for operator recovery — no adoption, overwrite, or deletion.
2. **`/gc` scope.** Project-wide, slugless, response-only. Description-only frontmatter. No `<slug>` token, no active/latest inference, no lifecycle-artifact writes, no `MEMORY.md` write. Per-slug grading is a separate future scope.

## Observable Truths

1. Invalid, absolute, path-like, uppercase, or malformed slugs stop before filesystem or memory access.
2. `/create` creates a previously unused namespace and both initial canonical files.
3. `/plan`, `/ship`, and `/verify` stop without writes when either `PLAN.md` or `TODO.md` is missing.
4. `/research` may run before `/create`, but returns findings only and creates no files.
5. Existing lifecycle state is confined to the four canonical files; project memory never carries task status or final verification state.
6. `/gc` grades the project and returns its report without inferring or modifying a slug.
7. `/ship` still cannot declare completion; `/verify` remains the sole external completion authority.

## Required Artifacts

| Group | Paths | Provides |
|---|---|---|
| Planning contract | milestone-4 `spec.md`, `prd.json`, `plan.md` | Corrected scope, task graph, manifests |
| Canonical authority | `AGENTS.md`, canonical `PLAN.md`, `DECISIONS.md` | Namespace ownership, memory boundary, ADR-007 |
| Namespace prompts | `create.md`, `plan.md`, `research.md` | Validation and establishment behavior |
| Execution prompts | `ship.md`, `verify.md` | Established-namespace and memory rules |
| Operational prompt | `gc.md` | Project-wide response-only behavior |
| Evidence | canonical `TODO.md`, `PROGRESS.md`, `.opencode/state.md` | Candidate evidence only |
| Closure | milestone-4 `spec.md`, `.opencode/roadmap.md` | Implementation-done, verification-pending state |

## Key Links

| From | To | Via | Failure risk |
|---|---|---|---|
| Parsed slug | Artifact path | Canonical regex before access | Path escape or malformed namespace |
| `/create` | Namespace | Sole `mkdir` owner | Partial directory blocks future creation |
| Downstream command | Namespace | Require `PLAN.md` and `TODO.md` | Partial state mistaken for valid work |
| Lifecycle prompt | Project memory | Optional, explicit access | Cross-slug state or sensitive data leakage |
| `/ship` | `/verify` | Completion-authority boundary | Ship falsely claims completion |
| Checks | VERIFIED | Stable fingerprint | Concurrent edit leaves stale PASS |

## Dependency Graph

```text
A1 Contract correction + persisted plan
  -> A2 Canonical contract + ADR-007
    -> B1 Namespace prompts (create/plan/research)
      -> B2 Execution prompts (ship/verify)
        -> B3 Project-wide /gc
          -> C1 Candidate evidence
            -> C2 Implementation closure
              -> C3 Final no-write verification
```

Eight serial waves. Writable work never runs in parallel.

## Child Plan A — Contract Freeze

### Task A1: Correct the active planning contract

```yaml
needs: operator decisions on namespace ownership and gc scope
creates: corrected spec, bounded PRD, persisted plan
has_checkpoint: false
files:
  - .opencode/artifacts/milestone-4-canonical-artifacts/spec.md
  - .opencode/artifacts/milestone-4-canonical-artifacts/prd.json
  - .opencode/artifacts/milestone-4-canonical-artifacts/plan.md
```

RED: the present documents fail because they mandate downstream directory creation, add optional `/gc <slug>`, omit `/create` hardening, and have no `plan.md`.

Correct to: `/create` sole owner; established = PLAN+TODO; downstream fail-closed; research response-only; `/gc` project-wide slugless; two-surface ADR-007; fail-closed validators; baseline-bound immutability.

GREEN: `jq -e` prd.json; task-graph validator (2-3 tasks per child plan, ≤3 files, ID-based deps backward); `plan.md` exists.

Commit: `docs(plan): milestone 4 — freeze canonical-artifact contract`

### Task A2: Formalize namespace and memory authority

```yaml
needs: A1
creates: canonical two-surface contract and ADR-007
has_checkpoint: false
files:
  - AGENTS.md
  - .pi/artifacts/pi-template/PLAN.md
  - .pi/artifacts/pi-template/DECISIONS.md
```

RED: the three files lack ADR-007 and the full namespace/memory contract.

Add: `/create` sole creator; established sentinel (PLAN+TODO); partial namespaces block without adoption/overwrite/deletion; lifecycle state confined to the four files; project memory optional cross-slug context; missing memory non-blocking; only `/init` may establish the OpenCode surface; `/verify` may append one distilled non-sensitive finding pre-fingerprint; memory content never secrets/credentials/PII/raw output/per-slug status/final results. ADR-007 with Context/Decision/Consequences/Alternatives.

GREEN: contract phrases and ADR section exist; existing authority and ADR-006 unchanged.

Commit: `docs(contract): milestone 4 — canonical namespace + project memory`

## Child Plan B — Prompt Hardening

Before B1, freeze `B_BASE = HEAD`. After each B task:

```bash
git diff --exit-code bebd0449eb501fe9e7dd5fa66781ad1f1613a459 -- \
  .opencode/command/{audit,create,fix,gc,init,plan,research,ship,verify}.md
```

Also compare every baseline `##`/`###` heading in changed prompts against its `bebd044` version. No pre-existing procedural heading may disappear.

### Task B1: Harden /create, /plan, /research

```yaml
needs: A2
creates: ordered validation and fail-closed namespace behavior
has_checkpoint: false
files:
  - .pi/prompts/create.md
  - .pi/prompts/plan.md
  - .pi/prompts/research.md
```

RED: order-aware assertion reports `/create` validation follows slug-derived access; `/plan` and `/research` lack canonical validation; `/research` can write without an established namespace.

- `/create`: move slug parsing/validation before context and duplicate checks; keep sole namespace creation; distinguish established/partial/absent namespaces.
- `/plan`: validate before memory or artifact reads; require both sentinel files; never create a directory.
- `/research`: validate first; if established, may write `PROGRESS.md`; if missing/partial, response-only (no `PROGRESS.md` or memory write).

GREEN: order-aware assertion passes; exactly one namespace-creation instruction across these three prompts; baseline headings preserved.

Commit: `fix(pi): milestone 4 — enforce canonical namespace ownership`

### Task B2: Align /ship and /verify

```yaml
needs: B1
creates: established-namespace and two-surface execution guards
has_checkpoint: false
files:
  - .pi/prompts/ship.md
  - .pi/prompts/verify.md
```

RED: both prompts contain blanket confinement wording and lack an explicit two-surface distinction.

- Require both canonical files before any project-memory read or lifecycle write.
- Keep namespace creation forbidden.
- Replace blanket wording with: lifecycle state is slug-confined; optional project memory is a separate surface.
- `/verify` may append a durable finding only if MEMORY exists, before the final fingerprint, under ADR-007 privacy rules.
- Preserve: `/ship` cannot declare terminal completion; `/verify` sole external authority; no post-fingerprint write.

GREEN: order, memory-boundary, no-directory-creation, and completion-authority assertions pass; baseline headings and milestone-3 markers preserved.

Commit: `fix(pi): milestone 4 — align ship and verify artifact boundaries`

### Task B3: Make /gc project-wide and response-only

```yaml
needs: B2
creates: slugless project quality command
has_checkpoint: false
files:
  - .pi/prompts/gc.md
```

RED: current file matches "active slug" and lifecycle-artifact writes.

- Remove all slug inference and lifecycle-artifact writes.
- Keep description-only frontmatter.
- Keep Fallow scan, quality domains, cleanup recommendations, tooling status.
- Read project memory only when it exists; never write it.
- Emit grades and recommendations in the response only.

GREEN: no slug token, active/latest inference, lifecycle-artifact write, or argument hint remains; all quality phases still exist.

Commit: `fix(pi): milestone 4 — make gc project-wide and response-only`

## Child Plan C — Evidence and Closure

### Task C1: Record candidate evidence

```yaml
needs: B3
creates: pre-final evidence with verification explicitly pending
has_checkpoint: false
files:
  - .pi/artifacts/pi-template/TODO.md
  - .pi/artifacts/pi-template/PROGRESS.md
  - .opencode/state.md
```

Run every A/B validator. Verify protected command bodies against `bebd044`. Run the full milestone-3 regression suite (frontmatter, forbidden scan, source preservation, slug presence, completion authority, heading preservation). Run `git diff --check`. Record commands, exit codes, baseline OID, verified paths, limitations, and runtime-smoke deferral. Mark milestone 4 implementation complete but **pending external static verification**. Commit and push these exact paths.

Commit: `docs(pi): milestone 4 — record candidate evidence (pending final no-write verify)`

### Task C2: Close implementation state

```yaml
needs: C1
creates: implemented/pending-verification OpenCode status
has_checkpoint: false
files:
  - .opencode/artifacts/milestone-4-canonical-artifacts/spec.md
  - .opencode/roadmap.md
```

Mark only A1-C2 complete. Leave C3 explicitly pending external no-write verification. Mark roadmap milestone 4 implementation-done/static-verification-pending. Re-run PRD graph and JSON checks. Commit and push these exact two paths. Complete all remote synchronization before C3.

Commit: `docs(create): milestone 4 — close implementation state (verification pending)`

### Task C3: Final no-write static verification

```yaml
needs: C2, all authorized commits and pushes complete
creates: external static-verification declaration
has_checkpoint: false
files: []
```

1. Capture: HEAD OID; staged binary-diff digest; unstaged binary-diff digest; untracked-file content manifest; hashes of every verified path.
2. Run each validator read-only.
3. Recompute and compare the complete tuple after every validator.
4. Verify: protected command bodies match `bebd044`; only manifest-owned files changed since that baseline; all current and baseline prompt headings remain; PRD graph/manifests pass; canonical slug/order/namespace checks pass; memory privacy and portability checks pass; `/gc` remains slugless and response-only; milestone-3 regression suite passes; `git diff --check` passes; local HEAD equals both synchronized remote refs.
5. Compare the final tuple to the initial tuple.
6. If unchanged, declare **Milestone 4 statically VERIFIED** in the response/session transcript only.
7. Perform no edit, stage, commit, push, formatter, or evidence write after the baseline fingerprint.

Any mutation or failed check returns to its owning task and restarts C1-C3. Runtime verification remains deferred to milestone 6.

## Failure Behavior

- Invalid slug: stop before reads or writes.
- Missing or partial namespace: block without creating, adopting, overwriting, or deleting anything.
- Missing project memory: continue without it.
- Source-command or unexplained heading drift: stop before commit.
- Validator error: fail closed; do not interpret tool failure as a clean negative result.
- Concurrent byte change: invalidate the verification run.
- Commit path outside task ownership: do not push.
- Unavailable standing Git authorization in a later session: pause before commit or push.

## Privacy and Security

- Project memory is tracked; only distilled, non-sensitive cross-slug knowledge belongs there.
- Never place secrets, credentials, PII, raw tool output, per-slug status, or final fingerprint evidence in memory.
- No new dependencies, automatic installs, publication, or destructive filesystem operations.
- `.pi/fabric.json` remains outside this milestone and must not be staged.

## Constitutional Compliance

PASS after Task A1 corrects the current spec/PRD. Eight tasks split 2/3/3. Every task owns at most three files. All writable waves are serial. Exact-path staging only. No destructive Git operations, dependency additions, file deletion, or writable fan-out. Final verification is no-write and external.
