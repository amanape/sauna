// CLI Adapter — argument parsing and entry point
// Traces to: specs/cli-adapter.md

import { parseArgs } from "node:util";

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
