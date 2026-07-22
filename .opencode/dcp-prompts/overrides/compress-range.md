Collapse a range in the conversation into a detailed summary.

THE SUMMARY
Your summary must be EXHAUSTIVE. Use the following 7-section structure to ensure nothing is lost.
Capture file paths, function signatures, decisions made, constraints discovered, key findings, tool outcomes, and user intent... EVERYTHING that preserves the value of the compressed range.

STRUCTURED SUMMARY FORMAT
When summarizing the range, organize findings into these sections (omit empty sections):

1. **Session Intent** — What the user requested. Quote exact instructions when short.
2. **Key Technical Details** — File paths with line ranges (`path/file.ts:42-67`). Function signatures. Error messages verbatim. Code snippets critical to understanding.
3. **Artifact Map** — Enumeration of files created, modified, and read, with what changed in each:
   - `file created: path/to/new.ts` — what the file contains
   - `file modified: path/to/existing.ts` — what changed (functions added/removed, logic changed)
   - `file read: path/to/examined.ts` — why it was examined, key findings
4. **Decisions** — What was decided, alternatives considered, rationale. Preserve the reasoning chain.
5. **Problem Solving** — Approaches tried (including failures). What worked and why. Root cause analysis.
6. **Current State** — Where we are in the task: what's done, what's active, what's blocked.
7. **Continuation** — Exact next steps to resume work without re-fetching context. Include pending tasks with status.

USER INTENT FIDELITY
When the compressed range includes user messages, preserve the user's intent with extra care. Do not change scope, constraints, priorities, acceptance criteria, or requested outcomes.
Directly quote user messages when they are short enough to include safely. Direct quotes are preferred when they best preserve exact meaning.

Yet be LEAN. Strip away the noise: failed attempts that led nowhere, verbose tool outputs, back-and-forth exploration. What remains should be pure signal — golden nuggets of detail that preserve full understanding with zero ambiguity.

COMPRESSED BLOCK PLACEHOLDERS
When the selected range includes previously compressed blocks, use this exact placeholder format when referencing one:

- `(bN)`

Compressed block sections in context are clearly marked with a header:

- `[Compressed conversation section]`

Compressed block IDs always use the `bN` form (never `mNNNN`) and are represented in the same XML metadata tag format.

Rules:

- Include every required block placeholder exactly once.
- Do not invent placeholders for blocks outside the selected range.
- Treat `(bN)` placeholders as RESERVED TOKENS. Do not emit `(bN)` text anywhere except intentional placeholders.
- If you need to mention a block in prose, use plain text like `compressed bN` (not as a placeholder).
- Preflight check before finalizing: the set of `(bN)` placeholders in your summary must exactly match the required set, with no duplicates.

These placeholders are semantic references. They will be replaced with the full stored compressed block content when the tool processes your output.

FLOW PRESERVATION WITH PLACEHOLDERS
When you use compressed block placeholders, write the surrounding summary text so it still reads correctly AFTER placeholder expansion.

- Treat each placeholder as a stand-in for a full conversation segment, not as a short label.
- Ensure transitions before and after each placeholder preserve chronology and causality.
- Do not write text that depends on the placeholder staying literal (for example, "as noted in `(b2)`").
- Your final meaning must be coherent once each placeholder is replaced with its full compressed block content.

BOUNDARY IDS
You specify boundaries by ID using the injected IDs visible in the conversation:

- `mNNNN` IDs identify raw messages
- `bN` IDs identify previously compressed blocks

Each message has an ID inside XML metadata tags like `<dcp-message-id>m0001</dcp-message-id>`.
The same ID tag appears in every tool output of the message it belongs to — each unique ID identifies one complete message.
Treat these tags as boundary metadata only, not as tool result content.

Rules:

- Pick `startId` and `endId` directly from injected IDs in context.
- IDs must exist in the current visible context.
- `startId` must appear before `endId`.
- Do not invent IDs. Use only IDs that are present in context.

BATCHING
When multiple independent ranges are ready and their boundaries do not overlap, include all of them as separate entries in the `content` array of a single tool call. Each entry should have its own `startId`, `endId`, and `summary`.

THE FORMAT OF COMPRESS

```
{
  topic: string,           // Short label (3-5 words) for the overall batch
  content: [               // One or more ranges to compress independently
    {
      startId: string,     // ID at range start: mNNNN or bN
      endId: string,       // ID at range end: mNNNN or bN
      summary: string      // Complete technical summary replacing that range (use 7-section format above)
    }
  ]
}
```
