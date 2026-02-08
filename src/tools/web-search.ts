import type { Tool } from "../types";

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

export type SearchFunction = (query: string) => Promise<SearchResult[]>;

export function createWebSearchTool(searchFn: SearchFunction): Tool {
  return {
    name: "web_search",
    description:
      "Search the web for a query and return relevant results with titles, snippets, and URLs.",
    parameters: {
      query: {
        type: "string",
        description: "The search query to execute",
        required: true,
      },
    },
    async execute(args: Record<string, unknown>): Promise<string> {
      const raw = args.query;
      if (typeof raw !== "string" || raw.trim() === "") {
        return "Error: query parameter is required and must be a non-empty string.";
      }

      const query = raw.trim();

      try {
        const results = await searchFn(query);

        if (results.length === 0) {
          return `No results found for: ${query}`;
        }

        return results
          .map(
            (r, i) =>
              `${i + 1}. ${r.title}\n   ${r.snippet}\n   ${r.url}`,
          )
          .join("\n\n");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Error searching for "${query}": ${msg}`;
      }
    },
  };
}
