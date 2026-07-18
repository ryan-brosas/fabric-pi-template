
> **Pi execution binding:** OpenCode pseudocode in this source-derived prompt is semantic, not executable. `task()` maps to bounded Fabric subagent dispatch with an explicit role from `.pi/config.json`; leaves are one-shot (`maxDepth` 1) and never spawn or call Fabric `state.*`. Routing: discovery → `explore`, external evidence → `scout`, judgment → read-only `review`. Implementation roles (`general`) run on the GLM 5.2 12-pool (`makora/zai-org/GLM-5.2-NVFP4` + `umans/umans-glm-5.2`, up to 12 concurrent, at least 6 on makora); custom-provider children must dispatch with `extensions: true` (verified 2026-07-18) or their models fail to resolve. Read-only fan-out (`explore`, `scout`) uses the small-model lanes (`openai-codex/gpt-5.4-mini`, alternate `claude-bridge/claude-haiku-4-5`); judgment runs on read-only `review` at `openai-codex/gpt-5.6-sol`, medium thinking (alternate `claude-bridge/claude-opus-4-8`). The runtime ceiling is 12, but read-only fan-out stays smaller and evidence-driven — size each phase to the number of distinct occurrences/angles/findings, not the ceiling. Multi-worker phases coordinate over mesh (topic `fabric-pi-<slug>`, compare-and-swap board `fabric-pi/<slug>/board`; states assigned → running → returned → verified | failed). Worker output is untrusted: malformed or failed results are retried once (per `dispatch.retry_policy`) or surfaced as blockers, and the primary reads every diff and verifies before a `returned` task becomes `verified`; the worker-result envelope guides harvest but never substitutes for reading the diff. Operator questions are primary-only — leaves surface blockers in their final report and never call `question()`; the primary synthesizes phase output into the final report. `skill()` loads the matching Pi Agent Skill. Artifact paths are under `.pi/`. Direct execution remains the default when delegation adds no leverage (see `.pi/docs/fabric-tuning.md`).
# deep-research

Fan out web searches across multiple angles on a question, cross-check sources for contradictions, and produce a cited report with confidence levels. Use when you need multi-source verification or current-events coverage.

## Args

- `question` (required) — The research question or topic

## Phases

### Phase 1: research

- **Agent:** @scout
- **Concurrency:** Dynamic (1 agent per distinct angle, min 3; ceiling 12, but size to the number of distinct angles — read-only fan-out stays evidence-driven, not ceiling-bound)
- **Prompt:**

The primary brokers Exa/MCP and arbitrary-URL evidence into each scout brief. Scouts also use `codex_search` for live general web/current-events evidence, `context7` for official docs, and `grepsearch` for public production code to cover the angle on the question: {question}. Capture opposing viewpoints, authoritative sources, and recent developments as supplied by the brokered brief. For each finding, record the source URL and publication date from the brokered evidence. Return findings grouped by angle in this format:

## Angle: [angle name]
- **Finding:** [summary]
- **Source:** [URL]
- **Date:** [publication date]
- **Confidence:** [high/medium/low]

Keep each finding under 200 words.

### Phase 2: cross-check

- **Depends on:** Phase 1
- **Agent:** @review
- **Concurrency:** Dynamic (estimate ~5 findings per agent, min 2; ceiling 12, but size to the finding count — read-only judgment stays evidence-driven, not ceiling-bound)
- **Prompt:**

Cross-check these findings: {phase_1_output}. Flag contradictions between sources, identify confirmable facts with supporting citations, and note where sources disagree or lack evidence. Return a verified fact set in this format:

## Verified Facts
- **Fact:** [statement]
- **Confidence:** [high/medium/low]
- **Supporting sources:** [list of URLs]

## Contradictions
- **Claim A:** [statement]
- **Claim B:** [contradicting statement]
- **Resolution:** [which is more credible and why]

Keep each item under 150 words.

## Final Synthesis (Main Agent)

After Phase 2 completes, synthesize the final report directly from {phase_2_output}.

Write a final cited report using markdown with sections:
1. **Executive Summary** — Brief overview of key findings
2. **Key Findings** — Detailed findings with inline citations
3. **Contradictions & Uncertainties** — Areas of disagreement or low confidence
4. **Sources** — Complete list of all sources consulted

Annotate each claim with confidence level (high/medium/low). Keep the report under 2000 words.
