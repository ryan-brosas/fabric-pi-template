
import { spawn } from "node:child_process";
import type { McpClient, McpServerConfig, SkillMcpState } from "./types.js";
import { filterTools } from "./utils.js";

export function getClientKey(skillName: string, serverName: string): string {
  return `${skillName}:${serverName}`;
}

export function disconnectAll(state: SkillMcpState): void {
  for (const [, client] of state.clients) {
    client.process.kill();
  }
  state.clients.clear();
}

export function buildLoadedMcpDetails(loadedSkills: Map<string, Record<string, McpServerConfig>>): {
  summary: string;
  examples: string;
} {
  const loadedEntries = Array.from(loadedSkills.entries());
  if (loadedEntries.length === 0) {
    return {
      summary:
        "Loaded MCP skills: (none). Load a skill with MCP config via skill() before using this tool.",
      examples:
        'Examples:\n- skill("playwright")\n- skill_mcp(skill_name="playwright", list_tools=true)',
    };
  }

  const summaryLines = ["Loaded MCP skills and servers:"];
  const examples: string[] = [];
  for (const [skillName, config] of loadedEntries) {
    const serverNames = Object.keys(config);
    summaryLines.push(`- ${skillName}: ${serverNames.join(", ")}`);

    const serverHint = serverNames.length > 1 ? `, mcp_name="${serverNames[0]}"` : "";
    examples.push(`- skill_mcp(skill_name="${skillName}", list_tools=true${serverHint})`);
  }

  return {
    summary: summaryLines.join("\n"),
    examples: `Examples:\n${examples.slice(0, 3).join("\n")}`,
  };
}

export function sendRequest(client: McpClient, method: string, params?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = ++client.requestId;
    const request = {
      jsonrpc: "2.0",
      id,
      method,
      params: params || {},
    };

    const timeout = setTimeout(() => {
      client.pendingRequests.delete(id);
      reject(new Error(`Request timeout: ${method}`));
    }, 30000);

    client.pendingRequests.set(id, {
      resolve: (v: any) => {
        clearTimeout(timeout);
        resolve(v);
      },
      reject: (e: any) => {
        clearTimeout(timeout);
        reject(e);
      },
    });

    client.process.stdin?.write(`${JSON.stringify(request)}\n`);
  });
}

export async function connectServer(
  state: SkillMcpState,
  skillName: string,
  serverName: string,
  config: McpServerConfig,
): Promise<McpClient> {
  const key = getClientKey(skillName, serverName);

  const existing = state.clients.get(key);
  if (existing && !existing.process.killed) {
    return existing;
  }

  const proc = spawn(config.command, config.args || [], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...config.env },
    shell: true,
  });

  const client: McpClient = {
    process: proc,
    config,
    requestId: 0,
    pendingRequests: new Map(),
  };

  let buffer = "";
  proc.stdout?.on("data", (data) => {
    buffer += data.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response = JSON.parse(line);
        if (response.id !== undefined) {
          const pending = client.pendingRequests.get(response.id);
          if (pending) {
            client.pendingRequests.delete(response.id);
            if (response.error) {
              pending.reject(new Error(response.error.message));
            } else {
              pending.resolve(response.result);
            }
          }
        }
      } catch {
        /* skip malformed JSON */
      }
    }
  });

  proc.on("error", (err) => {
    console.error(`MCP server error [${key}]:`, err.message);
  });

  proc.on("exit", () => {
    state.clients.delete(key);
  });

  state.clients.set(key, client);

  try {
    await sendRequest(client, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "opencode-skill-mcp", version: "1.1.0" },
    });

    proc.stdin?.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      })}\n`,
    );

    try {
      const toolsResult = await sendRequest(client, "tools/list", {});
      const allTools = toolsResult.tools || [];
      client.capabilities = { tools: allTools };
      client.filteredTools = filterTools(allTools, config.includeTools);
    } catch {
      client.capabilities = { tools: [] };
      client.filteredTools = [];
    }
  } catch (e: any) {
    proc.kill();
    state.clients.delete(key);
    throw new Error(`Failed to initialize MCP server: ${e.message}`);
  }

  return client;
}
