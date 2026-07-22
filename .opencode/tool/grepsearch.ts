import { tool } from "@opencode-ai/plugin";

const GREP_APP_API = "https://grep.app/api/search"; // aislop-ignore-line -- stable public API

interface SearchResult {
  repo: string;
  path: string;
  content: { snippet: string };
  total_matches: string;
}

interface GrepResponse {
  hits: { hits: SearchResult[] };
  time: number;
}

export default tool({
  description: `Search real-world code examples from GitHub repositories via grep.app. Replaces asking "how do others use X?" — use this for finding production patterns and real-world API usage.

WHEN: Implementing unfamiliar APIs, looking for production patterns, understanding library integrations.
SKIP: Searching your own codebase (use grep/LSP), looking up docs (use context7), general research (use websearch).

Common mistakes:
- DON'T search for keywords like "react tutorial" — search for literal code: "useState("
- DON'T use without language filter when searching common patterns
- DON'T ignore the repo filter when you know which project to search

Use when:
- Implementing unfamiliar APIs - see how others use a library
- Looking for production patterns - find real-world examples
- Understanding library integrations - see how things work together

IMPORTANT: Search for **literal code patterns**, not keywords:
Good: "useState(", "import React from", "async function"

Bad: "react tutorial", "best practices", "how to use"
Examples:
  grepsearch({ query: "getServerSession", language: "TypeScript" })
  grepsearch({ query: "CORS(", language: "Python", repo: "flask" })
  grepsearch({ query: "export async function POST", path: "route.ts" })
`,
  args: {
    query: tool.schema.string().describe("Code pattern to search for (literal text)"),
    language: tool.schema
      .string()
      .optional()
      .describe("Filter by language: TypeScript, TSX, Python, Go, Rust, etc."),
    repo: tool.schema.string().optional().describe("Filter by repo: 'owner/repo' or partial match"),
    path: tool.schema.string().optional().describe("Filter by file path: 'src/', '.test.ts', etc."),
    limit: tool.schema.number().optional().describe("Max results to return (default: 10, max: 20)"),
  },
  execute: async (args) => {
    const { query, language, repo, path, limit = 10 } = args;

    if (!query || query.trim() === "") {
      return "Error: query is required";
    }

    // Build URL with proper filter parameters
    // grep.app uses filter[lang][0]=TypeScript format, NOT inline lang:TypeScript
    const url = new URL(GREP_APP_API);
    url.searchParams.set("q", query);

    // Add language filter (grep.app uses filter[lang][0] format)
    if (language) {
      url.searchParams.set("filter[lang][0]", language);
    }

    // Add repo filter
    if (repo) {
      url.searchParams.set("filter[repo][0]", repo);
    }

    // Add path filter
    if (path) {
      url.searchParams.set("filter[path][0]", path);
    }

    try {
      const response = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
          "User-Agent": "OpenCode/1.0",
        },
      });

      if (!response.ok) {
        return `Error: grep.app API returned ${response.status}`;
      }

      const data = (await response.json()) as GrepResponse;

      if (!data.hits?.hits?.length) {
        return `No results found for: ${query}${language ? ` (${language})` : ""}`;
      }

      const maxResults = Math.min(limit, 20);
      const results = data.hits.hits.slice(0, maxResults);

      const formatted = results.map((hit, i) => {
        const repoName = hit.repo || "unknown";
        const filePath = hit.path || "unknown";
        const snippet = hit.content?.snippet || "";

        const cleanCode = snippet
          .replace(/<[^>]*>/g, "") // Remove HTML tags
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .split("\n")
          .slice(0, 8)
          .join("\n")
          .trim();

        return `## ${i + 1}. ${repoName}
**File**: ${filePath}
\`\`\`
${cleanCode}
\`\`\``;
      });

      return `Found ${data.hits.hits.length} results (showing ${results.length}) in ${data.time}ms:

${formatted.join("\n\n")}`;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error searching grep.app: ${message}`;
    }
  },
});
