import { test, expect, describe, mock, beforeEach } from "bun:test";
import type { Agent } from "@mastra/core/agent";

// Mock modules before importing the function under test
const mockListTools = mock(async () => ({
  tavily_web_search: { execute: async () => "results" },
  context7_lookup: { execute: async () => "docs" },
}));
const mockDisconnect = mock(async () => {});

mock.module("./mcp-client", () => ({
  createMcpClient: () => ({
    listTools: mockListTools,
    disconnect: mockDisconnect,
  }),
  validateTavilyApiKey: (env: Record<string, string | undefined>) => {
    if (!env.TAVILY_API_KEY) throw new Error("TAVILY_API_KEY environment variable is required");
  },
}));

// Import after mocking
const { initEnvironment } = await import("./init-environment");
const { validateApiKey } = await import("./model-resolution");

const validEnv = {
  ANTHROPIC_API_KEY: "test-key",
  TAVILY_API_KEY: "tvly-test",
};

describe("initEnvironment", () => {
  beforeEach(() => {
    mockListTools.mockClear();
    mockDisconnect.mockClear();
  });

  test("throws when model provider API key is missing", async () => {
    await expect(
      initEnvironment({ codebase: "/tmp", env: { TAVILY_API_KEY: "tvly-test" } }),
    ).rejects.toThrow("ANTHROPIC_API_KEY");
  });

  test("throws when TAVILY_API_KEY is missing", async () => {
    await expect(
      initEnvironment({ codebase: "/tmp", env: { ANTHROPIC_API_KEY: "test-key" } }),
    ).rejects.toThrow("TAVILY_API_KEY");
  });

  test("returns mcp client, tools, workspace, and researcher", async () => {
    const result = await initEnvironment({ codebase: "/tmp", env: validEnv });

    expect(result.mcp).toBeDefined();
    expect(result.tools).toBeDefined();
    expect(result.workspace).toBeDefined();
    expect(result.researcher).toBeDefined();
  });

  test("lists tools from the MCP client", async () => {
    await initEnvironment({ codebase: "/tmp", env: validEnv });
    expect(mockListTools).toHaveBeenCalledTimes(1);
  });

  test("researcher agent uses provided model", async () => {
    const result = await initEnvironment({
      codebase: "/tmp",
      model: "openai/gpt-4",
      env: { OPENAI_API_KEY: "test-key", TAVILY_API_KEY: "tvly-test" },
    });

    expect((result.researcher as Agent).model).toBe("openai/gpt-4");
  });

  test("researcher agent defaults to anthropic model when none specified", async () => {
    const result = await initEnvironment({ codebase: "/tmp", env: validEnv });
    expect((result.researcher as Agent).model).toBe("anthropic/claude-opus-4-6");
  });

  test("workspace is rooted at the provided codebase path", async () => {
    const result = await initEnvironment({ codebase: "/my/project", env: validEnv });
    // Workspace filesystem should be rooted at codebase
    expect(result.workspace).toBeDefined();
  });

  test("returned mcp client supports disconnect for cleanup", async () => {
    const result = await initEnvironment({ codebase: "/tmp", env: validEnv });
    await result.mcp.disconnect();
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});
