# Milestone 4 — Canonical Artifacts (Audit + Hardening)

> **Status:** proposed · **ID:** ms4-001 · **Created:** 2026-07-22
> **Roadmap item:** `4. Canonical artifacts` (`.opencode/roadmap.md:59-63`)
> **Approach (operator-approved):** audit + hardening pass. Milestones 1-3 already encoded most of the canonical-artifact contract (the 4-file set exists at `.pi/artifacts/pi-template/`, ADR-006 external verification, the nine ported prompts reference `.pi/artifacts/<slug>/`, `.pi/.gitignore` tracks artifacts). This spec captures the done-state, audits the nine prompts for residual gaps, hardens them to fully encode the contract, and formalizes the two-surface design (lifecycle state vs project memory).

## Operator Resolutions (binding)

Two load-bearing contract decisions resolved before implementation:

1. **Namespace ownership.** `/create` is the **sole** slug-namespace creator. An established namespace = both `PLAN.md` AND `TODO.md` exist. Downstream lifecycle commands (`/plan`, `/ship`, `/verify`) validate the slug, then **fail closed** if the namespace is missing or partial — they never `mkdir`, adopt, or auto-heal. Pre-`/create` `/research` may run read-only and returns findings in the response only (no `PROGRESS.md` or project-memory write). An empty or partial namespace blocks for operator recovery — no silent adoption, overwrite, or deletion.
2. **`/gc` scope.** Project-wide, slugless, response-only. Description-only frontmatter. No `<slug>` token, no `.active`/latest inference, no lifecycle-artifact writes, no `MEMORY.md` write. Per-slug grading is a separate future scope, not this milestone.

## Problem Statement

Roadmap milestone 4 requires `.pi/artifacts/<slug>/{PLAN,TODO,PROGRESS,DECISIONS}.md` to be the **sole lifecycle record** (tracked; no `.active`, no "latest"; only `/verify` declares verified status externally; no repository write after the final before/after fingerprint). A read-only audit of the nine ported `.pi/prompts/*.md` (milestone 3) against this contract found four genuine residual gaps:

1. **Namespace ownership is not fail-closed.** `/create` does `mkdir -p .pi/artifacts/<slug>/` (`create.md:111-115`) and refuses existing directories, but `/plan`, `/ship`, and `/verify` only require `PLAN.md` — they do not require `TODO.md`, and `/research` writes `PROGRESS.md` without an establishment guard. A partial directory or a pre-`/create` research write can be mistaken for a valid namespace or permanently block `/create` retries. Resolution: `/create` is the sole creator; an established namespace requires both sentinel files; downstream commands fail closed.
2. **Slug validation is inconsistent and out of order.** `/create`, `/ship`, and `/verify` validate `<slug>` with `^(?=.{1,64}$)[a-z0-9]+(?:-[a-z0-9]+)*$` before filesystem access. `/plan` and `/research` only say the slug is "required" or "validated by /create" — no regex. Worse, `/create` reads slug-derived paths (`MEMORY.md` at `:46-50`, `.pi/artifacts/` scan at `:54`) BEFORE validating the slug at `:58-66`. A path-like slug can influence the duplicate lookup before rejection. Resolution: validation must precede any slug-derived access in every lifecycle prompt.
3. **`/gc` infers an "active slug."** `gc.md` is an operational command (no `<slug>`), but it references "the active slug" (`gc.md:33,48`) and writes lifecycle decisions — concepts that do not exist in the Pi runtime layer (which has no `.active` pointer). This is dead inference inherited from the OpenCode layer. Resolution: `/gc` is project-wide, slugless, response-only.
4. **The two-surface contract is not formalized.** The roadmap says the 4 canonical files are the "sole lifecycle record," but several prompts also read/write `.opencode/artifacts/MEMORY.md` (project memory). This is intentional (MEMORY.md is durable cross-slug knowledge, distinct from per-slug lifecycle state), but the separation is not documented as a contract — a future reader cannot tell whether a MEMORY.md reference is a confinement violation or intended design. Resolution: ADR-007 formalizes the two surfaces with portability and privacy rules.

The audit confirmed these are NOT gaps: no `.active` or `latest` token appears in any of the 9 prompts; `/ship` correctly states it cannot declare terminal verified status (`ship.md:12,398,441`); `/verify` correctly states it is the sole terminal-verified authority, transcript-only, no post-fingerprint write (`verify.md:8,64,133-135`); `/research` correctly states it is sideways and never declares terminal status (`research.md:10`); all frontmatter conforms (description required; argument-hint on the 8 that take args; gc description-only).

## Scope

**In:**
- Harden `/create`: move slug validation before any slug-derived access; keep sole namespace creation; distinguish established/partial/absent namespaces.
- Harden `/plan` and `/research`: add explicit slug-regex validation before filesystem access; add an established-namespace guard (require `PLAN.md` and `TODO.md`); `/research` returns response-only (no `PROGRESS.md` or memory write) when the namespace is missing or partial.
- Harden `/ship` and `/verify`: add the established-namespace guard (require `PLAN.md` and `TODO.md`); replace the blanket "All artifact reads and writes are confined to .pi/artifacts/<slug>/" wording with the two-surface wording; preserve the completion-authority split.
- Fix `/gc`: remove "active slug" inference and lifecycle-artifact writes; operate project-wide and response-only; description-only frontmatter; no `<slug>` token.
- Formalize the two-surface contract in `AGENTS.md`, `.pi/artifacts/pi-template/PLAN.md`, and `.pi/artifacts/pi-template/DECISIONS.md` (ADR-007): lifecycle state is confined to `.pi/artifacts/<slug>/{PLAN,TODO,PROGRESS,DECISIONS}.md`; project memory (`.opencode/artifacts/MEMORY.md`) is an **optional** separate surface for durable cross-slug knowledge; missing memory is treated as absent (non-blocking); ordinary prompts must not auto-create the OpenCode scaffold; only `/init` may establish the OpenCode context surface; `/verify` may append one distilled non-sensitive finding pre-fingerprint; memory writes contain distilled knowledge only — never secrets, credentials, PII, raw tool output, per-slug status, or final verification results.
- Verify the hardened contract with executable fail-closed checks (each gap closed, no regression in the milestone-3 static suite).

**Out:**
- No changes to the nine prompts' substantive procedural content (phases, tables, TDD, goal-backward, etc.) — only the enumerated hardening edits + contract formalization.
- No `mkdir -p` added to `/plan`, `/research`, `/ship`, or `/verify` — `/create` is the sole namespace creator.
- No optional `<slug>` on `/gc` — per-slug grading is a separate future scope.
- No `.pi/tools/` fingerprint capture — milestone 5.
- No runtime smoke — milestone 6 (requires `/trust` + restart).
- No new lifecycle prompts (`/gate` is a separate deferred milestone).
- No renumbering of roadmap milestones.
- No change to the OpenCode command layer (`.opencode/command/`); source bodies remain immutable against the `bebd044` baseline.

## Proposed Solution

1. **Namespace ownership (fail-closed).** `/create` is the sole namespace creator. It validates the slug first, then `mkdir -p .pi/artifacts/<slug>/` and writes both `PLAN.md` and `TODO.md`, refusing an existing namespace. An established namespace = both `PLAN.md` and `TODO.md` exist. Downstream lifecycle commands (`/plan`, `/ship`, `/verify`) validate the slug, then check that both sentinel files exist; if either is missing, they stop without writes (block for operator recovery — no adoption, overwrite, or deletion). `/research` validates the slug; if the namespace is established it may write `PROGRESS.md`; if missing or partial it runs read-only and returns findings in the response only.
2. **Slug validation (defense-in-depth, ordered).** Every lifecycle prompt that takes `<slug>` (`create`, `plan`, `research`, `ship`, `verify`) validates the slug with `^(?=.{1,64}$)[a-z0-9]+(?:-[a-z0-9]+)*$` and rejects empty, absolute, slash-containing, dot-segment (`..`), uppercase, leading/trailing-hyphen, double-hyphen values **before any slug-derived filesystem or project-memory access**. The four operational commands (`audit`, `fix`, `gc`, `init`) keep their natural args and take no slug.
3. **`/gc` fix.** `/gc` is project-wide, slugless, and response-only. Description-only frontmatter. It grades project-wide template domains (plugins, commands, skills, docs), reads project memory only when it exists, never writes it, and emits grades and recommendations in the response only. No `.active`/latest inference, no lifecycle-artifact writes, no `<slug>` token.
4. **Two-surface contract (ADR-007).** Add a "Two surfaces" subsection to `AGENTS.md`, `PLAN.md`, and a new `ADR-007`: (a) **Lifecycle state** — `.pi/artifacts/<slug>/{PLAN,TODO,PROGRESS,DECISIONS}.md`, the sole per-slug lifecycle record, confined to the slug namespace. (b) **Project memory** — `.opencode/artifacts/MEMORY.md`, an **optional** separate writable surface for durable cross-slug knowledge. Missing memory is treated as absent (non-blocking); prompts must not auto-create the OpenCode scaffold. Only `/init` may establish the OpenCode context surface; `/verify` may append one distilled non-sensitive finding pre-fingerprint. Lifecycle prompts may read project memory for context when it exists; writes to project memory are explicit "record durable finding" steps, never lifecycle state. Memory content is distilled, non-sensitive knowledge only — never secrets, credentials, PII, raw tool output, per-slug status, or final verification results. A MEMORY.md reference in a lifecycle prompt is NOT a confinement violation; it is the intended two-surface design.
5. **No regression.** The milestone-3 static suite (frontmatter 9/9, forbidden scan CLEAN, source immutability, slug presence 5/5) must still pass after hardening. The hardening edits add slug-validation + establishment-guard + two-surface wording; they do not introduce OpenCode-only constructs.

## Success Criteria

All checks are executable and **fail-closed**. `rg` exit 1 = clean (pass); exit ≥2 = error (fail). Negative checks use Node assertions or explicitly accept only `rg` exit 1, never bare `! rg` (which treats a tool error as success). Source-immutability and target-heading preservation are **baseline-bound** against `bebd0449eb501fe9e7dd5fa66781ad1f1613a459`, not index-only.

1. **Verify (slug regex, ordered):** the canonical regex precedes the first slug-derived access in all five lifecycle prompts — `node -e '<A2 order validator: regex index < min(MEMORY index, .pi/artifacts/<slug> index) for create/plan/research/ship/verify; throw on violation>'`
2. **Verify (namespace ownership):** `/create` is the only lifecycle prompt that creates a namespace — `node -e '<B1 validator: exactly one of create/plan/research/ship/verify contains "mkdir -p" + .pi/artifacts; that one is create; the other four forbid mkdir>'`
3. **Verify (established-namespace guard):** `/plan`, `/ship`, and `/verify` require both `PLAN.md` and `TODO.md` before any lifecycle write — `node -e '<B2 validator: plan/ship/verify contain established-namespace guard requiring both files; stop without writes on missing/partial>'`
4. **Verify (research response-only):** `/research` returns response-only (no `PROGRESS.md` or memory write) when the namespace is missing or partial — `node -e '<B1 validator: research contains the response-only branch for missing/partial namespace>'`
5. **Verify (/gc slugless):** `/gc` has description-only frontmatter, no `<slug>` token, no active/latest inference, no lifecycle-artifact write, no `MEMORY.md` write — `node -e '<B3 validator>'`
6. **Verify (two-surface contract):** documented in AGENTS + PLAN + ADR-007 — `rg -q 'Two surfaces|two-surface|project memory.*separate|lifecycle state.*confined' AGENTS.md && rg -q 'ADR-007' .pi/artifacts/pi-template/DECISIONS.md && rg -qi 'two surface|project memory' .pi/artifacts/pi-template/PLAN.md`
7. **Verify (no regression, milestone-3 suite):** `node -e '<frontmatter matrix 9/9>'` and `rg -q 'agent:|task\(|question\(|skill\(|write\(|\.active|spec\.md|prd\.json|tasks\.json|audit-pattern|batch-implement|deep-research|review-state\.json|/ui-slop-check|/compound|progress\.md|audit\.md' .pi/prompts/*.md` exits 1 (CLEAN), and `for f in create plan ship verify research; do rg -q '<slug>' .pi/prompts/$f.md || exit 1; done` (5/5)
8. **Verify (source immutability, baseline-bound):** `git diff --exit-code bebd0449eb501fe9e7dd5fa66781ad1f1613a459 -- .opencode/command/audit.md .opencode/command/create.md .opencode/command/fix.md .opencode/command/gc.md .opencode/command/init.md .opencode/command/plan.md .opencode/command/research.md .opencode/command/ship.md .opencode/command/verify.md`
9. **Verify (target-heading preservation):** every baseline `##`/`###` heading in each changed prompt remains after the edit — `node -e '<heading-preservation validator against B_BASE>'`
10. **Verify (completion-authority split):** `rg -q 'cannot declare (terminal )?(verified status|completion)' .pi/prompts/ship.md && rg -qi 'sole.*verified|transcript only|no repository write' .pi/prompts/verify.md`
11. **Verify (no .active/latest):** `rg -q '\.active|latest' .pi/prompts/*.md` exits 1 (CLEAN)
12. **Verify (prd graph bounded):** `jq -e` validates prd.json; 2-3 tasks per child plan; ≤3 files per task; ID-based dependencies point backward — `node -e '<task graph validator against prd.json>'`

## Technical Context

**Audit gap matrix (read-only, from milestone-4 explore pass):**

| Prompt | Namespace creation | Slug validation | Path confinement | .active/latest | Completion authority | Frontmatter |
|---|---|---|---|---|---|---|
| create | PASS (mkdir :111) | GAP (regex :58-66 AFTER access :42-54) | reads MEMORY.md (intended) | CLEAN | PASS (no verified) | PASS |
| plan | ABSENT (must NOT create) | GAP (no regex :18) | reads MEMORY.md (intended) | CLEAN | PASS | PASS |
| research | ABSENT (must NOT create) | GAP (no regex :14-17) | reads MEMORY.md (intended); writes PROGRESS without guard | CLEAN | PASS (sideways :10) | PASS |
| fix | N/A (no slug) | N/A | N/A | CLEAN | PASS | PASS |
| ship | ABSENT (must NOT create) | PASS (regex :14-16) | blanket confinement conflicts with MEMORY read :47-53 | CLEAN | PASS (no completion :12,398,441) | PASS |
| verify | ABSENT (must NOT create) | PASS (regex :10-12) | blanket confinement conflicts with MEMORY write :147-153 | CLEAN | PASS (sole external :8,64,133-135) | PASS |
| init | N/A (no slug) | N/A | N/A (bootstrap; establishes OpenCode surface) | CLEAN | PASS | PASS |
| gc | N/A (no slug) | N/A | GAP ("active slug" :33,48; lifecycle writes) | CLEAN | PASS | PASS |
| audit | N/A (no slug) | N/A | N/A (response-only) | CLEAN | PASS | PASS |

**MEMORY.md references are the intended two-surface design, not confinement gaps.** This spec formalizes that design (ADR-007) so the distinction is explicit.

**Binding contracts:**
- `AGENTS.md:107-113` — two lifecycle layers; Pi layer = `.pi/artifacts/<slug>/{PLAN,TODO,PROGRESS,DECISIONS}.md`, explicit slug, no `.active`, only `/verify` declares verified status (externally).
- `AGENTS.md:160-166` — freshness: PASS bound to bytes; fingerprint tuple; later edit invalidates stale PASS.
- `.pi/artifacts/pi-template/PLAN.md:143-175` — lifecycle flow; self-contained prompts.
- `.pi/artifacts/pi-template/DECISIONS.md` ADR-006 — external-only final verification.
- `.pi/.gitignore` — runtime state (`/fabric/ /npm/ /git/ /sessions/`) gitignored; `/artifacts/` tracked.

**Slug regex (canonical):** `^(?=.{1,64}$)[a-z0-9]+(?:-[a-z0-9]+)*$`

**Baselines (frozen):**
- Source-command immutability baseline OID: `bebd0449eb501fe9e7dd5fa66781ad1f1613a459`.
- Source-command sha256: audit=`d802d209...`, create=`c93c8bcc...`, fix=`b5842411...`, gc=`02a81685...`, init=`46e67990...`, plan=`fb23a75c...`, research=`4e5776a5...`, ship=`5136edb1...`, verify=`17306b1c...`.
- Target-prompt baseline (pre-hardening) sha256: create=`d3c457bb...`, plan=`f5681d44...`, research=`61d1f23f...`, ship=`5dcc1d12...`, verify=`861f57b3...`, gc=`8a3fb183...`. Plan B freezes `B_BASE` and requires every baseline `##`/`###` heading to remain in each changed prompt.

## Affected Files

**Manifests (exhaustive, exact-path staging):**
- `write_paths` (16 unique paths across A1-C2, incl. the new `plan.md`):
  - Plan A1: `.opencode/artifacts/milestone-4-canonical-artifacts/{spec.md,prd.json,plan.md}`
  - Plan A2: `AGENTS.md`, `.pi/artifacts/pi-template/PLAN.md`, `.pi/artifacts/pi-template/DECISIONS.md`
  - Plan B1: `.pi/prompts/{create,plan,research}.md`
  - Plan B2: `.pi/prompts/{ship,verify}.md`
  - Plan B3: `.pi/prompts/gc.md`
  - Plan C1: `.pi/artifacts/pi-template/{TODO,PROGRESS}.md`, `.opencode/state.md`
  - Plan C2: `.opencode/artifacts/milestone-4-canonical-artifacts/spec.md`, `.opencode/roadmap.md`
  - Plan C3: `[]` (no-write, external declaration only)
- `protected_source_paths` (9 OpenCode commands, never modified): `.opencode/command/{audit,create,fix,gc,init,plan,research,ship,verify}.md`
- `verified_paths` (all planning/contract/prompt/evidence/closure/active-pointer/ignore-policy files, hashed in C3): the 16 `write_paths` plus `.opencode/artifacts/.active` and `.pi/.gitignore`.

**Shared serial ownership:** `spec.md` is written by A1 (correct) and C2 (close). Each task commits only its owned `files`.

## Tasks

Bounded serial tasks across three child plans (A: 2, B: 3, C: 3). Every task ≤3 files. Full graph in `prd.json` with stable IDs `A1`-`C3`, `child_plan` fields, ID-based dependencies.

### Child Plan A — Contract Freeze

**A1 [contract] Correct the active planning contract (3 files: spec, prd, plan).**
Write the persisted `plan.md`; restructure `prd.json` to A1-C3 task IDs + `child_plan` + manifests; correct `spec.md` to: `/create` sole owner, established=PLAN+TODO, downstream fail-closed, research response-only, `/gc` project-wide slugless, two-surface ADR-007. Commit `docs(plan): milestone 4 — freeze canonical-artifact contract`.

**A2 [contract] Formalize canonical contract + ADR-007 (3 files: AGENTS, PLAN, DECISIONS).**
Add the two-surface + namespace-ownership + privacy contract to AGENTS and PLAN; add ADR-007. Done before prompt hardening so the contract is authoritative.

### Child Plan B — Prompt Hardening

Before B1, freeze `B_BASE = HEAD`. After each B task, compare the 9 source commands against `bebd044` and verify every baseline `##`/`###` heading in each changed prompt remains.

**B1 [harden] Harden /create, /plan, /research (3 files).**
Move `/create` validation before slug-derived access; keep sole `mkdir`; add established/partial/absent distinction. Add regex + establishment guard to `/plan` and `/research`; `/research` returns response-only when namespace missing/partial.

**B2 [harden] Align /ship and /verify (2 files).**
Require both sentinel files; replace blanket confinement with two-surface wording; preserve completion-authority split.

**B3 [harden] Make /gc project-wide slugless response-only (1 file).**
Description-only frontmatter; no `<slug>` token; no active/latest; no lifecycle-artifact write; no `MEMORY.md` write.

### Child Plan C — Evidence and Closure

**C1 [evidence] Record candidate evidence (3 files: TODO, PROGRESS, state).**
Run every A/B validator and the milestone-3 regression suite; record commands/exit codes/baseline OID/limitations + "pending final no-write verification"; mark hardening complete but verification PENDING. Not VERIFIED.

**C2 [close] Close implementation state (2 files: spec, roadmap).**
Mark only A1-C2 complete; leave C3 explicitly pending external no-write verification. Roadmap milestone 4 → implementation-done/verification-pending. Complete all remote synchronization before C3.

**C3 [verify] Final no-write static verification (0 files; external declaration only).**
Capture the fingerprint tuple (HEAD, staged/unstaged digests, untracked manifest, verified-file hashes); run all validators read-only; compare the tuple after every check; on mutation or failure, return to the owning task and restart C1-C3 (never repair inline after baseline). Declare **Milestone 4 statically VERIFIED** in the response/session transcript only. No repository write after the baseline fingerprint. Runtime verification remains deferred to milestone 6.

## Risks

- **Partial namespace blocks /create.** If `/create` writes `PLAN.md` but crashes before `TODO.md`, the namespace is partial and downstream commands fail closed (correct — operator recovery, no auto-heal). Mitigation: `/create` is atomic in prose; the established-namespace sentinel catches partial state.
- **Slug-regex divergence.** Five prompts must use the identical regex. Mitigation: the order-aware validator (criterion 1) greps the exact regex in all five; any divergence fails the gate.
- **Two-surface ambiguity.** Formalizing MEMORY.md as a separate surface could be misread as "lifecycle prompts may write anywhere." Mitigation: ADR-007 explicitly states project-memory writes are "record durable finding" steps (only `/init` establishes the surface and `/verify` appends pre-fingerprint), never lifecycle state; lifecycle state is confined to the 4 canonical files; missing memory is non-blocking.
- **gc scope change.** Removing "active slug" changes gc's behavior. Mitigation: gc still grades project-wide domains; the only change is no longer inferring a per-slug namespace that doesn't exist in the Pi layer.
- **Forbidden-token-in-parenthetical.** Explaining what is NOT used (e.g. "no `<slug>`") can match a literal forbidden token. Mitigation: the B3 validator checks behavior, not bare-token presence; rewording avoids the literal token while preserving the negation.

## Open Questions

None material. The two-surface design (lifecycle state vs project memory) is resolved by ADR-007. Namespace ownership and `/gc` scope are resolved by operator decision. The hardening is fail-closed defense-in-depth, not a workflow change.
