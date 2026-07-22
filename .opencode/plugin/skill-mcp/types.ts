
import type { ChildProcess } from "node:child_process";

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  includeTools?: string[];
}

export interface McpClient {
  process: ChildProcess;
  config: McpServerConfig;
  requestId: number;
  pendingRequests: Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>;
  capabilities?: {
    tools?: any[];
    resources?: any[];
    prompts?: any[];
  };
  filteredTools?: any[];
}

export interface SkillMcpState {
  clients: Map<string, McpClient>;
  loadedSkills: Map<string, Record<string, McpServerConfig>>;
}

export interface ClientManager {
  state: SkillMcpState;
}
