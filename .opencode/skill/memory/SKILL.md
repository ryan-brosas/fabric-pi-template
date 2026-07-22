---
name: memory
description: Read durable project context from `.opencode/artifacts/MEMORY.md`; append learnings to it. File-based, on-demand, observable.
---

# Project Memory

Durable project knowledge lives in `.opencode/artifacts/MEMORY.md`. Read it on demand when relevant, append to it when new learnings surface.

## When to load

**Check project memory** at the start of any task that:
- involves a decision, design choice, or architectural call
- references prior work, past sessions, or "what we did before"
- the user mentions "memory", "before", "last time", "we used to", or similar

For trivial edits, single-line fixes, or pure code questions — skip.

## Where memory lives

- `.opencode/artifacts/MEMORY.md` — single file for all durable project knowledge
- `~/.pi/MEMORY.md` — (optional) personal cross-project memory

Sections in MEMORY.md: architecture, decisions, patterns, gotchas. Grep-friendly keywords.

## Usage

**Recall prior context:**

```bash
# Search memory
rg -n "<topic>" .opencode/artifacts/MEMORY.md

# Read the file
read .opencode/artifacts/MEMORY.md
```

**Save a new learning this session:**

1. Check for duplicates: `rg -n "<topic>" .opencode/artifacts/MEMORY.md`
2. Read the file, find the right section, then append via `edit`

## When NOT to use

- For session-internal scratch work — use the conversation, not MEMORY.md.
- For ephemeral task tracking — use `TODO.md`, not MEMORY.md.
- For project rules — those go in `AGENTS.md`, not MEMORY.md.
