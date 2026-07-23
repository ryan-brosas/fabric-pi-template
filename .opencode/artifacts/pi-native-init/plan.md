---
must_haves:
  truths:
    - "A fresh repository can generate the complete Pi-native context packet through /init."
    - "Any AGENTS.md mutation forces a reload barrier before the packet becomes ready."
    - "Both raw-description and source-backed /create preserve validation order and namespace ownership."
    - "Every lifecycle command fails closed unless the complete initialization packet is ready."
    - "Roadmap IDs remain stable and are never reused across refreshes."
    - "The shipped .pi runtime works without .opencode and autonomous execution cannot mutate protected context."
    - "Ready status is issued only after static checks, reload confirmation, and no-write verification."
  artifacts:
    - path: "AGENTS.md"
      provides: "Verbatim managed boilerplate and preserved project appendix"
    - path: ".pi/state.md"
      provides: "Crash-safe initialization and reload state"
    - path: ".pi/ROADMAP.md"
      provides: "Versioned roadmap cards and monotonic ID allocation"
    - path: ".pi/{tech-stack,user,memory}.md"
      provides: "Scoped project facts, approved preferences, and durable intent"
    - path: ".pi/prompts/{init,create,plan,research,ship,verify,gc}.md"
      provides: "Initialization, source creation, and packet-gated lifecycle"
    - path: ".opencode/tool/structural-check.sh"
      provides: "Offline, fail-closed contract checks"
    - path: ".pi/skills/**"
      provides: "Portable Pi-native lifecycle guidance"
    - path: ".pi/away-runtime/** and .pi/away-sandbox.json"
      provides: "Protected Pi-native context in unattended execution"
    - path: ".pi/artifacts/pi-template/{PLAN,DECISIONS}.md"
      provides: "ADR-016 and canonical runtime authority"
  key_links:
    - from: "/init"
      to: "AGENTS.md"
      via: "managed-region reconciliation"
    - from: "AGENTS.md mutation"
      to: "/create handoff"
      via: "/reload then /init --refresh"
    - from: ".pi/state.md"
      to: "all lifecycle prompts"
      via: "complete-ready-packet gate"
    - from: "source bytes"
      to: "feature PLAN.md"
      via: "stable SHA-256 provenance"
    - from: ".pi/ROADMAP.md"
      to: "/create --from"
      via: "immutable RM-NNN card"
    - from: ".pi/memory.md"
      to: "interview-derived roadmap cards"
      via: "confirmed Initialization Intent section"
    - from: ".pi/away-sandbox.json"
      to: "project context"
      via: "protected path manifest"
    - from: "final ready promotion"
      to: "verification claim"
      via: "post-write no-write fingerprint pass"
---

# Pi-Native Initialization Compiler Implementation Plan

> **For Claude:** Implement this plan task-by-task.

**Goal:** Make `/init` the truthful mandatory lifecycle opener, producing a complete Pi-native packet and safely handing ready projects to source-backed `/create`.

**Discovery Level:** 3 — cross-cutting lifecycle architecture, crash-safe state transitions, prompt ingestion security, protected runtime paths, and version-specific Pi behavior.

**Context Budget:** Eight child plans, approximately 35-50% context each. All writable tasks are serial.

**Effort:** XL (>2 days)

## Institutional Findings

- Project memory records the old single OpenCode memory decision at `.opencode/artifacts/MEMORY.md:44-49`; ADR-016 supersedes its location.
- Current `/init` still has optional modes, `.opencode` outputs, the AGENTS line cap, and stale `/plan` handoff (`.pi/prompts/init.md:10-20,28-42,79-95`).
- `/create` still reads old memory and lacks source mode (`.pi/prompts/create.md:42-72`).
- Canonical PLAN still embeds stale `pi-fabric` 0.22.4 and `fullCodeMode:false`, conflicting with settled/current configuration (`.pi/artifacts/pi-template/PLAN.md:9-45`; `.pi/settings.json:5-7`; `.pi/fabric.json:1-4`).
- Pi 0.81.1 officially supports `$ARGUMENTS`, project prompt frontmatter, and project trust (`docs/prompt-templates.md:9-17,31-37,65-74`).
- Pi loads context files at startup; an `AGENTS.md` change requires `/reload` or restart (`docs/quickstart.md:86-103`; `docs/usage.md:49-58`).
- `away-sandbox-runtime` remains at its A3 checkpoint with B1/C/D outstanding and owns overlapping authority files (`.opencode/artifacts/away-sandbox-runtime/progress.md:73-112`).
- No existing `pi-native-init/plan.md` exists. `.active` still points to `away-sandbox-runtime`.

## Non-Goals

- No changes to `.opencode/command/**`.
- No fallback reads or compatibility shim for old context paths.
- No file deletion.
- No new package or dependency.
- No generalized lifecycle schema/kernel.
- No automatic `.active` rewrite, branch, worktree, commit, or push.
- No networked or authenticated runtime smoke without explicit operator approval.

## Required P1 Contract Corrections

Before production edits, P1 must reconcile these newly validated gaps in `spec.md` and `prd.json`:

1. Production `write_paths` becomes **38**, adding the feature spec, PRD, and `.pi/away-sandbox.json`.
2. State adds `context_reload_required: true|false`.
3. Any `AGENTS.md` mutation leaves state `partial`; only a post-`/reload` refresh may promote it to `ready`.
4. Interview-derived intent is persisted in `.pi/memory.md` before roadmap creation.
5. Roadmap frontmatter adds a monotonic `last_issued_id`; refresh never reuses IDs.
6. P3.2 migrates `/create` to `.pi/memory.md` and adds the ready-packet/hash gate.
7. P6.3 rejects the exact `.opencode/artifacts/.active` coordination path, not generic `.active` strings.
8. Negative `rg` checks accept only exit 1 as clean; exit 0 and exit >=2 fail.
9. P7.1 also updates `.pi/away-sandbox.json`.
10. `autonomous-away-loop` is explicitly blocked until P8.3 completes.

## Dependency Graph

```text
P1.1 -> P1.2
          |
          v
P2.1 -> P2.2 -> P2.3
                    |
                    v
P3.1 -> P3.2 -> P3.3
                    |
                    v
P4.1 -> P4.2 -> P4.3
                    |
                    v
P5.1 -> P5.2 -> P5.3
                    |
                    v
P6.1 -> P6.2 -> P6.3
                    |
                    v
P7.1 -> P7.2 -> P7.3
                    |
                    v
P8.1 -> P8.2 -> P8.3
```

Twenty-three serial waves. No writable parallelism.

---

# Child Plan P1 - Contract Freeze and Safe Checker

## Task P1.1 - Correct the contract and lock boilerplate

```yaml
needs: away-sandbox-runtime settled or explicit operator rebaseline
creates: corrected spec/PRD and canonical boilerplate fixture
has_checkpoint: true
files:
  - .opencode/artifacts/pi-native-init/spec.md
  - .opencode/artifacts/pi-native-init/prd.json
  - .opencode/artifacts/pi-native-init/boilerplate.md
```

1. **GATE:** Re-read predecessor progress. Stop unless B1/C/D are settled or the operator explicitly reserves/rebaselines this feature.
2. **RED:** Confirm the present PRD has 35 rather than 38 production paths and lacks the reload, ID-allocation, manifest, and reverse-serialization corrections.
3. Update the spec with all ten P1 corrections above.
4. Update PRD task metadata without changing the 23 stable IDs or eight-plan structure.
5. Persist the operator-supplied boilerplate verbatim inside the exact managed markers. Stop rather than reconstructing missing bytes.
6. Validate:

```bash
jq -e . .opencode/artifacts/pi-native-init/prd.json
node -e 'const p=require("./.opencode/artifacts/pi-native-init/prd.json");if(p.tasks.length!==23)throw Error("task count");if(new Set(p.manifests.write_paths).size!==38)throw Error("write paths");const pos=new Map(p.tasks.map((t,i)=>[t.id,i]));for(const[i,t]of p.tasks.entries()){if(t.files.length>3)throw Error(t.id+": files");for(const d of t.depends_on){if(!pos.has(d)||pos.get(d)>=i)throw Error(t.id+" -> "+d)}}'
git diff --check
```

Expected: JSON valid, 23 tasks, 38 unique production paths, <=3 files per task, backward-only dependencies.

## Task P1.2 - Freeze baseline and make checks offline/fail-closed

```yaml
needs: P1.1
creates: stable protected-file baseline, safe checker, autonomous Gate 0.4
has_checkpoint: false
files:
  - .opencode/artifacts/pi-native-init/baseline.md
  - .opencode/tool/structural-check.sh
  - .opencode/artifacts/autonomous-away-loop/plan.md
```

1. Capture the settled HEAD OID and protected-file SHA-256 values in `baseline.md`.
2. **RED:** `rg -n '\bnpx\b' .opencode/tool/structural-check.sh` must find the unsafe probe.
3. Add one fail-closed negative-match helper: `rg` exit 1 passes, exit 0 fails, and exit >=2 fails as a tool error.
4. Replace the network-capable Fallow probe with `command -v fallow`; skip when no installed binary exists.
5. Add autonomous Gate 0.4 requiring pi-native-init P8.3 before autonomous implementation.
6. Verify:

```bash
bash -n .opencode/tool/structural-check.sh
bash .opencode/tool/structural-check.sh
git diff --check
```

Expected: checker exits 0, performs no install/network probe, and the autonomous prerequisite is explicit.

---

# Child Plan P2 - Canonical Contract and Partial Packet

## Task P2.1 - Establish ADR-016 and managed AGENTS

```yaml
needs: P1.2
creates: canonical initialization authority and managed AGENTS structure
has_checkpoint: false
files:
  - .pi/artifacts/pi-template/DECISIONS.md
  - .pi/artifacts/pi-template/PLAN.md
  - AGENTS.md
```

1. **RED:** Confirm ADR-016 and managed markers are absent and the runtime-config excerpt disagrees with settled settings.
2. Add ADR-016; preserve ADR-007 text and namespace decisions while marking only its memory-location decision partially superseded.
3. Update canonical PLAN with the full packet, state/reload ordering, both create syntaxes, source guard, provenance, roadmap allocator, packet gates, and `.pi/memory.md`.
4. Reconcile the complete settings/Fabric excerpt against settled `.pi/settings.json` and `.pi/fabric.json`, including Fabric 0.23.0 and `fullCodeMode:true`.
5. Move the exact fixture bytes into the AGENTS boilerplate region; preserve repository routing/topology in the project appendix.
6. Verify marker uniqueness and exact bytes:

```bash
node -e 'const fs=require("node:fs"),a="<!-- pi:init:boilerplate:start -->",b="<!-- pi:init:boilerplate:end -->";const x=p=>{const s=fs.readFileSync(p,"utf8"),i=s.indexOf(a),j=s.indexOf(b,i+a.length);if(i<0||j<0||s.indexOf(a,i+1)>=0||s.indexOf(b,j+1)>=0)throw Error(p);return Buffer.from(s.slice(i+a.length,j));};if(!x("AGENTS.md").equals(x(".opencode/artifacts/pi-native-init/boilerplate.md")))throw Error("boilerplate drift")'
rg -q '^## ADR-016:' .pi/artifacts/pi-template/DECISIONS.md
rg -q 'pi-fabric@0.23.0' .pi/artifacts/pi-template/PLAN.md
rg -q 'fullCodeMode.*true' .pi/artifacts/pi-template/PLAN.md
git diff --check
```

## Task P2.2 - Seed facts, approved profile, and durable intent

```yaml
needs: P2.1
creates: technical context, approved user profile, stable project-intent source
has_checkpoint: false
files:
  - .pi/tech-stack.md
  - .pi/user.md
  - .pi/memory.md
```

1. **RED:** Confirm all three files are absent.
2. Write detected versions, architecture, and command evidence to `.pi/tech-stack.md`; classify commands as `verified|documented|failed|unknown`.
3. Preview every `.pi/user.md` field and include only explicitly approved preferences.
4. Create `.pi/memory.md` with decisions/patterns/gotchas and an immutable `## Initialization Intent - <generation-id>` section containing confirmed project intent.
5. Verify versions, privacy boundaries, stable intent heading, and formatting:

```bash
rg -q 'pi-fabric.*0.23.0' .pi/tech-stack.md
rg -q '^## Initialization Intent - ' .pi/memory.md
git diff --check
```

## Task P2.3 - Seed roadmap and partial state

```yaml
needs: P2.2
creates: versioned roadmap and fail-closed partial initialization state
has_checkpoint: false
files:
  - .pi/ROADMAP.md
  - .pi/state.md
```

1. **RED:** Confirm both files are absent.
2. Create roadmap schema v1 with `last_issued_id`, 1-3 Ready cards, bounded Next cards, and compact Later cards.
3. Source each card from the stable `.pi/memory.md` intent section and its whole-file SHA-256.
4. Compute the managed AGENTS interior hash.
5. Write `.pi/state.md` **last** with status `partial` and `context_reload_required: true`; do not emit a create handoff.

```bash
rg -q '^roadmap_schema_version: 1$' .pi/ROADMAP.md
rg -q '^last_issued_id: RM-[0-9][0-9][0-9]$' .pi/ROADMAP.md
rg -q '^initialization_status: partial$' .pi/state.md
rg -q '^context_reload_required: true$' .pi/state.md
git diff --check
```

---

# Child Plan P3 - Source-Backed `/create`

## Task P3.1 - Add failing create assertions

```yaml
needs: P2.3
creates: RED structural contract for both create modes
has_checkpoint: false
files:
  - .opencode/tool/structural-check.sh
```

1. Read the checker and current create prompt fresh.
2. Add assertions for argument grammar, slug-before-packet ordering, complete ready packet/hash gate, `.pi/memory.md`, source bounds, stable provenance, and no roadmap mutation.
3. Add preservation checks for sole namespace ownership and review/supervisor phases.
4. Run the checker and confirm only the new create section is RED:

```bash
bash -n .opencode/tool/structural-check.sh
bash .opencode/tool/structural-check.sh
```

Expected: exit 1 caused by named create-contract failures, not checker errors.

## Task P3.2 - Implement source mode and ready-packet gate

```yaml
needs: P3.1
creates: raw and source-backed create journeys
has_checkpoint: false
files:
  - .pi/prompts/create.md
```

1. Update `argument-hint` and input parsing for raw description or exactly one `--from` source.
2. Preserve canonical slug validation as the first filesystem-affecting guard.
3. After slug validation, require all six packet files, state schema v1, `ready`, reload flag false, and matching AGENTS hash.
4. Replace old memory access with `.pi/memory.md`; only then classify namespace absent/partial/established.
5. Implement lexical/canonical source validation, type/size/secret-name checks, and exact anchor behavior.
6. Hash one stable byte buffer, extract one outcome, and record path, anchor, whole-file hash, and RM ID.
7. Revalidate source bytes immediately before the first namespace write; drift returns to preview with zero namespace writes.
8. Preserve PLAN/TODO creation, namespace ownership, research, review, and supervisor behavior; then run:

```bash
bash .opencode/tool/structural-check.sh
git diff --check
```

Expected: create assertions GREEN; state remains partial.

## Task P3.3 - Close the create gate

```yaml
needs: P3.2
creates: static create evidence
has_checkpoint: false
files: []
```

1. Run the complete checker.
2. Compare protected OpenCode command bodies against the P1.2 baseline.
3. Confirm state remains partial:

```bash
bash .opencode/tool/structural-check.sh
rg -q '^initialization_status: partial$' .pi/state.md
git diff --check
```

---

# Child Plan P4 - `/init` Compiler and Refresh

## Task P4.1 - Add failing init assertions

```yaml
needs: P3.3
creates: RED compiler, refresh, reload, and drift contract
has_checkpoint: false
files:
  - .opencode/tool/structural-check.sh
```

1. Add assertions for new flags, removed modes, six outputs, no line cap, and byte-identical boilerplate.
2. Add state-classification and crash-order assertions.
3. Add source-data, interview-provenance, input/appendix drift, monotonic roadmap-ID, and reload-barrier assertions.
4. Run the checker; expect only the new init section to fail.

## Task P4.2 - Rewrite `/init`

```yaml
needs: P4.1
creates: truthful initialization compiler and refresh state machine
has_checkpoint: false
files:
  - .pi/prompts/init.md
```

1. Replace frontmatter grammar with `[--from <path[#anchor]>] [--deep] [--refresh]`; retain Pi 0.81.1 `$ARGUMENTS`.
2. Classify absent, interrupted-without-state, malformed, partial, established, and refresh states.
3. Apply the same bounded, data-only source guard as `/create`.
4. Separate discovered facts, explicit intent, and approved preferences; questions address unresolved material gaps only.
5. For interview mode, write confirmed intent to memory before compiling roadmap cards.
6. Preview every artifact and hash every input plus bytes outside managed regions; confirmation is required.
7. Re-read and re-hash immediately before mutation; any drift blocks or re-previews with zero target writes.
8. Fresh or refresh writes AGENTS/tech/user/memory/roadmap serially. If AGENTS changes, state ends `partial` with reload required and the only next instruction is `/reload`, then `/init --refresh`.
9. Post-reload refresh revalidates unchanged bytes, writes `ready` with reload false last, and only then emits the exact `/create <slug> --from .pi/ROADMAP.md#RM-NNN` handoff.
10. Preserve IDs by normalized outcome; never decrement `last_issued_id`; allocate a new ID for materially changed or new outcomes.

Verify:

```bash
bash .opencode/tool/structural-check.sh
git diff --check
```

## Task P4.3 - Close the init gate

```yaml
needs: P4.2
creates: static init evidence
has_checkpoint: false
files: []
```

1. Run all structural assertions.
2. Confirm all three boilerplate interiors are byte-identical.
3. Confirm repository seed state remains partial:

```bash
bash .opencode/tool/structural-check.sh
rg -q '^initialization_status: partial$' .pi/state.md
git diff --check
```

---

# Child Plan P5 - Lifecycle Consumer Migration

## Task P5.1 - Add failing packet-gate assertions

```yaml
needs: P4.3
creates: RED lifecycle ordering and packet checks
has_checkpoint: false
files:
  - .opencode/tool/structural-check.sh
```

1. Assert slug validation precedes packet, memory, namespace, and lifecycle access in every slugged command.
2. Assert packet completeness, schema, ready status, reload false, and AGENTS hash.
3. Assert `/gc` gates before memory/action and remains read-only.
4. Add scoped old-path rejection, excluding historical ADR-007 text; run expected RED.

## Task P5.2 - Migrate planning, research, and shipping

```yaml
needs: P5.1
creates: packet-gated plan/research/ship prompts
has_checkpoint: false
files:
  - .pi/prompts/plan.md
  - .pi/prompts/research.md
  - .pi/prompts/ship.md
```

1. Add the common packet gate immediately after each slug validator.
2. Change active project-memory access to `.pi/memory.md`.
3. Preserve `/plan` established-namespace refusal behavior.
4. Preserve response-only pre-create `/research`, but only after a ready packet exists.
5. Preserve `/ship`'s non-terminal completion boundary.
6. Run targeted and full checks:

```bash
bash .opencode/tool/structural-check.sh
git diff --check
```

## Task P5.3 - Migrate verification and GC

```yaml
needs: P5.2
creates: packet-gated verification and project-wide GC
has_checkpoint: false
files:
  - .pi/prompts/verify.md
  - .pi/prompts/gc.md
```

1. Add the verify packet gate after slug validation and migrate memory to `.pi/memory.md`.
2. Keep any distilled memory append before the final fingerprint.
3. Preserve external-only final verification and the no-post-fingerprint-write rule.
4. Add the slugless GC packet gate before memory or action; GC remains response-only.
5. Verify:

```bash
bash .opencode/tool/structural-check.sh
rg -q '^initialization_status: partial$' .pi/state.md
git diff --check
```

---

# Child Plan P6 - Runtime Skill Portability

## Task P6.1 - Migrate core lifecycle skills

```yaml
needs: P5.3
creates: Pi-native lifecycle, memory, and execution guidance
has_checkpoint: false
files:
  - .pi/skills/development-lifecycle/SKILL.md
  - .pi/skills/memory/SKILL.md
  - .pi/skills/subagent-driven-development/SKILL.md
```

1. **RED:** Record old first-hook, memory, and global plan-context matches.
2. Make `/init` the mandatory first hook and all downstream commands explicitly slugged.
3. Move memory guidance to `.pi/memory.md`.
4. Replace global plan-context files with `.pi/artifacts/<slug>/PLAN.md` and canonical slug files.
5. Run scoped scans and `git diff --check`.

## Task P6.2 - Migrate research and verification references

```yaml
needs: P6.1
creates: portable research references and freshness-only verification
has_checkpoint: false
files:
  - .pi/skills/gemini-large-context/SKILL.md
  - .pi/skills/opensrc/references/example-workflow.md
  - .pi/skills/verification-before-completion/references/VERIFICATION_PROTOCOL.md
```

1. **RED:** Record exact OpenCode coordination, research, and verify-log matches.
2. Replace `.active` inference with explicit `<slug>` paths.
3. Replace OpenCode research output with canonical per-slug `PROGRESS.md`.
4. Remove the verification cache, cached-pass shortcut, and post-success append protocol entirely.
5. Retain candidate evidence before the final fingerprint and external-only final declaration.

## Task P6.3 - Expand portability checks

```yaml
needs: P6.2
creates: GREEN all-skills portability gate
has_checkpoint: false
files:
  - .opencode/tool/structural-check.sh
```

1. Add fail-closed scans for `.opencode/`, the exact `.opencode/artifacts/.active` path, and global verify logs.
2. Do not reject legitimate object-property text such as `participants.active`.
3. Assert the development-lifecycle skill names `/init` first.
4. Run:

```bash
bash .opencode/tool/structural-check.sh
rg -q '^initialization_status: partial$' .pi/state.md
git diff --check
```

---

# Child Plan P7 - Away-Sandbox Convergence

## Task P7.1 - Protect Pi-native context in the runtime closure

```yaml
needs: P6.3 and settled away-sandbox implementation
creates: .pi-only copied runtime and protected context
has_checkpoint: false
files:
  - .pi/away-runtime/closure.ts
  - .pi/away-runtime/confinement.test.ts
  - .pi/away-sandbox.json
```

1. Re-read settled B2 files. Stop and re-plan P7 if paths or ownership differ materially.
2. **RED:** Add a copied-`.pi` fixture with `.opencode` absent.
3. Add mutation-denial cases for ROADMAP, user, tech-stack, state, memory, and managed AGENTS.
4. Remove mandatory OpenCode runtime closure members.
5. Add all Pi-native packet files to exact protected paths.
6. Preserve protection of prompts, canonical authority, runtime source, and the sandbox manifest itself.
7. Run:

```bash
node --experimental-strip-types --test .pi/away-runtime/confinement.test.ts
git diff --check
```

## Task P7.2 - Synchronize sandbox feature contracts

```yaml
needs: P7.1
creates: accurate away-sandbox spec, plan, and task graph
has_checkpoint: false
files:
  - .opencode/artifacts/away-sandbox-runtime/spec.md
  - .opencode/artifacts/away-sandbox-runtime/plan.md
  - .opencode/artifacts/away-sandbox-runtime/prd.json
```

1. **RED:** Identify stale mandatory OpenCode closure and unmanaged AGENTS assumptions.
2. Update closure membership and copied-`.pi` acceptance.
3. Restrict AGENTS ownership to the fixed managed-region contract.
4. Add Pi-native context protection and regression checks.
5. Validate JSON, graph, tests, and formatting.

## Task P7.3 - Reconcile ADR-014 with ADR-016

```yaml
needs: P7.2
creates: consistent sandbox and initialization authority
has_checkpoint: false
files:
  - .pi/artifacts/pi-template/DECISIONS.md
  - .pi/artifacts/pi-template/PLAN.md
  - AGENTS.md
```

1. **RED:** Check ADR-014 lacks the final Pi-native packet relationship.
2. Reconcile ADR-014 and ADR-016 without changing their independent authority.
3. Update canonical protected-context and copied-runtime wording.
4. Preserve fixture-identical boilerplate; confine project details to the appendix.
5. Run sandbox tests, structural checks, and confirm state remains partial.

---

# Child Plan P8 - Autonomous Loop, Dev Docs, and READY

## Task P8.1 - Synchronize autonomous-away-loop

```yaml
needs: P7.3
creates: roadmap-driven autonomous contract compatible with init
has_checkpoint: false
files:
  - .opencode/artifacts/autonomous-away-loop/spec.md
  - .opencode/artifacts/autonomous-away-loop/plan.md
  - .opencode/artifacts/autonomous-away-loop/prd.json
```

1. **RED:** Detect alternative roadmap defaults and stale lifecycle assumptions.
2. Make `.pi/ROADMAP.md` the sole default.
3. Require schema v1, monotonic IDs, and eligibility only for Ready + `away-ok` + no open decisions.
4. Require source-backed `/create`, no roadmap mutation, and protected Pi-native context.
5. Preserve Gate 0.4 until P8.3; validate JSON and task dependencies.

## Task P8.2 - Update development-only summaries

```yaml
needs: P8.1
creates: accurate but explicitly non-runtime OpenCode summaries
has_checkpoint: false
files:
  - .opencode/tech-stack.md
  - .opencode/roadmap.md
  - .opencode/state.md
```

1. Record `/init`, the six-file packet, reload barrier, and source-backed create.
2. Record ADR-016 and sole `.pi/ROADMAP.md` ownership.
3. Label all three files development-only, never shipped runtime dependencies.
4. Run scoped consistency checks and `git diff --check`.

## Task P8.3 - Promote READY and perform no-write acceptance

```yaml
needs: P8.2
creates: final ready state and external verification evidence
has_checkpoint: true
files:
  - .opencode/tool/structural-check.sh
  - .pi/state.md
```

1. Add final exact assertions while state is still partial.
2. Run the full static gate; repair failures only in their owning tasks.
3. Confirm final AGENTS bytes and hash, with reload-required still true.
4. **GATE:** Operator runs `/reload` or restarts Pi. Do not promote state beforehand.
5. In the reloaded session, rerun the checker and reject any intervening drift.
6. Change only `.pi/state.md` to `ready` and `context_reload_required: false`.
7. Capture HEAD, staged/unstaged digests, untracked content manifest, and verified-file hashes.
8. Run the complete checker, away-runtime tests, and `git diff --check` without writing.
9. With explicit approval, rerun away-sandbox D3 authenticated attestation/fingerprint checks.
10. Recompute the fingerprint. If unchanged, report acceptance externally and perform no further repository write.

If any post-ready check fails, the next repair write must first return state to `partial`.

---

## Retained-Fixture Runtime Checkpoint

Requires explicit approval, `/trust`, Pi restart, provider credentials in the trusted parent, and a retained fixture that is never auto-deleted.

Scenarios:

1. Preview/cancel produces no writes.
2. Fresh `--from` writes the packet and ends partial/reload-required.
3. `/reload` plus `/init --refresh` finalizes ready and emits the create command.
4. No-source interview persists stable intent before roadmap generation.
5. Plain init refuses an established packet.
6. AGENTS-changing refresh requires another reload barrier.
7. Source or appendix drift after preview produces zero target writes.
8. Unsafe, symlinked, outside-root, secret-named, oversized, duplicate-anchor, and ambiguous sources fail closed.
9. Missing, malformed, partial, reload-required, or not-ready packets block every lifecycle command.
10. Invalid slugs fail before packet access; GC gates before memory/action.
11. Roadmap reorder/remove/add/material-change refresh preserves IDs and advances the high-water mark.
12. Managed boilerplate equality and state hash remain exact.

Static source checks are not runtime proof. Pi's `--offline` controls startup network behavior only; provider requests still require explicit approval.

## Failure Behavior

- Predecessor unsettled: stop at P1.1.
- Exact boilerplate unavailable: stop; never reconstruct it.
- Source/input drift: re-preview with zero target writes.
- Partial/reload-required state: every lifecycle command blocks.
- `rg` exit >=2: checker failure, never a clean negative.
- Settled away-runtime paths differ: stop and split/re-plan P7.
- Post-ready verification failure: return state to partial before repair.
- Storage cap reached: retain fixtures and request separate deletion permission.
- No fallback to weaker security, old paths, or compatibility behavior.

## Privacy and Security

- `.pi/user.md` contains only previewed, operator-approved fields.
- `.pi/memory.md` contains no secrets, credentials, PII, raw tool output, per-slug status, or final verification results.
- Source documents are untrusted data and cannot authorize commands or tool calls.
- Secret-bearing files are never read as initialization sources.
- No installs, publication, deployment, or authenticated smoke without approval.
- The away sandbox protects all five `.pi` context files and AGENTS.

## Constitutional Compliance

- **PASS:** 23 tasks across eight child plans.
- Every task owns at most three files.
- Writable tasks are strictly serial.
- No dependency additions or file deletion.
- No destructive Git operation, hook bypass, branch mutation, automatic commit, or push.
- Exact boilerplate and concurrent work are preserved.

## Report

- **Discovery Level:** 3
- **Must-Haves:** 7 truths, 9 artifact groups, 8 key links
- **Context Budget:** Eight executions at approximately 35-50% each
- **Dependency Waves:** 23 serial waves
- **Task Count:** 23 tasks, approximately 125 short TDD steps
- **Production Paths:** 38
- **Plan Location:** `.opencode/artifacts/pi-native-init/plan.md`
- **Current Blocker:** `away-sandbox-runtime` must settle or be explicitly rebaselined
- **Next Step:** `/ship pi-native-init` (only after the predecessor settles or the operator rebaselines)
