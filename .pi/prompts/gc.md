---
description: Run garbage collection — Fallow analysis, quality grading, and propose cleanup
agent: build
---

> **Pi execution binding:** The TypeScript blocks below run inside `fabric_exec` as real governed dispatch: implementation runs on the GLM 12 pool (up to 12 GLM 5.2 workers at medium thinking; custom-provider children spawn with `extensions: true`), and read-only reasoning roles run on `openai-codex/gpt-5.6-sol`. The full dispatch doctrine — GLM pool split, role routes, `required_skills`, board states, and worker-distrust / primary-sole-integrator — lives in `.pi/docs/fabric-tuning.md` (kernel defined in `APPEND_SYSTEM.md`).

# Garbage Collection

Run structural analysis, update quality grades, and propose cleanup (the operator owns every commit/PR).

## Load Skills

```typescript
skill({ name: "fallow" });
skill({ name: "verification-before-completion" });
```

## Phase 1: Run Fallow Scan

```bash
npx fallow --format json --quiet
```

Extract:
- Dead code (unused exports, files, dependencies)
- Code duplication (clone groups)
- Complexity hotspots (cyclomatic complexity)
- Architecture boundary violations

## Phase 2: Read Existing Quality Grades

Read `.pi/QUALITY.md` if it exists. Compare with current Fallow findings.

## Phase 3: Grade Each Domain

Run the structural check:

```bash
.pi/tools/structural-check.sh
```

Prepare evidence for grades per domain; Phase 4 performs the final synthesis and updates `.pi/QUALITY.md`:

| Domain | Source | Grade |
|---|---|---|
| Extensions | `.pi/extensions/*.ts` | A–D |
| Prompts | `.pi/prompts/*.md` | A–D |
| Skills | `.pi/skills/` | A–D |
| Docs | `.pi/artifacts/MEMORY.md` | A–D |

## Phase 4: Governed Analysis and Cleanup Proposal

The primary supplies the completed command outputs as named strings
`π.fallowReport` and `π.structuralReport`. Fan-out is read-only: no
implementation route, worktree, source edit, commit, or PR is created. The
primary synthesizes the returned evidence into grades and a cleanup proposal,
then updates `.pi/QUALITY.md` itself if warranted.

```typescript
// fabric_exec — governed read-only GC fan-out; primary synthesizes.
const ROOT = '.';
const cfg = JSON.parse(String(await pi.read(ROOT + '/.pi/config.json')));
const fallowReport = typeof π.fallowReport === 'string' ? π.fallowReport.trim() : '';
const structuralReport = typeof π.structuralReport === 'string' ? π.structuralReport.trim() : '';
if (!fallowReport) throw new Error('π.fallowReport is required; run Phase 1 first');
if (!structuralReport) throw new Error('π.structuralReport is required; run Phase 3 first');
const commandEvidence = '\n\nFallow output:\n' + fallowReport.slice(0, 16000) +
  '\n\nStructural-check output:\n' + structuralReport.slice(0, 16000);
async function spawnLeaf(role, brief, name) {
  const route = cfg.role_routes[role];
  const contract = String(await pi.read(ROOT + '/' + route.contract));
  return tools.call({ ref: 'agents.spawn', args: {
    name, model: route.model, thinking: route.thinking, tools: route.tools,
    extensions: true, timeoutMs: 600000,
    task: contract + '\n\n---\n\nrequired_skills: [] (load no skill)\n' + brief +
      commandEvidence +
      '\nRead-only: report evidence and proposed remediation; changed_paths must be empty.' } });
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
        message: 'Deadline near: return your grade and prioritized evidence now.' } }); } catch (_) {}
    }
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
  const result = await tools.call({ ref: 'agents.wait', args: { id } });
  if (!result || result.status !== 'completed')
    throw new Error('read-only worker did not complete: ' + String(result && result.status));
  return result;
}
const assignments = [
  { role: 'review', name: 'gc-extensions', brief:
    'Grade Extensions (A-D) under .pi/extensions. Validate dead code, duplication, complexity, and boundaries. Cite file:line; propose fixes only.' },
  { role: 'review', name: 'gc-prompts', brief:
    'Grade Prompts (A-D) under .pi/prompts. Validate consistency, obsolete contracts, and duplication. Cite file:line; propose fixes only.' },
  { role: 'review', name: 'gc-skills', brief:
    'Grade Skills (A-D) under .pi/skills. Validate dead or duplicated guidance and broken references. Cite file:line; propose fixes only.' },
  { role: 'explore', name: 'gc-docs', brief:
    'Inventory quality evidence for Docs at .pi/artifacts/MEMORY.md and related artifact guidance. Cite exact paths/lines and missing files; do not edit.' },
];
const handles = await Promise.all(assignments.map(a => spawnLeaf(a.role, a.brief, a.name)));
const reports = await Promise.all(handles.map(h => waitGoverned(h.id, 600000)));
return { reports: reports.map(r => ({ id: r.id, status: r.status, text: r.text })) };
```

The primary verifies cited findings against the files, resolves conflicting
grades, writes the single quality report, and lists remediation as operator-owned
proposals. Do not dispatch fix workers from `/gc`; use `/fix` or `/ship`
after the operator selects a proposal.

## Phase 5: Report

Output:

1. **Quality Grades:** Per-domain status
2. **Issues Found:** Count by severity
3. **Cleanup proposed:** [N] fixes suggested / not needed (operator owns the commit/PR)
4. **Recommendations:** Suggested improvements for next cycle

## Related Commands

| Need | Command |
|---|---|
| Full verification | `/verify all --full` |
| Architecture audit | `/audit` |
