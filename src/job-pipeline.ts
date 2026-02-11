import type { Agent } from "@mastra/core/agent";
import type { Writable } from "node:stream";
import type { HookResult } from "./hook-executor";
import { runFixedCount, runUntilDone } from "./loop-runner";

export interface JobPipelineDeps {
  createPlanner: () => Promise<Agent>;
  createBuilder: () => Promise<Agent>;
  readTasksFile: () => Promise<string>;
  output: Writable;
  plannerIterations: number;
  jobId: string;
  hooks?: string[];
  runHooks?: (hooks: string[], cwd: string) => Promise<HookResult>;
  hookCwd?: string;
  maxHookRetries?: number;
  onHookFailure?: (failedCommand: string, attempt: number, maxRetries: number) => void;
}

export async function runJobPipeline(deps: JobPipelineDeps): Promise<void> {
  const { createPlanner, createBuilder, readTasksFile, output, plannerIterations, jobId, hooks, runHooks, hookCwd, maxHookRetries, onHookFailure } = deps;

  // Phase 1: Planning
  const planner = await createPlanner();
  output.write(`Starting planning phase for job "${jobId}"...\n`);

  await runFixedCount({
    agent: planner,
    iterations: plannerIterations,
    message: "Begin planning.",
    onProgress: (current, total) => {
      output.write(`Planning iteration ${current}/${total}\n`);
    },
    onOutput: (chunk) => {
      output.write(chunk);
    },
  });

  output.write("Planning phase complete.\n");

  // Phase 2: Building
  const builder = await createBuilder();
  output.write("Starting build phase...\n");

  await runUntilDone({
    agent: builder,
    message: "Begin building.",
    readTasksFile,
    hooks,
    runHooks,
    hookCwd,
    maxHookRetries,
    onHookFailure,
    onProgress: (iteration, remaining) => {
      output.write(`Build iteration ${iteration} — ${remaining} tasks remaining\n`);
    },
    onOutput: (chunk) => {
      output.write(chunk);
    },
  });

  output.write(`Job "${jobId}" complete. All tasks done.\n`);
}
