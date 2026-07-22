---
description: Research a topic before implementation
argument-hint: "<slug> <topic> [--quick|--thorough]"
---

# Research: $ARGUMENTS

Gather information before implementation. Find answers, document findings, stop when done.

> Research can happen at any phase when you need external information or codebase understanding. Research is sideways — it feeds `/create` or `/plan`, not the linear lifecycle path. Research never declares terminal status.

## Parse Arguments

| Argument         | Default  | Description                         |
| ---------------- | -------- | ----------------------------------- |
| `<slug>`         | required | The active feature namespace        |
| Topic            | required | What to research (after the slug)   |
| `--quick`        | false    | ~10 tool calls, single question     |
| `--thorough`     | false    | ~100+ calls, comprehensive analysis |

Default depth: ~30 tool calls for moderate exploration.

Validate `<slug>` before any filesystem or project-memory access. Reject empty, absolute (start with `/`), slash-containing, `..`-segment, uppercase, leading/trailing-hyphen, or double-hyphen values.

Accepted pattern:

```
^(?=.{1,64}$)[a-z0-9]+(?:-[a-z0-9]+)*$
```

If the slug is invalid, stop and report the exact failure. Do not access `.pi/artifacts/` or `.opencode/artifacts/MEMORY.md` until the slug passes validation.

**Namespace guard.** `/research` may run before `/create` (research is sideways). Classify the namespace:
- **Established** (both `PLAN.md` and `TODO.md` exist in `.pi/artifacts/<slug>/`): research may write `.pi/artifacts/<slug>/PROGRESS.md`.
- **Missing or partial** (neither, or only one, exists): research runs read-only and returns findings in the response only. Do not write `PROGRESS.md`, do not write `.opencode/artifacts/MEMORY.md`, and do not `mkdir`. `/research` never creates a namespace — `/create` is the sole namespace creator.

## Complexity Detection

Before starting, analyze the research topic complexity:

**Simple research** (execute directly):
- Single factual question
- One specific API or library
- Narrow scope with clear boundaries
- Example: "How does React useEffect work?"

**Complex research** (multi-angle analysis):
- Multi-angle topic requiring cross-checking
- Broad scope with multiple perspectives
- Requires verification from multiple sources
- Example: "What are the best practices for authentication in 2026?"

### Decision Logic

1. **Parse the topic** from the arguments (after `<slug>`)
2. **Assess complexity:**
   - Contains "best practices", "compare", "approaches", "strategies" → Complex
   - Contains "how does", "what is", "explain" → Simple
   - Topic spans multiple domains or technologies → Complex
   - Topic is narrow and specific → Simple
3. **Route accordingly:**
   - Simple → Execute directly (see "Direct Execution" below)
   - Complex → Multi-angle analysis (see "Multi-Angle Execution" below)

## Multi-Angle Execution (Complex Research)

If complexity is detected as complex, perform multi-angle analysis directly:

1. **Delegate to multiple read-only `scout` children** (one per angle) to gather findings from independent perspectives.
2. **Delegate to read-only `review` children** to cross-check findings for contradictions and confidence.
3. **Synthesize the report** from all cross-checked findings.
4. **Write the final report** to `.pi/artifacts/<slug>/PROGRESS.md` — only if the namespace is established per the Namespace guard above; otherwise return findings in the response only.

**Announce:** "This is complex research requiring multi-angle analysis. Delegating parallel read-only scouts with cross-check."

## Direct Execution (Simple Research)

If complexity is simple, execute directly:

### Before You Research

- **Be certain**: Only research what you need for implementation
- **Don't over-research**: Stop when you have enough to proceed
- **Use source priority**: Codebase → Docs → Source → GitHub → Web
- **Verify confidence**: Medium+ confidence required before stopping
- **Document findings**: Write to `.pi/artifacts/<slug>/PROGRESS.md` if the namespace is established; otherwise report directly in the response (missing/partial namespace is response-only)

### Available Tools

| Tool         | Use When                        |
| ------------ | ------------------------------- |
| `explore`    | Codebase patterns, LSP analysis |
| `scout`      | External docs, best practices   |
| `context7`   | Official API references         |
| `opensrc`    | Package source code inspection  |
| `grepsearch` | GitHub code search / real-world examples |

### Phase 1: Load Context

Read `.pi/artifacts/<slug>/PLAN.md` if it exists and extract questions that need answering.

#### Context Search (Required)

Search `.opencode/artifacts/MEMORY.md` for existing findings. Use them to: skip already-answered questions, narrow scope to gaps only, avoid contradicting prior decisions without justification.

```bash
rg -n "topic" .opencode/artifacts/MEMORY.md
```

### Phase 2: Research

#### Source Priority

1. **Codebase patterns** — delegate to `explore` for LSP analysis
2. **Official docs** — `context7` for API references
3. **Source code** — `npx opensrc <package>` when docs are insufficient
4. **GitHub examples** — `grepsearch` for real-world patterns
5. **Web search** — only if tiers 1-4 don't answer

#### Delegation

| What              | Helper                        | When                                   |
| ----------------- | ----------------------------- | -------------------------------------- |
| Codebase analysis | `explore`                     | Internal patterns, file structure, LSP |
| External docs     | `scout`                       | Library APIs, best practices           |
| Multiple domains  | Parallel `explore` + `scout`  | 3+ independent questions               |

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

Write findings to `.pi/artifacts/<slug>/PROGRESS.md` — only if the namespace is established per the Namespace guard above; otherwise return findings in the response only (do not write `PROGRESS.md` or create any file):

- Questions asked → answered/partial/unanswered with confidence
- Key findings with sources (file paths, docs)
- Recommendation based on findings
- Open items needing resolution

## Output

Report:

1. **Execution mode:** Direct or Multi-Angle
2. Depth level and tool call count (if direct)
3. Questions with answer status and confidence
4. Key insights (bullet points)
5. Open items remaining
6. Next step suggestion

## Related Commands

| Need           | Command      |
| -------------- | ------------ |
| Create + start | `/create`    |
| Plan details   | `/plan`      |
| Pick up work   | `/ship`      |
| Audit codebase | `/audit`     |
