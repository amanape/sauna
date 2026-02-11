import { MCPClient } from "@mastra/mcp";

export interface McpServerConfigs {
  servers: Record<string, { command: string; args?: string[]; env?: Record<string, string> }>;
}

/**
 * Throws if TAVILY_API_KEY is missing or empty.
 * Call at startup to fail fast before the MCP client silently starts without it.
 */
export function validateTavilyApiKey(env: Record<string, string | undefined>): void {
  if (!env.TAVILY_API_KEY) {
    throw new Error("TAVILY_API_KEY environment variable is required");
  }
}

/**
 * Build MCP server configuration from an env record.
 * Pure function — testable without spawning servers.
 */
export function buildMcpServerConfigs(env: Record<string, string | undefined>): McpServerConfigs {
  const tavilyKey = env.TAVILY_API_KEY;

  return {
    servers: {
      tavily: {
        command: "npx",
        args: ["-y", "tavily-mcp@latest"],
        ...(tavilyKey ? { env: { TAVILY_API_KEY: tavilyKey } } : {}),
      },
      context7: {
        command: "npx",
        args: ["-y", "@upstash/context7-mcp"],
      },
    },
  };
}

/**
 * Create a shared MCPClient configured with Tavily (web search) and Context7 (docs lookup).
 * Accepts an env record for testability — never reads process.env directly.
 */
export function createMcpClient(env: Record<string, string | undefined>): MCPClient {
  const config = buildMcpServerConfigs(env);
  return new MCPClient(config);
}
