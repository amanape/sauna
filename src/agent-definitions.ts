import { resolve } from "node:path";

import { Agent } from "@mastra/core/agent";
import type { ToolsInput } from "@mastra/core/agent";
import type { Workspace } from "@mastra/core/workspace";

import { DEFAULT_MODEL } from "./model-resolution";

export interface ResearchAgentConfig {
  model?: string;
  tools: ToolsInput;
  workspace: Workspace;
  maxSteps?: number;
}

export function createResearchAgent(config: ResearchAgentConfig): Agent {
  return new Agent({
    id: "researcher",
    name: "researcher",
    description: "Autonomous research sub-agent that investigates codebases, reads files, runs commands, and searches the web to gather information and return a structured summary.",
    instructions: {
      role: "system",
      content: "You are an autonomous research agent. Investigate the given topic thoroughly using the workspace tools, web search, and documentation lookup. Read files, explore directories, run commands, search the web, and look up library documentation as needed. Return a comprehensive, structured summary of your findings.",
      providerOptions: {
        anthropic: {
          cacheControl: { type: "ephemeral" },
        },
      },
    },
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
  tools: ToolsInput;
  workspace: Workspace;
  researcher: Agent;
  outputPath?: string;
}

export function createDiscoveryAgent(config: DiscoveryAgentConfig): Agent {
  let content = config.systemPrompt;
  if (config.outputPath) {
    content += `\n\n## Output Directory\n\nWrite all output files to the \`${config.outputPath}\` directory.`;
  }

  return new Agent({
    id: "discovery",
    name: "discovery",
    instructions: {
      role: "system",
      content,
      providerOptions: {
        anthropic: {
          cacheControl: { type: "ephemeral" },
        },
      },
    },
    model: config.model ?? DEFAULT_MODEL,
    tools: config.tools,
    workspace: config.workspace,
    agents: { researcher: config.researcher },
  });
}

export interface PlanningAgentConfig {
  model?: string;
  tools: ToolsInput;
  workspace: Workspace;
  researcher: Agent;
  jobId: string;
}

export async function createPlanningAgent(config: PlanningAgentConfig): Promise<Agent> {
  const promptPath = resolve(import.meta.dirname, "../.sauna/prompts/plan.md");
  const raw = await Bun.file(promptPath).text();
  const instructions = raw.replaceAll("${JOB_ID}", config.jobId);

  return new Agent({
    id: "planner",
    name: "planner",
    instructions,
    model: config.model ?? DEFAULT_MODEL,
    tools: config.tools,
    workspace: config.workspace,
    agents: { researcher: config.researcher },
  });
}

export interface BuilderAgentConfig {
  model?: string;
  tools: ToolsInput;
  workspace: Workspace;
  researcher: Agent;
  jobId: string;
}

export async function createBuilderAgent(config: BuilderAgentConfig): Promise<Agent> {
  const promptPath = resolve(import.meta.dirname, "../.sauna/prompts/build.md");
  const raw = await Bun.file(promptPath).text();
  const instructions = raw.replaceAll("${JOB_ID}", config.jobId);

  return new Agent({
    id: "builder",
    name: "builder",
    instructions,
    model: config.model ?? DEFAULT_MODEL,
    tools: config.tools,
    workspace: config.workspace,
    agents: { researcher: config.researcher },
  });
}
