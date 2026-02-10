import type { SearchFunction, SearchResult } from "./web-search";

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface TavilyResponse {
  results: TavilyResult[];
}

export function translateTavilyResponse(response: TavilyResponse): SearchResult[] {
  return response.results.map((r) => ({
    title: r.title,
    snippet: r.content,
    url: r.url,
  }));
}

export function createTavilySearch(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): SearchFunction {
  return async (query: string): Promise<SearchResult[]> => {
    const response = await fetchImpl("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(
        `Tavily API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as TavilyResponse;
    return translateTavilyResponse(data);
  };
}
