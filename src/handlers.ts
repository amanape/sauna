// Subcommand handlers — one function per subcommand

import type { Agent } from "@mastra/core/agent";
import type { Writable } from "node:stream";

import type { PlanArgs } from "./cli";
import type { Environment } from "./init-environment";
import type { FixedCountConfig } from "./loop-runner";
import type { PlanningAgentConfig } from "./agent-definitions";

export interface HandlePlanDeps {
  args: PlanArgs;
  env: Environment;
  output: Writable;
  createPlanningAgent: (config: PlanningAgentConfig) => Promise<Agent>;
  runFixedCount: (config: FixedCountConfig) => Promise<void>;
}

export async function handlePlan(deps: HandlePlanDeps): Promise<void> {
  const { args, env, output, createPlanningAgent, runFixedCount } = deps;
  const { mcp, tools, workspace, researcher } = env;

  const agent = await createPlanningAgent({
    model: args.model,
    tools,
    workspace,
    researcher,
    jobId: args.job,
  });

  output.write(`Starting planning phase for job "${args.job}"...\n`);

  try {
    await runFixedCount({
      agent,
      iterations: args.iterations,
      message: "Begin planning.",
      onProgress: (current, total) => {
        output.write(`Planning iteration ${current}/${total}\n`);
      },
      onOutput: (chunk) => {
        output.write(chunk);
      },
    });

    output.write("Planning phase complete.\n");
  } finally {
    await mcp.disconnect();
  }
}
