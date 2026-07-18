import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, truncateHead } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const CONTEXT7_API = "https://context7.com/api/v2";
const GREP_APP_API = "https://grep.app/api/search";

function text(content: string, details: Record<string, unknown> = {}) {
  const truncated = truncateHead(content, { maxBytes: DEFAULT_MAX_BYTES, maxLines: DEFAULT_MAX_LINES });
  const suffix = truncated.truncated ? `\n\n[Output truncated: ${truncated.outputLines}/${truncated.totalLines} lines]` : "";
  return { content: [{ type: "text" as const, text: truncated.content + suffix }], details: { ...details, truncation: truncated } };
}

export default function researchTools(pi: ExtensionAPI) {
  pi.registerTool({
    name: "context7",
    label: "Context7",
    description: "Resolve library IDs and query current library documentation. Use resolve before query; do not use for local code or general web research.",
    parameters: Type.Object({
      operation: Type.Optional(Type.String({ description: "resolve or query; default resolve" })),
      libraryName: Type.Optional(Type.String()),
      libraryId: Type.Optional(Type.String()),
      topic: Type.Optional(Type.String()),
    }),
    async execute(_id, args, signal) {
      const operation = args.operation ?? "resolve";
      const headers: Record<string, string> = { Accept: "application/json", "User-Agent": "Pi/1.0" };
      if (process.env.CONTEXT7_API_KEY) headers.Authorization = `Bearer ${process.env.CONTEXT7_API_KEY}`;
      if (operation === "resolve") {
        if (!args.libraryName?.trim()) throw new Error("libraryName is required for resolve");
        const url = new URL(`${CONTEXT7_API}/libs/search`);
        url.searchParams.set("libraryName", args.libraryName); url.searchParams.set("query", "documentation");
        const response = await fetch(url, { headers, signal });
        if (!response.ok) throw new Error(`Context7 API returned ${response.status}`);
        const data = await response.json() as { results?: Array<Record<string, unknown>> };
        const results = data.results ?? [];
        return text(results.slice(0, 5).map((lib, i) => `${i + 1}. ${lib.title} -> ${lib.id}\n${lib.description ?? ""}`).join("\n\n") || `No libraries found for ${args.libraryName}`, { operation, count: results.length });
      }
      if (operation === "query") {
        if (!args.libraryId?.trim() || !args.topic?.trim()) throw new Error("libraryId and topic are required for query");
        const url = new URL(`${CONTEXT7_API}/context`);
        url.searchParams.set("libraryId", args.libraryId); url.searchParams.set("query", args.topic);
        const response = await fetch(url, { headers: { ...headers, Accept: "text/plain" }, signal });
        if (!response.ok) throw new Error(`Context7 API returned ${response.status}`);
        return text(await response.text(), { operation, libraryId: args.libraryId, topic: args.topic });
      }
      throw new Error(`Unknown operation: ${operation}`);
    },
  });

  pi.registerTool({
    name: "grepsearch",
    label: "grep.app",
    description: "Search literal production code patterns in public GitHub repositories through grep.app. Use for real-world library usage, not local code or prose research.",
    parameters: Type.Object({
      query: Type.String(), language: Type.Optional(Type.String()), repo: Type.Optional(Type.String()), path: Type.Optional(Type.String()), limit: Type.Optional(Type.Number()),
    }),
    async execute(_id, args, signal) {
      const url = new URL(GREP_APP_API); url.searchParams.set("q", args.query);
      if (args.language) url.searchParams.set("filter[lang][0]", args.language);
      if (args.repo) url.searchParams.set("filter[repo][0]", args.repo);
      if (args.path) url.searchParams.set("filter[path][0]", args.path);
      const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Pi/1.0" }, signal });
      if (!response.ok) throw new Error(`grep.app API returned ${response.status}`);
      const data = await response.json() as { hits?: { hits?: Array<any> }, time?: number };
      const hits = data.hits?.hits ?? []; const limit = Math.min(args.limit ?? 10, 20);
      const formatted = hits.slice(0, limit).map((hit, i) => {
        const snippet = String(hit.content?.snippet ?? "").replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').split("\n").slice(0, 8).join("\n");
        return `${i + 1}. ${hit.repo}\nFile: ${hit.path}\n${snippet}`;
      }).join("\n\n");
      return text(formatted || `No results found for ${args.query}`, { count: hits.length, elapsedMs: data.time });
    },
  });
}