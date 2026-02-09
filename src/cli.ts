// CLI Adapter — argument parsing and entry point
// Traces to: specs/cli-adapter.md

import { parseArgs } from "node:util";

import { createFileReadTool } from "./tools/file-read";
import { createFileWriteTool } from "./tools/file-write";
import { createWebSearchTool, type SearchFunction } from "./tools/web-search";

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
    createFileWriteTool(outputPath),
    createWebSearchTool(searchFn),
  ];
}

export async function main(): Promise<void> {
  throw new Error("main() pending rewrite — see Priority 3 in sdk-migration tasks");
}
