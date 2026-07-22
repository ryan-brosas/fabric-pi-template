# Pi-Native Initialization Compiler (`/init`) and Source-Backed `/create`

> **Status:** spec + prd created (10 P1 corrections applied) — P1.1 in progress (fixture + baseline + prd done; this spec aligned) · **ID:** pni-001 · **Created:** 2026-07-23
> **Predecessor (operator Option B):** `away-sandbox-runtime` is paused at B3 (C1–D3 deferred, reconcile-on-resume); `.opencode/artifacts/.active` remains on it (not repointed by this feature). B1 wrote ADR-014 into `AGENTS.md`/`DECISIONS.md`/`PLAN.md` — the same shared authority files this feature's P2.1/P7.3 must edit. The operator reserved `pi-native-init` as the next feature under a feature-scoped baseline (absolute byte-equality unachievable under concurrent churn; binding check: pi-native-init commits must not touch protected paths). Shared-file edits at P2.1/P7.3 are the real serialization points.
> **Approach (operator-approved):** redesign `/init` as the truthful first lifecycle touch — a hybrid compiler that produces the complete Pi-native project packet and hands off to source-backed `/create`. Full packet always; structured roadmap cards; verbatim managed AGENTS boilerplate; crash-safe refresh; all runtime context migrated from `.opencode` to `.pi` (no compatibility shims). Eight strictly serial child plans; `.pi/state.md` stays `partial` until the final static gate, then `ready` as the last production write.

## Operator Resolutions (binding)

Load-bearing design decisions resolved before this spec (brainstorm + review gates):

1. **Mandatory first touch.** `/init` is the required lifecycle opener. It produces the full packet always — `--context`/`--user`/`--all` modes are removed. Fresh projects no longer point to `/plan` (wrong: `/plan` requires an established namespace). Handoff is source-backed `/create`.
2. **Hybrid compiler.** `/init [--from <path[#anchor]>] [--deep]` accepts explicit project intent (PLAN/PRD/README) when supplied; otherwise discovers and interviews. `/init --refresh` reconciles an established packet.
3. **Canonical roadmap.** `.pi/ROADMAP.md` is the sole default (resolves the autonomous-away-loop open question; the away runtime must work without `.opencode`).
4. **Structured cards.** Roadmap is versioned Markdown cards (`roadmap_schema_version: 1`), not prose. 1–3 Ready cards, bounded Next, summarized Later themes.
5. **User profile.** `.pi/user.md` — tracked, operator-approved identity/preferences only; no secrets, no inferred personal data. Every field is explicitly previewed.
6. **All Pi-native packet.** Root `AGENTS.md` plus `.pi/{ROADMAP.md,user.md,tech-stack.md,state.md,memory.md}`. No `.opencode` runtime dependency for shipped prompts/skills.
7. **Source-backed `/create`.** `/create <slug> --from <repo-relative-path[#anchor]>` derives one bounded feature from a roadmap card or PLAN/PRD section, preserving provenance. `/create <slug> "raw description"` is retained. `/init` never creates a feature namespace; `/create` remains the sole slug-namespace creator.
8. **Init reruns.** Plain `/init` is fresh-only; an established packet refuses and points to `/init --refresh`. Refresh = rediscover + semantic diff + preview + confirmed reconciliation.
9. **Curated horizons.** Source PLAN decomposition yields 1–3 Ready cards, bounded Next, summarized Later — no exhaustive speculative decomposition.
10. **Verbatim boilerplate everywhere.** The operator-supplied AGENTS policy block is preserved byte-for-byte inside exact managed markers in every generated `AGENTS.md`. Root `AGENTS.md` is migrated into the same marker structure. No deduplication, weakening, or conditionalizing; no 60/150-line cap. A deterministic byte comparison ties the init literal block, the root marker-bounded block, and the locked fixture.
11. **ADR-016.** Supersedes only ADR-007's project-memory *location* (`.opencode/artifacts/MEMORY.md` → `.pi/memory.md`); ADR-007's historical text and namespace decisions are preserved (marked partially superseded). Permits the narrow initialization-state frontmatter schema while continuing to prohibit lifecycle-kernel/typed-handoff schemas. ADR-014/015 are reserved by active away features, so this is ADR-016. No compatibility shims or fallback reads.
12. **Crash-safe refresh.** `.pi/state.md` frontmatter `schema_version: 1`, `initialization_status: partial|ready`, `context_reload_required: true|false` (`BLOCKED` is response-only, never persisted). Fresh init writes state last. Refresh with changes writes `partial` before any other packet mutation and `ready` last; a crash leaves lifecycle commands blocked. Any `AGENTS.md` mutation leaves state `partial` + `context_reload_required: true` and advertises only `/reload` then `/init --refresh`; only a post-`/reload` (or restart) refresh with no drift writes `ready` + `context_reload_required: false` last, then emits the `/create` handoff. The seed state stays `partial` until the final plan; intermediate plans do not advertise an unimplemented `/create --from`.
13. **Source is untrusted data.** Exact bounds, secret-name denylist, canonical realpath in repo, no symlinks/truncation; embedded instructions/commands/tool requests are ignored and cannot trigger actions. Provenance binds stable bytes (hash before extraction, revalidate immediately before write; drift restarts preview with zero target writes).
14. **Review-gate corrections (binding).** (a) Canonical `PLAN.md` encodes the *complete* ADR-016 contract, not just the schema exception. (b) The verification skill's cache/skip/post-success-append semantics are *removed*, not repointed. (c) The final no-write pass reruns `away-sandbox-runtime` D3 full tests/attestation/fingerprint against final bytes; any failure reopens work, and state returns to `partial` before any repair write. (d) The retained-fixture smoke covers missing/malformed/partial/not-ready packet rejection for every lifecycle command, proves slug validation precedes packet access for every slugged command, and proves slugless `/gc` gates before memory/action. (e) The smoke covers post-preview source/AGENTS-appendix mutation for `/init` and `/create --from` (re-preview/block, zero target/namespace writes).

## Problem Statement

Current `/init` (`.pi/prompts/init.md`) is a collection of setup flags, not a coherent lifecycle opener:

- It points fresh projects to `/plan` (`init.md:10`), but `/plan` now refuses absent namespaces and requires `/create` first (`plan.md:20-29,82-87`). The handoff is broken.
- Default output is `AGENTS.md` + `.opencode/tech-stack.md`; `--context`/`--user`/`--all` are optional modes (`init.md:13-20,28-44`). There is no observable readiness contract and no full packet.
- It caps AGENTS at `<60`/150 lines (`init.md:79`), conflicting with the operator's verbatim-boilerplate requirement.
- All project context lives under `.opencode` (`tech-stack/roadmap/state/user.md`, `artifacts/MEMORY.md`), but the shipped Pi runtime — and the autonomous-away runtime — must work with `.opencode` absent. ADR-007 hardcodes the old memory location; no decision moves context to `.pi`.
- `/create` accepts only `<slug> "raw description"` (`create.md:42-55`); there is no way to derive a feature from a roadmap card or PLAN section with stable provenance.

Root cause: `/init` creates files but lacks a readiness contract, points to the wrong next command, and the project-context surface is on the wrong layer.

## Scope

**In:**
- Rewrite `/init` as a hybrid compiler: fresh / interrupted / established / refresh state machine; full packet; bounded untrusted source; preview with hash-drift checks; exact managed boilerplate; `READY`/`PARTIAL`/response-only `BLOCKED`; exact `/create --from` handoff only when ready.
- Add `/create <slug> --from <repo-relative-path[#anchor]>` while preserving slug-first validation, fail-closed namespace ownership, and all review/supervisor rules; stable source-byte provenance; no roadmap mutation.
- Migrate all runtime context from `.opencode` to `.pi`: root `AGENTS.md` managed region + appendix; `.pi/{ROADMAP,user,tech-stack,state,memory}.md`. ADR-016 supersedes ADR-007's memory location. Update all runtime consumers (`.pi/prompts/{create,plan,research,ship,verify,gc,init}.md`, `.pi/skills/**`, canonical `PLAN.md`/`DECISIONS.md`, root `AGENTS.md`).
- Add the mandatory ready-packet gate to every lifecycle command (after slug validation for slugged commands; before memory/action for slugless `/gc`).
- Versioned roadmap grammar with immutable `RM-NNN` IDs and exact away-eligibility (`Ready` + `away-ok` + `Open decisions: none`).
- Make `.opencode/tool/structural-check.sh` offline-safe and extend it with the contract assertions (RED per plan, GREEN by plan close).
- Synchronize the active away features (`away-sandbox-runtime`, `autonomous-away-loop`) to the fixed managed AGENTS region, Pi-native context, source-backed create, and sole default `.pi/ROADMAP.md`.
- Update `.opencode/{tech-stack,roadmap,state}.md` as development-only docs describing the shipped Pi-native behavior.
- Final static gate, then promote `.pi/state.md` `partial → ready` (`context_reload_required: false`) as the last production write; the operator runs `/reload` or restarts Pi first (GATE: do not promote before reload), the reloaded session rejects any intervening drift, and the complete no-write static pass reruns.

**Out:**
- Remote or outside-repository sources; JSON anchors (V1); automatic package install or network access; compatibility shims or fallback reads from old `.opencode` context paths.
- Deleting existing `.opencode` development/history artifacts or changing `.opencode/command/**` (source bodies remain immutable).
- Mutating roadmap intent during `/create` or autonomous execution; replacing lifecycle Markdown with a generalized schema/kernel; renumbering roadmap IDs.
- Runtime prompt-execution smoke inside this feature's static gate (it is an explicit operator-gated retained-fixture smoke after `/trust` + restart).
- Repointing `.opencode/artifacts/.active` (held by `away-sandbox-runtime`); the operator repoints when away-sandbox settles.

## Proposed Solution

### AGENTS managed regions (verbatim boilerplate)

```markdown
<!-- pi:init:boilerplate:start -->
<operator-approved bytes, verbatim>
<!-- pi:init:boilerplate:end -->

<!-- pi:init:project-appendix:start -->
<project-specific discovered context>
<!-- pi:init:project-appendix:end -->
```

The marker-bounded boilerplate interiors in root `AGENTS.md`, `.pi/prompts/init.md`, and the locked fixture (`.opencode/artifacts/pi-native-init/boilerplate.md`) must compare byte-for-byte. Refresh separately hashes and reconciles the appendix; conflicts outside managed regions block. The exact block is locked at P1.1 from the operator-supplied source (stop rather than reconstruct from a summary).

### Initialization state (`.pi/state.md`)

```yaml
---
schema_version: 1
initialization_status: partial
context_reload_required: true
generation_id: "<opaque generation ID>"
updated_at: "<ISO-8601>"
agents_boilerplate_sha256: "<lowercase SHA-256 of the managed block>"
---
```

Allowed statuses: `partial`, `ready`. `context_reload_required` is `true` whenever a reload/restart is needed before the packet can be used (always after an `AGENTS.md` mutation), `false` only after a post-reload no-drift refresh. `BLOCKED` is response-only. Fresh writes state last; refresh-with-changes writes `partial` + `context_reload_required: true` before any other packet mutation and `ready` + `context_reload_required: false` last; any post-ready repair transitions back to `partial` first.

### Source guard

- Repository-relative `.md`/`.txt`/`.json` only; reject absolute/traversal/symlink/non-regular/canonical-path-outside-repo.
- Reject secret-bearing names: `.env*`, private-key names, `*.pem`, `*.key`, `*.p12`, `*.pfx`, credential/secret/token/password stores.
- Whole file ≤ `1,048,576` bytes; selected section ≤ `65,536` bytes; reject oversize, never truncate.
- JSON unanchored (V1). Markdown anchors match exactly one case-sensitive heading or `RM-NNN`; section ends before the next same/higher-level heading; zero/multiple matches block.
- Source is data only; embedded directives/commands/tool requests are ignored and cannot trigger actions.
- Record repo-relative path, anchor, whole-file SHA-256, Roadmap ID. Revalidate type/realpath/hash immediately before writing; drift restarts preview with zero target writes.

### Roadmap card grammar (`.pi/ROADMAP.md`)

```markdown
---
roadmap_schema_version: 1
last_issued_id: RM-001
---

## Ready

### RM-001 — Short title
- Outcome: <observable result>
- Why now: <reason>
- Acceptance evidence:
  - <observable check>
- Dependencies: none | RM-NNN, ...
- Candidate slug: <lowercase-hyphen> | unresolved
- Autonomy: away-ok | manual-only
- Open decisions: none | <text>
- Source: <path[#anchor]> @ sha256:<64 lowercase hex>
```

All horizons use the same fields. `unresolved` values force `manual-only`. IDs are globally unique, immutable, never renumbered/reused/reassigned to a materially different outcome. `last_issued_id` is the monotonic high-water mark: never decremented; a materially changed or new outcome allocates a new ID above the high-water mark; refresh preserves existing IDs by normalized outcome and never reissues a retired ID. Away eligibility = `Ready` + `Autonomy: away-ok` + `Open decisions: none`. Reservations/completion live in the autonomous-loop ledger, never in roadmap intent.

### Lifecycle gate ordering

Every slugged lifecycle command (`create`, `plan`, `research`, `ship`, `verify`) validates the slug first, then requires the complete packet with `initialization_status: ready` and matching boilerplate hash, before any project-memory or lifecycle access. Slugless `/gc` requires the complete ready packet before memory/action (memory use stays read-only). `/fix` and `/audit` are operational and unchanged.

## Success Criteria

All checks are executable and **fail-closed**. `rg` exit 1 = clean (pass); exit ≥2 = error. Negative checks accept only `rg` exit 1, never a bare-negated `rg` invocation (tool error ≠ success). The contract assertions are added to `.opencode/tool/structural-check.sh` incrementally (RED at P3.1/P4.1/P5.1/P6.3; GREEN by each plan close) and run as the final gate at P8.3.

1. **Verify (init flags/outputs):** `--from`, `--deep`, `--refresh` present; `--context`/`--user`/`--all` absent; all six Pi-native outputs referenced; no `60`/`150` line cap — `node -e '<A1 validator against .pi/prompts/init.md>'`.
2. **Verify (managed boilerplate equality):** markers occur exactly once in `AGENTS.md` and `.pi/prompts/init.md`; both marker-bounded interiors and the fixture (`.opencode/artifacts/pi-native-init/boilerplate.md`) are byte-identical; `agents_boilerplate_sha256` in `.pi/state.md` matches the block hash — `node -e '<A2 byte-comparison validator>'`.
3. **Verify (state schema):** `.pi/state.md` frontmatter has `schema_version: 1`, `initialization_status: partial|ready`, and `context_reload_required: true|false` — `rg -q '^schema_version: 1$' .pi/state.md && rg -q '^initialization_status: (partial|ready)$' .pi/state.md && rg -q '^context_reload_required: (true|false)$' .pi/state.md`.
4. **Verify (packet completeness):** `AGENTS.md` and `.pi/{ROADMAP,user,tech-stack,state,memory}.md` all exist — `node -e '<A4 existence validator>'`.
5. **Verify (create grammar + ordering):** `--from <path[#anchor]>` present; raw-description mode retained; slug validation precedes packet/source access; `/create` is still the sole `mkdir` namespace creator — `node -e '<B1 order+grammar validator; regex index < min(packet index, source index, .pi/artifacts index) for create>'`.
6. **Verify (create source contract):** source bounds, secret-name denylist, no-symlink/no-truncation, untrusted-data rule, and provenance fields (path/anchor/whole-file SHA-256/Roadmap ID) present; no roadmap-mutation language — `node -e '<B2 source-contract validator>'`.
7. **Verify (lifecycle packet gate):** `plan`/`research`/`ship`/`verify` validate slug, then require the complete ready packet + matching boilerplate hash before memory/lifecycle access; `/gc` requires the ready packet before memory/action and keeps memory read-only — `node -e '<C1 gate validator across the five slugged prompts + gc>'`.
8. **Verify (Pi-native memory path):** `.pi/memory.md` is the project-memory path in `create`/`plan`/`research`/`ship`/`verify`/`gc`; no active runtime contract reads `.opencode/artifacts/MEMORY.md` — scoped to `AGENTS.md`, `.pi/prompts/*.md`, `.pi/skills/**`, `.pi/artifacts/pi-template/PLAN.md`, excluding historical ADR-007 text — `rg -q '.pi/memory.md' .pi/prompts/{create,plan,research,ship,verify,gc}.md && { rg -n '\.opencode/(artifacts/MEMORY\.md|tech-stack\.md|roadmap\.md|state\.md|user\.md)' AGENTS.md .pi/prompts .pi/skills .pi/artifacts/pi-template/PLAN.md; [ $? -eq 1 ]; }`.
9. **Verify (skills portability):** no `.opencode` runtime deps, the exact `.opencode/artifacts/.active` coordination path, or global verify log in `.pi/skills/**`; `development-lifecycle` makes `/init` the first hook (must NOT false-positive on legitimate text like `participants.active` or the bare substring `.active`) — `{ rg -n '\.opencode/|verify\.log' .pi/skills; [ $? -eq 1 ]; } && rg -q '/init' .pi/skills/development-lifecycle/SKILL.md`.
10. **Verify (verification cache removed):** `.pi/skills/verification-before-completion/references/VERIFICATION_PROTOCOL.md` has no cache/skip/post-success-append semantics — `{ rg -n 'verify\.log|cache|skip.*verif|append.*after|post-success' .pi/skills/verification-before-completion/references/VERIFICATION_PROTOCOL.md; [ $? -eq 1 ]; }`.
11. **Verify (ADR-016 + ADR-007 preserved):** ADR-016 present; ADR-007 marked partially superseded with historical text intact — `rg -q '^## ADR-016:' .pi/artifacts/pi-template/DECISIONS.md && rg -q 'ADR-007' .pi/artifacts/pi-template/DECISIONS.md`.
12. **Verify (canonical contract complete):** `.pi/artifacts/pi-template/PLAN.md` encodes mandatory `/init`, the six-file packet, state ordering, packet gates, both `/create` syntaxes, source bounds/provenance, exact roadmap grammar, and Pi-native memory — `node -e '<D1 canonical-contract validator>'`.
13. **Verify (roadmap grammar):** `roadmap_schema_version: 1`; unique `RM-NNN`; exact `Autonomy`/`Open decisions` values; away-eligibility rule — `node -e '<D2 roadmap validator against .pi/ROADMAP.md>'`.
14. **Verify (roadmap ID allocation):** `.pi/ROADMAP.md` frontmatter has monotonic `last_issued_id: RM-NNN`; IDs never reused/renumbered; refresh preserves IDs by normalized outcome and never decrements the high-water mark — `rg -q '^last_issued_id: RM-[0-9][0-9][0-9]$' .pi/ROADMAP.md`.
15. **Verify (no regression):** existing milestone-3/4 static suite still passes (frontmatter matrix, forbidden-token CLEAN, slug presence, namespace ownership, completion-authority split) — `node -e '<milestone-3/4 regression validator>'`.
16. **Verify (source command immutability):** `.opencode/command/**` unchanged against the P1.1 baseline — `git diff --exit-code <baseline_oid> -- .opencode/command/`.
17. **Verify (prd graph bounded):** `jq -e` validates `prd.json`; 2–3 tasks per child plan; ≤3 files per task; ID-based dependencies point backward — `node -e '<prd graph validator>'`.
18. **Verify (final ready + no-write pass):** `.pi/state.md` is `ready` + `context_reload_required: false`; the complete static gate passes read-only; `git diff --check` clean — `rg -q '^initialization_status: ready$' .pi/state.md && rg -q '^context_reload_required: false$' .pi/state.md && bash .opencode/tool/structural-check.sh && git diff --check`.
19. **Verify (offline checker):** `.opencode/tool/structural-check.sh` has no network-capable probe — `{ rg -n '\bnpx\b' .opencode/tool/structural-check.sh; [ $? -eq 1 ]; }` (accept only `rg` exit 1).

## Technical Context

**Binding contracts:**
- `AGENTS.md:109-119` — two lifecycle layers; `/create` sole namespace creator; two writable surfaces (lifecycle state vs project memory). This feature rebinds project memory to `.pi/memory.md` via ADR-016.
- `AGENTS.md:115-119` — namespace ownership and the "only `/init` may establish the OpenCode context surface" rule; superseded for the Pi-native packet by ADR-016.
- `.pi/artifacts/pi-template/PLAN.md:356-399` — canonical lifecycle; currently omits `/init`, names `.opencode/tech-stack.md`, treats `.opencode/artifacts/MEMORY.md` as optional; `:13-18` "no schemas" non-goal must be narrowed.
- `.pi/artifacts/pi-template/DECISIONS.md:135-175` — ADR-007 (old optional memory location); partially superseded by ADR-016.
- `.pi/prompts/create.md:42-73,123-259` — slug-first guard, fail-closed namespace ownership, PLAN/TODO creation, review/supervisor rules (all preserved).
- `.pi/prompts/{plan,research,ship,verify,gc}.md` — current memory refs and lifecycle guards (migrated).

**Current stale surfaces (must migrate):**
- `.pi/skills/development-lifecycle/SKILL.md:25-42` — omits `/init`, stale unslugged workflow.
- `.pi/skills/subagent-driven-development/SKILL.md:34-38` — global `.opencode/artifacts/plan-context.md`.
- `.pi/skills/gemini-large-context/SKILL.md:126-139` — `.active`, OpenCode spec/research paths.
- `.pi/skills/verification-before-completion/references/VERIFICATION_PROTOCOL.md:98-124,148` — global `.opencode/artifacts/verify.log`, cache/skip/append behavior (removed, not repointed).
- `.pi/skills/opensrc/references/example-workflow.md:42` — OpenCode research path.
- `.pi/skills/memory/SKILL.md:3-40` — old memory path.

**Unsafe verification harness:** `.opencode/tool/structural-check.sh:118-128` probes `npx fallow --version` (network-capable). P1.2 replaces it with an installed-binary/local probe; Fallow is skipped when absent, never installed.

**Predecessor conflict:** `away-sandbox-runtime` is in progress (`.opencode/artifacts/away-sandbox-runtime/progress.md`: P0.1/P0.2/A1/A2 DONE; A3 blocking checkpoint next; B1 writes ADR-014 into `AGENTS.md`/`DECISIONS.md`/`PLAN.md`; baseline includes those bytes plus every Pi prompt). Its B1 owns the same shared authority files this feature's P2.1/P7.3 must edit. Serialization is a real direct dependency, not dirty-tree noise.

**Slug regex (canonical, unchanged):** `^(?=.{1,64}$)[a-z0-9]+(?:-[a-z0-9]+)*$`

## Affected Files

**Manifests (exhaustive, exact-path staging):**
- `write_paths` (38 unique paths across P1–P8):
  - Plan 1: `.opencode/artifacts/pi-native-init/{boilerplate.md,baseline.md,spec.md,prd.json}`, `.opencode/tool/structural-check.sh`, `.opencode/artifacts/autonomous-away-loop/plan.md`
  - Plan 2: `.pi/artifacts/pi-template/{DECISIONS.md,PLAN.md}`, `AGENTS.md`, `.pi/{ROADMAP.md,tech-stack.md,user.md,memory.md,state.md}`
  - Plan 3: `.opencode/tool/structural-check.sh`, `.pi/prompts/create.md`
  - Plan 4: `.opencode/tool/structural-check.sh`, `.pi/prompts/init.md`
  - Plan 5: `.opencode/tool/structural-check.sh`, `.pi/prompts/{plan,research,ship,verify,gc}.md`
  - Plan 6: `.pi/skills/{development-lifecycle,subagent-driven-development}/SKILL.md`, `.pi/skills/memory/SKILL.md`, `.pi/skills/gemini-large-context/SKILL.md`, `.pi/skills/opensrc/references/example-workflow.md`, `.pi/skills/verification-before-completion/references/VERIFICATION_PROTOCOL.md`, `.opencode/tool/structural-check.sh`
  - Plan 7: `.pi/away-runtime/{closure.ts,confinement.test.ts}`, `.pi/away-sandbox.json`, `.opencode/artifacts/away-sandbox-runtime/{spec.md,plan.md,prd.json}`, `.pi/artifacts/pi-template/{DECISIONS.md,PLAN.md}`, `AGENTS.md`
  - Plan 8: `.opencode/artifacts/autonomous-away-loop/{spec.md,plan.md,prd.json}`, `.opencode/{tech-stack,roadmap,state}.md`, `.opencode/tool/structural-check.sh`, `.pi/state.md`
- `protected_source_paths` (9 OpenCode commands, never modified): `.opencode/command/{audit,create,fix,gc,init,plan,research,ship,verify}.md`
- `verified_paths`: all `write_paths` plus `.opencode/artifacts/.active`, `.pi/.gitignore`.
- `baseline_oid`: pending — frozen at P1.1 at HEAD `e15881f` under operator Option B (reserve pi-native-init; `away-sandbox-runtime` paused at B3; C1–D3 deferred, reconcile-on-resume). Feature-scoped baseline (absolute byte-equality unachievable under concurrent churn; binding check is feature-scoped: pi-native-init commits must not touch protected paths).
- `shared_serial_ownership`:
  - `AGENTS.md`, `.pi/artifacts/pi-template/DECISIONS.md`, `.pi/artifacts/pi-template/PLAN.md` — owners: P2.1, P7.3
  - `.opencode/tool/structural-check.sh` — owners: P1.2, P3.1, P4.1, P5.1, P6.3, P8.3 (serial; each appends its own assertions)
  - `.pi/state.md` — owners: P2.3 (partial), P8.3 (ready)
  - `.pi/away-sandbox.json` — owners: P7.1
  - `.opencode/artifacts/autonomous-away-loop/plan.md` — owners: P1.2 (Gate 0.4), P8.1 (full sync)

**Operational note:** `.opencode/artifacts/.active` is NOT repointed by this feature. It remains on `away-sandbox-runtime` until that feature settles; the operator repoints to `pi-native-init` (or authorizes proceeding) at P1.1.

## Tasks

Bounded serial tasks across eight child plans (P1: 2, P2–P8: 3 each). Every task ≤3 files. Full graph in `prd.json` with stable IDs `P1.1`–`P8.3`, `child_plan` fields, ID-based dependencies. No writable plans run in parallel.

### Child Plan P1 — Preflight and Offline Checker

**P1.1 [preflight] Resolve ownership and lock canonical input (3 files: spec, prd, boilerplate).**
Record operator Option B (reserve `pi-native-init`; `away-sandbox-runtime` paused at B3; C1–D3 deferred, reconcile-on-resume). Apply all ten P1 contract corrections to `spec.md` and `prd.json`. Obtain/confirm the exact operator-supplied AGENTS boilerplate (stop rather than reconstruct from a summary); persist it verbatim as the locked fixture (`.opencode/artifacts/pi-native-init/boilerplate.md`, extracted from root `AGENTS.md` Rule 0 → Safety + Note for Codex in generated order); record its SHA-256. Record the eight-plan dependency chain. (`baseline.md` freeze is P1.2.)

**P1.2 [safety] Freeze feature-scoped baseline, make verification offline-safe and fail-closed (3 files: baseline, structural-check.sh, autonomous-away-loop/plan).**
Freeze `baseline.md` at the P1.1 HEAD under Option B (feature-scoped: pi-native-init commits must not touch protected paths). Remove the network-capable `npx fallow --version` probe; use an already-installed binary/local probe; skip Fallow when absent, never install or contact a registry. Add a fail-closed negative-match helper (`rg` exit 1 = clean; exit 0 = forbidden; exit ≥2 = tool error) used by all negative checks. Add **Gate 0.4** to `.opencode/artifacts/autonomous-away-loop/plan.md`: pi-native-init P8.3 must complete before any autonomous-away-loop implementation begins. Verify: `bash -n` + `{ rg -n '\bnpx\b' .opencode/tool/structural-check.sh; [ $? -eq 1 ]; }` + checker runs + `rg -q 'P8.3' .opencode/artifacts/autonomous-away-loop/plan.md` + `git diff --check`.

### Child Plan P2 — Canonical Contract and Partial Packet

**P2.1 [contract] Establish ADR-016 and managed AGENTS (3 files: DECISIONS, PLAN, AGENTS).**
Add ADR-016 (supersedes only ADR-007's memory location; preserve ADR-007 historical text + namespace decisions; mark partially superseded). Encode the *complete* contract in canonical `PLAN.md` (mandatory `/init`, six-file packet, state ordering, packet gates, both `/create` syntaxes, source bounds/provenance, exact roadmap grammar, Pi-native memory; narrow the "no schemas" non-goal to lifecycle-kernel/typed-handoff). Move the exact boilerplate into its managed region in `AGENTS.md`; preserve project routing/topology in the appendix. Verify: markers once; boilerplate hash unchanged; `git diff --check`.

**P2.2 [seed] Seed project facts, profile, and durable intent (3 files: tech-stack, user, memory).**
Store detected technical facts + command evidence (`verified|documented|failed|unknown`) in tech-stack. Store only operator-approved tracked preferences in user. Create `.pi/memory.md` with distilled non-sensitive project memory AND an immutable `## Initialization Intent - <generation-id>` section holding confirmed operator/project intent (interview-derived when no `--from`); this section is the provenance source for roadmap cards. Memory is seeded BEFORE the roadmap (P2.3). Verify: no secrets, no speculative commands, `Initialization Intent` section present.

**P2.3 [seed] Seed roadmap and partial state (2 files: ROADMAP, state).**
Compile project intent into the exact v1 roadmap grammar (`roadmap_schema_version: 1`; monotonic `last_issued_id: RM-NNN`; 1–3 Ready cards; unresolved → `manual-only`; unique immutable `RM-NNN`). Each card cites the stable `.pi/memory.md` `Initialization Intent` section path + whole-file SHA-256. Write `.pi/state.md` LAST with `schema_version: 1`, `initialization_status: partial`, `context_reload_required: true`, `agents_boilerplate_sha256` set. Do not advertise the packet as usable or `/create --from` as ready (state is partial + reload-required). Verify: `last_issued_id`, `### RM-001`, `Autonomy:`, `initialization_status: partial`, `context_reload_required: true`; `git diff --check`.

### Child Plan P3 — Source-Backed `/create`

**P3.1 [test] Add failing structural assertions (1 file: structural-check.sh).** Assert the new grammar, slug-before-packet/source ordering, mandatory ready packet, source bounds, untrusted-data rule, provenance fields, no roadmap mutation, and preserved namespace/review/supervisor safeguards. Capture expected RED.

**P3.2 [impl] Implement source mode and packet gate (1 file: create.md).** Support `/create <slug> "description"` and `/create <slug> --from <path[#anchor]>`. Validation order: slug → complete-ready-packet gate (all six files, schema v1, `initialization_status: ready`, `context_reload_required: false`, `agents_boilerplate_sha256` matching the managed AGENTS interior) → namespace (absent/partial/established). Memory access uses `.pi/memory.md` (not `.opencode/artifacts/MEMORY.md`). Apply the source guard and stable-byte procedure; block zero/multiple anchor matches and multiple shippable outcomes; record provenance in `PLAN.md`; never mutate `.pi/ROADMAP.md`. Preserve fail-closed namespace ownership and all review/supervisor rules.

**P3.3 [gate] Close the create gate (0 files).** `bash .opencode/tool/structural-check.sh && git diff --check`. State remains `partial`.

### Child Plan P4 — `/init` Compiler and Refresh State Machine

**P4.1 [test] Add failing init assertions (1 file: structural-check.sh).** Assert new flags, removed modes, all Pi-native outputs, no line cap, exact boilerplate equality, full state machine + write ordering, source bounds, prompt-injection treatment, drift checks, readiness outputs. Confirm only intended checks fail.

**P4.2 [impl] Rewrite init (1 file: init.md).** Absent / interrupted-without-state / established / partial / refresh classifications; hybrid compiler; full-packet preview + confirmation; fresh writes state last; refresh invalidation before mutation; re-preview on any input/appendix drift; exact managed boilerplate + semantically reconciled appendix; `READY`/`PARTIAL`/response-only `BLOCKED`; exact `/create --from` handoff only when ready; no installs/network/secret-reads/source-triggered actions.

**P4.3 [gate] Close the init gate (0 files).** `bash .opencode/tool/structural-check.sh && git diff --check`. State remains `partial`.

### Child Plan P5 — Lifecycle Consumer Migration

**P5.1 [test] Encode packet-gate assertions (1 file: structural-check.sh).** Slug-before-packet for every slugged command; complete packet + schema v1 + `ready` + matching boilerplate hash; `/gc` gates before memory/action; old-path rejection scoped to active runtime contracts (exclude historical ADR-007).

**P5.2 [impl] Migrate planning and delivery prompts (3 files: plan, research, ship).** Replace active memory access with `.pi/memory.md`; add the mandatory ready-packet gate after slug validation; preserve established/missing/partial namespace behavior; preserve response-only pre-create research once the packet is ready.

**P5.3 [impl] Migrate verification and GC (2 files: verify, gc).** Preserve `/verify`'s final-fingerprint and no-post-fingerprint-write contract; keep the durable-memory append before the final pass; make `.pi/memory.md` mandatory packet structure while `/gc` stays read-only. Verify: structural checker + `git diff --check`. State remains `partial`.

### Child Plan P6 — Runtime Skill Portability

**P6.1 [impl] Migrate core lifecycle skills (3 files: development-lifecycle, memory, subagent-driven-development).** Make `/init` the first lifecycle hook; use explicit slug-local canonical artifacts; remove global OpenCode plan/memory paths.

**P6.2 [impl] Migrate research and verification references (3 files: gemini-large-context, opensrc workflow, VERIFICATION_PROTOCOL).** Replace `.active` and global OpenCode paths; *remove* (not repoint) the verification cache/skip/post-success-append behavior — candidate evidence stays in per-slug `PROGRESS.md` before the final pass; final declaration remains external with no post-fingerprint write.

**P6.3 [test] Expand portability verification (1 file: structural-check.sh).** Scan all `.pi/skills/**`; fail on active `.opencode` runtime deps, the exact `.opencode/artifacts/.active` coordination path, global verify logs, or stale unslugged lifecycle instructions (must NOT false-positive on legitimate text like `participants.active` or the bare substring `.active`). Verify: structural checker + `git diff --check`. State remains `partial`.

### Child Plan P7 — Away-Sandbox Convergence

**P7.1 [impl] Correct the settled runtime closure (3 files: closure.ts, confinement.test.ts, away-sandbox.json).** Remove mandatory `.opencode` closure members if present; use Pi-native runtime + protected-context paths; prove a copied `.pi` runtime works with `.opencode` absent; protect the packet and managed AGENTS region from autonomous mutation. `.pi/away-sandbox.json` `protected_paths`/`runtime_protected_paths` add the five `.pi` context files (`ROADMAP`, `user`, `tech-stack`, `state`, `memory`) and the managed AGENTS region; `.opencode/command/**` remains protected as source; the sandbox manifest itself is protected. Verify: `node --experimental-strip-types --test .pi/away-runtime/confinement.test.ts && git diff --check`.

**P7.2 [docs] Synchronize the sandbox feature contract (3 files: away-sandbox spec, plan, prd).** Update closure membership, managed-region ownership, Pi-native context, and acceptance checks for the fixed managed AGENTS region and protected context.

**P7.3 [contract] Reconcile canonical sandbox authority (3 files: DECISIONS, PLAN, AGENTS).** Align ADR-014 with ADR-016 while proving the managed boilerplate hash is unchanged. Verify: settled sandbox unit tests + structural checker + `git diff --check`. State remains `partial`.

### Child Plan P8 — Autonomous Loop, Dev Docs, and READY

**P8.1 [docs] Synchronize autonomous-away-loop (3 files: away-loop spec, plan, prd).** Require sole default `.pi/ROADMAP.md`, exact roadmap grammar (`roadmap_schema_version: 1`, monotonic `last_issued_id`, immutable `RM-NNN`), source-backed `/create`, eligibility only for `Ready` + `away-ok` + `Open decisions: none`, no roadmap mutation, protected Pi-native context, and the fixed AGENTS managed region. **Gate 0.4** (added at P1.2) is preserved until pi-native-init P8.3 completes.

**P8.2 [docs] Update development-only context (3 files: tech-stack, roadmap, state).** Describe the shipped Pi-native behavior while keeping these `.opencode` files explicitly development-only.

**P8.3 [gate] Final static gate and readiness promotion (2 files: structural-check.sh, state).** Add final exact assertions; run all static checks while state is `partial`. **GATE:** the operator runs `/reload` or restarts Pi; do not promote before reload. In the reloaded session the checker reruns and rejects any intervening drift; only then change `.pi/state.md` to `initialization_status: ready` + `context_reload_required: false` (written last); rerun the complete no-write static pass; make no further production write. Then (operator-gated, no-write) rerun `away-sandbox-runtime` D3 full tests/attestation/fingerprint against final bytes — failure reopens work with state back to `partial` before any repair.

## Runtime Verification Checkpoint (operator-gated, deferred)

Requires explicit operator approval, `/trust`, Pi restart, existing trusted-parent credentials, and a retained fixture path (never deleted). Scenarios: (1) fresh preview/cancel → no writes; (2) fresh source init → full packet + `ready` last; (3) plain rerun → refusal; (4) refresh → `partial` before mutation + interruption recovery; (5) `/create --from` → exact stable provenance; (6) post-preview source/appendix drift for `/init` and `/create --from` → re-preview/block, zero target/namespace writes; (7) outside-root/symlink/secret-name/oversized/duplicate-anchor/ambiguous-outcome inputs → fail closed; (8) missing/malformed/partial/not-ready packets block `create`/`plan`/`research`/`ship`/`verify`/`gc`; (9) every slugged command rejects an invalid slug before packet access; `/gc` gates before memory/action; (10) managed boilerplate equality holds. Static evidence is not runtime proof.

## Risks

- **Concurrent authority edits:** serialize after `away-sandbox-runtime` (B1 owns the same files); never treat the overlap as harmless dirty-tree noise. Mitigation: P1.1 ownership gate + operator rebaseline path.
- **Exact boilerplate drift:** locked fixture + byte comparison across fixture/init/root; no summary-based reconstruction. Mitigation: P1.1 stop-if-absent; criterion 2.
- **Crash during refresh:** state becomes `partial` before packet mutation; a crash leaves commands blocked. Mitigation: write-ordering contract; criterion 3.
- **Prompt injection:** source is data only; embedded directives cannot authorize actions. Mitigation: source guard + untrusted-data rule; criterion 6.
- **Tracked profile privacy:** `.pi/user.md` carries only operator-approved fields, no secrets. Mitigation: P2.2 preview-all-fields rule.
- **Intermediate-state false advertising:** seed state stays `partial`; `/create --from` not advertised until P3 lands. Mitigation: criterion 3 + plan ordering.
- **Static-evidence overclaim:** source checks prove contract structure, not runtime behavior. Mitigation: deferred operator-gated smoke; explicit "static evidence only" until run.
- **Post-ready failure:** no repair write until state is `partial` again; away-sandbox D3 rerun can reopen work. Mitigation: P8.3 + review correction 14c.

## Open Questions

None material. The design is operator-approved (brainstorm + verbatim-boilerplate decision); the four review-gate corrections are accepted. The only open checkpoint is operational: the operator confirms `away-sandbox-runtime` has settled (or authorizes a rebaseline) at P1.1, and supplies/confirms the exact boilerplate bytes.
