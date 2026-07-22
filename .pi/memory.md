# Project Memory

Durable cross-slug project knowledge. Search with `rg -n "topic" .pi/memory.md`,
read with `read`, append with `edit`. Non-authoritative; `AGENTS.md` and
`.pi/artifacts/pi-template/` are binding.

Updated: 2026-07-23

---

## Initialization Intent - gen-2026-07-23-01

Immutable record of confirmed project intent at initialization. Roadmap cards cite
this section (path + whole-file SHA-256) as provenance. Do not edit; supersede by
adding a new dated generation section.

**Project:** `swastika` — a Pi-native coding template powered by `pi-fabric` 0.23.0.
The deliverable is project config, Pi prompts, lifecycle artifacts, and a Fabric
supervisor/worker topology adoptable by other repositories. Not an application
codebase.

**Confirmed intent:**
- Mandatory first-touch `/init` compiles a full Pi-native context packet:
  `AGENTS.md` (verbatim managed boilerplate + project appendix) plus
  `.pi/{tech-stack,ROADMAP,state,user,memory}.md`.
- `/init` supports `--from <source[#anchor]>` (compile explicit intent) and
  `--refresh` (crash-safe reconciliation; `ready` -> `partial` before mutation,
  `ready` last).
- `/create` gains source-backed mode: `/create <slug> --from <source[#anchor]>`
  alongside the raw-description mode; provenance (path, anchor, whole-file SHA-256,
  RM ID) recorded in the feature PLAN.
- State schema v1 gates lifecycle commands: `initialization_status: ready` +
  `context_reload_required: false` + matching `agents_boilerplate_sha256` required
  before `/create` and downstream slug lifecycle access.
- Roadmap grammar v1: immutable `RM-NNN` IDs, monotonic `last_issued_id`, away
  eligibility = Ready + `Autonomy: away-ok` + `Open decisions: none`.

**Source:** interview-derived (no `--from` at seed). See `.pi/ROADMAP.md` for the
compiled Ready/Next/Later horizons.

---

## Patterns

### File-Based Context Reads

Before starting work: `rg -n "topic" .pi/memory.md` to find relevant decisions,
patterns, gotchas. Missing memory is treated as absent (non-blocking).

### Minimal Delegation

Prefer direct tools over `task()` delegation for surgical fixes. Delegate only for
isolation, parallelism, or specialist focus.

### Close the Loop

Every non-trivial phase ends with a 1-3 line summary. If you can't summarize it, you
don't understand it.

### Concurrent-Agent Working Set

Edits from other agents in this repo are normal working-set changes — never stash,
revert, or disturb them. Treat them as your own. (Codified in `AGENTS.md` Note for
Codex/GPT.)

---

## Gotchas

- `.pi/fabric.json` `subagents.model` may drift from the `AGENTS.md`-authoritative
  Makora model (`makora/zai-org/GLM-5.2-NVFP4`) under concurrent edits. Operator
  authority outranks config drift; reconcile before changing either source.
- `extensions:false` breaks Makora — implementation workers need `extensions:true`
  + `thinking:"max"` + an exact writable allowlist. (See `AGENTS.md` Gotchas.)
- Full `bash .opencode/tool/structural-check.sh` exits 1 on a pre-existing
  protected-file line-count failure (`.opencode/command/ship.md` > 500 lines) that
  is orthogonal to feature work; use targeted per-task gates.
