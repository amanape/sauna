import { test, expect } from "bun:test";
import {
  createWebSearchTool,
  type SearchResult,
  type SearchFunction,
} from "./web-search";

test("formats search results with title, snippet, and URL", async () => {
  const searchFn: SearchFunction = async () => [
    {
      title: "Bun Runtime",
      snippet: "Bun is a fast JavaScript runtime",
      url: "https://bun.sh",
    },
    {
      title: "Bun Docs",
      snippet: "Official documentation for Bun",
      url: "https://bun.sh/docs",
    },
  ];
  const tool = createWebSearchTool(searchFn);
  const result = await tool.execute({ query: "bun runtime" });

  expect(result).toContain("Bun Runtime");
  expect(result).toContain("Bun is a fast JavaScript runtime");
  expect(result).toContain("https://bun.sh");
  expect(result).toContain("Bun Docs");
  expect(result).toContain("Official documentation for Bun");
  expect(result).toContain("https://bun.sh/docs");
});

test("passes trimmed query to search function", async () => {
  let receivedQuery = "";
  const searchFn: SearchFunction = async (query) => {
    receivedQuery = query;
    return [];
  };
  const tool = createWebSearchTool(searchFn);
  await tool.execute({ query: "  spaced query  " });

  expect(receivedQuery).toBe("spaced query");
});

test("returns error when query is missing", async () => {
  const searchFn: SearchFunction = async () => [];
  const tool = createWebSearchTool(searchFn);
  const result = await tool.execute({});

  expect(result).toMatch(/error/i);
  expect(result).toContain("query");
});

test("returns error when query is empty or whitespace", async () => {
  const searchFn: SearchFunction = async () => [];
  const tool = createWebSearchTool(searchFn);

  const empty = await tool.execute({ query: "" });
  expect(empty).toMatch(/error/i);

  const whitespace = await tool.execute({ query: "   " });
  expect(whitespace).toMatch(/error/i);
});

test("returns no-results message when search returns empty array", async () => {
  const searchFn: SearchFunction = async () => [];
  const tool = createWebSearchTool(searchFn);
  const result = await tool.execute({ query: "obscure query" });

  expect(result).toMatch(/no results/i);
});

test("handles search function errors gracefully", async () => {
  const searchFn: SearchFunction = async () => {
    throw new Error("API rate limited");
  };
  const tool = createWebSearchTool(searchFn);
  const result = await tool.execute({ query: "test" });

  expect(result).toMatch(/error/i);
  expect(result).toContain("API rate limited");
});

test("numbers multiple results sequentially", async () => {
  const searchFn: SearchFunction = async () => [
    { title: "First", snippet: "s1", url: "https://a.com" },
    { title: "Second", snippet: "s2", url: "https://b.com" },
    { title: "Third", snippet: "s3", url: "https://c.com" },
  ];
  const tool = createWebSearchTool(searchFn);
  const result = await tool.execute({ query: "test" });

  expect(result).toContain("1.");
  expect(result).toContain("2.");
  expect(result).toContain("3.");
});
