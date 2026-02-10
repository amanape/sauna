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
            const output = tr.payload.result;
            if (
              typeof output === "string" &&
              output.startsWith("Wrote ")
            ) {
              deps.output.write(output + "\n");
            }
          }
        },
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

export interface DiscoveryAgentConfig {
  systemPrompt: string;
  model?: string;
  tools: ReturnType<typeof createTools>;
  workspace: Workspace;
}

export function createDiscoveryAgent(config: DiscoveryAgentConfig): Agent {
  return new Agent({
    id: "discovery",
    name: "discovery",
    instructions: config.systemPrompt,
    model: config.model ?? DEFAULT_MODEL,
    tools: config.tools,
    workspace: config.workspace,
  });
}

export async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY environment variable is required");
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
  });

  await runConversation({
    agent,
    input: process.stdin,
    output: process.stdout,
  });
}
