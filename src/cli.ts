// CLI Adapter — argument parsing and entry point

import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import { Agent } from "@mastra/core/agent";
import type { LLMStepResult } from "@mastra/core/agent";
import type { Readable, Writable } from "node:stream";

import { validateApiKey } from "./model-resolution";
import { createMcpClient, validateTavilyApiKey } from "./mcp-client";
import { createWorkspace } from "./workspace-factory";
import { createDiscoveryAgent } from "./agent-definitions";
import { SessionRunner } from "./session-runner";
import type { OnFinishCallback } from "./session-runner";

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
  onFinish?: OnFinishCallback;
}

export async function runConversation(deps: ConversationDeps): Promise<void> {
  const session = new SessionRunner({
    agent: deps.agent,
    maxSteps: 50,
    onStepFinish(step: LLMStepResult) {
      for (const tr of step.toolResults) {
        const result = tr.payload.result as Record<string, unknown> | undefined;
        if (
          tr.payload.toolName === "mastra_workspace_write_file" &&
          result?.success
        ) {
          deps.output.write(`Wrote ${result.path}\n`);
        }
      }
    },
    ...(deps.onFinish ? { onFinish: deps.onFinish } : {}),
  });

  const rl = createInterface({
    input: deps.input,
    output: deps.output,
  });

  try {
    for await (const line of rl) {
      const streamResult = await session.sendMessage(line);
      if (!streamResult) continue;

      for await (const chunk of streamResult.textStream) {
        deps.output.write(chunk);
      }
      deps.output.write("\n");

      await streamResult.getFullOutput();
    }
  } finally {
    rl.close();
  }
}

export async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));

  try {
    validateApiKey(process.env, args.model);
    validateTavilyApiKey(process.env);
  } catch (e: unknown) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }

  const mcp = createMcpClient(process.env as Record<string, string | undefined>);
  const tools = await mcp.listTools();
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

  try {
    await runConversation({
      agent,
      input: process.stdin,
      output: process.stdout,
    });
  } finally {
    await mcp.disconnect();
  }
}
