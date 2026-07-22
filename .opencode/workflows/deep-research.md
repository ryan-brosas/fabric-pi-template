# deep-research

Fan out web searches across multiple angles on a question, cross-check sources for contradictions, and produce a cited report with confidence levels. Use when you need multi-source verification or current-events coverage.

## Args

- `question` (required) — The research question or topic

## Phases

### Phase 1: research

- **Agent:** @scout
- **Concurrency:** Dynamic (1 agent per distinct angle, min 3, max 10)
- **Prompt:**

Search for different perspectives on the question: {question}. Cover opposing viewpoints, authoritative sources, and recent developments. For each finding, include the URL and publication date. Return findings grouped by angle in this format:

## Angle: [angle name]
- **Finding:** [summary]
- **Source:** [URL]
- **Date:** [publication date]
- **Confidence:** [high/medium/low]

Keep each finding under 200 words.

### Phase 2: cross-check

- **Depends on:** Phase 1
- **Agent:** @review
- **Concurrency:** Dynamic (estimate ~5 findings per agent, min 2, max 10)
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
