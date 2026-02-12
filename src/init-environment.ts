// Shared environment initialization for all subcommand handlers

import type { Agent, ToolsInput } from "@mastra/core/agent";
import type { Workspace } from "@mastra/core/workspace";
import type { MCPClient } from "@mastra/mcp";

import { validateApiKey } from "./model-resolution";
import { createMcpClient, validateTavilyApiKey } from "./mcp-client";
import { createWorkspace } from "./workspace-factory";
import { createResearchAgent } from "./agent-definitions";

export interface InitEnvironmentConfig {
  codebase: string;
  model?: string;
  env: Record<string, string | undefined>;
}

export interface Environment {
  mcp: MCPClient;
  tools: ToolsInput;
  workspace: Workspace;
  researcher: Agent;
}

export async function initEnvironment(config: InitEnvironmentConfig): Promise<Environment> {
  validateApiKey(config.env, config.model);
  validateTavilyApiKey(config.env);

  const mcp = createMcpClient(config.env);
  const tools = await mcp.listTools();
  const workspace = createWorkspace(config.codebase, {
    skillsPaths: [".sauna/skills"],
  });

  const researcher = createResearchAgent({
    model: config.model,
    tools,
    workspace,
  });

  return { mcp, tools, workspace, researcher };
}
