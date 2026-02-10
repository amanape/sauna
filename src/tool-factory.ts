import { createWebSearchTool, type SearchFunction } from "./tools/web-search";
import { createTavilySearch } from "./tools/search-backends";

export function resolveSearchFn(env: Record<string, string | undefined>): SearchFunction {
  const tavilyKey = env.TAVILY_API_KEY;
  if (tavilyKey) {
    return createTavilySearch(tavilyKey);
  }
  return async () => {
    throw new Error(
      "Web search is not configured. Set TAVILY_API_KEY environment variable to enable web search.",
    );
  };
}

export function createTools(
  searchFn?: SearchFunction,
) {
  const effectiveSearchFn = searchFn ?? resolveSearchFn(process.env as Record<string, string | undefined>);
  return {
    web_search: createWebSearchTool(effectiveSearchFn),
  };
}
