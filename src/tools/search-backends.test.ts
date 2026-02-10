import { test, expect, describe, mock, beforeEach } from "bun:test";
import { createTavilySearch, translateTavilyResponse } from "./search-backends";
import type { SearchResult } from "./web-search";

describe("translateTavilyResponse", () => {
  test("translates Tavily API response to SearchResult[]", () => {
    const tavilyResponse = {
      results: [
        {
          title: "TypeScript Handbook",
          url: "https://typescriptlang.org/docs/handbook",
          content: "The TypeScript Handbook is the definitive guide...",
          score: 0.95,
        },
        {
          title: "Getting Started",
          url: "https://typescriptlang.org/docs/getting-started",
          content: "Get started with TypeScript in 5 minutes...",
          score: 0.87,
        },
      ],
    };

    const results = translateTavilyResponse(tavilyResponse);

    expect(results).toEqual([
      {
        title: "TypeScript Handbook",
        snippet: "The TypeScript Handbook is the definitive guide...",
        url: "https://typescriptlang.org/docs/handbook",
      },
      {
        title: "Getting Started",
        snippet: "Get started with TypeScript in 5 minutes...",
        url: "https://typescriptlang.org/docs/getting-started",
      },
    ]);
  });

  test("returns empty array for empty results", () => {
    const results = translateTavilyResponse({ results: [] });
    expect(results).toEqual([]);
  });

  test("handles missing optional fields gracefully", () => {
    const tavilyResponse = {
      results: [
        {
          title: "",
          url: "https://example.com",
          content: "",
          score: 0.5,
        },
      ],
    };

    const results = translateTavilyResponse(tavilyResponse);
    expect(results).toEqual([
      { title: "", snippet: "", url: "https://example.com" },
    ]);
  });
});

describe("createTavilySearch", () => {
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock();
  });

  test("calls Tavily API with correct URL, headers, and body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            title: "Result",
            url: "https://example.com",
            content: "A snippet",
            score: 0.9,
          },
        ],
      }),
    });

    const search = createTavilySearch("tvly-test-key-123", mockFetch as any);
    await search("bun runtime");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = (mockFetch.mock.calls as any)[0];
    expect(url).toBe("https://api.tavily.com/search");
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(options.headers["Authorization"]).toBe("Bearer tvly-test-key-123");
    const body = JSON.parse(options.body);
    expect(body.query).toBe("bun runtime");
  });

  test("returns translated search results", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            title: "Bun Docs",
            url: "https://bun.sh/docs",
            content: "Bun is a fast runtime",
            score: 0.95,
          },
        ],
      }),
    });

    const search = createTavilySearch("tvly-key", mockFetch as any);
    const results = await search("bun runtime");

    expect(results).toEqual([
      {
        title: "Bun Docs",
        snippet: "Bun is a fast runtime",
        url: "https://bun.sh/docs",
      },
    ]);
  });

  test("throws on non-OK HTTP response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });

    const search = createTavilySearch("bad-key", mockFetch as any);
    await expect(search("test")).rejects.toThrow(
      "Tavily API error: 401 Unauthorized",
    );
  });

  test("propagates network errors", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network failure"));

    const search = createTavilySearch("tvly-key", mockFetch as any);
    await expect(search("test")).rejects.toThrow("Network failure");
  });
});
