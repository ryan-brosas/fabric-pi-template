# OpenCode Plugins

Plugins in this directory extend OpenCode with project-specific behavior and tools.

## Current Plugin Files

```text
plugin/
├── copilot-auth.ts     # GitHub Copilot provider/auth integration
├── prompt-leverage.ts  # Prompt pre-processing with structured execution framing
├── session-summary.ts  # Structured persistent session summary (artifact trail, decisions, anchored merge)
├── session-summary/    # Session-summary helper modules (types, serialize, tracking, persist)
├── skill-mcp.ts        # Skill-scoped MCP bridge (skill_mcp tools)
└── sdk/                # Shared SDK types
```

## Plugin Responsibilities

- `skill-mcp.ts`
  - Loads MCP configs from skills
  - Exposes `skill_mcp`, `skill_mcp_status`, `skill_mcp_disconnect`
  - Supports tool filtering with `includeTools`

- `copilot-auth.ts`
  - Handles GitHub Copilot OAuth/device flow
  - Adds model/provider request shaping for compatible reasoning behavior

- `prompt-leverage.ts`
  - Upgrades user prompts with objective, context, tool rules, verification, and done criteria
  - Runs through `experimental.chat.messages.transform`

- `session-summary.ts` + `session-summary/`
  - **Barrel plugin** — entry point is `session-summary.ts` (<300 lines per architecture rule)
  - Helper modules in `session-summary/`: `types.ts`, `serialize.ts`, `tracking.ts`, `persist.ts`
  - Maintains a structured, incrementally-updated session summary that survives DCP compression cycles
  - **File-artifact tracking**: intercepts `read`, `edit`, `write` via `tool.execute.before` to track which files were read, modified, or created
  - **Decision capture**: tracks significant decisions made during sessions
  - **Anchored merge**: persists summary to `.opencode/state/session-summary.md` before compaction, merges incrementally rather than regenerating from scratch
  - **Context injection**: injects structured `<session_summary>` block into system prompt via `experimental.chat.system.transform`
  - **Intent guessing**: captures session intent from the first user message
  - Inspired by Factory.ai's anchored iterative summarization research

## Notes

- OpenCode auto-discovers every `.ts` file in `plugin/` as a plugin — keep helper modules in per-plugin subdirectories (e.g., `session-summary/`)
- Keep plugin documentation aligned with actual files in this directory
- Prefer shared helpers in per-plugin directories over duplicated utilities across plugins

## References

- OpenCode plugin docs: https://opencode.ai/docs/plugins/
- OpenCode custom tools docs: https://opencode.ai/docs/custom-tools/
