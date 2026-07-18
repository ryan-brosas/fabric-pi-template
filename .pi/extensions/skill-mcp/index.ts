import { dirname } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, truncateHead } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { McpClient, McpServerConfig } from "./types.js";
import { findSkillPath, loadMcpConfig } from "./utils.js";
import { connectServer, disconnectAll, sendRequest } from "./client.js";

function output(value: unknown, details: Record<string, unknown> = {}) {
  const raw = JSON.stringify(value, null, 2);
  const truncated = truncateHead(raw, { maxBytes: DEFAULT_MAX_BYTES, maxLines: DEFAULT_MAX_LINES });
  return { content: [{ type: "text" as const, text: truncated.content }], details: { ...details, truncated: truncated.truncated } };
}

export default function skillMcp(pi: ExtensionAPI) {
  const clients = new Map<string, McpClient>();
  const loadedSkills = new Map<string, Record<string, McpServerConfig>>();
  const state = { clients, loadedSkills };

  pi.registerTool({
    name: "skill_mcp",
    label: "Skill MCP",
    description: "List or invoke tools from an MCP server declared by a loaded Pi skill through mcp.json or SKILL.md frontmatter. includeTools filters are enforced.",
    parameters: Type.Object({
      skill_name: Type.String(),
      mcp_name: Type.Optional(Type.String()),
      list_tools: Type.Optional(Type.Boolean()),
      tool_name: Type.Optional(Type.String()),
      arguments: Type.Optional(Type.String({ description: "JSON object encoded as a string" })),
    }),
    async execute(_id, args) {
      const skillPath = findSkillPath(args.skill_name, process.cwd());
      if (!skillPath) throw new Error(`Skill '${args.skill_name}' not found`);
      const config = loadMcpConfig(dirname(skillPath), skillPath);
      if (!config) throw new Error(`Skill '${args.skill_name}' has no MCP configuration`);
      loadedSkills.set(args.skill_name, config);
      const names = Object.keys(config); const serverName = args.mcp_name ?? names[0];
      if (!serverName || !config[serverName]) throw new Error(`MCP server not found; available: ${names.join(", ")}`);
      const client = await connectServer(state, args.skill_name, serverName, config[serverName]);
      if (args.list_tools) {
        return output({ server: serverName, tools: (client.filteredTools ?? []).map((tool: any) => ({ name: tool.name, description: tool.description, schema: tool.inputSchema })) }, { skill: args.skill_name, server: serverName });
      }
      if (!args.tool_name) throw new Error("Specify list_tools=true or tool_name");
      if (config[serverName].includeTools?.length && !client.filteredTools?.some((tool: any) => tool.name === args.tool_name)) {
        throw new Error(`Tool '${args.tool_name}' is outside includeTools; allowed: ${(client.filteredTools ?? []).map((tool: any) => tool.name).join(", ")}`);
      }
      let toolArgs: Record<string, unknown> = {};
      if (args.arguments) {
        try { toolArgs = JSON.parse(args.arguments); } catch { throw new Error("arguments must be valid JSON"); }
      }
      const result = await sendRequest(client, "tools/call", { name: args.tool_name, arguments: toolArgs });
      return output(result, { skill: args.skill_name, server: serverName, tool: args.tool_name });
    },
  });

  pi.registerTool({
    name: "skill_mcp_status",
    label: "Skill MCP Status",
    description: "Show active skill-scoped MCP server connections.",
    parameters: Type.Object({}),
    async execute() {
      return output({ connected: [...clients.entries()].map(([key, client]) => ({ key, running: !client.process.killed, tools: client.filteredTools?.length ?? 0 })) });
    },
  });

  pi.registerTool({
    name: "skill_mcp_disconnect",
    label: "Skill MCP Disconnect",
    description: "Disconnect all skill-scoped MCP servers or those belonging to one skill.",
    parameters: Type.Object({ skill_name: Type.Optional(Type.String()) }),
    async execute(_id, args) {
      if (!args.skill_name) {
        const count = clients.size; disconnectAll(state); return output({ disconnected: "all", count });
      }
      const keys = [...clients.keys()].filter((key) => key.startsWith(`${args.skill_name}:`));
      for (const key of keys) { clients.get(key)?.process.kill(); clients.delete(key); }
      return output({ disconnected: keys });
    },
  });

  pi.on("session_shutdown", () => disconnectAll(state));
}