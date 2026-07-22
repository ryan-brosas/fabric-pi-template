---
description: Research a topic before implementation
argument-hint: "<topic> [--quick|--thorough]"
agent: scout
---

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

1. **Read the workflow:** `.opencode/workflows/deep-research.md`
2. **Execute all phases:**
   - Phase 1: Spawn multiple @scout agents (dynamic count based on angles)
   - Phase 2: Spawn @review agents to cross-check findings
   - Phase 3: Spawn 1 @general agent to synthesize report
3. **Replace placeholders:**
   - `{question}` → the research topic from $ARGUMENTS
   - `{phase_N_output}` → actual output from completed phases
4. **Aggregate results** between phases
5. **Write final report** to `.opencode/artifacts/$(cat .opencode/artifacts/.active)/research.md`

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
- **Document findings**: Write to `.opencode/artifacts/$(cat .opencode/artifacts/.active)/research.md` or report directly

### Available Tools

| Tool         | Use When                        |
| ------------ | ------------------------------- |
| `explore`    | Codebase patterns, LSP analysis |
| `scout`      | External docs, best practices   |
| `context7`   | Official API references         |
| `opensrc`    | Package source code inspection  |
| `grepsearch` | GitHub code search / real-world examples |

### Phase 1: Load Context

Read `.opencode/artifacts/$(cat .opencode/artifacts/.active)/spec.md` if it exists and extract questions that need answering.

#### Context Search (Required)

Search `.opencode/artifacts/MEMORY.md` for existing findings. Use them to: skip already-answered questions, narrow scope to gaps only, avoid contradicting prior decisions without justification.

```bash
rg -n "topic" .opencode/artifacts/MEMORY.md
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

Write findings to `.opencode/artifacts/$(cat .opencode/artifacts/.active)/research.md` (if plan exists) or report directly (if topic):

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
