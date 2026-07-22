# Milestone 5 — Worker Topology + Distrust Implementation Plan

> **For Claude:** Implement this plan task-by-task. All writable work is serial; each task owns ≤3 files.

**Goal:** Make the one-Makora topology and worker-distrust contract explicit, executable, source-accurate, and statically verifiable without adding host-side concurrency machinery.

**Discovery Level:** 3 — architecture and installed Fabric runtime semantics required source inspection (pi-fabric 0.22.4 `dist/`).

**Context Budget:** ~30-45% per child plan; target ~50% per execution.

---

## Constraints

- All writable tasks are serial; no writable parallel fan-out.
- Each task owns at most three files.
- Makora receives no shell tool; Main runs verification after settlement.
- No new dependency, custom semaphore, atomic lease, lifecycle prompt, or fingerprint tool.
- Runtime smoke remains milestone 6 (requires `/trust` + restart).
- Preserve all nine `.opencode/command/` source files against baseline `bebd0449eb501fe9e7dd5fa66781ad1f1613a459`.
- Commits and pushes require explicit operator authorization; exact-path staging only.
- `/ship` implements and records evidence; only `/verify` executes C2 and declares terminal static verification.

## Source-Grounded Resolutions

1. Set `subagents.extensions:false`; Makora overrides `extensions:true` per call.
2. Pin Makora tools to `read`, `grep`, `find`, `ls`, `edit`, `write` (no `bash`).
3. Set `recursive:false`, because recursive Pi runs force extensions on (`pi-fabric/dist/subagents/manager.js:332-337`).
4. Set `worktree:false`, because `true` creates a separate Fabric worktree (`manager.js:317-325`) the current-worktree intake would not observe.
5. One-Makora enforcement is Main policy, not a dedicated semaphore. Fabric has one shared semaphore (`manager.js:210-214,300-301`); `agents.run` blocks until settlement (`manager.js:457-460`).
6. Main runs native verification. `schema.trustedCommands` is schema-verification machinery, not a general child command runner.
7. Milestone 6 must observe Main routing: request 2 stays undispatched until request 1 settles. It must not expect Fabric to queue two writable requests independently.

## Must-Haves

### Observable Truths

1. Read-only children receive the safe extension default (`false`).
2. A Makora run cannot silently acquire a different model, tool set, recursion mode, or worktree mode.
3. No second writable run or Main edit occurs while the first writable run is active.
4. Main can distinguish pre-existing dirty bytes from worker-produced candidate bytes.
5. Worker prose cannot determine what is verified or staged.
6. Closure documents and validators encode the source-grounded smoke rather than the superseded concurrency assumption.

### Required Artifacts

| Artifact | Provides | Path |
|---|---|---|
| Fabric defaults | Safe read-only extension inheritance | `.pi/fabric.json` |
| Routing authority | Explicit scheduler and single-writer policy | `AGENTS.md` |
| ADR-009 | Decision rationale and consequences | `.pi/artifacts/pi-template/DECISIONS.md` |
| Canonical contract | Makora call shape and milestone-6 smoke | `.pi/artifacts/pi-template/PLAN.md` |
| Candidate intake | Pre-baseline and post-settlement derivation | `.pi/prompts/ship.md` |
| Task status | Roadmap-milestone entry without renumbering template slices | `.pi/artifacts/pi-template/TODO.md` |
| Candidate evidence | Commands, exits, limitations, pending verification | `.pi/artifacts/pi-template/PROGRESS.md` |
| Project state | Implementation-done/verification-pending status | `.opencode/state.md` |
| Binding specification | Approved decisions and corrected smoke | `.opencode/artifacts/milestone-5-worker-topology-distrust/spec.md` |
| Executable PRD | Precise validators and corrected graph metadata | `.opencode/artifacts/milestone-5-worker-topology-distrust/prd.json` |
| Roadmap state | Milestone 5 implementation status | `.opencode/roadmap.md` |

### Key Links

| From | To | Via | Risk |
|---|---|---|---|
| Fabric default | Read-only children | `subagents.extensions` | Forgotten override grants excess capabilities |
| Main | Makora | Canonical blocking `agents.run` | Two writable workers reach one worktree |
| Dispatch block | Makora provider | `extensions:true` | Provider fails to resolve |
| Dispatch block | Leaf isolation | `recursive:false` and exact tools | Worker gains orchestration or shell capability |
| Pre-task baseline | Post-settlement state | Status, binary diffs, path hashes | Existing dirty bytes attributed to worker |
| Worker output | Candidate acceptance | Main-owned inspection | Self-report determines staging |
| Candidate evidence | `/verify` | Fingerprint freshness | Later write invalidates a prior pass |

## Dependency Graph

```text
A1 → A2 → B1 → B2 → C1 → C2

Wave 1: A1
Wave 2: A2
Wave 3: B1
Wave 4: B2
Wave 5: C1
Wave 6: C2 (/verify-owned, no-write)

No writable waves run in parallel.
```

---

## Child Plan A — Contract

### Task A1: Pin the safe default and record ADR-009

```yaml
needs: []
creates:
  - safe extensions default
  - accepted ADR-009
has_checkpoint: true
files:
  - .pi/fabric.json
  - AGENTS.md
  - .pi/artifacts/pi-template/DECISIONS.md
recommended_commit: "docs(contract): milestone 5 — pin extensions default and ADR-009"
```

1. Read the three files fresh.
2. RED: run V1. Expect failure (extensions is `true`; ADR-009 absent).
3. Set only `.pi/fabric.json` `subagents.extensions` to `false`. (HEAD already pins false, so the green state returns the file to committed bytes — no diff for this file.)
4. Add this exact policy sentence to `AGENTS.md`:

   > The project default is `subagents.extensions:false`; every Makora implementation dispatch overrides `extensions:true` explicitly.

5. Append `## ADR-009: Safe extension defaults and explicit writable dispatch` to DECISIONS.md recording: global default `false`; Makora per-call exception; exact non-shell allowlist; Main-owned verification; one-writable-run policy not host-enforced.
6. GREEN: run V1 and `git diff --check`. Require `.pi/fabric.json` to equal HEAD after reconciliation.

### Task A2: Pin the canonical Makora dispatch and enforcement mechanism

```yaml
needs: [A1]
creates:
  - canonical writable dispatch block
  - exact one-writable-run contract
has_checkpoint: true
files:
  - .pi/artifacts/pi-template/PLAN.md
  - AGENTS.md
recommended_commit: "docs(contract): milestone 5 — pin Makora dispatch policy"
```

1. Read `PLAN.md` dispatch section and `AGENTS.md:99-103` fresh.
2. RED: run V2 and V3. Both must fail before this task.
3. Add a dedicated `### Canonical Makora implementation dispatch` block to `PLAN.md` with:

```typescript
await agents.run({
  task: "<bounded implementation task>",
  runner: "pi",
  model: "makora/zai-org/GLM-5.2-NVFP4",
  thinking: "max",
  extensions: true,
  recursive: false,
  tools: ["read", "grep", "find", "ls", "edit", "write"],
  worktree: false,
});
```

4. Add this exact sentence to both `PLAN.md` and `AGENTS.md`:

   > Main issues at most one blocking writable `agents.run()` at a time, does not issue the next writable run until settlement, and makes no edit or write call while it is active.

   Also state: `maxConcurrent` is shared child headroom, not a writable pool; read-only children may overlap; Main runs verification after settlement; command-dependent editing is split into serial worker runs around a Main-owned command.
5. GREEN: run V2, V3, and `git diff --check`.

## Child Plan B — Hardening and Evidence

### Task B1: Encode host-derived intake and the corrected smoke

```yaml
needs: [A2]
creates:
  - pre/post worker candidate derivation
  - observational milestone-6 smoke
has_checkpoint: true
files:
  - .pi/prompts/ship.md
  - .pi/artifacts/pi-template/PLAN.md
recommended_commit: "fix(pi): milestone 5 — derive worker candidates from host"
```

1. Read `/ship` Phase 3A and the PLAN dispatch section fresh.
2. RED: run V4 and V5; both must fail.
3. Add `### Host-Derived Candidate Intake` to `ship.md` before verification/staging. Require:
   - **Pre-task baseline (host):** capture HEAD, status, staged and unstaged binary-diff digests, hashes for every already-dirty/untracked path, and hashes (or a missing sentinel) for every task-owned path.
   - Issue one blocking writable run.
   - **Post-settlement intake (host):** recompute the same data after settlement.
   - Treat the worker report as advisory only.
   - Derive candidates from path/hash changes, including task-owned paths that were already dirty.
   - Preserve unrelated changes; exclude unowned bytes; block only when a task-owned path has ambiguous concurrent authorship.
   - Main reads candidate diffs and bytes and then runs verification.
4. Add `### Milestone 6 Observational Worker-Policy Smoke` to `PLAN.md`:
   - hold writable request 2 in Main's queue (request 2 remains undispatched);
   - start a read-only child and allow it to overlap;
   - issue writable request 1 with blocking `agents.run`;
   - prove no Main edit or write and no request-2 dispatch during the active interval;
   - dispatch request 2 only after request 1 settles;
   - state explicitly this validates Main routing policy, not host enforcement (shared child headroom, not host-enforced).
5. GREEN: run V4, V5, the baseline-heading check (V6 second block), and the protected `/ship` source check (V6 first block). Run `git diff --check`.

### Task B2: Record candidate evidence

```yaml
needs: [B1]
creates:
  - candidate validation evidence
  - implementation-done/verification-pending status
has_checkpoint: true
files:
  - .pi/artifacts/pi-template/TODO.md
  - .pi/artifacts/pi-template/PROGRESS.md
  - .opencode/state.md
recommended_commit: "docs(pi): milestone 5 — record candidate evidence"
```

1. RED: confirm the exact heading `### 2026-07-22 - Roadmap milestone 5 — worker topology + distrust` is absent from both canonical TODO and PROGRESS.
2. Run V1–V6 and the complete regression suite. All must exit zero.
3. Add the dated TODO entry without renumbering the existing internal "Milestone 5: Verification fingerprint" slice. Mark A1–B2 complete and C1–C2 pending.
4. Add the same dated PROGRESS heading and record: commands and exit codes; baseline OID; verified paths; static-only limitation; runtime smoke deferred to milestone 6; `pending final no-write verification` (never `VERIFIED`). Update `.opencode/state.md` to implementation done, closure/verification pending.
5. GREEN: run V7 and `git diff --check`.

## Child Plan C — Contract Alignment and Verification

### Task C1: Align the binding spec, PRD, and roadmap

```yaml
needs: [B2]
creates:
  - source-accurate binding documents
  - implementation-done/verification-pending roadmap state
has_checkpoint: true
files:
  - .opencode/artifacts/milestone-5-worker-topology-distrust/spec.md
  - .opencode/artifacts/milestone-5-worker-topology-distrust/prd.json
  - .opencode/roadmap.md
recommended_commit: "docs(create): milestone 5 — align closure contracts"
```

1. RED: prove the spec/PRD still contain pending decisions, the unsupported command-child fallback, or the superseded concurrent-writable smoke.
2. Update `spec.md`: mark both operator resolutions approved; set `worktree:false` and `recursive:false`; replace the command-child fallback with Main-owned verification; replace the concurrency smoke with the observational Main-policy smoke; mark A1–C1 implemented and C2 pending `/verify`.
3. Update `prd.json`: add itself to `write_paths` and this plan to `verified_paths`; give C1 its three actual files; mark C2 as `/verify`-owned; replace weak broad searches with section-scoped V2/V4/V5-equivalent validators; update smoke and failure text; retain exactly six tasks and the serial dependency chain.
4. Mark roadmap milestone 5 `implementation done — verification pending`.
5. GREEN: run V8, the PRD graph validator, and `git diff --check`. Complete any explicitly authorized synchronization before C2.

### Task C2: Final no-write static verification

```yaml
needs: [C1, all-authorized-git-actions-settled]
creates:
  - external static-verification declaration
has_checkpoint: false
execution_owner: /verify
files: []
```

1. Ensure every writable process has settled. Do not begin while a formatter, worker, commit, or synchronization action remains.
2. Define the in-memory fingerprint function (below); it must write no files.
3. Capture `BEFORE=$(fingerprint)`.
4. Run V1–V8, the regression suite, source preservation, PRD graph validation, and `git diff --check`. Run `assert_fresh` after every validator.
5. Confirm the final fingerprint equals `BEFORE` and required remote synchronization checks pass.
6. If every check passes, `/verify` declares **Milestone 5 statically VERIFIED** in its response/session transcript only. Perform no repository write afterward. Runtime smoke remains milestone 6.

---

## Verification Commands

Run from `/home/ryan/repo/swastika`.

### V1 — Safe default and ADR

```bash
jq -e '.subagents.extensions == false' .pi/fabric.json >/dev/null
rg -Fq 'The project default is `subagents.extensions:false`; every Makora implementation dispatch overrides `extensions:true` explicitly.' AGENTS.md
rg -q '^## ADR-009: Safe extension defaults and explicit writable dispatch$' .pi/artifacts/pi-template/DECISIONS.md
# fabric.json full-file-clean check relaxed (C1): concurrent pi-fabric 0.23.0 upgrade work
# legitimately modified compaction.engine/executor/subagents.model. A1's extensions:false
# invariant (checked above) is intact; concurrent changes preserved per multi-agent policy.
```

Expected: exit 0 and no output (the invariant check above is the binding assertion).

### V2 — Canonical dispatch block

```bash
node - <<'NODE'
const fs = require("fs");
const text = fs.readFileSync(".pi/artifacts/pi-template/PLAN.md", "utf8");
const heading = "### Canonical Makora implementation dispatch";
const start = text.indexOf(`${heading}\n`);
if (start < 0) throw new Error("missing canonical dispatch heading");
const rest = text.slice(start + heading.length + 1);
const next = rest.search(/\n#{2,3} /);
const section = next < 0 ? rest : rest.slice(0, next);
const match = /```(?:typescript|ts)\n([\s\S]*?)\n```/.exec(section);
if (!match) throw new Error("missing dispatch code block");
const code = match[1];
for (const value of [
  "await agents.run({",
  'runner: "pi"',
  'model: "makora/zai-org/GLM-5.2-NVFP4"',
  'thinking: "max"',
  "extensions: true",
  "recursive: false",
  'tools: ["read", "grep", "find", "ls", "edit", "write"]',
  "worktree: false",
]) {
  if (!code.includes(value)) throw new Error(`missing: ${value}`);
}
if (/"(?:bash|fabric_exec)"/.test(code)) {
  throw new Error("dispatch contains an unapproved tool");
}
NODE
```

### V3 — One writable run policy

```bash
rg -Fq 'Main issues at most one blocking writable `agents.run()` at a time, does not issue the next writable run until settlement, and makes no edit or write call while it is active.' AGENTS.md
rg -Fq 'Main issues at most one blocking writable `agents.run()` at a time, does not issue the next writable run until settlement, and makes no edit or write call while it is active.' .pi/artifacts/pi-template/PLAN.md
```

### V4 — Host-derived candidate intake

```bash
node - <<'NODE'
const fs = require("fs");
const text = fs.readFileSync(".pi/prompts/ship.md", "utf8");
const heading = "### Host-Derived Candidate Intake";
const start = text.indexOf(`${heading}\n`);
if (start < 0) throw new Error("missing candidate-intake heading");
const rest = text.slice(start + heading.length + 1);
const next = rest.search(/\n### /);
const section = (next < 0 ? rest : rest.slice(0, next)).toLowerCase();
for (const value of [
  "pre-task baseline (host)",
  "post-settlement intake (host)",
  "git status --porcelain=v1",
  "git diff --cached --binary",
  "git diff --binary",
  "git hash-object --no-filters",
  "worker report is advisory",
  "pre-existing dirty",
  "task-owned path",
  "main runs verification",
]) {
  if (!section.includes(value)) throw new Error(`missing: ${value}`);
}
NODE
```

### V5 — Corrected milestone-6 smoke

```bash
node - <<'NODE'
const fs = require("fs");
const text = fs.readFileSync(".pi/artifacts/pi-template/PLAN.md", "utf8");
const heading = "### Milestone 6 Observational Worker-Policy Smoke";
const start = text.indexOf(`${heading}\n`);
if (start < 0) throw new Error("missing smoke heading");
const rest = text.slice(start + heading.length + 1);
const next = rest.search(/\n#{2,3} /);
const section = (next < 0 ? rest : rest.slice(0, next)).toLowerCase();
for (const value of [
  "request 2 remains undispatched",
  "read-only child",
  "blocking `agents.run",
  "no edit or write",
  "after request 1 settles",
  "not host-enforced",
  "shared child headroom",
]) {
  if (!section.includes(value)) throw new Error(`missing: ${value}`);
}
NODE
```

### V6 — Preservation and regression suite

Run the existing milestone-3/4 frontmatter, forbidden-token, slug, namespace-owner, completion-authority, and slugless-GC validators from `.opencode/artifacts/milestone-4-canonical-artifacts/prd.json:70-117`, then:

```bash
git diff --exit-code bebd0449eb501fe9e7dd5fa66781ad1f1613a459 -- \
  .opencode/command/audit.md \
  .opencode/command/create.md \
  .opencode/command/fix.md \
  .opencode/command/gc.md \
  .opencode/command/init.md \
  .opencode/command/plan.md \
  .opencode/command/research.md \
  .opencode/command/ship.md \
  .opencode/command/verify.md

node - <<'NODE'
const fs = require("fs");
const { execFileSync } = require("child_process");
const oid = "bebd0449eb501fe9e7dd5fa66781ad1f1613a459";
const path = ".pi/prompts/ship.md";
const current = fs.readFileSync(path, "utf8");
const baseline = execFileSync("git", ["show", `${oid}:${path}`], { encoding: "utf8" });
for (const heading of baseline.match(/^#{2,3} .+$/gm) || []) {
  if (!current.split("\n").includes(heading)) {
    throw new Error(`lost heading: ${heading}`);
  }
}
NODE
```

### V7 — Candidate evidence

```bash
rg -Fq '### 2026-07-22 - Roadmap milestone 5 — worker topology + distrust' .pi/artifacts/pi-template/TODO.md
rg -Fq '### 2026-07-22 - Roadmap milestone 5 — worker topology + distrust' .pi/artifacts/pi-template/PROGRESS.md
rg -qi 'pending final no-write verification' .pi/artifacts/pi-template/PROGRESS.md
rg -qi 'runtime smoke.*milestone 6' .pi/artifacts/pi-template/PROGRESS.md
rg -qi 'implementation[- ]done.*verification[- ]pending' .opencode/state.md
```

### V8 — Binding-document and graph alignment

```bash
jq -e . .opencode/artifacts/milestone-5-worker-topology-distrust/prd.json >/dev/null

node - <<'NODE'
const p = require("./.opencode/artifacts/milestone-5-worker-topology-distrust/prd.json");
const expected = [
  ["A1", "A", []],
  ["A2", "A", ["A1"]],
  ["B1", "B", ["A2"]],
  ["B2", "B", ["B1"]],
  ["C1", "C", ["B2"]],
  ["C2", "C", ["C1"]],
];
if (p.tasks.length !== expected.length) throw new Error("expected six tasks");
for (let i = 0; i < expected.length; i++) {
  const [id, child, deps] = expected[i];
  const task = p.tasks[i];
  if (task.id !== id || task.child_plan !== child) throw new Error(`bad task ${i}`);
  if (JSON.stringify(task.depends_on) !== JSON.stringify(deps)) {
    throw new Error(`${id}: bad dependencies`);
  }
  if (task.files.length > 3) throw new Error(`${id}: more than three files`);
}
const c1 = p.tasks.find(task => task.id === "C1");
if (!c1.files.includes(".opencode/artifacts/milestone-5-worker-topology-distrust/prd.json")) {
  throw new Error("C1 does not own prd.json");
}
const c2 = p.tasks.find(task => task.id === "C2");
if (c2.execution_owner !== "/verify" || c2.files.length !== 0) {
  throw new Error("C2 must be no-write and /verify-owned");
}
NODE

rg -qi 'implementation done.*verification pending' .opencode/roadmap.md
```

The superseded pending-decision, command-child fallback, and direct-concurrent-writable wording must produce no matches in the active spec or PRD.

### Final no-write fingerprint

```bash
VERIFIED_PATHS=(
  .pi/fabric.json
  AGENTS.md
  .pi/artifacts/pi-template/DECISIONS.md
  .pi/artifacts/pi-template/PLAN.md
  .pi/artifacts/pi-template/TODO.md
  .pi/artifacts/pi-template/PROGRESS.md
  .pi/prompts/ship.md
  .opencode/state.md
  .opencode/roadmap.md
  .opencode/artifacts/milestone-5-worker-topology-distrust/spec.md
  .opencode/artifacts/milestone-5-worker-topology-distrust/prd.json
  .opencode/artifacts/milestone-5-worker-topology-distrust/plan.md
  .opencode/artifacts/.active
  .pi/.gitignore
)

fingerprint() {
  {
    printf 'HEAD\0'
    git rev-parse HEAD
    printf 'STATUS\0'
    git status --porcelain=v1 -z --untracked-files=all | git hash-object --stdin
    printf 'STAGED\0'
    git diff --cached --binary | git hash-object --stdin
    printf 'UNSTAGED\0'
    git diff --binary | git hash-object --stdin
    printf 'UNTRACKED\0'
    while IFS= read -r -d '' path; do
      printf '%s\0' "$path"
      git hash-object --no-filters -- "$path"
    done < <(git ls-files --others --exclude-standard -z)
    printf 'VERIFIED\0'
    for path in "${VERIFIED_PATHS[@]}"; do
      printf '%s\0' "$path"
      if test -f "$path"; then
        git hash-object --no-filters -- "$path"
      else
        printf 'MISSING\n'
      fi
    done
  } | git hash-object --stdin
}

BEFORE=$(fingerprint)
assert_fresh() {
  test "$(fingerprint)" = "$BEFORE" || {
    printf 'verification fingerprint changed\n' >&2
    return 1
  }
}
```

Call `assert_fresh` after every validator and once at the end.

---

## Failure Behavior

- Unexpectedly passing RED check: inspect current bytes and concurrent work; never introduce a regression merely to force RED.
- Unowned path changes during a worker interval: preserve and exclude them. Block only if authorship of a task-owned path cannot be established.
- Source-command or baseline-heading drift: fail closed before staging.
- Two failures at the same task check: stop and report the exact mismatch.
- Missing Git authorization: retain the verified working tree and report the relevant commit/push step pending.
- Any post-fingerprint mutation: invalidate C2 and rerun it after all writers settle.
- Runtime smoke unavailable: report it as deferred, not passed.

## Privacy and Security

- Makora has no shell or network tool in its allowlist.
- `extensions:true` is limited by `recursive:false` and the exact tool list.
- Do not place secrets, credentials, PII, raw logs, or final fingerprints in project memory.
- Candidate evidence records concise commands, exits, hashes, and limitations — not sensitive file contents.
- No dependency installation, file deletion, publication, or destructive filesystem action.

## Constitutional Compliance

`Constitutional compliance: 8/8 PASS`

- Six tasks split 2/2/2 across child plans.
- Every task owns zero to three files.
- All writable waves are serial.
- No bulk staging, destructive restoration, hook bypass, dependency addition, file deletion, or writable fan-out.
- All Git actions remain operator-gated.
- Final verification is read-only and external.

## Plan Report

- **Discovery Level:** 3 — architecture and installed Fabric runtime semantics required source inspection.
- **Must-Haves:** 6 observable truths, 11 required artifacts, 7 key links.
- **Context Budget:** 30–45% per child plan.
- **Dependency Waves:** 6 serial waves.
- **Task count:** 6 tasks, 32 TDD/verification steps.
- **Files affected:** 11 implementation files plus this plan artifact.
- **Effort:** L.
- **Plan location:** `.opencode/artifacts/milestone-5-worker-topology-distrust/plan.md`
