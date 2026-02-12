// Subcommand handlers — one function per subcommand

import type { Agent } from "@mastra/core/agent";
import type { Writable } from "node:stream";
import { join } from "node:path";

import type { PlanArgs, BuildArgs, RunArgs } from "./cli";
import type { Environment } from "./init-environment";
import type { FixedCountConfig, UntilDoneConfig } from "./loop-runner";
import type { PlanningAgentConfig, BuilderAgentConfig } from "./agent-definitions";
import type { HookResult } from "./hook-executor";
import type { JobPipelineDeps } from "./job-pipeline";

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
    });

    output.write("Planning phase complete.\n");
  } finally {
    await mcp.disconnect();
  }
}

export interface HandleBuildDeps {
  args: BuildArgs;
  env: Environment;
  output: Writable;
  createBuilderAgent: (config: BuilderAgentConfig) => Promise<Agent>;
  runUntilDone: (config: UntilDoneConfig) => Promise<void>;
  loadHooks: (projectRoot: string) => Promise<string[]>;
  runHooks: (hooks: string[], cwd: string) => Promise<HookResult>;
}

export async function handleBuild(deps: HandleBuildDeps): Promise<void> {
  const { args, env, output, createBuilderAgent, runUntilDone, loadHooks, runHooks } = deps;
  const { mcp, tools, workspace, researcher } = env;

  const agent = await createBuilderAgent({
    model: args.model,
    tools,
    workspace,
    researcher,
    jobId: args.job,
  });

  const hooks = await loadHooks(args.codebase);
  const tasksPath = join(args.codebase, ".sauna", "jobs", args.job, "tasks.md");

  output.write(`Starting build phase for job "${args.job}"...\n`);

  try {
    await runUntilDone({
      agent,
      message: "Begin building.",
      readTasksFile: () => Bun.file(tasksPath).text(),
      hooks,
      runHooks,
      hookCwd: args.codebase,
      onProgress: (iteration, remaining) => {
        output.write(`Build iteration ${iteration} — ${remaining} tasks remaining\n`);
      },
    });

    output.write("Build phase complete.\n");
  } finally {
    await mcp.disconnect();
  }
}

export interface HandleRunDeps {
  args: RunArgs;
  env: Environment;
  output: Writable;
  createPlanningAgent: (config: PlanningAgentConfig) => Promise<Agent>;
  createBuilderAgent: (config: BuilderAgentConfig) => Promise<Agent>;
  runJobPipeline: (deps: JobPipelineDeps) => Promise<void>;
  loadHooks: (projectRoot: string) => Promise<string[]>;
  runHooks: (hooks: string[], cwd: string) => Promise<HookResult>;
}

export async function handleRun(deps: HandleRunDeps): Promise<void> {
  const { args, env, output, createPlanningAgent, createBuilderAgent, runJobPipeline, loadHooks, runHooks } = deps;
  const { mcp, tools, workspace, researcher } = env;

  const hooks = await loadHooks(args.codebase);
  const tasksPath = join(args.codebase, ".sauna", "jobs", args.job, "tasks.md");

  try {
    await runJobPipeline({
      createPlanner: () =>
        createPlanningAgent({
          model: args.model,
          tools,
          workspace,
          researcher,
          jobId: args.job,
        }),
      createBuilder: () =>
        createBuilderAgent({
          model: args.model,
          tools,
          workspace,
          researcher,
          jobId: args.job,
        }),
      readTasksFile: () => Bun.file(tasksPath).text(),
      output,
      plannerIterations: args.iterations,
      jobId: args.job,
      hooks,
      runHooks,
      hookCwd: args.codebase,
    });
  } finally {
    await mcp.disconnect();
  }
}
