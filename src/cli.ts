// CLI Adapter — argument parsing and entry point
// Traces to: specs/cli-adapter.md

import { parseArgs } from "node:util";
import { createInterface } from "node:readline";
import { resolve, dirname, join } from "node:path";
import { ConversationEngine } from "./engine";
import { AnthropicProvider } from "./providers/anthropic";
import { createFileReadTool } from "./tools/file-read";
import { createFileSearchTool } from "./tools/file-search";
import { createWebSearchTool, type SearchFunction } from "./tools/web-search";
import { createWriteJtbdTool, createWriteSpecTool } from "./tools/output-writer";
import { createSessionCompleteTool } from "./tools/session-complete";

export interface CliArgs {
  codebase: string;
  output: string;
  provider: string;
  model?: string;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      codebase: { type: "string" },
      output: { type: "string", default: "./jobs/" },
      provider: { type: "string", default: "anthropic" },
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
    provider: values.provider!,
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
  return [
    createFileReadTool(codebasePath),
    createFileSearchTool(codebasePath),
    createWebSearchTool(searchFn),
    createWriteJtbdTool(outputPath),
    createWriteSpecTool(outputPath),
    createSessionCompleteTool(),
  ];
}

export async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Error: ANTHROPIC_API_KEY environment variable is required");
    process.exit(1);
  }

  const codebasePath = resolve(args.codebase);
  const provider = new AnthropicProvider({
    apiKey,
    model: args.model,
  });
  const tools = createTools(codebasePath, args.output);
  const systemPrompt = await Bun.file(
    join(dirname(import.meta.dir), ".sauna", "prompts", "discovery.md"),
  ).text();
  const engine = new ConversationEngine(provider, tools, systemPrompt, codebasePath);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = (query: string): Promise<string> =>
    new Promise((resolve) => rl.question(query, resolve));

  console.log("Discovery Agent — describe the problem you want to solve.\n");

  let firstTurn = true;

  rl.on("close", () => {
    console.log("\nSession ended.");
    process.exit(0);
  });

  while (true) {
    const input = await prompt("> ");
    if (!input.trim()) continue;

    const output = firstTurn
      ? await engine.start(input)
      : await engine.respond(input);
    firstTurn = false;

    if (output.files_written) {
      for (const file of output.files_written) {
        console.log(`\nWrote ${file}`);
      }
    }

    console.log(`\n${output.text}\n`);

    if (output.done) {
      console.log("Session complete.");
      rl.close();
      break;
    }
  }
}
