import { test, expect } from "bun:test";
import { createWebSearchTool, type SearchFunction } from "./web-search";

function execute(
  tool: ReturnType<typeof createWebSearchTool>,
  input: { query: string },
) {
  return tool.execute!(input, {
    toolCallId: "test",
    messages: [],
    abortSignal: new AbortController().signal,
  });
}

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
  const result = await execute(tool, { query: "bun runtime" });

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
  await execute(tool, { query: "  spaced query  " });

  expect(receivedQuery).toBe("spaced query");
});

test("returns no-results message including the query", async () => {
  const searchFn: SearchFunction = async () => [];
  const tool = createWebSearchTool(searchFn);
  const result = await execute(tool, { query: "obscure query" });

  expect(result).toMatch(/no results/i);
  expect(result).toContain("obscure query");
});

test("handles search function errors gracefully", async () => {
  const searchFn: SearchFunction = async () => {
    throw new Error("API rate limited");
  };
  const tool = createWebSearchTool(searchFn);
  const result = await execute(tool, { query: "test" });

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
  const result = await execute(tool, { query: "test" });

  expect(result).toContain("1.");
  expect(result).toContain("2.");
  expect(result).toContain("3.");
});

test("handles non-Error thrown values in search function", async () => {
  const searchFn = async () => {
    throw "plain string error";
  };
  const tool = createWebSearchTool(searchFn as SearchFunction);
  const result = await execute(tool, { query: "test" });
  expect(result).toMatch(/error/i);
  expect(result).toContain("plain string error");
});

test("formats each result with indented snippet and URL", async () => {
  const searchFn: SearchFunction = async () => [
    { title: "Only", snippet: "the snippet", url: "https://x.com" },
  ];
  const tool = createWebSearchTool(searchFn);
  const result = await execute(tool, { query: "test" });
  expect(result).toBe("1. Only\n   the snippet\n   https://x.com");
});

test("includes query text in error message on failure", async () => {
  const searchFn: SearchFunction = async () => {
    throw new Error("timeout");
  };
  const tool = createWebSearchTool(searchFn);
  const result = await execute(tool, { query: "specific query" });
  expect(result).toContain("specific query");
  expect(result).toContain("timeout");
});
