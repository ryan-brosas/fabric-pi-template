---
description: Research a topic before implementation
argument-hint: "<topic> [--quick|--thorough]"
agent: scout
---

> **Pi execution binding:** The pseudocode in this prompt is semantic, not executable. `task()` maps to bounded Fabric subagent dispatch with an explicit role from `.pi/config.json`: implementation routes to the `general` role only, on the GLM 12 pool (`makora/zai-org/GLM-5.2-NVFP4` + `umans/umans-glm-5.2`, up to 12 concurrent GLM 5.2 workers, at least 6 on makora, at medium thinking); custom-provider children spawn with `extensions:true` and the primary injects the role contract from `.pi/agents/` before dispatch. The `build` route (`claude-bridge/claude-opus-4-8`, high thinking) is the primary supervisor and sole integrator — it orchestrates, gates, and integrates but is never dispatched as an implementation worker. This prompt's agent (`scout`) is **read-only research**: it gathers and reports evidence and never edits; the `general` route is the only tier granted edit/write/bash. Read-only fan-out (`explore`, `scout`) uses the small-model lanes (`openai-codex/gpt-5.4-mini`, alternate `claude-bridge/claude-haiku-4-5`); scouts carry `context7`, `grepsearch`, and pinned `codex_search`; the primary brokers MCP evidence and arbitrary URL fetching. Reasoning roles (`plan`, `review`, `debug`) run on `openai-codex/gpt-5.6-sol` at medium thinking, read-only. Workers are leaves at `maxDepth` 1: they never spawn agents and never call Fabric `state.*`. Multi-worker phases coordinate over mesh (topic `fabric-pi-<slug>`, CAS board `fabric-pi/<slug>/board`) with canonical board states `assigned|running|returned|verified|failed`; the primary publishes assignments, workers report status. **Worker output is untrusted evidence** — worker summaries are reports, not merged results; the primary reads every diff, verifies, and is the sole integrator. Briefs carry `required_skills` (resolved by the primary against `.pi/skills/manifest.json` before spawn; `[]` loads no skill). Workers never create branches, commits, PRs, or other externally visible actions without operator confirmation — they suggest them in reports. `question()` maps to asking the operator; `skill()` loads the matching Pi Agent Skill. Artifact paths are under `.pi/`. Direct execution remains the default when delegation adds no leverage (see `.pi/docs/fabric-tuning.md`).

# Research: $ARGUMENTS

Gather information before implementation. Find answers, document findings, stop when done.

> Research can happen at any phase when you need external information or codebase understanding.

## Complexity Detection

Before starting, analyze the research topic complexity:

**Simple research** (execute directly):
- Single factual question
- One specific API or library
- Narrow scope with clear boundaries
- Example: "How does React useEffect work?"

**Complex research** (invoke workflow):
- Multi-angle topic requiring cross-checking
- Broad scope with multiple perspectives
- Requires verification from multiple sources
- Example: "What are the best practices for authentication in 2026?"

### Decision Logic

1. **Parse the topic** from $ARGUMENTS
2. **Assess complexity:**
   - Contains "best practices", "compare", "approaches", "strategies" → Complex
   - Contains "how does", "what is", "explain" → Simple
   - Topic spans multiple domains or technologies → Complex
   - Topic is narrow and specific → Simple
3. **Route accordingly:**
   - Simple → Execute directly (see "Direct Execution" below)
   - Complex → Invoke `deep-research` workflow (see "Workflow Execution" below)

## Workflow Execution (Complex Research)

If complexity is detected as complex:

1. **Read the workflow:** `.pi/workflows/deep-research.md`
2. **Execute all phases:**
   - Phase 1: Spawn multiple @scout agents (dynamic count based on angles)
   - Phase 2: Spawn @review agents to cross-check findings
   - Phase 3: Spawn 1 @general agent to synthesize report
3. **Replace placeholders:**
   - `{question}` → the research topic from $ARGUMENTS
   - `{phase_N_output}` → actual output from completed phases
4. **Aggregate results** between phases
5. **Write final report** to `.pi/artifacts/$(cat .pi/artifacts/.active)/research.md`

**Announce:** "This is complex research requiring multi-angle analysis. Invoking deep-research workflow."

## Direct Execution (Simple Research)

If complexity is simple, execute directly:

### Parse Arguments

| Argument         | Default  | Description                         |
| ---------------- | -------- | ----------------------------------- |
| Topic            | required | What to research                    |
| `--quick`        | false    | ~10 tool calls, single question     |
| `--thorough`     | false    | ~100+ calls, comprehensive analysis |

Default depth: ~30 tool calls for moderate exploration.

### Before You Research

- **Be certain**: Only research what you need for implementation
- **Don't over-research**: Stop when you have enough to proceed
- **Use source priority**: Codebase → Docs → Source → GitHub → Web
- **Verify confidence**: Medium+ confidence required before stopping
- **Document findings**: Write to `.pi/artifacts/$(cat .pi/artifacts/.active)/research.md` or report directly

### Available Tools

| Tool         | Use When                        |
| ------------ | ------------------------------- |
| `explore`    | Codebase patterns, LSP analysis |
| `scout`      | External docs, best practices   |
| `context7`   | Official API references         |
| `opensrc`    | Package source code inspection  |
| `grepsearch` | GitHub code search / real-world examples |

### Phase 1: Load Context

Read `.pi/artifacts/$(cat .pi/artifacts/.active)/spec.md` if it exists and extract questions that need answering.

#### Context Search (Required)

Search `.pi/artifacts/MEMORY.md` for existing findings. Use them to: skip already-answered questions, narrow scope to gaps only, avoid contradicting prior decisions without justification.

```bash
rg -n "topic" .pi/artifacts/MEMORY.md
```

### Phase 2: Research

#### Source Priority

1. **Codebase patterns** — delegate to `explore` agent for LSP analysis
2. **Official docs** — `context7` for API references
3. **Source code** — `npx opensrc <package>` when docs are insufficient
4. **GitHub examples** — `grepsearch` for real-world patterns
5. **Web search** — only if tiers 1-4 don't answer

#### Delegation

| What              | Agent                        | When                                   |
| ----------------- | ---------------------------- | -------------------------------------- |
| Codebase analysis | `explore`                    | Internal patterns, file structure, LSP |
| External docs     | `scout` (this agent)         | Library APIs, best practices           |
| Multiple domains  | Parallel `explore` + `scout` | 3+ independent questions               |

#### Confidence Levels

- **High**: Multiple authoritative sources agree, verified in codebase
- **Medium**: Single good source, plausible but unverified
- **Low**: Conflicting info, speculation — discard without corroboration

### Phase 3: Stop When

- All questions answered with medium+ confidence
- Tool budget exhausted for depth level
- Last 5 tool calls yielded no new insights
- Blocked and need human input

### Phase 4: Document

Write findings to `.pi/artifacts/$(cat .pi/artifacts/.active)/research.md` (if plan exists) or report directly (if topic):

- Questions asked → answered/partial/unanswered with confidence
- Key findings with sources (file paths, docs)
- Recommendation based on findings
- Open items needing resolution

## Output

Report:

1. **Execution mode:** Direct or Workflow
2. Depth level and tool call count (if direct)
3. Questions with answer status and confidence
4. Key insights (bullet points)
5. Open items remaining
6. Next step suggestion

## Related Commands

| Need           | Command      |
| -------------- | ------------ |
| Create + start | `/create`    |
| Plan details   | `/plan <id>` |
| Pick up work   | `/ship <id>` |
| Audit codebase | `/audit`     |
