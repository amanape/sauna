// CLI Adapter — argument parsing and entry point
// Traces to: specs/cli-simplification.md

import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import { Agent } from "@mastra/core/agent";
import { Workspace, LocalFilesystem, LocalSandbox } from "@mastra/core/workspace";
import type { Readable, Writable } from "node:stream";

import { createFileReadTool } from "./tools/file-read";
import { createFileWriteTool } from "./tools/file-write";
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
  codebasePath: string,
  outputPath: string,
  searchFn: SearchFunction = defaultSearchFn,
) {
  return {
    file_read: createFileReadTool(codebasePath),
    file_write: createFileWriteTool(outputPath),
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

      const result = await deps.agent.generate(messages, {
        maxSteps: 50,
        onStepFinish(step) {
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

      messages = [...result.messages];

      if (result.text) {
        deps.output.write(result.text + "\n");
      }
    }
  } finally {
    rl.close();
  }
}

export async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY environment variable is required");
    process.exit(1);
  }

  const tools = createTools(args.codebase, args.output);
  const workspace = createWorkspace(args.codebase);
  const systemPrompt = await Bun.file(
    resolve(import.meta.dirname, "../.sauna/prompts/discovery.md"),
  ).text();

  const modelId = args.model ?? "anthropic/claude-sonnet-4-5-20250929";

  const agent = new Agent({
    id: "discovery",
    name: "discovery",
    instructions: systemPrompt,
    model: modelId,
    tools,
    workspace,
  });

  await runConversation({
    agent,
    input: process.stdin,
    output: process.stdout,
  });
}
