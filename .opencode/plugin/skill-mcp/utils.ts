// aislop-ignore-file -- YAML frontmatter parsing requires nested conditional logic for format flexibility
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Match a tool name against a glob pattern.
 * Supports: exact match, * (any chars), ? (single char)
 */
export function matchGlobPattern(pattern: string, toolName: string): boolean {
  if (pattern === toolName) return true;

  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(toolName);
}

/**
 * Filter tools based on includeTools patterns.
 */
export function filterTools(allTools: any[], includePatterns?: string[]): any[] {
  if (!includePatterns || includePatterns.length === 0) {
    return allTools;
  }
  return allTools.filter((tool) =>
    includePatterns.some((pattern) => matchGlobPattern(pattern, tool.name)),
  );
}

/**
 * Parse YAML frontmatter from SKILL.md content.
 * Supports nested mcp server config (Ampcode pattern).
 */
export function parseYamlFrontmatter(content: string): {
  frontmatter: any;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const yamlStr = match[1];
  const body = match[2];

  const frontmatter: any = {};
  let mcpConfig: any = null;
  let serverName = "";
  let serverConfig: any = {};
  let currentArrayKey = "";

  for (const line of yamlStr.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const indent = line.search(/\S/);
    const keyMatch = trimmed.match(/^([\w-]+):\s*(.*)$/);

    if (keyMatch) {
      const [, key, value] = keyMatch;

      if (indent === 0) {
        if (key === "mcp") {
          mcpConfig = {};
          frontmatter.mcp = mcpConfig;
        } else {
          frontmatter[key] = value || undefined;
        }
        currentArrayKey = "";
      } else if (mcpConfig !== null && indent === 2) {
        serverName = key;
        serverConfig = {};
        mcpConfig[serverName] = serverConfig;
        currentArrayKey = "";
      } else if (serverConfig && indent === 4) {
        if (key === "command") {
          serverConfig.command = value;
          currentArrayKey = "";
        } else if (key === "args" || key === "includeTools") {
          if (value.startsWith("[")) {
            try {
              serverConfig[key] = JSON.parse(value);
            } catch {
              serverConfig[key] = [];
            }
            currentArrayKey = "";
          } else {
            serverConfig[key] = [];
            currentArrayKey = key;
          }
        } else {
          currentArrayKey = "";
        }
      }
    } else if (
      trimmed.startsWith("- ") &&
      serverConfig &&
      currentArrayKey &&
      serverConfig[currentArrayKey]
    ) {
      const item = trimmed.slice(2).replace(/^["']|["']$/g, "");
      serverConfig[currentArrayKey].push(item);
    }
  }

  return { frontmatter, body };
}

/**
 * Load MCP config from either mcp.json or YAML frontmatter.
 * Priority: mcp.json > YAML frontmatter (Ampcode pattern).
 */
export function loadMcpConfig(
  skillDir: string,
  skillPath: string,
): Record<
  string,
  { command: string; args?: string[]; includeTools?: string[]; env?: Record<string, string> }
> | null {
  const mcpJsonPath = join(skillDir, "mcp.json");
  if (existsSync(mcpJsonPath)) {
    try {
      return JSON.parse(readFileSync(mcpJsonPath, "utf-8"));
    } catch {
      /* fall through to YAML */
    }
  }

  const content = readFileSync(skillPath, "utf-8");
  const { frontmatter } = parseYamlFrontmatter(content);
  if (frontmatter.mcp && Object.keys(frontmatter.mcp).length > 0) {
    return frontmatter.mcp;
  }

  return null;
}

/**
 * Find skill file path by skill name.
 * Checks project .opencode/skill/ first, then user ~/.config/opencode/skill/.
 */
export function findSkillPath(skillName: string, projectDir: string): string | null {
  const locations = [
    join(projectDir, ".opencode", "skill", skillName, "SKILL.md"),
    join(homedir(), ".config", "opencode", "skill", skillName, "SKILL.md"),
  ];

  for (const loc of locations) {
    if (existsSync(loc)) return loc;
  }
  return null;
}
