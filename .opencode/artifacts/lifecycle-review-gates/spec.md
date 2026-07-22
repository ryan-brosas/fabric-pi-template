# Lifecycle Review Gates — tier-gated read-only review at all four lifecycle prompts

> **Status:** proposed · **ID:** lrg-001 · **Created:** 2026-07-22
> **Baseline OID:** `596aae7fef1a004096fff324657c877b7a000973` (HEAD after milestone-5 + prewalk settled)

## Problem Statement

The four lifecycle prompts (`/create`, `/plan`, `/ship`, `/verify`) have no systematic
review gate. `/create` (Phase 4) and `/plan` (Phase 0/3) dispatch read-only `explore`/`scout`
children for *research/gathering*, not *review/advisory*. `/ship` derives candidates from the
worktree (milestone-5 host-derived intake) and runs a Standard/Iterative scored review loop, but
that loop commits before review, lacks an in-memory diff packet, and uses a subjective 1–5 score
rather than evidence-backed findings. `/verify` runs mechanical gates (typecheck/lint/test/build)
and coherence cross-refs but no *judgment* layer over the actual command evidence and freshness.

ADR-008 (DECISIONS.md:177-209) dropped the dormant security/architecture advisor panel and the
never-built standalone `/gate` command as redundant, and kept an explicit escape hatch:
*"if a change genuinely needs a security or architecture specialist review, the operator
dispatches a read-only `explore`/`review` child ad hoc rather than relying on a fixed advisor
panel."* That escape hatch is easy to forget — exactly the kind of rarely-invoked manual step
ADR-008 criticized `/gate` for being. The fix: make the escape hatch **systematic** by embedding a
read-only `review` child gate into the prompts themselves, so the operator does not have to
remember to dispatch it.

## Relationship to ADR-008 (partial supersession — NOT "consistent")

This proposal **partially supersedes ADR-008**. ADR-008 explicitly rejected embedding review gates
into `/ship` and `/verify` (its rejected alternative (b)), and it rejected mandatory advisor
consultation every cycle. This feature reverses both of those specific decisions: it embeds a
read-only review child into `/ship` and `/verify`, and it runs review at every `/create`/`/plan`/
`/ship`/`/verify` invocation (tier-gated, so L0-1 is non-blocking).

ADR-008's *other* decisions are **preserved unchanged**:
- The single ambient supervisor (`supervise.md`) is the only persistent reviewer; no mailbox panel
  is restored.
- No standalone `/gate` command is introduced.
- Review remains a read-only child (`extensions:false`, `read,grep,find,ls`, non-recursive); no
  new agent lane, model tier, or capability widening.
- Main remains sole integrator; reviewer output is untrusted prose (Worker Distrust).

The supersession is recorded as **ADR-011** (ADR-010 is the settled prewalk decision). ADR-008 gets
a forward reference noting the partial supersession. The canonical `PLAN.md` and `AGENTS.md` "no
mandatory review every cycle" wording is reworded to "no fixed review matrix; evidence-based
boundary review is tier-gated" — review runs at every invocation, but it is not a fixed
perspective matrix and L0-1 stays non-blocking.

## Chosen design

**Embed a tier-gated read-only `review` child gate at all four lifecycle prompts.** The `review`
lane already exists (AGENTS.md:99 — `review` runs `openai-codex/gpt-5.6-sol`, `thinking:"max"`,
`extensions:false`, read-only `read,grep,find,ls`). **No new lane, no new model tier, no
capability widening.** After prewalk, Main runs `fullCodeMode:true`, so the gate dispatches inside
a `fabric_exec` program as an explicit `agents.run`; before/independent of full code mode it is a
plain read-only `agents.run`. The dispatch shape is pinned (see Exact Dispatch) and identical
either way — the only difference is the surrounding program context, not the child contract.

### The four gates

| Prompt | Gate | Where (phase) | Blocking |
|---|---|---|---|
| `/create` | **Spec review** — audit the *final validated and synchronized* PLAN/TODO: scope clarity, observable-truth completeness, ambiguous non-goals, open questions that block `/plan`, task-to-criterion traceability, versioned source obligations | `## Phase 10A: Spec Review Gate` — after Phase 8 (validate PRD) and Phase 10 (convert PRD to tasks), before the report | L2-3 only |
| `/plan` | **Planning review** — audit the *final constitutionally compliant* plan: requirement→artifact→key link→task→verification traceability, slice quality, dependency consistency, failure/recovery/security paths, source citations, abstraction necessity | `## Phase 8A: Planning Review Gate` — after Phase 8 (Constitutional Compliance), before the report | L2-3 only; L0-1 advisory |
| `/ship` | **Diff review** — one canonical final-diff review of the settled candidate bytes: correctness, security, regressions, scope creep, surgical-diff discipline, generated-code quality, language/framework best practice | `### Tier-Gated Diff Review` — replaces the old Standard + Iterative scored modes; after UI Quality Gate + Goal-Backward Verification, before candidate acceptance | L2-3 only |
| `/verify` | **Evidence review** — audit completeness, coherence, command evidence, and freshness for what mechanical gates miss (superseded checks, stale assertions, untested branches, skips-as-passes) | `### Phase 5A: Advisory Evidence Review` — after Phase 4 (coherence), before candidate evidence writes and the fresh final pass | always advisory (ADR-006 no-write stands) |

Gate placement reviews the **final artifacts** for that phase, not an intermediate draft: `/create`
reviews after validation + TODO conversion (so a clean review is not immediately staled by Phase 8
rewrites or Phase 10 derivation); `/plan` reviews after constitutional compliance; `/ship` reviews
the final settled diff after UI/goal-backward checks; `/verify` reviews after coherence and before
the final fingerprint.

### Effective Review Level (durable, deterministic)

`/plan` is optional, so `/create` must persist both levels. Every created PLAN carries:

```markdown
**Discovery Level:** N — rationale
**Effective Review Level:** N — max(discovery, risk floor)
```

Every later phase computes:

```text
effective = max(stored discovery, stored effective level, current risk floor)
```

Missing or malformed data **never defaults to L0** — a slug that skipped `/plan` still carries
`/create`'s numeric level. Apply at least **L2** for: authentication or authorization; secrets,
credentials, PII, or sensitive data; destructive actions; database/schema/persistence changes;
concurrency or distributed state; public APIs or compatibility contracts; new dependencies or
unfamiliar external APIs; cross-subsystem work.

### Tier behavior

- **L0-1 (advisory):** the reviewer runs but its completion is not a phase precondition. Reviewer
  availability is advisory; a child failure warns and proceeds. Existing hard safety/correctness
  rules still apply when Main independently validates a Critical/High finding.
- **L2-3 (blocking):** Main cannot advance until the review is tied to current candidate bytes and
  every Critical/High finding is adjudicated (resolved, disproved with evidence, or explicitly
  accepted with rationale). A timeout or unavailable reviewer blocks unless the operator overrides.
- **`/verify` (always advisory):** the reviewer never blocks by its own authority. Independently
  confirmed correctness/safety defects still produce `NEEDS WORK` under Main's authority (ADR-006:
  `/verify` may block, but the *reviewer child* is advisory).
- A **clean review never certifies readiness**; Main and `/verify` retain their existing authority.
- Any **candidate-byte change invalidates the review** and requires a new L2-3 packet/review.

### Finding semantics

Each finding contains:

```text
[Critical|High|Medium|Low][category] path:line
Violated authority or invariant:
Concrete failure scenario and cost:
Smallest correction:
Confidence:
Evidence: local | host-supplied | source-check-required
```

- No overall score, no mandatory finding quota. `No evidence-backed findings in the supplied scope.`
  is a valid clean response.
- A child **never labels itself authoritative** or declares readiness. Main reopens every cited
  `path:line` and reproduces the reasoning before accepting (Worker Distrust). Only Main's validated
  disposition blocks or proceeds.
- Critical/High independently validated defects block at every level. Medium may be deferred with
  rationale. Low never blocks alone.

### Objective generated-code quality ("AI slop" as evidence, not vibe)

Qualifying findings include: untraceable scope (diff hunks with no requirement); duplicate
implementations with cited locations and divergence risk; dead/unreachable/unwired code;
speculative abstractions without a requirement or caller; behaviorless wrappers that obscure
ownership or errors; placeholder/no-op/hard-coded implementation; invented or version-incompatible
APIs/dependencies; broad fallback or error swallowing that masks failure; tests that only verify
mocks rather than behavior; unnecessary compatibility shims (this repo is clean-slate); large
unrelated generated edits that increase collision/review risk.

"Looks AI-generated," verbosity, naming taste, comments, or scanner labels alone are **not**
findings. Existing `aislop`/Fallow output may be supplied as an evidence lead, but the lifecycle
must **not install or fetch a scanner** during a gate — tool output becomes a finding only after
mapping to a concrete cost above.

### Language and framework overlay

Authority order: (1) latest operator decision; (2) applicable `AGENTS.md`; (3) accepted DECISIONS
and PLAN requirements; (4) exact-version official material supplied in the packet; (5)
exact-version source/types/examples; (6) project tests/configuration and established local patterns;
(7) maintainer guidance or optional local skills; (8) model memory — **never authoritative**.

At L2-3, `source-check-required` stops acceptance until Main or a network-capable scout obtains
authoritative evidence and the review is rerun. Do not invent a best practice from memory. Local
TypeScript guidance is conditional project policy, not a universal language mandate — do not
automatically demand branded primitives merely because a file is TypeScript.

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

Only `status === "completed"` counts as a completed review. Partial text from a failed, stopped,
or timed-out child is context only, never a final review. There is **no role/subagent-type field**
on `agents.run`; the focused role is encoded in the task text. Read-only is capability policy, not
a security sandbox — enforce a prompt-level path allowlist and exclude secret-bearing files.

### Review packet (in-memory, host-supplied)

The reviewer has only `read,grep,find,ls`; it **cannot** run `git diff`, verification commands, or
network research. Main must supply an inline sanitized packet containing: phase, slug, effective
level and rationale; applicable requirements/decisions; host-derived changed paths, unified diff,
baseline/candidate hashes; commands run, exit codes, untruncated output, modes, and fingerprint
state; detected language/framework and exact manifest/lockfile versions; relevant local standards
or researched source excerpts; an explicit file allowlist excluding secrets. Do not silently
truncate — split oversized packets by disjoint subsystem or language into bounded read-only
review runs; all L2-3 chunks must complete.

### Convergence loops

Accepted findings can stale the validation/review they depend on, so each gate reruns dependent
work after an accepted finding: `/create` regenerates TODO as needed, reruns validation, then
re-reviews at L2-3; `/plan` reruns constitutional compliance and re-reviews; `/ship` reruns full
Phase 4, regenerates the packet, and re-reviews after any candidate mutation. Bound convergence to
**two review-integration rounds**, then escalate unresolved findings. "One review" means one
canonical mechanism, not only one execution.

### Role separation (do not conflate)

- **Supervisor** (`supervise.md`) — ambient, reactive (`events: agent_settled/tool_error`), steers
  Main on drift *during* work. **Unchanged by this spec.**
- **Lifecycle advisor** (this spec) — gate-dispatched read-only `review` child, at a phase
  boundary, advisory to Main. The missing middle.
- **Prewalk** (`prewalk-extension`, ADR-010) — frontier(GPT)→executor(Makora) handoff within a
  task. Composes naturally: GPT-5.6 reviews GPT-5.6's plan before the Makora handoff.

Three distinct mechanisms; the advisor is the one ADR-008 left as a manual escape hatch.

## Scope (In/Out)

### In scope
- Add a tier-gated read-only `review` child gate to `.pi/prompts/{create,plan,ship,verify}.md`.
- `/create` persists both Discovery Level and Effective Review Level (numeric).
- `/ship` replaces the Standard + Iterative scored review modes with one `### Tier-Gated Diff
  Review` fed by a `### Ship-Level Review Baseline`.
- `/verify` adds `### Phase 5A: Advisory Evidence Review` + `### Phase 5B: Candidate Evidence
  Writes` + `### Phase 5C: Final No-Write Pass` + `### Phase 5D: Transcript-Only Result` in order.
- ADR-011 recording the partial supersession of ADR-008.
- Canonical `PLAN.md`: exact review dispatch, packet contract, level propagation, freshness,
  source hierarchy, failure behavior.
- `AGENTS.md`: reviewer role, objective generated-code policy, language/framework overlay;
  reword "no mandatory review every cycle" to "no fixed review matrix; evidence-based boundary
  review is tier-gated".
- `.opencode/tech-stack.md`, `.opencode/roadmap.md`, `.opencode/state.md`: synchronized summaries.

### Out of scope (non-goals)
- Changing the supervisor (`supervise.md`) — a different, ambient/reactive mechanism.
- Restoring the dormant advisor panel or a standalone `/gate` command (ADR-008 rejected these;
  preserved).
- A new agent lane or model tier (uses the existing `review` lane).
- Widening capability (read-only, `extensions:false`, no `bash`, no recursion).
- A fixed review perspective matrix (review runs at every invocation but is not a fixed matrix).
- Installing or fetching a quality scanner (`aislop`/Fallow) during a gate.
- Changes to `.pi/fabric.json`, `.pi/settings.json`, `.opencode/command/*.md` source bodies, or
  historical milestone artifacts.

## Sequencing (now satisfied)

**Milestone-5 C2 settled** (HEAD `2a8b487`) and **prewalk-extension C2 settled** (HEAD `596aae7`).
ADR-010 (prewalk) is present at DECISIONS.md:254. All shared files (`ship.md`, `AGENTS.md`,
`DECISIONS.md`, `tech-stack.md`, `PLAN.md`) are now free. This feature takes **ADR-011** (next
available). The hard sequencing constraint from the original draft is resolved.

## Milestone-5 regression invariant (must preserve)

Milestone-5's V6 validator scans all `.pi/prompts/*.md`. Every prompt edit here MUST preserve:
- Frontmatter `description` (+ `argument-hint` where present) for create/plan/ship/verify.
- `<slug>` token in create/plan/ship/verify/research.
- No forbidden OpenCode-pseudocode tokens (`task(`, `question(`, `skill(`, `write(`, `.active`,
  `spec.md`, `prd.json`, `review-state.json`, etc.).
- `ship.md` keeps its "cannot declare...verified status/completion" phrase.
- `verify.md` keeps its "sole...verified | transcript only | no repository write" phrase.

The advisor-gate text is clean prose with no pseudocode tokens. `/ship` consolidation intentionally
**retires** three headings (`### Mode Selection`, `### Standard Review Mode`, `### Iterative
Quality Loop Mode`) and replaces them with `### Ship-Level Review Baseline` + `### Tier-Gated Diff
Review`; the C3 baseline-aware validator permits exactly those retirements and preserves UI Quality
Gate, Goal-Backward Verification, and every unrelated heading.

## Privacy and Security

- Exclude environment, key, token, credential, and PII-bearing files from packets.
- Redact sensitive command output.
- Supply an explicit path allowlist; never include credentials in task text or persisted findings.
- Read-only tools are capability policy, not secret isolation.
- Do not dynamically install or fetch quality scanners.
- Persist only distilled findings and disposition rationale.

## Failure Behavior

- L0-1 child failure: warn and continue using normal safety/verification rules.
- L2-3 child failure: retry once; then stop for operator disposition.
- `/verify` child failure: advisory warning; does not independently prevent `VERIFIED`.
- Validated Critical/High defect: blocks at every level.
- L2-3 `source-check-required`: obtain authoritative evidence and rerun review.
- False positive: Main records an evidence-backed rejection.
- Candidate mutation: invalidates the review; requires a new L2-3 packet/review.
- Two integration rounds without convergence: stop and surface unresolved findings.
- Oversized packet: split by disjoint candidate files; never truncate silently.

## Risks

- **Authority conflict (highest):** unless ADR-011 explicitly supersedes part of ADR-008, both
  "reviews optional" and "reviews mandatory" stay authoritative. Mitigated by the explicit partial
  supersession and forward reference.
- **Stale/incomplete evidence (high):** unless Main supplies the in-memory packet, the reviewer
  audits current files, not the final diff/evidence. Mitigated by the packet contract.
- **`/plan` skipped (high):** a complex feature going `/create`→`/ship` has no level. Mitigated by
  `/create` persisting both numeric levels.
- **Accepted findings stale validation/review (high):** mitigated by bounded convergence loops.
- **Hallucinated language advice (medium):** mitigated by `source-check-required` fail-closed.
- **Review latency (medium):** L0-1 stays non-blocking; no fixed perspective matrix.
