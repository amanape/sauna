// CLI Adapter — argument parsing and entry point
// Traces to: specs/cli-simplification.md

import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import { Agent } from "@mastra/core/agent";
import { Workspace, LocalFilesystem, LocalSandbox } from "@mastra/core/workspace";
import type { Readable, Writable } from "node:stream";

import { createWebSearchTool, type SearchFunction } from "./tools/web-search";

export interface CliArgs {
  codebase: string;
  output: string;
  model?: string;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      codebase: { type: "string" },
      output: { type: "string", default: "./jobs/" },
      model: { type: "string" },
    },
    strict: true,
  });

  if (!values.codebase) {
    throw new Error("--codebase <path> is required");
  }

  return {
    codebase: values.codebase,
    output: values.output!,
    model: values.model,
  };
}

const defaultSearchFn: SearchFunction = async () => {
  throw new Error("Web search is not configured");
};

export function createTools(
  searchFn: SearchFunction = defaultSearchFn,
) {
  return {
    web_search: createWebSearchTool(searchFn),
  };
}

export function createWorkspace(codebasePath: string): Workspace {
  return new Workspace({
    filesystem: new LocalFilesystem({
      basePath: codebasePath,
      contained: true,
    }),
    sandbox: new LocalSandbox({
      workingDirectory: codebasePath,
    }),
  });
}

export interface ConversationDeps {
  agent: Agent;
  input: Readable;
  output: Writable;
  onFinish?: (event: any) => Promise<void> | void;
}

export async function runConversation(deps: ConversationDeps): Promise<void> {
  let messages: any[] = [];

  const rl = createInterface({
    input: deps.input,
    output: deps.output,
  });

  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      messages.push({ role: "user", content: trimmed });

      const streamResult = await deps.agent.stream(messages, {
        maxSteps: 50,
        onStepFinish(step: any) {
          for (const tr of step.toolResults) {
            if (
              tr.payload.toolName === "mastra_workspace_write_file" &&
              tr.payload.result?.success
            ) {
              deps.output.write(`Wrote ${tr.payload.result.path}\n`);
            }
          }
        },
        ...(deps.onFinish ? { onFinish: deps.onFinish } : {}),
      });

      for await (const chunk of streamResult.textStream) {
        deps.output.write(chunk);
      }
      deps.output.write("\n");

      const fullOutput = await streamResult.getFullOutput();
      messages = [...fullOutput.messages];
    }
  } finally {
    rl.close();
  }
}

export const DEFAULT_MODEL = "anthropic/claude-sonnet-4-5-20250929";

export function getProviderFromModel(model?: string): string {
  const m = model ?? DEFAULT_MODEL;
  const slashIndex = m.indexOf("/");
  if (slashIndex === -1) return "anthropic";
  return m.slice(0, slashIndex);
}

export function getApiKeyEnvVar(provider: string): string {
  return `${provider.toUpperCase()}_API_KEY`;
}

export function validateApiKey(model?: string): string {
  const provider = getProviderFromModel(model);
  const envVar = getApiKeyEnvVar(provider);
  if (!process.env[envVar]) {
    throw new Error(`${envVar} environment variable is required`);
  }
  return envVar;
}

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

export async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));

  try {
    validateApiKey(args.model);
  } catch (e: any) {
    console.error(e.message);
    process.exit(1);
  }

  const tools = createTools();
  const workspace = createWorkspace(args.codebase);
  const systemPrompt = await Bun.file(
    resolve(import.meta.dirname, "../.sauna/prompts/discovery.md"),
  ).text();

  const agent = createDiscoveryAgent({
    systemPrompt,
    model: args.model,
    tools,
    workspace,
    outputPath: args.output,
  });

  await runConversation({
    agent,
    input: process.stdin,
    output: process.stdout,
  });
}
