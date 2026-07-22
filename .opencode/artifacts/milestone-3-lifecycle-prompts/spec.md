# Milestone 3 — Lifecycle Prompts

> **Status:** proposed · **ID:** ms3-001 · **Created:** 2026-07-22
> **Roadmap item:** `3. Lifecycle prompts` (`.opencode/roadmap.md:46-50`), expanded per operator to **all** commands in `.opencode/command/`
> **Approach (operator-approved):** take **all of** each `.opencode/command/*.md` body into `.pi/prompts/*.md`, stripping **only** OpenCode-only syntax and re-pointing artifact paths to the Pi layer. These commands ARE the lifecycle — keep all content that can run. Do not thin-rewrite; strip is surgical removal of OpenCode-only constructs only.

## Problem Statement

The template ships its runtime lifecycle through Pi prompts under `.pi/prompts/` (auto-discovered, per `AGENTS.md:107-109` and `.pi/artifacts/pi-template/PLAN.md:155-158`). The OpenCode command layer (`.opencode/command/`) already encodes the lifecycle and its operational commands — but the command bodies use OpenCode-only constructs that Pi prompts cannot execute: `agent:` frontmatter routing, `task()/question()/skill()/write()` pseudo-tool calls, `.opencode/artifacts/<slug>/spec.md`+`.active`+`prd.json` artifacts, `batch-implement`/`deep-research`/`audit-pattern` workflow routing, review matrices, and `/ui-slop-check`/`/compound` invocation strings. Without Pi-native prompts, the shipped runtime has no lifecycle commands at all — `/supervise` (milestone 2) stands alone.

`/ui-slop-check` is **not** a command — it does not exist as a file in `.opencode/command/`. It appears only as an invocation string (`/ui-slop-check auto --since=$BASE_SHA`) inside `ship.md`'s body and is stripped during the port, the same as `/compound`.

## Scope

**In:**
- Port **all** OpenCode commands to Pi prompts — the full `.opencode/command/` set (9 files): `audit`, `create`, `fix`, `gc`, `init`, `plan`, `research`, `ship`, `verify`.
- Strip every OpenCode-only construct (see Technical Context) from each ported body.
- Adapt each prompt to the Pi-layer contract: frontmatter `description` + `argument-hint`, explicit `<slug>` for the five lifecycle commands (`create`, `plan`, `ship`, `verify`, `research`), reads/writes `.pi/artifacts/<slug>/{PLAN,TODO,PROGRESS,DECISIONS}.md`, no `.active` pointer, no "latest" inference.
- Encode the completion authority split: `/ship` records implementation but **cannot** declare completion; `/verify` is the **sole** phase that may declare terminal verified status, and it does so externally (response/session transcript only) — no repository write after the final before/after fingerprint (per `AGENTS.md:107-109,166`, `PLAN.md` Verification, `DECISIONS.md` ADR-006).
- Encode `/verify` freshness: a PASS is bound to the bytes tested; capture a fingerprint tuple (HEAD, staged/unstaged digests, untracked manifest, file hashes); a later edit invalidates a stale PASS (per `AGENTS.md` Verification/Freshness and `PLAN.md`).
- Encode `/research` as sideways (feeds `/plan` or `/create`, lives in `PROGRESS.md`, not on the linear path).

**Out:**
- No runtime gate/council wiring — that is milestone 2 (`/supervise`) and a separate gate item if raised; these prompts do not invoke `/supervise` or `agents.*`.
- No `.pi/tools/` verification-fingerprint tooling — milestone 5. `/verify` here describes the fingerprint *contract*; the capture tool lands later.
- No branch creation, no worktree management inside the prompts — per the main-only/per-artifact-commit precedent and AGENTS.md single-writer rule.
- No porting of OpenCode workflow *machinery* — `batch-implement`, `deep-research`, `audit-pattern` routing blocks, the 5-parallel-agent review matrix, the `review-state.json` iterative loop, and the `/ui-slop-check`/`/compound` invocation strings. These rely on OpenCode-only `task()`/`question()`/`skill()` dispatch that Pi templates cannot execute. The *procedural intent* behind them (verify before done, ask before close, audit patterns) is kept as direct imperatives.

## Proposed Solution

For each command, take **all of** the corresponding `.opencode/command/<name>.md` body into `.pi/prompts/<name>.md`, then strip only the OpenCode-only constructs below. Everything else stays — these commands ARE the lifecycle. Strip is surgical removal of OpenCode-only constructs, not a rewrite:

1. **Frontmatter:** replace OpenCode frontmatter (`description`, optional `argument-hint`, `agent: <role>`) with Pi frontmatter (`description`, `argument-hint: "<slug> [args]"` for lifecycle commands, or the command's natural args otherwise). Remove the `agent:` line entirely — Pi has no `agent:` routing.
2. **Strip pseudo-tool calls:** remove every `task({...})`, `question({...})`, `skill({ name: ... })`, `write({...})`, and the `typescript`/`bash` blocks that exist only to invoke them. Replace invocation-shaped instructions with direct imperatives to Main (e.g., "Ask the operator" instead of `question({ ... })`; "load the SKILL.md" instead of `skill({ name: ... })`).
3. **Adapt artifact paths:** replace `.opencode/artifacts/$(cat .opencode/artifacts/.active)/spec.md|prd.json|plan.md|tasks.json|progress.md|audit.md` with `.pi/artifacts/<slug>/{PLAN,TODO,PROGRESS,DECISIONS}.md`. Remove every `.active` pointer reference and "latest" inference. `progress.md` (lowercase) → `PROGRESS.md`.
4. **Strip workflow routing:** remove `batch-implement`/`deep-research`/`audit-pattern` workflow invocation blocks and the ≥5-independent-tasks parallel-routing decision logic. Pi prompts are self-contained Main instructions, not workflow dispatchers.
5. **Strip review/UX machinery:** remove the 5-parallel-agent review matrix, the iterative quality loop (`review-state.json`), and the `/ui-slop-check`/`/compound` invocation strings (these are not commands — they are non-existent invocation strings inside command bodies). Keep the *intent* (run verification before claiming done; ask before close; audit patterns) as direct imperatives.
6. **Preserve all runnable content:** keep all of each body — phase structure, duplicate-check, research-depth options, PRD-rigor (lite/full), workspace setup, goal-backward analysis, dependency graph, TDD flow, commit protocol, verification modes (incremental/full), coherence, confidence levels, stop-conditions, source priority, reproduce→isolate→fix→verify, structural checks, quality grades. Convert OpenCode-only *invocation shapes* (the `task()`/`question()`/`skill()`/`write()` calls) into direct imperatives to Main — but keep the surrounding procedural prose that told the reader *when* and *why* to do those things.
7. **Completion authority:** make `/ship` body explicitly state it records implementation but must NOT write terminal verified status; make `/verify` body explicitly state it is the only phase permitted to write verified status.
8. **Self-contained:** no `agent:` routing, no pseudo-tool calls, no command chaining (Pi templates expand Markdown only — `PLAN.md:157`).

## Success Criteria

All checks are executable; `! rg -q ...` exits 0 on no-match (pass) and non-zero on match (fail). `rg` exit 1 = clean; exit ≥2 = error (not a pass).

1. **Verify:** all nine prompts exist — `ls .pi/prompts/{audit,create,fix,gc,init,plan,research,ship,verify}.md`
2. **Verify:** each has valid Pi frontmatter — `node -e 'const fs=require("fs");const need={audit:"<pattern>",create:"<slug>",fix:"<bug>",gc:null,init:"[--deep]",plan:"<slug>",research:"<slug>",ship:"<slug>",verify:"<slug>"};for(const[f,h]of Object.entries(need)){const s=fs.readFileSync(".pi/prompts/"+f+".md","utf8");const m=/^---\n([\s\S]*?)\n---\n/.exec(s);if(!m)throw new Error(f+": no frontmatter");const keys=[...m[1].matchAll(/^(\w[-\w]*):/gm)].map(x=>x[1]);if(!keys.includes("description"))throw new Error(f+": missing description");if(h!==null){const ah=m[1].match(/^argument-hint:\s*(.+)$/m);if(!ah)throw new Error(f+": missing argument-hint");}}'`
3. **Verify:** no OpenCode-only frontmatter — `! rg -q '^agent:' .pi/prompts/*.md`
4. **Verify:** no pseudo-tool calls — `! rg -q 'task\(|question\(|skill\(|write\(' .pi/prompts/*.md`
5. **Verify:** no OpenCode artifact refs — `! rg -q '\.active|spec\.md|prd\.json|tasks\.json|(?<![A-Z])progress\.md|audit\.md' .pi/prompts/*.md` (`PROGRESS.md` uppercase is canonical and allowed)
6. **Verify:** no workflow/review machinery — `! rg -q 'batch-implement|deep-research|audit-pattern|ui-slop-check|compound|review-state\.json' .pi/prompts/*.md`
7. **Verify:** completion-authority split — `rg -q 'cannot declare completion|must not.*completion' .pi/prompts/ship.md && rg -q 'sole.*verified|only.*phase.*verified|externally' .pi/prompts/verify.md`
8. **Verify:** explicit slug on the five lifecycle commands — `for f in create plan ship verify research; do rg -q '<slug>' .pi/prompts/$f.md || { echo MISSING $f; exit 1; }; done`
9. **Verify:** canonical artifact paths — `rg -q '\.pi/artifacts/<slug>/(PLAN|TODO|PROGRESS|DECISIONS)\.md' .pi/prompts/*.md`
10. **Verify:** no post-fingerprint write in `/verify` — `rg -q 'no repository write|no.*write.*after.*fingerprint|externally' .pi/prompts/verify.md`
11. **Verify:** source command bodies unchanged — `git diff --exit-code -- .opencode/command/`
12. **Verify:** concurrent slugs stay disjoint (by construction, no `.active`) — `! rg -q '\.active' .pi/prompts/*.md`

## Technical Context

**Lifecycle source bodies being ported (the full `.opencode/command/` set):**
- `.opencode/command/audit.md` (65 lines) — pattern audit; invokes `audit-pattern` workflow, writes `.opencode/artifacts/$(cat .opencode/artifacts/.active)/audit.md`. Strips: workflow routing, `.active`.
- `.opencode/command/create.md` (260 lines) — PRD creation; duplicate check, research depth, PRD rigor (lite/full), workspace setup, PRD→tasks. Heavy on `task()`/`question()`/`skill()` and `.active`/`spec.md`/`prd.json`.
- `.opencode/command/fix.md` (55 lines) — debug/fix; `skill(root-cause-tracing/verification-before-completion)`, npm commands, reproduce→isolate→fix→verify.
- `.opencode/command/gc.md` (78 lines) — garbage collection; `skill(fallow/verification)`, `npx fallow`, `.opencode/tool/structural-check.sh`, `.opencode/QUALITY.md`, `task()` for cleanup PRs.
- `.opencode/command/init.md` (307 lines) — project init; AGENTS.md + tech-stack.md + roadmap/state/user; modes `--deep|--context|--user|--all`; very heavy `task()/question()/skill()/write()` pseudo-calls.
- `.opencode/command/plan.md` (410 lines) — planning; institutional research (MEMORY/git history), discovery assessment, goal-backward analysis, dependency graph, constitutional compliance gate.
- `.opencode/command/research.md` (160 lines) — research; `deep-research` workflow, source priority, confidence levels, stop-when.
- `.opencode/command/ship.md` (502 lines) — ship; contains the non-existent `/ui-slop-check` invocation string, `batch-implement` routing, 5-agent review matrix, `review-state.json` loop, `/compound`, TDD flow, commit protocol, goal-backward verification, close.
- `.opencode/command/verify.md` (161 lines) — verify; verification cache (state fingerprint), completeness, correctness (incremental/full gates), coherence, report. Already closest to the Pi contract (freshness fingerprint lives here).

**Binding contracts:**
- `AGENTS.md:107-109` — two lifecycle layers; Pi layer = `.pi/artifacts/<slug>/{PLAN,TODO,PROGRESS,DECISIONS}.md`, explicit slug, no `.active`, only `/verify` may declare verified status (externally).
- `AGENTS.md` Verification + Freshness — PASS bound to bytes tested; fingerprint tuple; later edit invalidates stale PASS.
- `.pi/artifacts/pi-template/PLAN.md:141-158` — lifecycle flow and the "self-contained, no agent routing, no pseudo-tool calls, no command chaining" constraint.
- `.opencode/skill/development-lifecycle/SKILL.md` — canonical 4 files and phase intent (source for semantics if a command body is ambiguous).
- `.pi/prompts/supervise.md` (milestone 2) — the established Pi-prompt style: frontmatter `description`-only, self-contained, no pseudo-tool calls. New prompts must match this style.

**Pi prompt mechanics (from milestone 2 research):**
- Pi auto-discovers `.pi/prompts/*.md` as slash commands, non-recursive.
- Frontmatter = `description` (required) + optional `argument-hint`. The filename (minus `.md`) is the command name.
- Templates expand Markdown only; `agent:`, `task()`, `question()`, `skill()`, `write()` are NOT executed — they render as literal text, which is a defect.

## Affected Files

**Create (9 Pi prompts):**
- `.pi/prompts/audit.md`
- `.pi/prompts/create.md`
- `.pi/prompts/fix.md`
- `.pi/prompts/gc.md`
- `.pi/prompts/init.md`
- `.pi/prompts/plan.md`
- `.pi/prompts/research.md`
- `.pi/prompts/ship.md`
- `.pi/prompts/verify.md`

**Lifecycle source bodies (the `.opencode/command/` set — not modified by this port):**
- `.opencode/command/audit.md`
- `.opencode/command/create.md`
- `.opencode/command/fix.md`
- `.opencode/command/gc.md`
- `.opencode/command/init.md`
- `.opencode/command/plan.md`
- `.opencode/command/research.md`
- `.opencode/command/ship.md`
- `.opencode/command/verify.md`

**Evidence (updated by `/ship`, not this spec):**
- `.opencode/artifacts/milestone-3-lifecycle-prompts/prd.json`
- `.pi/artifacts/pi-template/TODO.md`
- `.pi/artifacts/pi-template/PROGRESS.md`
- `.opencode/state.md`

## Tasks

The full bounded task graph lives in `prd.json` (12 serial tasks, each ≤3 files) and `plan.md` (5 child plans). Summary — every task depends on the previous (serial, single-writer):

### [port] Nine prompt ports (one file each, serial chain)
- **create → plan → research → fix → ship → verify → init → gc → audit**
- Each takes **all of** the corresponding `.opencode/command/<name>.md` body, strips only OpenCode-only syntax, re-points to `.pi/artifacts/<slug>/`.
- The five lifecycle commands (`create`, `plan`, `ship`, `verify`, `research`) take an explicit validated `<slug>`; the four operational commands (`audit`, `fix`, `gc`, `init`) keep natural args.
- `/ship` port encodes the completion-authority split (records implementation, cannot declare completion).
- `/verify` port encodes freshness + external verification (sole external verifier; no repo write after the final fingerprint).
- Per-command KEEP/ADAPT/STRIP contract: see `plan.md` "Port Contract" table. No bulk transformation scripts; manual section-by-section edits only.

### [evidence] Record candidate evidence (3 files: TODO, PROGRESS, state)
- Run the complete static suite; record commands/exit codes/limitations + "pending final no-write verification"; mark nine implementations complete but verification pending. **Not** VERIFIED.

### [close] Close OpenCode feature implementation state (2 files: spec, roadmap)
- Mark each bounded task complete (without VERIFIED); roadmap milestone 3 → implementation-done/verification-pending; `jq` validates prd.json.

### [verify] Final no-write verification (no files; external declaration only)
- All success-criteria checks pass; source command bodies unchanged (`git diff --exit-code -- .opencode/command/`); `git diff --check` clean; local `HEAD` == remote `main` == `main:master`; `VERIFIED` declared in response/transcript only — **no repository write after the final before/after fingerprint** (a post-fingerprint write would invalidate the PASS it records).

## Risks

- **Over-stripping loses useful content.** The OpenCode bodies carry real phase logic (goal-backward analysis, dependency graphs, verification modes, TDD flow, commit protocol, reproduce→isolate→fix→verify, structural checks). The instruction is to take **all of** each body, not thin-rewrite. Mitigation: strip only the enumerated OpenCode-only constructs; keep the surrounding procedural prose; convert invocation shapes (`task()`/`question()`/`skill()`/`write()`) to direct imperatives, but keep the *when* and *why* that surrounded them.
- **Inconsistency across nine prompts.** The shared contract (slug, artifact paths, completion authority) must read identically across the five lifecycle commands. Mitigation: serialize the port task (no parallel per-file fan-out) and run the cross-prompt coherence check in [verify].
- **Leftover OpenCode patterns pass visual review.** A stray `question(` or `.active` reference renders harmlessly in Markdown but violates the "no pseudo-tool calls" acceptance. Mitigation: the `rg` static checks (criteria 3-6) are the gate, not visual review.
- **Operational commands without a slug.** `audit`, `fix`, `gc`, `init` are not on the create→ship→verify line and take different args (a path/pattern, a bug description, none, modes). They must not be forced into the `<slug>` artifact contract. Mitigation: criterion 8 checks `<slug>` only on the five lifecycle commands.

## Open Questions

None. The copy-and-strip approach is operator-approved (take all of each body, strip only OpenCode-only syntax); the 9-command scope is operator-set (the full `.opencode/command/` set); the Pi-layer contract, completion-authority split, and freshness rule are all documented in binding contracts. OpenCode workflow *machinery* (`batch-implement`, `deep-research`, `audit-pattern`, 5-agent review matrix, `review-state.json`, `/ui-slop-check`, `/compound`) is stripped because it relies on OpenCode-only `task()`/`question()`/`skill()` dispatch that Pi templates cannot execute (roadmap:46-48). OpenCode *procedural content* (the surrounding when/why/instructions) is kept and converted to direct imperatives.
