---
description: Audit codebase for a specific pattern
argument-hint: "<pattern>"
agent: build
---

> **Pi execution binding:** OpenCode pseudocode in this source-derived prompt is semantic, not executable. `task()` maps to bounded Fabric subagent dispatch with an explicit role from `.pi/config.json`: implementation runs **`general`-only** on the GLM 12 pool — up to 12 concurrent GLM 5.2 workers split across `makora/zai-org/GLM-5.2-NVFP4` (first six on makora) and `umans/umans-glm-5.2` (balance on umans), at medium thinking; custom-provider children spawn with `extensions:true`. The `build` route (`claude-bridge/claude-opus-4-8` at high thinking) is the primary supervisor and sole integrator — it orchestrates, gates, and integrates but is never dispatched as a worker. Read-only fan-out (`explore`, `scout`) uses the small-model lanes (`openai-codex/gpt-5.4-mini`, alternate `claude-bridge/claude-haiku-4-5`); `review`, `plan`, and `debug` run on `openai-codex/gpt-5.6-sol` at medium thinking as **read-only reasoning** (reasoning roles never implement and cannot edit). The primary resolves `required_skills` against `.pi/skills/manifest.json` before spawn and injects the role contract from `.pi/agents/` into every dispatch. Workers are leaves at `maxDepth` 1: they never spawn agents and never call Fabric `state.*`; each owns **exclusive paths** (no two workers edit the same file) and gets one bounded retry on a failed check before reporting a blocker. Multi-worker phases coordinate over mesh using the canonical board states `assigned → running → returned → verified | failed` (durable topic `fabric-pi-<slug>`, CAS board `fabric-pi/<slug>/board`). **Worker output is untrusted** — worker summaries are reports, not merged code; the primary reads every diff, verifies, and is the sole integrator. Workers never create branches, commits, PRs, or other externally visible actions without operator confirmation — they suggest them in reports. Every worker brief carries a `required_skills` field (`[]` is valid and means no skill loaded; unknown skills are rejected before spawn). `question()` maps to asking the operator; `skill()` loads the matching Pi Agent Skill. Artifact paths are under `.pi/`. Direct execution remains the default when delegation adds no leverage (see `.pi/docs/fabric-tuning.md`).

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

1. **Read the workflow:** `.pi/workflows/audit-pattern.md`
2. **Execute all phases:**
   - Phase 1: Spawn 1 @explore agent to discover all occurrences
   - Phase 2: Spawn multiple @review agents (dynamic count based on occurrences)
   - Phase 3: Spawn 1 @general agent to synthesize findings
3. **Replace placeholders:**
   - `{pattern}` → the pattern from $ARGUMENTS
   - `{phase_N_output}` → actual output from completed phases
4. **Aggregate results** between phases
5. **Write final report** to `.pi/artifacts/$(cat .pi/artifacts/.active)/audit.md`

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
