import { Agent } from "@mastra/core/agent";
import type { Workspace } from "@mastra/core/workspace";

import { DEFAULT_MODEL } from "./model-resolution";
import { createTools } from "./tool-factory";

export interface ResearchAgentConfig {
  model?: string;
  tools: ReturnType<typeof createTools>;
  workspace: Workspace;
  maxSteps?: number;
}

export function createResearchAgent(config: ResearchAgentConfig): Agent {
  return new Agent({
    id: "researcher",
    name: "researcher",
    description: "Autonomous research sub-agent that investigates codebases, reads files, runs commands, and searches the web to gather information and return a structured summary.",
    instructions: "You are an autonomous research agent. Investigate the given topic thoroughly using the workspace tools and web search. Read files, explore directories, run commands, and search the web as needed. Return a comprehensive, structured summary of your findings.",
    model: config.model ?? DEFAULT_MODEL,
    tools: config.tools,
    workspace: config.workspace,
    defaultOptions: {
      maxSteps: config.maxSteps ?? 30,
    },
  });
}

export interface DiscoveryAgentConfig {
  systemPrompt: string;
  model?: string;
  tools: ReturnType<typeof createTools>;
  workspace: Workspace;
  outputPath?: string;
}

export function createDiscoveryAgent(config: DiscoveryAgentConfig): Agent {
  let instructions = config.systemPrompt;
  if (config.outputPath) {
    instructions += `\n\n## Output Directory\n\nWrite all output files to the \`${config.outputPath}\` directory.`;
  }

  const researcher = createResearchAgent({
    model: config.model,
    tools: config.tools,
    workspace: config.workspace,
  });

  return new Agent({
    id: "discovery",
    name: "discovery",
    instructions,
    model: config.model ?? DEFAULT_MODEL,
    tools: config.tools,
    workspace: config.workspace,
    agents: { researcher },
  });
}
