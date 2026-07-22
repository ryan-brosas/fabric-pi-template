Collapse selected individual messages in the conversation into detailed summaries.

THE SUMMARY
Your summary must be EXHAUSTIVE. Use the following 9-section structure to ensure nothing is lost.
Capture file paths, function signatures, decisions made, constraints discovered, key findings, tool outcomes, and user intent details that matter... EVERYTHING that preserves the value of the selected message after the raw message is removed.

STRUCTURED SUMMARY FORMAT
When summarizing each message, organize findings into these sections (omit empty sections):

1. **Primary Request** — What the user actually wants. Quote exact instructions when short.
2. **Key Technical Concepts** — Decisions made, constraints discovered, architecture choices, patterns identified.
3. **Files and Code** — Exact file paths with line numbers (`path/file.ts:42-67`). Function signatures. Code snippets critical to understanding.
4. **Errors and Fixes** — What broke, root cause, what fixed it. Include error messages verbatim when diagnostic.
5. **Problem Solving** — Approaches tried (including failures). What worked and why.
6. **User Messages** — Preserve exact user intent. Directly quote short user instructions when that best preserves meaning.
7. **Pending Tasks** — Incomplete work with current status.
8. **Current Work** — What's actively happening right now.
9. **Next Step** — What should happen next (if clear from context).

USER INTENT FIDELITY
When a selected message contains user intent, preserve that intent with extra care. Do not change scope, constraints, priorities, acceptance criteria, or requested outcomes.
Directly quote short user instructions when that best preserves exact meaning.

Yet be LEAN. Strip away the noise: failed attempts that led nowhere, verbose tool output, and repetition. What remains should be pure signal — golden nuggets of detail that preserve full understanding with zero ambiguity.

MESSAGE IDS
You specify individual raw messages by ID using the injected IDs visible in the conversation:

- `mNNNN` IDs identify raw messages

Each message has an ID inside XML metadata tags like `<dcp-message-id priority="high">m0007</dcp-message-id>`.
The ID tag appears at the end of the message it belongs to — each ID covers all the content above it back to the previous ID.
Treat these tags as message metadata only, not as content to summarize. Use only the inner `mNNNN` value as the `messageId`.
The `priority` attribute indicates relative context cost. Prefer higher-priority closed messages before lower-priority ones.
Messages marked as `<dcp-message-id>BLOCKED</dcp-message-id>` cannot be compressed.

Rules:

- Pick each `messageId` directly from injected IDs visible in context.
- Only use raw message IDs of the form `mNNNN`.
- Ignore XML attributes such as `priority` when copying the ID; use only the inner `mNNNN` value.
- Do NOT use compressed block IDs like `bN`.
- Do not invent IDs. Use only IDs that are present in context.
- Do not target prior compressed blocks or block summaries.

BATCHING
Select MANY messages in a single tool call when they are independently safe to compress.
Each entry should summarize exactly one message, and the tool can receive as many entries as needed in one batch.
When several messages are equally safe to compress, prefer higher-priority messages first.

Because each message is compressed independently:

- Do not describe ranges
- Do not use start/end boundaries
- Do not use compressed block placeholders
- Do not reference prior compressed blocks with `(bN)`

THE FORMAT OF COMPRESS

```
{
  topic: string,           // Short label (3-5 words) for the overall batch
  content: [               // One or more messages to compress independently
    {
      messageId: string,   // Raw message ID only: mNNNN (ignore metadata attributes like priority)
      topic: string,       // Short label (3-5 words) for this one message summary
      summary: string      // Complete technical summary replacing that one message (use 9-section format above)
    }
  ]
}
```
