import { test, expect, describe } from "bun:test";
import { buildMcpServerConfigs, createMcpClient, validateTavilyApiKey } from "./mcp-client";
import { MCPClient } from "@mastra/mcp";

describe("buildMcpServerConfigs", () => {
  test("includes tavily server with API key from env", () => {
    const config = buildMcpServerConfigs({ TAVILY_API_KEY: "tvly-test-123" });

    expect(config.servers.tavily).toEqual({
      command: "npx",
      args: ["-y", "tavily-mcp@latest"],
      env: { TAVILY_API_KEY: "tvly-test-123" },
    });
  });

  test("tavily server omits env when TAVILY_API_KEY is missing", () => {
    const config = buildMcpServerConfigs({});

    expect(config.servers.tavily).toEqual({
      command: "npx",
      args: ["-y", "tavily-mcp@latest"],
    });
    expect(config.servers.tavily.env).toBeUndefined();
  });

  test("includes context7 server with stdio transport", () => {
    const config = buildMcpServerConfigs({});

    expect(config.servers.context7).toEqual({
      command: "npx",
      args: ["-y", "@upstash/context7-mcp"],
    });
  });

  test("configures exactly two servers", () => {
    const config = buildMcpServerConfigs({ TAVILY_API_KEY: "key" });
    expect(Object.keys(config.servers)).toEqual(["tavily", "context7"]);
  });
});

describe("validateTavilyApiKey", () => {
  test("does not throw when TAVILY_API_KEY is present", () => {
    expect(() => validateTavilyApiKey({ TAVILY_API_KEY: "tvly-test" })).not.toThrow();
  });

  test("throws when TAVILY_API_KEY is missing", () => {
    expect(() => validateTavilyApiKey({})).toThrow("TAVILY_API_KEY");
    expect(() => validateTavilyApiKey({})).toThrow("is required");
  });

  test("throws when TAVILY_API_KEY is empty string", () => {
    expect(() => validateTavilyApiKey({ TAVILY_API_KEY: "" })).toThrow("TAVILY_API_KEY");
  });
});

describe("createMcpClient", () => {
  test("returns an MCPClient instance", () => {
    const client = createMcpClient({ TAVILY_API_KEY: "tvly-test" });
    expect(client).toBeInstanceOf(MCPClient);
  });
});

describe("MCP tool namespacing (integration)", () => {
  const tavilyKey = process.env.TAVILY_API_KEY;
  const skip = !tavilyKey;

  // These tests spawn real MCP server subprocesses via stdio transport.
  // They require TAVILY_API_KEY in the environment and network access.
  // Skipped automatically in environments where the key is unavailable.

  test.skipIf(skip)(
    "listTools returns tool names prefixed by server name",
    async () => {
      const client = createMcpClient({ TAVILY_API_KEY: tavilyKey! });
      try {
        const tools = await client.listTools();
        const toolNames = Object.keys(tools);

        expect(toolNames.length).toBeGreaterThan(0);

        const tavilyTools = toolNames.filter((n) => n.startsWith("tavily_"));
        const context7Tools = toolNames.filter((n) => n.startsWith("context7_"));

        expect(tavilyTools.length).toBeGreaterThan(0);
        expect(context7Tools.length).toBeGreaterThan(0);

        // Every tool must belong to one of the configured servers
        for (const name of toolNames) {
          expect(
            name.startsWith("tavily_") || name.startsWith("context7_"),
          ).toBe(true);
        }
      } finally {
        await client.disconnect();
      }
    },
    { timeout: 60_000 },
  );

  test.skipIf(skip)(
    "tavily tools and context7 tools have no name collisions",
    async () => {
      const client = createMcpClient({ TAVILY_API_KEY: tavilyKey! });
      try {
        const tools = await client.listTools();
        const toolNames = Object.keys(tools);

        // Since names are prefixed, duplicates are impossible — but verify
        // the set size equals the array length to confirm no silent overwrites.
        expect(new Set(toolNames).size).toBe(toolNames.length);
      } finally {
        await client.disconnect();
      }
    },
    { timeout: 60_000 },
  );
});
