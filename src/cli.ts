// CLI Adapter — argument parsing and entry point
// Traces to: specs/cli-simplification.md

import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import { generateText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { LanguageModel, ModelMessage, ToolSet } from "ai";
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

export interface ConversationDeps {
  model: LanguageModel;
  tools: ToolSet;
  systemPrompt: string;
  input: Readable;
  output: Writable;
}

export async function runConversation(deps: ConversationDeps): Promise<void> {
  const messages: ModelMessage[] = [];

  const rl = createInterface({
    input: deps.input,
    output: deps.output,
  });

  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      messages.push({ role: "user", content: trimmed });

      const result = await generateText({
        model: deps.model,
        system: deps.systemPrompt,
        tools: deps.tools,
        stopWhen: stepCountIs(50),
        messages,
        onStepFinish({ toolResults }) {
          for (const tr of toolResults) {
            if (
              typeof tr.output === "string" &&
              tr.output.startsWith("Wrote ")
            ) {
              deps.output.write(tr.output + "\n");
            }
          }
        },
      });

      messages.push(...result.response.messages);

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
  const systemPrompt = await Bun.file(
    resolve(import.meta.dirname, "../.sauna/prompts/discovery.md"),
  ).text();

  const modelId = args.model ?? "claude-sonnet-4-5-20250929";

  await runConversation({
    model: anthropic(modelId),
    tools,
    systemPrompt,
    input: process.stdin,
    output: process.stdout,
  });
}
