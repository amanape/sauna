// CLI Adapter — argument parsing and entry point
// Traces to: specs/cli-simplification.md

import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import { Agent } from "@mastra/core/agent";
import { Workspace, LocalFilesystem, LocalSandbox } from "@mastra/core/workspace";
import type { Readable, Writable } from "node:stream";

import { OutputConstrainedFilesystem } from "./output-constrained-filesystem";
import { DEFAULT_MODEL, validateApiKey } from "./model-resolution";
import { createTools } from "./tool-factory";

export { DEFAULT_MODEL, getProviderFromModel, getApiKeyEnvVar, validateApiKey } from "./model-resolution";
export { createTools, resolveSearchFn } from "./tool-factory";

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

export interface WorkspaceOptions {
  skillsPaths?: string[];
  outputDir?: string;
}

export function createWorkspace(codebasePath: string, options?: WorkspaceOptions): Workspace {
  const baseFs = new LocalFilesystem({
    basePath: codebasePath,
    contained: true,
  });
  const filesystem = options?.outputDir
    ? new OutputConstrainedFilesystem(baseFs, options.outputDir)
    : baseFs;

  return new Workspace({
    filesystem,
    sandbox: new LocalSandbox({
      workingDirectory: codebasePath,
    }),
    ...(options?.skillsPaths ? { skills: options.skillsPaths } : {}),
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
  const workspace = createWorkspace(args.codebase, {
    skillsPaths: [".sauna/skills"],
    outputDir: args.output,
  });
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
