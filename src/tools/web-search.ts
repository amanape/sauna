import { tool } from "ai";
import * as z from "zod";

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

export type SearchFunction = (query: string) => Promise<SearchResult[]>;

export function createWebSearchTool(searchFn: SearchFunction) {
  return tool({
    description:
      "Search the web for a query and return relevant results with titles, snippets, and URLs.",
    inputSchema: z.object({
      query: z.string().describe("The search query to execute"),
    }),
    async execute({ query: rawQuery }) {
      const query = rawQuery.trim();

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
  });
}
