/**
 * Skill-MCP Plugin — Bridge between OpenCode skills and MCP tools.
 *
 * Loads MCP server configs from skill directories (mcp.json or YAML frontmatter),
 * spawns MCP processes, and exposes their tools to the agent via skill_mcp tools.
 *
 * Implements the Ampcode-style MCP skill pattern:
 * - SKILL.md frontmatter or mcp.json declares MCP servers
 * - includeTools filtering reduces token usage
 * - Lifecycle management via connect / disconnect
 */
import { dirname } from "node:path";
import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin/tool";
import type { McpServerConfig } from "./skill-mcp/types.js";
import { findSkillPath, loadMcpConfig } from "./skill-mcp/utils.js";
import {
  connectServer,
  disconnectAll,
  sendRequest,
  buildLoadedMcpDetails,
} from "./skill-mcp/client.js";

export const SkillMcpPlugin: Plugin = async ({ directory }) => {
  const clients = new Map();
  const loadedSkills = new Map<string, Record<string, McpServerConfig>>();

  return {
    "tool.definition": async (input, output) => {
      const toolID = input.toolID;
      if (toolID === "skill_mcp") {
        const details = buildLoadedMcpDetails(loadedSkills);
        output.description = `${output.description}\n\n${details.summary}\n\n${details.examples}`;
      }
      if (toolID === "skill_mcp_status") {
        output.description = `${output.description}

Connection status: Shows currently active MCP server connections from skill-embedded MCP servers.
Example: skill_mcp_status({})`;
      }
    },
    tool: {
      skill_mcp: tool({
        description: `Invoke MCP tools from skill-embedded MCP servers.

When a skill declares MCP servers (via mcp.json or YAML frontmatter), use this tool to:
- List available tools: skill_mcp(skill_name="playwright", list_tools=true)
- Call a tool: skill_mcp(skill_name="playwright", tool_name="browser_navigate", arguments='{"url": "..."}')

Skills can use "includeTools" to filter which MCP tools are exposed (reduces token usage).
The skill must be loaded first via the skill() tool to register its MCP config.`,
        args: {
          skill_name: tool.schema.string().describe("Name of the loaded skill with MCP config"),
          mcp_name: tool.schema
            .string()
            .optional()
            .describe("Specific MCP server name (if skill has multiple)"),
          list_tools: tool.schema
            .boolean()
            .optional()
            .describe("List available tools from this MCP"),
          tool_name: tool.schema.string().optional().describe("MCP tool to invoke"),
          arguments: tool.schema.string().optional().describe("JSON string of tool arguments"),
        },
        async execute(args: any) {
          const { skill_name, mcp_name, list_tools, tool_name, arguments: argsJson } = args;

          if (!skill_name) return JSON.stringify({ error: "skill_name required" });

          const skillPath = findSkillPath(skill_name, directory);
          if (!skillPath) return JSON.stringify({ error: `Skill '${skill_name}' not found` });

          const skillDir = dirname(skillPath);
          const mcpConfig = loadMcpConfig(skillDir, skillPath);
          if (!mcpConfig) {
            return JSON.stringify({
              error: `Skill '${skill_name}' has no MCP config (check mcp.json or YAML frontmatter)`,
            });
          }

          loadedSkills.set(skill_name, mcpConfig);

          const serverNames = Object.keys(mcpConfig);
          const targetServer = mcp_name || serverNames[0];
          if (!mcpConfig[targetServer]) {
            return JSON.stringify({
              error: `MCP server '${targetServer}' not found in skill`,
              available: serverNames,
            });
          }

          const serverConfig = mcpConfig[targetServer];

          let client: any;
          try {
            client = await connectServer(
              { clients, loadedSkills },
              skill_name,
              targetServer,
              serverConfig,
            );
          } catch (e: any) {
            return JSON.stringify({ error: `Failed to connect: ${e.message}` });
          }

          if (list_tools) {
            const totalTools = client.capabilities?.tools?.length || 0;
            const filteredTools = client.filteredTools || [];
            const isFiltered = serverConfig.includeTools && serverConfig.includeTools.length > 0;

            return JSON.stringify(
              {
                mcp: targetServer,
                tools: filteredTools.map((t: any) => ({
                  name: t.name,
                  description: t.description,
                  schema: t.inputSchema,
                })),
                ...(isFiltered && {
                  filtering: {
                    patterns: serverConfig.includeTools,
                    showing: filteredTools.length,
                    total: totalTools,
                    tokenSavings: `~${Math.round((1 - filteredTools.length / totalTools) * 100)}%`,
                  },
                }),
              },
              null,
              2,
            );
          }

          if (tool_name) {
            if (serverConfig.includeTools && serverConfig.includeTools.length > 0) {
              const isAllowed = client.filteredTools?.some((t: any) => t.name === tool_name);
              if (!isAllowed) {
                return JSON.stringify({
                  error: `Tool '${tool_name}' is not in includeTools filter`,
                  allowed: client.filteredTools?.map((t: any) => t.name) || [],
                  hint: "Add this tool to includeTools in mcp.json or YAML frontmatter",
                });
              }
            }

            let toolArgs = {};
            if (argsJson) {
              try {
                toolArgs = JSON.parse(argsJson);
              } catch {
                return JSON.stringify({ error: "Invalid JSON in arguments" });
              }
            }

            try {
              const result = await sendRequest(client, "tools/call", {
                name: tool_name,
                arguments: toolArgs,
              });
              return JSON.stringify({ result }, null, 2);
            } catch (e: any) {
              return JSON.stringify({ error: `Tool call failed: ${e.message}` });
            }
          }

          return JSON.stringify({
            error: "Specify either list_tools=true or tool_name to call",
            mcp: targetServer,
            available_tools: client.filteredTools?.map((t: any) => t.name) || [],
          });
        },
      }),

      skill_mcp_status: tool({
        description: "Show status of connected MCP servers from skills.",
        args: {},
        async execute() {
          const servers: any[] = [];
          for (const [key, client] of clients) {
            const [skillName, serverName] = key.split(":");
            const totalTools = client.capabilities?.tools?.length || 0;
            const filteredTools = client.filteredTools?.length || 0;
            const isFiltered = client.config.includeTools && client.config.includeTools.length > 0;

            servers.push({
              skill: skillName,
              server: serverName,
              connected: !client.process.killed,
              tools: filteredTools,
              ...(isFiltered && { filtering: { total: totalTools, filtered: filteredTools } }),
            });
          }
          return JSON.stringify({ connected_servers: servers, count: servers.length });
        },
      }),

      skill_mcp_disconnect: tool({
        description: "Disconnect MCP servers. Use when done with browser automation etc.",
        args: {
          skill_name: tool.schema
            .string()
            .optional()
            .describe("Specific skill to disconnect (all if omitted)"),
        },
        async execute(args: any) {
          if (args.skill_name) {
            const toDisconnect: string[] = [];
            for (const key of clients.keys()) {
              if (key.startsWith(`${args.skill_name}:`)) toDisconnect.push(key);
            }
            for (const key of toDisconnect) {
              const c = clients.get(key);
              c?.process.kill();
              clients.delete(key);
            }
            return JSON.stringify({ disconnected: toDisconnect });
          }
          const count = clients.size;
          disconnectAll({ clients, loadedSkills });
          return JSON.stringify({ disconnected: "all", count });
        },
      }),
    },
  };
};

export default SkillMcpPlugin;
