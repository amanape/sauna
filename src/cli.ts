// CLI Adapter — argument parsing and entry point
// Traces to: specs/cli-simplification.md

import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import { Agent } from "@mastra/core/agent";
import type { Readable, Writable } from "node:stream";

import { validateApiKey } from "./model-resolution";
import { createTools } from "./tool-factory";
import { createWorkspace } from "./workspace-factory";
import { createDiscoveryAgent } from "./agent-definitions";

export { DEFAULT_MODEL, getProviderFromModel, getApiKeyEnvVar, validateApiKey } from "./model-resolution";
export { createTools, resolveSearchFn } from "./tool-factory";
export { createWorkspace, type WorkspaceOptions } from "./workspace-factory";
export { createDiscoveryAgent, createResearchAgent, type DiscoveryAgentConfig, type ResearchAgentConfig } from "./agent-definitions";

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
