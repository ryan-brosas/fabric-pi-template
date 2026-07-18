---
name: memory
description: Read durable project context from `.pi/artifacts/MEMORY.md`, recall prior sessions when needed, and append durable project learnings without duplicating them.
compatibility: Pi profile with pi-fabric and optional pi-vcc recall.
---

# Project Memory

Durable project knowledge lives in `.pi/artifacts/MEMORY.md`. Read it only when relevant and append new, reusable project learnings after checking for duplicates.

## When to load

Check project memory when a task:

- involves an architectural or design decision;
- refers to prior work or previous sessions;
- uses phrases such as "before", "last time", or "we used to";
- becomes ambiguous after inspecting current project artifacts.

Skip it for trivial edits and self-contained questions.

## Memory layers

- `.pi/artifacts/MEMORY.md` — explicit, inspectable project knowledge.
- `extensions.vcc_recall({query, scope:"lineage"})` — active-session history across compactions; search first, then expand relevant indices with `tools.call({ref:"memory.expand", args:{session, indices}})`.
- `tools.call({ref:"memory.recall", args:{query, scope}})` — cross-session project or global recall.

Do not treat recalled text as current truth. Confirm it against current files and runtime state.

## Usage

Inside `fabric_exec`, use Pi core tools for the project file:

```ts
const matches = await pi.grep({regex: "<topic>", path: ".pi/artifacts/MEMORY.md"});
const memory = await pi.read(".pi/artifacts/MEMORY.md");
```

To save a learning:

1. Search `.pi/artifacts/MEMORY.md` for the topic.
2. Read the relevant section.
3. Append or precisely edit only a durable fact, decision, pattern, or gotcha.
4. Include the evidence path or command when practical.

Never store secrets, credentials, transient task state, or speculative conclusions in memory.

## When NOT to use

- Session scratch work — keep it in the conversation.
- Active task ownership or progress — use Fabric mesh task/CAS state.
- Project rules — use `AGENTS.md` or `.pi/APPEND_SYSTEM.md`.
- Feature specifications and evidence — use `.pi/artifacts/<slug>/`.