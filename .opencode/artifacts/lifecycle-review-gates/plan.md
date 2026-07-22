# Lifecycle Review Gates Implementation Plan

> **For Claude:** Implement this plan task-by-task. Re-read every target file after milestone-5 C2 and prewalk-extension C2 settle; current line numbers and the baseline OID recorded here will be stale by then. All writable work is serial; each task owns at most three files.

**Goal:** Add source-grounded, tier-gated reviews to `/create`, `/plan`, `/ship`, and `/verify` that detect concrete correctness, safety, generated-code-quality, and language/framework defects while preserving Main's sole integration and verification authority.

**Discovery Level:** 3 — architectural lifecycle change, pi-fabric runtime contract, ADR supersession, four prompt state machines, and cross-feature sequencing.

**Context Budget:** Split into three child plans, each targeting 30–50% context per execution.

---

## Constraints

- Do not start implementation until milestone-5 C2 and prewalk-extension C2 settle.
- After prewalk, require exact ADR-010 before assigning lifecycle review ADR-011.
- All writes are serial; no parallel writable work.
- Maximum three files per task.
- No new dependency, agent lane, model tier, extension, review-state file, or quality scanner.
- Review children remain `extensions:false`, non-recursive, and limited to `read`, `grep`, `find`, `ls`.
- Main independently validates every finding; reviewer output is untrusted prose.
- Preserve the single ambient supervisor and no standalone `/gate`.
- Preserve ADR-006: only `/verify` may declare terminal verification, externally, with no post-fingerprint write.
- Do not modify `.pi/fabric.json`, `.pi/settings.json`, `.pi/prompts/supervise.md`, historical milestone artifacts, or `.opencode/command/*.md` source bodies.
- Do not silently truncate review packets; split them by disjoint subsystem or language when large.

---

## Must-Haves

### Observable Truths

1. `/create` reviews the final validated and synchronized PLAN/TODO artifacts.
2. `/plan` reviews the final constitutionally compliant plan.
3. `/ship` has one canonical final-diff review path rather than Standard and scored Iterative alternatives.
4. `/verify` reviews completeness, coherence, command evidence, and freshness before the final no-write pass.
5. "AI slop" is reported only when concrete scope, duplication, dead-code, speculative-abstraction, placeholder, error-masking, test-quality, or maintainability cost is evidenced.
6. Language/framework findings establish the exact version and cite an authoritative rule; otherwise they return `source-check-required`.
7. L0-1 reviewer availability is advisory; L2-3 requires a completed current-byte review and disposition.
8. Any independently validated Critical/High correctness or safety defect blocks regardless of discovery level.
9. A clean review does not certify readiness; Main and `/verify` retain their existing authority.

### Required Artifacts

| Artifact | Provides | Path |
|---|---|---|
| Corrected feature contract | Source-accurate design and graph | `.opencode/artifacts/lifecycle-review-gates/spec.md` |
| Executable PRD | Seven bounded tasks and exact validators | `.opencode/artifacts/lifecycle-review-gates/prd.json` |
| Spec boundary gate | Final spec/TODO review | `.pi/prompts/create.md` |
| Planning boundary gate | Final-plan review | `.pi/prompts/plan.md` |
| Delivery boundary gate | Candidate-diff review | `.pi/prompts/ship.md` |
| Evidence boundary gate | Advisory evidence review and final-pass ordering | `.pi/prompts/verify.md` |
| ADR-011 | Partial supersession of ADR-008 | `.pi/artifacts/pi-template/DECISIONS.md` |
| Canonical runtime contract | Dispatch, packet, severity, and tier rules | `.pi/artifacts/pi-template/PLAN.md` |
| Root authority | Reviewer role and generated-code rubric | `AGENTS.md` |
| Project summaries | Current runtime and review topology | `.opencode/tech-stack.md` |

### Key Links

| From | To | Via | Risk |
|---|---|---|---|
| `/create` selection | Later gates | Persisted Discovery and Effective Review Levels | Skipping `/plan` silently becomes L0 |
| PLAN Review Profile | Language/framework review | Version and source packet | Model invents outdated best practice |
| Ship-level baseline | Final candidate | Paths, hashes, before/after bytes, diff | Concurrent bytes reviewed as worker output |
| Candidate packet | Review child | Inline sanitized task brief | Child cannot obtain Git diff itself |
| Preliminary verification | `/verify` advisor | Commands, exits, modes, concise outputs | Reviewer audits evidence it never received |
| Reviewer finding | Workflow block | Main reopens bytes and validates | Child severity becomes untrusted authority |
| Candidate mutation | Review freshness | Candidate digest comparison | Review approves stale bytes |

---

## Shared Review Contract

### Effective Level

Persist both fields in every created PLAN:

```markdown
**Discovery Level:** N — rationale
**Effective Review Level:** N — max(discovery, risk floor)
```

Every later phase computes:

```text
max(stored discovery, stored effective level, current risk floor)
```

Never default missing or malformed data to L0; a slug that skipped `/plan` still carries `/create`'s numeric level.

Apply at least L2 for:

- Authentication or authorization.
- Secrets, credentials, PII, or sensitive data.
- Destructive actions.
- Database/schema/persistence changes.
- Concurrency or distributed state.
- Public APIs or compatibility contracts.
- New dependencies or unfamiliar external APIs.
- Cross-subsystem work.

### Finding Semantics

Each finding contains:

```text
[Critical|High|Medium|Low][category] path:line
Violated authority or invariant:
Concrete failure scenario and cost:
Smallest correction:
Confidence:
Evidence: local | host-supplied | source-check-required
```

- No overall score.
- No mandatory finding quota.
- `No evidence-backed findings in the supplied scope.` is a valid clean response.
- A child never labels itself authoritative or declares readiness.

### Objective Generated-Code Quality

Qualifying findings include:

- Untraceable scope (diff hunks with no requirement or necessary implementation support).
- Duplicate implementations with cited locations and divergence risk.
- Dead, unreachable, or unwired code.
- Speculative abstractions without a requirement or caller.
- Behaviorless wrappers that obscure ownership or errors.
- Placeholder, no-op, fake, or hard-coded implementation.
- Invented or version-incompatible APIs or dependencies.
- Broad fallback or error swallowing that masks failure.
- Tests that only verify mocks rather than behavior.
- Unnecessary compatibility shims (this repo is clean-slate; no backwards compatibility).
- Large unrelated generated edits that increase collision and review risk.

"Looks AI-generated," verbosity, naming taste, comments, or scanner labels alone are not findings. Existing `aislop` or Fallow output may be supplied as evidence leads, but the lifecycle must not install or fetch a scanner during a gate.

### Language and Framework Overlay

Authority order:

1. Latest operator decision.
2. Applicable `AGENTS.md`.
3. Accepted DECISIONS and PLAN requirements.
4. Exact-version official material supplied in the packet.
5. Exact-version source, types, and official examples.
6. Project tests/configuration and established local patterns.
7. Maintainer guidance or optional local skills.
8. Model memory — never authoritative.

At L2-3, `source-check-required` stops acceptance until Main or a network-capable scout obtains authoritative evidence and the review is rerun. Do not invent a best practice from memory.

### Exact Dispatch

```typescript
const result = await agents.run({
  task: "<phase-specific sanitized review packet>",
  name: "lifecycle-review-<phase>",
  runner: "pi",
  model: "openai-codex/gpt-5.6-sol",
  thinking: "max",
  extensions: false,
  recursive: false,
  tools: ["read", "grep", "find", "ls"],
  worktree: false,
});
```

Only `status === "completed"` counts as a completed review. Partial text from a failed, stopped, or timed-out child is context only, never a final review. There is no role/subagent-type field on `agents.run`; the focused role is encoded in the task text.

---

## Dependency Graph

```text
External prerequisite 1: milestone-5 C2
External prerequisite 2: prewalk-extension C2

milestone-5 C2
  → prewalk-extension C2
    → A1 → A2 → B1 → B2 → C1 → C2 → C3

Wave 1: A1
Wave 2: A2
Wave 3: B1
Wave 4: B2
Wave 5: C1
Wave 6: C2
Wave 7: C3

No writable waves run in parallel.
```

---

# Child Plan A — Contract and Review-Level Producers

## Task A1: Rebase and correct the binding specification

```yaml
needs:
  - milestone-5 C2 settled
  - prewalk-extension C2 settled
  - exact ADR-010 present
creates:
  - corrected lifecycle-review contract
  - seven-task bounded PRD
  - current baseline OID
has_checkpoint: true
files:
  - .opencode/artifacts/lifecycle-review-gates/spec.md
  - .opencode/artifacts/lifecycle-review-gates/prd.json
  - .opencode/artifacts/.active
```

### TDD Steps

1. Read the settled milestone-5 and prewalk artifacts, current ADRs, prompts, and shared files fresh. Capture the new baseline with `git rev-parse HEAD`.
2. Stop if prewalk ADR-010 or its C2 evidence is absent — do not guess the ADR number.
3. **RED:** prove the current contract is stale:

   ```bash
   rg -n 'consistent with ADR-008|NOT a reversal' .opencode/artifacts/lifecycle-review-gates/spec.md
   node -e 'const p=require("./.opencode/artifacts/lifecycle-review-gates/prd.json"); if(p.tasks.length!==7)process.exit(1)'
   ```

   Expected: stale ADR language matches; the seven-task assertion exits nonzero.

4. Rewrite `spec.md` to record a deliberate partial supersession of ADR-008 (not "consistent, not a reversal"), corrected phase placement, review packet contract, effective-level propagation, convergence loops, source hierarchy, and the objective generated-code rubric. Preserve the single supervisor, no mailbox panel, and no standalone `/gate`.
5. Rewrite `prd.json` to the seven tasks in this plan; set the settled baseline OID, exact write/verified paths, and shared serial ownership. Add `roadmap.md` and `state.md` to write/verified paths. Keep the protected source paths unchanged.
6. Set `.opencode/artifacts/.active` to `lifecycle-review-gates`.
7. **GREEN:**

   ```bash
   node -e 'const p=require("./.opencode/artifacts/lifecycle-review-gates/prd.json");const ids=new Map(p.tasks.map((t,i)=>[t.id,i]));const counts={};if(p.tasks.length!==7||ids.size!==7)process.exit(1);for(const[i,t] of p.tasks.entries()){if(t.files.length>3)process.exit(1);counts[t.child_plan]=(counts[t.child_plan]||0)+1;for(const d of t.depends_on){if(!ids.has(d)||ids.get(d)>=i)process.exit(1)}}if(counts.A!==2||counts.B!==2||counts.C!==3)process.exit(1)'
   ! rg -n 'consistent with ADR-008|NOT a reversal' .opencode/artifacts/lifecycle-review-gates/spec.md
   git diff --check
   ```

---

## Task A2: Add durable review levels and final-artifact gates

```yaml
needs: [A1]
creates:
  - numeric discovery/effective level from /create
  - final spec review gate
  - final planning review gate
has_checkpoint: false
files:
  - .pi/prompts/create.md
  - .pi/prompts/plan.md
```

### TDD Steps

1. Read both prompts and their frontmatter fresh.
2. **RED:** require the future unique markers to be absent:

   ```bash
   rg -n '^## Phase 10A: Spec Review Gate$' .pi/prompts/create.md
   rg -n '^## Phase 8A: Planning Review Gate$' .pi/prompts/plan.md
   ```

   Expected: both exit 1.

3. Add Skip=0, Minimal=1, Standard=2, Deep=3 mapping to `/create`. Require both `**Discovery Level:** N — rationale` and `**Effective Review Level:** N — max(discovery, risk floor)` in Lite and Full PLAN formats.
4. Add a `## Review Profile` covering language/framework versions, local authorities, required source packet, required checks, and applicable overlays.
5. Add `## Phase 10A: Spec Review Gate` after Phase 8 validation and Phase 10 TODO conversion. Accepted findings regenerate TODO as necessary, rerun validation, and trigger another L2-3 review. Bound convergence to two review-integration rounds, then escalate.
6. Add `## Phase 8A: Planning Review Gate` after Phase 8 Constitutional Compliance. Accepted findings rerun compliance and L2-3 review, with the same two-round bound.
7. Preserve frontmatter (`description` + `argument-hint`), `<slug>` token, and forbidden-token cleanliness.

### GREEN

```bash
rg -n '^## Phase 10A: Spec Review Gate$' .pi/prompts/create.md
rg -n '^## Phase 8A: Planning Review Gate$' .pi/prompts/plan.md
rg -n '^\*\*Discovery Level:\*\*|^\*\*Effective Review Level:\*\*|^## Review Profile$' .pi/prompts/create.md .pi/prompts/plan.md
rg -q '<slug>' .pi/prompts/create.md && rg -q '<slug>' .pi/prompts/plan.md
node -e 'const fs=require("fs");const checks=[[".pi/prompts/create.md",["## Phase 8: Validate PRD","## Phase 10: Convert PRD to Tasks","## Phase 10A: Spec Review Gate","## Phase 11: Report"]],[".pi/prompts/plan.md",["## Phase 7: Write Plan","## Phase 8: Constitutional Compliance Gate","## Phase 8A: Planning Review Gate","## Phase 9: Report"]]];for(const[f,h] of checks){const s=fs.readFileSync(f,"utf8");let last=-1;for(const x of h){const i=s.indexOf(x);if(i<=last)process.exit(1);last=i}}'
```

---

# Child Plan B — Candidate and Evidence Consumers

## Task B1: Replace `/ship` review modes with one canonical final-diff gate

```yaml
needs: [A2]
creates:
  - ship-level review baseline
  - final candidate packet
  - one tier-gated review mechanism
has_checkpoint: false
files:
  - .pi/prompts/ship.md
```

### TDD Steps

1. Read the post-prewalk `/ship` prompt fresh; identify Host-Derived Candidate Intake and Selective Routing.
2. **RED:**

   ```bash
   rg -n '^### Ship-Level Review Baseline$|^### Tier-Gated Diff Review$' .pi/prompts/ship.md
   ```

   Expected: exit 1.

3. Add a `### Ship-Level Review Baseline` before Phase 3 execution. It must cover HEAD, staged/unstaged state, untracked manifest, candidate path hashes, and already-dirty path hashes.
4. Preserve per-worker Host-Derived Candidate Intake. Build the final packet from the ship-level baseline and settled candidate bytes, explicitly listing candidate and excluded paths. Do not silently truncate; split by disjoint subsystem or language when large.
5. Move UI Quality Gate and Goal-Backward Verification before the advisor. Keep UI accessibility/recovery as an applicable overlay within the single review, not a separate scoring system.
6. Replace `### Mode Selection`, `### Standard Review Mode`, and `### Iterative Quality Loop Mode` with one `### Tier-Gated Diff Review`. Do not retain score-based approval.
7. Require full Phase 4 rerun, packet regeneration, and L2-3 re-review after any candidate mutation. Cap integration rounds at two, then escalate.

### GREEN

```bash
test "$(rg -c '^### Ship-Level Review Baseline$' .pi/prompts/ship.md)" = 1
test "$(rg -c '^### Tier-Gated Diff Review$' .pi/prompts/ship.md)" = 1
! rg -n '^### Standard Review Mode$|^### Iterative Quality Loop Mode$|Score ≥|score \(X/5\)' .pi/prompts/ship.md
rg -n 'Host-Derived Candidate Intake|Selective Routing|Objective Generated-Code Quality|Language and Framework Overlay|source-check-required' .pi/prompts/ship.md
rg -n 'cannot declare (terminal )?(verified status|completion)' .pi/prompts/ship.md
rg -q '<slug>' .pi/prompts/ship.md
git diff --check
```

---

## Task B2: Add advisory evidence review and a fresh final pass

```yaml
needs: [B1]
creates:
  - in-memory verification evidence packet
  - advisory evidence review
  - correctly ordered final no-write pass
has_checkpoint: false
files:
  - .pi/prompts/verify.md
```

### TDD Steps

1. Read ADR-006 and the entire current `/verify` state machine fresh.
2. **RED:**

   ```bash
   rg -n '^### Phase 5A: Advisory Evidence Review$|^### Phase 5C: Final No-Write Pass$' .pi/prompts/verify.md
   ```

   Expected: exit 1.

3. Preserve `## Phase 5: Report`; add ordered subsections:
   - `### Phase 5A: Advisory Evidence Review`
   - `### Phase 5B: Candidate Evidence Writes`
   - `### Phase 5C: Final No-Write Pass`
   - `### Phase 5D: Transcript-Only Result`
4. Construct the review packet from preliminary command names, exit codes, modes, concise non-sensitive outputs, skips, completeness/coherence, fingerprints, effective level, and prior review dispositions.
5. Treat reviewer availability as advisory. Independently validated defects still produce `NEEDS WORK`; any required write returns to `/ship`.
6. Perform all allowed PROGRESS/MEMORY writes before a fresh final-pass baseline.
7. Rerun all required terminal gates and coherence, compare the final fingerprint, then emit the transcript-only result with no later write.

### GREEN

```bash
rg -n '^### Phase 5A: Advisory Evidence Review$|^### Phase 5B: Candidate Evidence Writes$|^### Phase 5C: Final No-Write Pass$|^### Phase 5D: Transcript-Only Result$' .pi/prompts/verify.md
node -e 'const s=require("fs").readFileSync(".pi/prompts/verify.md","utf8");const h=["## Phase 4: Coherence","### Phase 5A: Advisory Evidence Review","### Phase 5B: Candidate Evidence Writes","### Phase 5C: Final No-Write Pass","### Phase 5D: Transcript-Only Result"];let last=-1;for(const x of h){const i=s.indexOf(x);if(i<=last)process.exit(1);last=i}}'
rg -ni 'sole.*verified|transcript only|no repository write' .pi/prompts/verify.md
rg -q '<slug>' .pi/prompts/verify.md
git diff --check
```

---

# Child Plan C — Authority, Summaries, and Closure

## Task C1: Record ADR-011 and canonical reviewer authority

```yaml
needs: [B2]
creates:
  - accepted ADR-011
  - canonical lifecycle review contract
  - root reviewer authority
has_checkpoint: true
files:
  - .pi/artifacts/pi-template/DECISIONS.md
  - .pi/artifacts/pi-template/PLAN.md
  - AGENTS.md
```

### TDD Steps

1. Confirm ADR-010 is the settled prewalk decision and no ADR-011 exists.
2. **RED:**

   ```bash
   rg -n '^## ADR-011: Tier-gated lifecycle review gates$' .pi/artifacts/pi-template/DECISIONS.md
   ```

   Expected: exit 1.

3. Append `## ADR-011: Tier-gated lifecycle review gates`. Explicitly supersede ADR-008's no-consultation clause and its rejected embedded-gate alternative (b). Record the authority, dispatch, packet, level propagation, freshness, source hierarchy, and failure rules.
4. Add a forward-reference note to ADR-008 ("superseded in part by ADR-011") while preserving the single supervisor, no mailbox panel, and no standalone `/gate`.
5. Update canonical `PLAN.md` with the exact review dispatch, packet contract, level propagation, freshness rule, source hierarchy, and failure behavior.
6. Update `AGENTS.md` with the reviewer role, objective generated-code-quality policy, and language/framework overlay. Remove or reword the "no mandatory review every cycle" wording to "no fixed review matrix; evidence-based boundary review is tier-gated" without creating a fixed perspective matrix.

### GREEN

```bash
rg -n '^## ADR-011: Tier-gated lifecycle review gates$' .pi/artifacts/pi-template/DECISIONS.md
rg -n 'supersed.*ADR-008|ADR-011' .pi/artifacts/pi-template/DECISIONS.md
rg -n 'Objective Generated-Code Quality|Language and Framework Overlay|source-check-required' AGENTS.md .pi/artifacts/pi-template/PLAN.md
git diff --check
```

---

## Task C2: Synchronize project summaries

```yaml
needs: [C1]
creates:
  - current model/runtime summary
  - current roadmap policy
  - implementation status
has_checkpoint: false
files:
  - .opencode/tech-stack.md
  - .opencode/roadmap.md
  - .opencode/state.md
```

### TDD Steps

1. Read all three files and compare them to ADR-010/011 and installed pi-fabric.
2. **RED:** prove the stale policy remains:

   ```bash
   rg -n 'No mandatory research/review agents every cycle|0\.22\.4' .opencode/roadmap.md .opencode/tech-stack.md .opencode/state.md
   ```

3. Update `tech-stack.md` with pi-fabric 0.23.0, the exact read-only review dispatch, and tier semantics.
4. Replace the roadmap non-goal with "no fixed review matrix; evidence-based boundary review is tier-gated."
5. Update `state.md` with milestone/prewalk/lifecycle status and ADR-011, without turning the state summary into authority.

### GREEN

```bash
rg -n '0\.23\.0|tier-gated lifecycle review|ADR-011' .opencode/tech-stack.md .opencode/roadmap.md .opencode/state.md
! rg -n 'No mandatory research/review agents every cycle' .opencode/roadmap.md
git diff --check
```

---

## Task C3: Static closure and direct read-only runtime smoke

```yaml
needs: [C2]
creates:
  - structural verification evidence
  - read-only reviewer runtime evidence
  - final unchanged fingerprint
has_checkpoint: true
files: []
```

### TDD Steps

1. Request `/reload` or a Pi restart so prompt/resource changes are current.
2. Run JSON, graph, unique-heading, order, exact-dispatch, and prompt-frontmatter checks.
3. Replace milestone-5's old all-heading-preservation assertion with a baseline-aware validator:
   - Permit only the explicitly retired `/ship` review headings (`Mode Selection`, `Standard Review Mode`, `Iterative Quality Loop Mode`).
   - Preserve UI Quality Gate, Goal-Backward Verification, and every unrelated heading.
   - Preserve all `/verify` baseline headings (Phase 5 Report stays; only ordered subsections are added).
   - Require each new heading exactly once and in order.
   - Do not modify historical milestone artifacts.
4. Run the complete milestone-5 forbidden-token and `<slug>` regression checks across `.pi/prompts/*.md`.
5. Confirm protected files remain unchanged from A1's settled baseline:

   ```bash
   git diff --exit-code "$(node -p 'require("./.opencode/artifacts/lifecycle-review-gates/prd.json").manifests.baseline_oid')" -- \
     .pi/fabric.json .pi/settings.json .pi/prompts/supervise.md .opencode/command
   ```

6. Under a before/after fingerprint, execute one direct review-child smoke using the exact dispatch. The task reads allowed project files and returns evidence-backed findings only. Do not invoke the mutating lifecycle commands.
7. Require:
   - `status === "completed"`;
   - no write-capable child tools in the dispatch;
   - unchanged repository fingerprint;
   - a clean packet permits zero findings;
   - an unsupported language claim returns `source-check-required`;
   - a candidate-hash change is documented as invalidating an L2-3 review.

A failed runtime reviewer smoke blocks feature verification. End-to-end lifecycle invocation remains deferred because `/create`, `/plan`, and `/verify` intentionally write artifacts.

### Final Static Commands

```bash
git diff --check
node -p 'require("./.pi/npm/node_modules/pi-fabric/package.json").version' | rg -x '0\.23\.0'
pi --approve --list-models | rg -F 'openai-codex/gpt-5.6-sol'
pi --approve --list-models | rg -F 'makora/zai-org/GLM-5.2-NVFP4'
for f in create plan ship verify research; do rg -q '<slug>' ".pi/prompts/$f.md" || exit 1; done
! rg -n 'agent:|task\(|question\(|skill\(|write\(|\.active|spec\.md|prd\.json|review-state\.json' .pi/prompts/*.md
```

---

## Failure Behavior

- **L0-1 child failure:** warn and continue using normal safety and verification rules.
- **L2-3 child failure:** retry once; then stop for operator disposition.
- **`/verify` child failure:** advisory warning; does not independently prevent `VERIFIED`.
- **Validated Critical/High defect:** blocks at every level.
- **L2-3 `source-check-required`:** obtain authoritative evidence and rerun review.
- **False positive:** Main records an evidence-backed rejection.
- **Candidate mutation:** invalidates the review and requires a new L2-3 packet/review.
- **Two integration rounds without convergence:** stop and surface unresolved findings.
- **Oversized packet:** split by disjoint candidate files; never truncate silently.

## Privacy and Security

- Exclude environment, key, token, credential, and PII-bearing files from packets.
- Redact sensitive command output.
- Supply an explicit path allowlist.
- Read-only tools are capability policy, not secret isolation.
- Never include credentials in task text or persisted findings.
- Do not dynamically install or fetch quality scanners.
- Persist only distilled findings and disposition rationale.

## Risks

- **Highest:** authority conflict unless ADR-011 explicitly supersedes part of ADR-008.
- **High:** reviewer receives stale or incomplete evidence unless Main supplies the in-memory packet.
- **High:** `/plan` may be skipped; `/create` must therefore persist both levels.
- **High:** accepted findings can stale validation/review; bounded convergence loops are mandatory.
- **Medium:** language advice can become hallucinated convention; `source-check-required` is the fail-closed response.
- **Medium:** review latency; L0-1 remains non-blocking and no fixed perspective matrix is used.

## Constitutional Compliance

**PASS**

- Seven tasks across three child plans.
- Two, two, and three tasks per child plan.
- Maximum three files per task.
- No deletion.
- No new dependencies.
- No capability widening.
- No writable or recursive reviewer.
- No automatic commit, push, publication, or destructive command.
- All writable waves are serial.
- TDD uses exact RED/GREEN structural and runtime checks.

## Report

1. **Discovery Level:** 3 — lifecycle architecture and ADR change.
2. **Must-Haves:** 9 truths, 10 artifact rows, 7 key links.
3. **Context Budget:** Plan A 35–45%, Plan B 40–50%, Plan C 30–40%.
4. **Dependency Waves:** 7 internal waves after 2 external prerequisites.
5. **Task count:** 7 tasks, 45 TDD steps.
6. **Files affected:** 13 distinct paths across the three child plans.
7. **Plan location:** `.opencode/artifacts/lifecycle-review-gates/plan.md`.
8. **Next step:** Finish milestone-5 C2 and prewalk-extension C2, then run `/ship lifecycle-review-gates`.
