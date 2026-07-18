# OpenCode → Pi Port Map

**Source of truth:** `/home/ryan/repo/new-system/.opencode`  
**Target:** `/home/ryan/repo/swastika/.pi`

The former `new-system/project/.pi` derivative is not authority. Its pre-port static payload is preserved at `/home/ryan/repo/swastika/.migration-backup/derived-v4-static` because no files may be deleted without operator permission.

| OpenCode surface | Pi-native surface | Port rule |
|---|---|---|
| `AGENTS.md` | `.pi/APPEND_SYSTEM.md` + `.pi/AGENTS.md` | Preserve behavioral kernel; replace OpenCode tool names with Pi bindings. |
| `agent/*.md` | `.pi/agents/*.md` + `.pi/config.json` | Preserve seven roles and model intent; Fabric supplies bounded subagents. |
| `command/*.md` | `.pi/prompts/*.md` | Preserve nine operator commands and argument contracts. |
| `skill/**` | `.pi/skills/**` | Copied byte-for-byte first; `.pi/skill-adaptations.json` allowlists changed source files and the two Pi-only helper manifests. |
| `plugin/*.ts` | `.pi/extensions/**` | Rewrite hooks against Pi `ExtensionAPI`; never load OpenCode SDK code directly. |
| `tool/*.ts` | `.pi/extensions/tools/**` | Register Pi tools with TypeBox schemas and output truncation. |
| `workflows/*.md` | `.pi/workflows/*.md` | Preserve workflow intent; map `task()` to bounded Fabric dispatch. |
| `templates/**` | `.pi/templates/**` | Preserve templates with `.pi` artifact paths. |
| `opencode.json` | `.pi/settings.json`, `.pi/config.json`, `.pi/fabric.json`, extensions | Split model, compaction, role, permission, formatter, MCP, and watcher behavior by Pi authority. |
| `tui.json` | Pi settings/extensions | Compaction shortcut can be registered locally; built-in keybinding remaps remain user-global in Pi and are documented rather than silently claimed. |
| DCP configuration | pi-vcc + session-summary extension | Preserve context continuity without loading OpenCode plugins. |

## Intentional semantic differences

- Pi has no native project-local agent declarations; Fabric routes the seven source roles.
- Pi project keybindings are not a settings surface. The port does not overwrite user-global `keybindings.json`.
- OpenCode permission maps become `tool_call` guards. Non-interactive risky actions fail closed. Fabric-native tools (currently `fabric_exec`) are explicitly exempt because Fabric owns authorization, capture, state, mesh, and nested execution at that seam; ordinary shell commands do not gain an exemption from merely mentioning Fabric.
- MCP servers are connected through the ported skill-MCP extension or Fabric MCP, not OpenCode's MCP runtime.
- Generated-profile duplicate agents, prompts, skills, and templates were moved to `.migration-backup/disabled-generated-residue`; they are absent from active `.pi`.
- `figma-mcp-go` was `enabled: false` in source `opencode.json` and is intentionally not declared; the enabled `webclaw` server is declared via `.pi/skills/webclaw/mcp.json` for the skill-MCP loader.
- The source DCP override prompts (`dcp-prompts/overrides/compress-message.md`, `compress-range.md`) are superseded by pi-vcc's own structured summarization prompts; the custom override text is not carried because pi-vcc exposes no project-local prompt override surface.

## Verification boundary

A valid port must prove:

1. all seven source roles are mapped;
2. all nine source commands are discoverable and generated-only duplicate commands are absent;
3. every source skill exists under `.pi/skills`; unregistered files remain byte-identical and registered adaptations contain no active `.opencode/artifacts` bindings;
4. OpenCode SDK imports are absent from active `.pi/extensions`;
5. guard, prompt leverage, session summary, diagnostics, Context7, grep.app, and skill-MCP behavior use Pi APIs;
6. settings and Fabric configs parse;
7. a fresh trusted Pi session loads the profile without duplicate resources.