import { test, expect, describe } from "bun:test";
import { buildMcpServerConfigs, createMcpClient } from "./mcp-client";
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

describe("createMcpClient", () => {
  test("returns an MCPClient instance", () => {
    const client = createMcpClient({ TAVILY_API_KEY: "tvly-test" });
    expect(client).toBeInstanceOf(MCPClient);
  });
});
