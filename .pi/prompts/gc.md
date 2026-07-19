---
description: Run garbage collection — Fallow analysis, quality grading, and propose cleanup
agent: build
---

> **Pi execution binding:** The pseudocode in this prompt is semantic, not executable. `task()` maps to bounded Fabric subagent dispatch with an explicit role from `.pi/config.json`: implementation runs **`general`-only** on the GLM 12 pool — up to 12 concurrent GLM 5.2 workers split across `makora/zai-org/GLM-5.2-NVFP4` (first six on makora) and `umans/umans-glm-5.2` (balance on umans), at medium thinking; custom-provider children spawn with `extensions:true`. The `build` route (`claude-bridge/claude-opus-4-8` at high thinking) is the primary supervisor and sole integrator — it orchestrates, gates, and integrates but is never dispatched as a worker. Read-only fan-out (`explore`, `scout`) uses the small-model lanes (`openai-codex/gpt-5.4-mini`, alternate `claude-bridge/claude-haiku-4-5`); `review`, `plan`, and `debug` run on `openai-codex/gpt-5.6-sol` at medium thinking as **read-only reasoning** (reasoning roles never implement and cannot edit). The primary resolves `required_skills` against `.pi/skills/manifest.json` before spawn and injects the role contract from `.pi/agents/` into every dispatch. Workers are leaves at `maxDepth` 1: they never spawn agents and never call Fabric `state.*`; each owns **exclusive paths** (no two workers edit the same file) and gets one bounded retry on a failed check before reporting a blocker. Multi-worker phases coordinate over mesh using the canonical board states `assigned → running → returned → verified | failed` (durable topic `fabric-pi-<slug>`, CAS board `fabric-pi/<slug>/board`). **Worker output is untrusted** — worker summaries are reports, not merged code; the primary reads every diff, verifies, and is the sole integrator. Workers never create branches, commits, PRs, or other externally visible actions without operator confirmation — they suggest them in reports. Every worker brief carries a `required_skills` field (`[]` is valid and means no skill loaded; unknown skills are rejected before spawn). `question()` maps to asking the operator; `skill()` loads the matching Pi Agent Skill. Artifact paths are under `.pi/`. Direct execution remains the default when delegation adds no leverage (see `.pi/docs/fabric-tuning.md`).

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

Update `.pi/QUALITY.md` with grades per domain:

| Domain | Source | Grade |
|---|---|---|
| Extensions | `.pi/extensions/*.ts` | A–D |
| Prompts | `.pi/prompts/*.md` | A–D |
| Skills | `.pi/skills/` | A–D |
| Docs | `.pi/artifacts/MEMORY.md` | A–D |

## Phase 4: Propose Cleanup (if findings warrant)

GC proposes cleanup only; the operator owns every commit/PR. Workers never create branches, commits, or PRs — they suggest them in reports. For each P0/P1 finding from Fallow, spawn a `@general` worker (up to 12 concurrent — GLM 12 pool ceiling; batch remaining findings into later waves). Each worker owns exclusive paths, gets one bounded retry on a failed check, and reports changed paths plus evidence.

```typescript
// fabric_exec — general route (GLM 12 pool), up to 12 concurrent; first six on makora, balance on umans
const ROOT = (await pi.bash({ cmd: 'pwd', timeoutMs: 30000 })).output.trim();
const cfg = JSON.parse(String(await pi.read(ROOT + '/.pi/config.json')));
const route = cfg.role_routes.general;                              // resolve role from config
const contract = String(await pi.read(ROOT + '/' + route.contract)); // inject role contract (.pi/agents/general.md)
const h = await tools.call({
  ref: 'agents.spawn',
  args: {
    name: 'gc-fix-<finding-type>',
    task: contract + '\n\n---\n\n' +
      'Fix this Fallow finding: [detail]. Owned paths: [files]. Run verification after; ' +
      'report what changed and how it was proved. Suggest the commit/PR for the operator; ' +
      'do not commit, push, or open a PR yourself.' +
      '\n\nrequired_skills: [] (load no skill)' +
      '\n\nEnd your report with a JSON object matching .pi/schemas/worker-result.json ' +
      '(status, changed_paths, checks_run, stop_reason).',
    model: route.model,            // makora/zai-org/GLM-5.2-NVFP4 (alternate umans/umans-glm-5.2)
    thinking: route.thinking,      // medium
    tools: route.tools,            // read, grep, find, ls, edit, write, bash
    extensions: true,             // custom provider (makora/umans) needs this
  }
});
const done = await tools.call({ ref: 'agents.wait', args: { id: h.id } });
// untrusted until the primary reads the diff and verifies; operator owns the commit/PR
```

Wait for all fix tasks to complete. Verify each (read the diff, run the finding's check). Workers propose; the operator opens any PR.

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
