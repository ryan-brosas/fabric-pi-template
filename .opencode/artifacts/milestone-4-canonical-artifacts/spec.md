# Milestone 4 — Canonical Artifacts (Audit + Hardening)

> **Status:** proposed · **ID:** ms4-001 · **Created:** 2026-07-22
> **Roadmap item:** `4. Canonical artifacts` (`.opencode/roadmap.md:59-63`)
> **Approach (operator-approved):** audit + hardening pass. Milestones 1-3 already encoded most of the canonical-artifact contract (the 4-file set exists at `.pi/artifacts/pi-template/`, ADR-006 external verification, the nine ported prompts reference `.pi/artifacts/<slug>/`, `.pi/.gitignore` tracks artifacts). This spec captures the done-state, audits the nine prompts for residual gaps, hardens them to fully encode the contract, and formalizes the two-surface design (lifecycle state vs project memory).

## Problem Statement

Roadmap milestone 4 requires `.pi/artifacts/<slug>/{PLAN,TODO,PROGRESS,DECISIONS}.md` to be the **sole lifecycle record** (lazy creation, tracked; no `.active`, no "latest"; only `/verify` declares verified status externally; no repository write after the final before/after fingerprint). A read-only audit of the nine ported `.pi/prompts/*.md` (milestone 3) against this contract found four genuine residual gaps:

1. **Lazy creation is inconsistent.** `/create` does `mkdir -p .pi/artifacts/<slug>/` (`create.md:111-115`), but `/plan`, `/research`, `/ship`, and `/verify` have no lazy-create step — they assume the dir exists. A resumed session, a partial state, or a write to a not-yet-created dir fails rather than self-healing.
2. **Slug validation is inconsistent.** `/create`, `/ship`, and `/verify` validate `<slug>` with `^(?=.{1,64}$)[a-z0-9]+(?:-[a-z0-9]+)*$` before filesystem access. `/plan` and `/research` only say the slug is "required" or "validated by /create" — no regex, no rejection of empty/absolute/slash/dot-segment/uppercase/leading-trailing-hyphen/double-hyphen values. A stale or invalid slug argument reaches the filesystem without defense-in-depth.
3. **`/gc` infers an "active slug."** `gc.md` is an operational command (no `<slug>`), but it references "the active slug" (`gc.md:33,48`) — a concept that does not exist in the Pi runtime layer (which has no `.active` pointer). This is dead inference inherited from the OpenCode layer.
4. **The two-surface contract is not formalized.** The roadmap says the 4 canonical files are the "sole lifecycle record," but several prompts also read/write `.opencode/artifacts/MEMORY.md` (project memory). This is intentional (MEMORY.md is durable cross-slug knowledge, distinct from per-slug lifecycle state), but the separation is not documented as a contract — a future reader cannot tell whether a MEMORY.md reference is a confinement violation or intended design.

The audit confirmed these are NOT gaps: no `.active` or `latest` token appears in any of the 9 prompts; `/ship` correctly states it cannot declare terminal verified status (`ship.md:12,398,441`); `/verify` correctly states it is the sole terminal-verified authority, transcript-only, no post-fingerprint write (`verify.md:8,64,133-135`); `/research` correctly states it is sideways and never declares terminal status (`research.md:10`); all frontmatter conforms (description required; argument-hint on the 8 that take args; gc description-only).

## Scope

**In:**
- Harden `/plan` and `/research`: add explicit slug-regex validation before filesystem access; add `mkdir -p .pi/artifacts/<slug>/` before writes (idempotent lazy creation, defense-in-depth).
- Harden `/ship` and `/verify`: add `mkdir -p .pi/artifacts/<slug>/` before writes (both already validate the slug regex).
- Fix `/gc`: remove "active slug" inference; operate project-wide on template domains (plugins/commands/skills/docs), optionally grade a specific `<slug>` if provided.
- Formalize the two-surface contract in `AGENTS.md`, `.pi/artifacts/pi-template/PLAN.md`, and `.pi/artifacts/pi-template/DECISIONS.md`: lifecycle state is confined to `.pi/artifacts/<slug>/{PLAN,TODO,PROGRESS,DECISIONS}.md`; project memory (`.opencode/artifacts/MEMORY.md`) is a separate writable surface for durable cross-slug knowledge, explicitly distinguished from lifecycle state; reads of project memory for context are allowed; writes to project memory are explicit "record durable finding" steps, never lifecycle state.
- Verify the hardened contract with executable checks (each gap closed, no regression in the milestone-3 static suite).

**Out:**
- No changes to the nine prompts' substantive procedural content (phases, tables, TDD, goal-backward, etc.) — only the four enumerated hardening edits + the contract formalization.
- No `.pi/tools/` fingerprint capture — milestone 5.
- No runtime smoke — milestone 6 (requires `/trust` + restart).
- No new lifecycle prompts (`/gate` is a separate deferred milestone).
- No renumbering of roadmap milestones.
- No change to the OpenCode command layer (`.opencode/command/`); source bodies remain immutable.

## Proposed Solution

1. **Slug validation (defense-in-depth):** every lifecycle prompt that takes `<slug>` (`create`, `plan`, `research`, `ship`, `verify`) validates the slug with `^(?=.{1,64}$)[a-z0-9]+(?:-[a-z0-9]+)*$` and rejects empty, absolute, slash-containing, dot-segment (`..`), uppercase, leading/trailing-hyphen, double-hyphen values **before any filesystem access**. `create`/`ship`/`verify` already do this; `plan`/`research` are hardened to match. The four operational commands (`audit`, `fix`, `gc`, `init`) keep their natural args and take no slug.
2. **Lazy creation (idempotent):** every lifecycle prompt that WRITES to `.pi/artifacts/<slug>/` does `mkdir -p .pi/artifacts/<slug>/` before writing. `/create` remains the entry point that establishes the namespace (with its existing-slug refusal). `plan`/`research`/`ship`/`verify` mkdir -p before their writes so a partial or resumed state self-heals rather than failing on a missing dir. `/create`'s duplicate check is not bypassed: if `/plan` creates a dir for a slug `/create` hasn't run for, `/create` will still refuse that slug (correct — it is in use).
3. **`/gc` fix:** remove "active slug" inference. `/gc` grades project-wide domains (plugins, commands, skills, docs) without a slug. If the operator passes an optional `<slug>`, `/gc` also grades that slug's lifecycle artifacts. No `.active`/latest inference.
4. **Two-surface contract:** add a short "Two surfaces" subsection to the AGENTS.md Lifecycle artifacts block, PLAN.md lifecycle flow, and a new ADR-007: (a) **Lifecycle state** — `.pi/artifacts/<slug>/{PLAN,TODO,PROGRESS,DECISIONS}.md`, the sole per-slug lifecycle record, confined to the slug namespace. (b) **Project memory** — `.opencode/artifacts/MEMORY.md`, durable cross-slug knowledge, a separate writable surface. Lifecycle prompts may read project memory for context; writes to project memory are explicit "record durable finding" steps and are never lifecycle state. A MEMORY.md reference in a lifecycle prompt is NOT a confinement violation; it is the intended two-surface design.
5. **No regression:** the milestone-3 static suite (frontmatter 9/9, forbidden scan 9/9, source immutability, slug presence 5/5) must still pass after hardening. The hardening edits add slug-validation + mkdir lines; they do not introduce OpenCode-only constructs.

## Success Criteria

All checks executable; `! rg -q` exits 0 on no-match (pass), non-zero on match (fail); `rg -q` exits 0 on match. `rg` exit 1 = clean; exit ≥2 = error.

1. **Verify:** slug-validation regex present in all five lifecycle prompts — `for f in create plan research ship verify; do rg -q '\^\(\?=\.\{1,64\}\$\)\[a-z0-9\]' .pi/prompts/$f.md || { echo MISSING $f; exit 1; }; done`
2. **Verify:** lazy-creation `mkdir -p` present in the five lifecycle prompts before writes — `for f in create plan research ship verify; do rg -q 'mkdir -p.*\.pi/artifacts' .pi/prompts/$f.md || { echo MISSING $f; exit 1; }; done`
3. **Verify:** `/gc` has no "active slug" inference — `! rg -qi 'active slug' .pi/prompts/gc.md`
4. **Verify:** two-surface contract documented — `rg -q 'Two surfaces|two-surface|project memory.*separate|lifecycle state.*confined' AGENTS.md && rg -q 'ADR-007' .pi/artifacts/pi-template/DECISIONS.md`
5. **Verify:** no regression — milestone-3 suite still passes: `node -e '<frontmatter matrix from ms3 prd>'` (9/9); `! rg -q 'agent:|task\(|question\(|skill\(|write\(|\.active|spec\.md|prd\.json|tasks\.json|audit-pattern|batch-implement|deep-research|review-state\.json|/ui-slop-check|/compound|progress\.md|audit\.md' .pi/prompts/*.md` (CLEAN); `for f in create plan ship verify research; do rg -q '<slug>' .pi/prompts/$f.md || exit 1; done` (5/5)
6. **Verify:** source command bodies unchanged — `git diff --exit-code -- .opencode/command/`
7. **Verify:** completion-authority split intact — `rg -q 'cannot declare completion|must not.*completion' .pi/prompts/ship.md && rg -qi 'sole.*verified|transcript only|no repository write' .pi/prompts/verify.md`
8. **Verify:** no `.active`/latest in the nine prompts — `! rg -q '\.active|latest' .pi/prompts/*.md`
9. **Verify:** `jq -e` validates the frozen `prd.json` — `jq -e . .opencode/artifacts/milestone-4-canonical-artifacts/prd.json`
10. **Verify:** every task has ≤3 files and the plan has ≤3 tasks per child plan (bounded) — `jq -e '([.tasks[].files | length] | max) <= 3' .opencode/artifacts/milestone-4-canonical-artifacts/prd.json`

## Technical Context

**Audit gap matrix (read-only, from milestone-4 explore pass):**

| Prompt | Lazy creation | Slug validation | Path confinement | .active/latest | Completion authority | Frontmatter |
|---|---|---|---|---|---|---|
| create | PASS (mkdir :111) | PASS (regex :58-66) | reads MEMORY.md (intended) | CLEAN | PASS (no verified) | PASS |
| plan | ABSENT | GAP (no regex :18) | reads MEMORY.md (intended) | CLEAN | PASS | PASS |
| research | ABSENT | GAP (no regex :14-17) | reads MEMORY.md (intended) | CLEAN | PASS (sideways :10) | PASS |
| fix | N/A (no slug) | N/A | N/A | CLEAN | PASS | PASS |
| ship | ABSENT | PASS (regex :14-16) | reads MEMORY.md (intended) | CLEAN | PASS (no completion :12,398,441) | PASS |
| verify | ABSENT | PASS (regex :10-12) | writes MEMORY.md (intended, pre-fingerprint) | CLEAN | PASS (sole external :8,64,133-135) | PASS |
| init | N/A (no slug) | N/A | N/A (bootstrap) | CLEAN | PASS | PASS |
| gc | N/A (no slug) | N/A | GAP ("active slug" :33,48) | CLEAN | PASS | PASS |
| audit | N/A (no slug) | N/A | N/A (response-only) | CLEAN | PASS | PASS |

**MEMORY.md references are the intended two-surface design, not confinement gaps.** This spec formalizes that design (ADR-007) so the distinction is explicit.

**Binding contracts:**
- `AGENTS.md:107-113` — two lifecycle layers; Pi layer = `.pi/artifacts/<slug>/{PLAN,TODO,PROGRESS,DECISIONS}.md`, explicit slug, no `.active`, only `/verify` declares verified status (externally).
- `AGENTS.md:160-166` — freshness: PASS bound to bytes; fingerprint tuple; later edit invalidates stale PASS.
- `.pi/artifacts/pi-template/PLAN.md:143-175` — lifecycle flow; self-contained prompts.
- `.pi/artifacts/pi-template/DECISIONS.md` ADR-006 — external-only final verification.
- `.pi/.gitignore` — runtime state (`/fabric/ /npm/ /git/ /sessions/`) gitignored; `/artifacts/` tracked.

**Slug regex (canonical):** `^(?=.{1,64}$)[a-z0-9]+(?:-[a-z0-9]+)*$`

## Affected Files

**Harden (4 Pi prompts):**
- `.pi/prompts/plan.md` (add slug regex + mkdir)
- `.pi/prompts/research.md` (add slug regex + mkdir)
- `.pi/prompts/ship.md` (add mkdir; slug regex already present)
- `.pi/prompts/verify.md` (add mkdir; slug regex already present)

**Fix (1 Pi prompt):**
- `.pi/prompts/gc.md` (remove "active slug" inference)

**Formalize contract (3 docs):**
- `AGENTS.md` (two-surface subsection in Lifecycle artifacts)
- `.pi/artifacts/pi-template/PLAN.md` (two-surface in lifecycle flow)
- `.pi/artifacts/pi-template/DECISIONS.md` (ADR-007 two-surface)

**Evidence (updated by /ship, not this spec):**
- `.opencode/artifacts/milestone-4-canonical-artifacts/prd.json`
- `.pi/artifacts/pi-template/TODO.md`
- `.pi/artifacts/pi-template/PROGRESS.md`
- `.opencode/state.md`

**Close (updated by /ship):**
- `.opencode/artifacts/milestone-4-canonical-artifacts/spec.md`
- `.opencode/roadmap.md`

## Tasks

Bounded serial tasks (each ≤3 files). Full graph in `prd.json`.

### [contract] Formalize the two-surface contract (3 files: AGENTS, PLAN, DECISIONS)
Add a "Two surfaces" subsection: lifecycle state (4 canonical files, confined to slug) vs project memory (MEMORY.md, separate writable surface). ADR-007. Done before prompt hardening so the contract is authoritative.

### [harden-lifecycle] Harden /plan and /research (2 files)
Add slug-regex validation before filesystem access; add `mkdir -p .pi/artifacts/<slug>/` before writes. Preserve all existing procedural content.

### [harden-execution] Harden /ship and /verify (2 files)
Add `mkdir -p .pi/artifacts/<slug>/` before writes (slug regex already present in both). Preserve all existing procedural content and authority rules.

### [harden-ops] Fix /gc (1 file)
Remove "active slug" inference; operate project-wide on template domains; optionally accept a `<slug>` to grade that slug's lifecycle artifacts. No `.active`/latest.

### [evidence] Record candidate evidence (3 files: TODO, PROGRESS, state)
Run the full static suite; record commands/exit codes/limitations + "pending final no-write verification"; mark hardening complete but verification PENDING. Not VERIFIED.

### [close] Close OpenCode feature state (2 files: spec, roadmap)
Mark each bounded task complete (without VERIFIED); roadmap milestone 4 → implementation-done/verification-pending; jq validates prd.json.

### [verify] Final no-write verification (no files; external declaration only)
All success-criteria checks pass; source command bodies unchanged; `git diff --check` clean; local HEAD == remote main == main:master; VERIFIED declared in response/transcript only — no repository write after the final before/after fingerprint.

## Risks

- **Lazy creation bypasses /create's duplicate check.** If `/plan <new-slug>` creates the dir before `/create` runs, `/create <same-slug>` would refuse it (correct — slug in use). This is an operator workflow error, not a system failure. Mitigation: `/create` remains the documented entry point; the mkdir is idempotent defense-in-depth, not a new entry point.
- **Slug-regex divergence.** Five prompts must use the identical regex. Mitigation: the success-criteria check (criterion 1) greps the exact regex in all five; any divergence fails the gate.
- **Two-surface ambiguity.** Formalizing MEMORY.md as a separate surface could be misread as "lifecycle prompts may write anywhere." Mitigation: ADR-007 explicitly states project-memory writes are "record durable finding" steps, never lifecycle state; lifecycle state is confined to the 4 canonical files.
- **gc scope change.** Removing "active slug" changes gc's behavior. Mitigation: gc still grades project-wide domains; the only change is no longer inferring a per-slug namespace that doesn't exist in the Pi layer.

## Open Questions

None material. The two-surface design (lifecycle state vs project memory) is resolved by ADR-007 in this spec. The lazy-creation + slug-validation approach is defense-in-depth, not a workflow change. The gc fix is a correctness fix (the Pi layer has no `.active`). The operator approved the audit + hardening scope.
