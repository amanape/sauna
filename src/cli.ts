// CLI Adapter — argument parsing and entry point

import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { Agent } from "@mastra/core/agent";
import type { LLMStepResult } from "@mastra/core/agent";
import type { Readable, Writable } from "node:stream";

import { validateApiKey } from "./model-resolution";
import { createMcpClient, validateTavilyApiKey } from "./mcp-client";
import { createWorkspace } from "./workspace-factory";
import { createDiscoveryAgent, createResearchAgent, createPlanningAgent, createBuilderAgent } from "./agent-definitions";
import { SessionRunner } from "./session-runner";
import type { OnFinishCallback } from "./session-runner";
import { runJobPipeline } from "./job-pipeline";
import { loadHooks } from "./hooks-loader";
import { runHooks } from "./hook-executor";

export type Subcommand = "discover" | "plan" | "build" | "run";

export interface DiscoverArgs {
  subcommand: "discover";
  codebase: string;
  output: string;
  model?: string;
}

export interface PlanArgs {
  subcommand: "plan";
  codebase: string;
  job: string;
  iterations: number;
  model?: string;
}

export interface BuildArgs {
  subcommand: "build";
  codebase: string;
  job: string;
  model?: string;
}

export interface RunArgs {
  subcommand: "run";
  codebase: string;
  job: string;
  iterations: number;
  model?: string;
}

export type CliArgs = DiscoverArgs | PlanArgs | BuildArgs | RunArgs;

const VALID_SUBCOMMANDS: ReadonlySet<string> = new Set(["discover", "plan", "build", "run"]);

function validateJobDir(codebase: string, job: string): void {
  const jobDir = join(codebase, ".sauna", "jobs", job);
  if (!existsSync(jobDir)) {
    throw new Error(
      `Job directory not found: .sauna/jobs/${job}/ (resolved to ${jobDir})`,
    );
  }
}

function validateIterations(raw: string | undefined): number {
  if (raw === undefined) return 1;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error("--iterations must be a positive integer");
  }
  return n;
}

function requireFlag(values: Record<string, unknown>, flag: string, subcommand: string): string {
  const val = values[flag];
  if (!val || typeof val !== "string") {
    throw new Error(`--${flag} <${flag === "codebase" ? "path" : "slug"}> is required for "${subcommand}"`);
  }
  return val;
}

function parseDiscoverArgs(flagArgs: string[]): DiscoverArgs {
  const { values } = parseArgs({
    args: flagArgs,
    options: {
      codebase: { type: "string" },
      output: { type: "string", default: "./jobs/" },
      model: { type: "string" },
    },
    strict: true,
  });

  const codebase = requireFlag(values, "codebase", "discover");

  return {
    subcommand: "discover",
    codebase,
    output: values.output!,
    model: values.model,
  };
}

function parsePlanArgs(flagArgs: string[]): PlanArgs {
  const { values } = parseArgs({
    args: flagArgs,
    options: {
      codebase: { type: "string" },
      job: { type: "string" },
      iterations: { type: "string" },
      model: { type: "string" },
    },
    strict: true,
  });

  const codebase = requireFlag(values, "codebase", "plan");
  const job = requireFlag(values, "job", "plan");
  const iterations = validateIterations(values.iterations);
  validateJobDir(codebase, job);

  return { subcommand: "plan", codebase, job, iterations, model: values.model };
}

function parseBuildArgs(flagArgs: string[]): BuildArgs {
  const { values } = parseArgs({
    args: flagArgs,
    options: {
      codebase: { type: "string" },
      job: { type: "string" },
      model: { type: "string" },
    },
    strict: true,
  });

  const codebase = requireFlag(values, "codebase", "build");
  const job = requireFlag(values, "job", "build");
  validateJobDir(codebase, job);

  return { subcommand: "build", codebase, job, model: values.model };
}

function parseRunArgs(flagArgs: string[]): RunArgs {
  const { values } = parseArgs({
    args: flagArgs,
    options: {
      codebase: { type: "string" },
      job: { type: "string" },
      iterations: { type: "string" },
      model: { type: "string" },
    },
    strict: true,
  });

  const codebase = requireFlag(values, "codebase", "run");
  const job = requireFlag(values, "job", "run");
  const iterations = validateIterations(values.iterations);
  validateJobDir(codebase, job);

  return { subcommand: "run", codebase, job, iterations, model: values.model };
}

export function parseCliArgs(argv: string[]): CliArgs {
  const subcommand = argv[0];

  if (!subcommand || !VALID_SUBCOMMANDS.has(subcommand)) {
    throw new Error(
      `Unknown or missing subcommand: "${subcommand ?? ""}". Valid subcommands: discover, plan, build, run`,
    );
  }

  const flagArgs = argv.slice(1);

  switch (subcommand) {
    case "discover": return parseDiscoverArgs(flagArgs);
    case "plan": return parsePlanArgs(flagArgs);
    case "build": return parseBuildArgs(flagArgs);
    case "run": return parseRunArgs(flagArgs);
    default: throw new Error(`Unknown subcommand: ${subcommand}`);
  }
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
  });

  const researcher = createResearchAgent({
    model: args.model,
    tools,
    workspace,
  });

  switch (args.subcommand) {
    case "discover": {
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

      try {
        await runConversation({
          agent,
          input: process.stdin,
          output: process.stdout,
        });
      } finally {
        await mcp.disconnect();
      }
      break;
    }

    case "plan":
    case "build":
    case "run": {
      const tasksPath = join(args.codebase, ".sauna", "jobs", args.job, "tasks.md");
      const hooks = await loadHooks(args.codebase);
      const plannerIterations = "iterations" in args ? args.iterations : 1;

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
        output: process.stdout,
        plannerIterations,
        jobId: args.job,
        hooks,
        runHooks,
        hookCwd: args.codebase,
      });
      break;
    }
  }
}
