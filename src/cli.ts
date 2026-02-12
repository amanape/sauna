// CLI Adapter — argument parsing and entry point

import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { Agent } from "@mastra/core/agent";
import type { Readable, Writable } from "node:stream";

import { validateApiKey } from "./model-resolution";
import { createTools, resolveSearchFn } from "./tool-factory";
import { createWorkspace } from "./workspace-factory";
import { createDiscoveryAgent, createResearchAgent, createPlanningAgent, createBuilderAgent } from "./agent-definitions";
import { SessionRunner } from "./session-runner";
import { runJobPipeline } from "./job-pipeline";
import { loadHooks } from "./hooks-loader";
import { runHooks } from "./hook-executor";

export interface CliArgs {
  codebase: string;
  output: string;
  model?: string;
  job?: string;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      codebase: { type: "string" },
      output: { type: "string", default: "./jobs/" },
      model: { type: "string" },
      job: { type: "string" },
    },
    strict: true,
  });

  if (!values.codebase) {
    throw new Error("--codebase <path> is required");
  }

  if (values.job) {
    const jobDir = join(values.codebase, ".sauna", "jobs", values.job);
    if (!existsSync(jobDir)) {
      throw new Error(
        `Job directory not found: .sauna/jobs/${values.job}/ (resolved to ${jobDir})`,
      );
    }
  }

  return {
    codebase: values.codebase,
    output: values.output!,
    model: values.model,
    job: values.job,
  };
}

export interface ConversationDeps {
  agent: Agent;
  input: Readable;
  output: Writable;
  // TODO: MastraOnFinishCallback is not publicly exported from @mastra/core.
  // Replace `any` when Mastra exposes it.
  onFinish?: (event: any) => Promise<void> | void;
}

export async function runConversation(deps: ConversationDeps): Promise<void> {
  const session = new SessionRunner({
    agent: deps.agent,
    maxSteps: 50,
    // TODO: LLMStepResult is not publicly exported from @mastra/core.
    // Replace `any` when Mastra exposes it.
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
  } catch (e: unknown) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }

  const searchFn = resolveSearchFn(process.env as Record<string, string | undefined>);
  const tools = createTools(searchFn);
  const workspace = createWorkspace(args.codebase, {
    skillsPaths: [".sauna/skills"],
  });

  const researcher = createResearchAgent({
    model: args.model,
    tools,
    workspace,
  });

  if (args.job) {
    const tasksPath = join(args.codebase, ".sauna", "jobs", args.job, "tasks.md");
    const hooks = await loadHooks(args.codebase);

    await runJobPipeline({
      createPlanner: () =>
        createPlanningAgent({
          model: args.model,
          tools,
          workspace,
          researcher,
          jobId: args.job!,
        }),
      createBuilder: () =>
        createBuilderAgent({
          model: args.model,
          tools,
          workspace,
          researcher,
          jobId: args.job!,
        }),
      readTasksFile: () => Bun.file(tasksPath).text(),
      output: process.stdout,
      plannerIterations: 1,
      jobId: args.job,
      hooks,
      runHooks,
      hookCwd: args.codebase,
    });
    return;
  }

  const systemPrompt = await Bun.file(
    resolve(import.meta.dirname, "../.sauna/prompts/discovery.md"),
  ).text();

  const agent = createDiscoveryAgent({
    systemPrompt,
    model: args.model,
    tools,
    workspace,
    researcher,
    outputPath: args.output,
  });

  await runConversation({
    agent,
    input: process.stdin,
    output: process.stdout,
  });
}
