---
description: Audit codebase for a specific pattern
argument-hint: "<pattern>"
agent: build
---

> **Pi execution binding:** The TypeScript block runs inside `fabric_exec` as real governed dispatch (`agents.spawn` + status poll + deadline steer), not described pseudocode; implementation dispatches the GLM 12 pool (`general`-only, custom-provider children spawn with `extensions: true`), read-only fan-out (`explore`/`scout`) uses the small-model lanes, and `review`/`plan`/`debug` run on `openai-codex/gpt-5.6-sol` at medium thinking as read-only reasoning. The primary is the sole integrator and worker output is untrusted — see `.pi/docs/fabric-tuning.md` (kernel in `APPEND_SYSTEM.md`) for the full dispatch doctrine (GLM pool, role routes, required_skills, board states, worker-distrust / primary-sole-integrator).

# Audit: $ARGUMENTS

Find all occurrences of a code pattern in the codebase, review each for issues, and produce prioritized remediation recommendations.

> Use for cross-cutting concerns like auth checks, error handling, API patterns, or security vulnerabilities.

## Parse Arguments

| Argument | Default  | Description                          |
| -------- | -------- | ------------------------------------ |
| Pattern  | required | Code pattern to search for           |

**Examples:**
- `/audit console.log` — Find all console.log statements
- `/audit app.use(` — Find all middleware registrations
- `/audit fetch(` — Find all fetch calls
- `/audit try {` — Find all try-catch blocks

## Execution

This command invokes the `audit-pattern` workflow for multi-agent parallel execution.

### Workflow Execution

Read `.pi/workflows/audit-pattern.md` for phase semantics, then execute the
fan-out as a real Fabric program. Size Phase 2 to the discovered occurrence
clusters — never the 12-worker ceiling. The primary supplies the parsed argument
as the named string `π.pattern`; raw `$ARGUMENTS` is never pasted into code. Final
synthesis is performed directly by the main agent from the returned reports; no
@general worker is spawned.

```typescript
// fabric_exec — executable audit fan-out (read-only leaves; primary synthesizes)
const ROOT = (await pi.bash({ cmd: 'pwd', timeoutMs: 30000 })).output.trim();
const cfg = JSON.parse(String(await pi.read(ROOT + '/.pi/config.json')));
const pattern = typeof π.pattern === 'string' ? π.pattern.trim() : '';
if (!pattern) throw new Error('π.pattern is required');
async function spawnLeaf(role, brief, name) {
  const route = cfg.role_routes[role];
  const contract = String(await pi.read(ROOT + '/' + route.contract));
  return tools.call({ ref: 'agents.spawn', args: {
    name, model: route.model, thinking: route.thinking, tools: route.tools,
    extensions: true, timeoutMs: 600000,
    task: contract + '\n\n---\n\nrequired_skills: [] (load no skill)\n' + brief } });
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
        message: 'Deadline near: wrap up and return your findings now.' } }); } catch (_) {}
    }
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
  const result = await tools.call({ ref: 'agents.wait', args: { id } });
  if (!result || result.status !== 'completed')
    throw new Error('read-only worker did not complete: ' + String(result && result.status));
  return result;
}
// Phase 1 — discovery: one explore leaf lists every occurrence with file:line.
const d = await spawnLeaf('explore',
  'Find every occurrence of this code pattern: ' + JSON.stringify(pattern) +
  '. Read-only. Report a complete file:line list grouped by directory, with a one-line context per hit.',
  'audit-discover');
const discovery = await waitGoverned(d.id, 600000);
// Phase 2 — review: split the real discovery report into bounded evidence chunks.
const discoveryText = String(discovery.text || '').trim();
if (!discoveryText) throw new Error('audit discovery returned no evidence');
if (discoveryText.length > 120000)
  throw new Error('audit discovery evidence too large; narrow the pattern');
const boundedDiscovery = discoveryText;
const clusterCount = Math.ceil(boundedDiscovery.length / 20000);
const clusters = Array.from({ length: clusterCount }, (_, i) =>
  boundedDiscovery.slice(i * 20000, (i + 1) * 20000));
const reviewers = [];
for (const [i, cluster] of clusters.entries()) {
  const h = await spawnLeaf('review',
    'Review these discovered occurrences of ' + JSON.stringify(pattern) + ' for correctness, security, and consistency. ' +
    'Classify each as correct or an issue (critical/important/minor) with file:line and a concrete fix.\n' + cluster,
    'audit-review-' + (i + 1));
  reviewers.push(waitGoverned(h.id, 600000));
}
const reviews = await Promise.all(reviewers);
// Final synthesis: the primary verifies citations and writes the report itself.
return { pattern, discovery: { id: discovery.id, text: discoveryText },
  reviews: reviews.map(r => ({ id: r.id, status: r.status, text: r.text })) };
```

**Announce:** "Auditing codebase for pattern: [pattern]. Invoking audit-pattern workflow."

## Output

Report:

1. **Pattern:** [pattern searched]
2. **Occurrences found:** [count]
3. **Files affected:** [count]
4. **Issues by severity:**
   - Critical: [N]
   - Important: [N]
   - Minor: [N]
5. **Recommended fixes:** [list with file:line refs]
6. **Correct patterns:** [list of occurrences that are already correct]

## Related Commands

| Need              | Command       |
| ----------------- | ------------- |
| Research a topic  | `/research`   |
| Create feature    | `/create`     |
| Ship feature      | `/ship`       |
| Verify gates      | `/verify`     |
