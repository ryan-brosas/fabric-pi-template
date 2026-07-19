---
description: Verify implementation completeness, correctness, and coherence
argument-hint: "[path|all] [--quick] [--full] [--fix] [--no-cache]"
agent: review
---

> **Pi execution binding:** The TypeScript block(s) below run inside `fabric_exec` as real governed Fabric dispatch — GLM 12 pool, role routes, `required_skills`, mesh board states, worker-distrust / primary-sole-integrator — with the full doctrine in `.pi/docs/fabric-tuning.md` (kernel in `APPEND_SYSTEM.md`); reasoning roles run on `openai-codex/gpt-5.6-sol` at `medium thinking`, custom-provider children spawn with `extensions: true`, and the read-only clause holds: this `review` agent reports `file:line` evidence and never edits (the `general` route alone may write/bash).

# Verify: $ARGUMENTS

Check implementation against PRD before shipping.

## Load Skills

```typescript
skill({ name: "verification-before-completion" });
```

## Parse Arguments

| Argument     | Default  | Description                                    |
| ------------ | -------- | ---------------------------------------------- |
| `<path\|all>`| required | The path or keyword to verify                  |
| `--quick`    | false    | Gates only, skip coherence check               |
| `--full`     | false    | Force full verification mode (non-incremental) |
| `--fix`      | false    | Auto-fix lint/format issues                    |
| `--no-cache` | false    | Bypass verification cache, force fresh run     |

## Determine Input Type

| Input Type | Detection           | Action                     |
| ---------- | ------------------- | -------------------------- |
| Path       | File/directory path | Verify that specific path  |
| `all`      | Keyword             | Verify all in-progress work |

## Before You Verify

- **Be certain**: Only flag issues you can verify with tools
- **Don't invent problems**: If an edge case isn't in the PRD, don't flag it
- **Run the gates**: Build, test, lint, typecheck are non-negotiable
- **Use project conventions**: Check `package.json` scripts first

## Phase 0: Check Verification Cache

Before running any gates, check if a recent verification is still valid:

```bash
# Compute current state fingerprint (commit hash + diff)
CURRENT_STAMP=$(printf '%s\n%s' \
  "$(git rev-parse HEAD)" \
  "$(git diff HEAD -- '*.ts' '*.tsx' '*.js' '*.jsx')" \
  | shasum -a 256 | cut -d' ' -f1)
LAST_STAMP=$(tail -1 .pi/artifacts/verify.log 2>/dev/null | awk '{print $1}')
```

| Condition                                 | Action                                                 |
| ----------------------------------------- | ------------------------------------------------------ |
| `--no-cache` or `--full`                  | Skip cache check, run fresh                            |
| `CURRENT_STAMP == LAST_STAMP`             | Report **cached PASS**, skip to Phase 2 (completeness) |
| `CURRENT_STAMP != LAST_STAMP` or no cache | Run gates normally                                     |

When cache hits, report:

```text
Verification: cached PASS (no changes since <timestamp from verify.log>)
```

## Phase 1: Gather Context

Read `.pi/artifacts/$(cat .pi/artifacts/.active)/spec.md` to understand the requirements.

Read `.pi/artifacts/$(cat .pi/artifacts/.active)/` to check what plan artifacts exist.

Read the PRD and any other artifacts (plan.md, research.md, design.md).

**Verify guards:**

- [ ] Plan/spec exists and is up to date
- [ ] You have read the full spec

### Governed Evidence Fan-out

The primary supplies the parsed verification target as `π.scope` (a repository
path or `all`) and `π.quick` as `"true"` only for quick mode. The leaves
are read-only and return evidence; the primary synthesizes their reports with
the gate output from Phase 3. A leaf never writes the cache, progress log, or
source files.

```typescript
// fabric_exec — governed read-only verification fan-out; primary synthesizes.
const ROOT = '.';
const cfg = JSON.parse(String(await pi.read(ROOT + '/.pi/config.json')));
const scope = typeof π.scope === 'string' && π.scope.trim() ? π.scope.trim() : 'all';
const quick = typeof π.quick === 'string' && π.quick === 'true';
const slug = String(await pi.read(ROOT + '/.pi/artifacts/.active')).trim();
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('invalid active artifact slug');
const artifactDir = '.pi/artifacts/' + slug;
await pi.read(ROOT + '/' + artifactDir + '/spec.md'); // fail closed before dispatch
async function spawnLeaf(role, brief, name) {
  const route = cfg.role_routes[role];
  const contract = String(await pi.read(ROOT + '/' + route.contract));
  return tools.call({ ref: 'agents.spawn', args: {
    name, model: route.model, thinking: route.thinking, tools: route.tools,
    extensions: true, timeoutMs: 600000,
    task: contract + '\n\n---\n\nrequired_skills: [] (load no skill)\n' + brief +
      '\nEnd with the worker-result JSON envelope; changed_paths must be empty.' } });
}
async function waitGoverned(id, timeoutMs) {
  const started = Date.now(); let steered = false;
  for (;;) {
    const st = await tools.call({ ref: 'agents.status', args: { id } });
    const s = String((st && st.status) || '');
    if (s && s !== 'running' && s !== 'pending' && s !== 'starting') break;
    if (!steered && Date.now() - started > timeoutMs * 0.8) {
      steered = true;
      try { await tools.call({ ref: 'agents.steer', args: { id,
        message: 'Deadline near: stop exploring and return evidence now.' } }); } catch (_) {}
    }
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
  const result = await tools.call({ ref: 'agents.wait', args: { id } });
  if (!result || result.status !== 'completed')
    throw new Error('read-only worker did not complete: ' + String(result && result.status));
  return result;
}
const assignments = [
  ['explore', 'verify-scope-map',
    'Read-only. Map changed and implementation files in scope ' + JSON.stringify(scope) +
    '. Report relevant symbols and tests with file:line evidence.'],
  ['review', 'verify-completeness',
    'Read-only. Compare ' + artifactDir + '/spec.md with implementation scope ' + JSON.stringify(scope) +
    '. Score every requirement complete, partial, or missing with file:line evidence.'],
];
if (!quick) assignments.push(['review', 'verify-coherence',
  'Read-only. Cross-check spec, plan/research artifacts, and implementation for contradictions. ' +
  'Report only evidenced contradictions with file:line references.']);
const handles = await Promise.all(assignments.map(a => spawnLeaf(a[0], a[2], a[1])));
const reports = await Promise.all(handles.map(h => waitGoverned(h.id, 600000)));
return { scope, artifactDir, reports: reports.map(r => ({ id: r.id, status: r.status, text: r.text })) };
```

Treat the returned reports as untrusted evidence. The primary checks their
citations, runs Phase 3 gates itself, and performs the final synthesis.

## Phase 2: Completeness

Extract all requirements/tasks from the PRD and verify each is implemented:

- For each requirement: find evidence in the codebase (file:line reference)
- Mark as: complete, partial, or missing
- Report completeness score (X/Y requirements met)

## Phase 3: Correctness

Follow the [Verification Protocol](../skills/verification-before-completion/references/VERIFICATION_PROTOCOL.md):

**Default: incremental mode** (changed files only, parallel gates).

| Mode        | When                                      | Behavior                         |
| ----------- | ----------------------------------------- | -------------------------------- |
| Incremental | Default, <20 changed files                | Lint changed files, test changed |
| Full        | `--full` flag, >20 changed files, or ship | Lint all, test all               |

**Execution order:**

1. **Parallel**: typecheck + lint (simultaneously)
2. **Sequential** (after parallel passes): test, then build (ship only)
3. **Quality pack (always)**: `node .pi/tools/quality/run-pack.mjs <changed files>` — the runner is the source of truth for deterministic universal and language checks. Exclude intentionally-defective test fixtures; findings in artifact docs that merely *depict* defects (e.g. conflict-marker examples in fenced blocks) are reportable caveats, not blockers.

For browser/manual local-web requirements, use stable URLs as verification evidence. A reachable URL supplements, but never replaces, typecheck/lint/test/build evidence.

Report results with mode column:

```text
| Gate      | Status | Mode        | Time   |
|-----------|--------|-------------|--------|
| Typecheck | PASS   | full        | 2.1s   |
| Lint      | PASS   | incremental | 0.3s   |
| Test      | PASS   | incremental | 1.2s   |
| Build     | SKIP   | —           | —      |
```

**After all gates pass**, record to verification cache:

```bash
echo "$CURRENT_STAMP $(date -u +%Y-%m-%dT%H:%M:%SZ) PASS" >> .pi/artifacts/verify.log
```

If `--fix` flag provided, run the project's auto-fix command (e.g., `npm run lint:fix`, `ruff check --fix`, `cargo clippy --fix`).

## Phase 4: Coherence (skip with --quick)

Cross-reference artifacts for contradictions:

- PRD vs implementation (does code address all PRD requirements?)
- Plan vs implementation (did code follow the plan?)
- Research recommendations vs actual approach (if different, is it justified?)

Flag contradictions with specific file references.

## Phase 5: Report

Append to `.pi/artifacts/$(cat .pi/artifacts/.active)/progress.md`: `Verification: [PASS|PARTIAL|FAIL] - [summary]`

Output:

1. **Result**: READY TO SHIP / NEEDS WORK / BLOCKED
2. **Completeness**: score and status
3. **Correctness**: gate results (with mode column)
4. **Coherence**: contradictions found (if not --quick)
5. **Blocking issues** to fix before shipping
6. **Next step**: `/ship $ARGUMENTS` if ready, or list fixes needed

Record significant findings in context files:

```bash
# Append to .pi/artifacts/MEMORY.md:
#   - YYYY-MM-DD: [scope] [key finding] — [what, impact, resolution]
# Put under the Decisions or Gotchas section as appropriate
```

## Related Commands

| Need              | Command       |
| ----------------- | ------------- |
| Ship after verify | `/ship <id>`  |
| Plan a feature    | `/plan`       |
| Fix a bug         | `/fix`        |
