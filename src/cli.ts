// CLI Adapter — argument parsing and entry point

import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { Agent } from "@mastra/core/agent";
import type { LLMStepResult } from "@mastra/core/agent";
import type { Readable, Writable } from "node:stream";
import type { ChunkType } from "@mastra/core/stream";

import { createDiscoveryAgent, createPlanningAgent, createBuilderAgent } from "./agent-definitions";
import { initEnvironment } from "./init-environment";
import { SessionRunner, type OnFinishCallback } from "./session-runner";
import { runJobPipeline } from "./job-pipeline";
import { runFixedCount, runUntilDone } from "./loop-runner";
import { loadHooks } from "./hooks-loader";
import { runHooks } from "./hook-executor";
import { handlePlan, handleBuild, handleRun } from "./handlers";
import { createActivityReporter } from "./activity-reporter";
import { ExecutionMetrics } from "./execution-metrics";
import { createActivitySpinner } from "./terminal-formatting";

export type Subcommand = "discover" | "plan" | "build" | "run";

export interface DiscoverArgs {
  subcommand: "discover";
  codebase: string;
  output: string;
  model?: string;
  verbose: boolean;
}

export interface PlanArgs {
  subcommand: "plan";
  codebase: string;
  job: string;
  iterations: number;
  model?: string;
  verbose: boolean;
}

export interface BuildArgs {
  subcommand: "build";
  codebase: string;
  job: string;
  model?: string;
  verbose: boolean;
}

export interface RunArgs {
  subcommand: "run";
  codebase: string;
  job: string;
  iterations: number;
  model?: string;
  verbose: boolean;
}

export interface HelpResult {
  subcommand: "help";
  text: string;
}

export type CliArgs = DiscoverArgs | PlanArgs | BuildArgs | RunArgs;

export type ParseResult = CliArgs | HelpResult;

const VALID_SUBCOMMANDS: ReadonlySet<string> = new Set(["discover", "plan", "build", "run"]);

const USAGE_TEXT = `Usage: sauna <subcommand> [flags]

Subcommands:
  discover   Run the interactive discovery agent
  plan       Run the planning agent for a fixed iteration count
  build      Run the builder agent until all tasks are done
  run        Run plan then build sequentially

Run "sauna <subcommand> --help" for subcommand-specific flags.`;

const SUBCOMMAND_HELP: Record<Subcommand, string> = {
  discover: `Usage: sauna discover [flags]

Run the interactive discovery agent.

Flags:
  --codebase <path>   Project root to operate on (required)
  --output <path>     Output directory for jobs (default: ./jobs/)
  --model <model>     Override the default LLM model
  --verbose           Show detailed tool args, results, and reasoning`,

  plan: `Usage: sauna plan [flags]

Run the planning agent for a fixed iteration count.

Flags:
  --codebase <path>   Project root to operate on (required)
  --job <slug>        Job directory under .sauna/jobs/ (required)
  --iterations <n>    Number of planning iterations (default: 1)
  --model <model>     Override the default LLM model
  --verbose           Show detailed tool args, results, and reasoning`,

  build: `Usage: sauna build [flags]

Run the builder agent until all tasks are done.

Flags:
  --codebase <path>   Project root to operate on (required)
  --job <slug>        Job directory under .sauna/jobs/ (required)
  --model <model>     Override the default LLM model
  --verbose           Show detailed tool args, results, and reasoning`,

  run: `Usage: sauna run [flags]

Run plan then build sequentially.

Flags:
  --codebase <path>   Project root to operate on (required)
  --job <slug>        Job directory under .sauna/jobs/ (required)
  --iterations <n>    Number of planning iterations (default: 1)
  --model <model>     Override the default LLM model
  --verbose           Show detailed tool args, results, and reasoning`,
};

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
      verbose: { type: "boolean", default: false },
    },
    strict: true,
  });

  const codebase = requireFlag(values, "codebase", "discover");

  return {
    subcommand: "discover",
    codebase,
    output: values.output!,
    model: values.model,
    verbose: values.verbose!,
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
      verbose: { type: "boolean", default: false },
    },
    strict: true,
  });

  const codebase = requireFlag(values, "codebase", "plan");
  const job = requireFlag(values, "job", "plan");
  const iterations = validateIterations(values.iterations);
  validateJobDir(codebase, job);

  return { subcommand: "plan", codebase, job, iterations, model: values.model, verbose: values.verbose! };
}

function parseBuildArgs(flagArgs: string[]): BuildArgs {
  const { values } = parseArgs({
    args: flagArgs,
    options: {
      codebase: { type: "string" },
      job: { type: "string" },
      model: { type: "string" },
      verbose: { type: "boolean", default: false },
    },
    strict: true,
  });

  const codebase = requireFlag(values, "codebase", "build");
  const job = requireFlag(values, "job", "build");
  validateJobDir(codebase, job);

  return { subcommand: "build", codebase, job, model: values.model, verbose: values.verbose! };
}

function parseRunArgs(flagArgs: string[]): RunArgs {
  const { values } = parseArgs({
    args: flagArgs,
    options: {
      codebase: { type: "string" },
      job: { type: "string" },
      iterations: { type: "string" },
      model: { type: "string" },
      verbose: { type: "boolean", default: false },
    },
    strict: true,
  });

  const codebase = requireFlag(values, "codebase", "run");
  const job = requireFlag(values, "job", "run");
  const iterations = validateIterations(values.iterations);
  validateJobDir(codebase, job);

  return { subcommand: "run", codebase, job, iterations, model: values.model, verbose: values.verbose! };
}

export function parseCliArgs(argv: string[]): ParseResult {
  const subcommand = argv[0];

  if (!subcommand || subcommand === "--help") {
    return { subcommand: "help", text: USAGE_TEXT };
  }

  if (!VALID_SUBCOMMANDS.has(subcommand)) {
    throw new Error(
      `Unknown subcommand: "${subcommand}". Valid subcommands: discover, plan, build, run`,
    );
  }

  const flagArgs = argv.slice(1);

  if (flagArgs.includes("--help")) {
    return { subcommand: "help", text: SUBCOMMAND_HELP[subcommand as Subcommand] };
  }

  switch (subcommand) {
    case "discover": return parseDiscoverArgs(flagArgs);
    case "plan": return parsePlanArgs(flagArgs);
    case "build": return parseBuildArgs(flagArgs);
    case "run": return parseRunArgs(flagArgs);
    default: throw new Error(`Unknown subcommand: ${subcommand}`);
  }
}

export type StreamingChunkCallback = (chunk: ChunkType<unknown>) => void;

export interface ConversationDeps {
  agent: Agent;
  input: Readable;
  output: Writable;
  streaming?: boolean;
  onStepFinish?: (step: LLMStepResult) => void;
  onFinish?: OnFinishCallback;
  onChunk?: StreamingChunkCallback;
  onTurnStart?: () => void;
  onTurnEnd?: () => void;
}

/** Chunk types routed to onChunk callback during streaming */
const ROUTED_CHUNK_TYPES = new Set([
  "tool-call", "tool-result", "tool-error",
  "step-finish", "finish",
]);

export async function runConversation(deps: ConversationDeps): Promise<void> {
  const session = new SessionRunner({
    agent: deps.agent,
    ...(deps.onStepFinish ? { onStepFinish: deps.onStepFinish } : {}),
    ...(deps.onFinish ? { onFinish: deps.onFinish } : {}),
  });

  const rl = createInterface({
    input: deps.input,
    output: deps.output,
  });

  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      deps.onTurnStart?.();
      try {
        if (deps.streaming) {
          await handleStreamingTurn(session, trimmed, deps);
        } else {
          const result = await session.sendMessage(trimmed);
          if (result) {
            deps.output.write(result.text + "\n");
          }
        }
      } finally {
        deps.onTurnEnd?.();
      }
    }
  } finally {
    rl.close();
  }
}

async function handleStreamingTurn(
  session: SessionRunner,
  message: string,
  deps: ConversationDeps,
): Promise<void> {
  const result = session.sendMessageStreaming(message);
  if (!result) return;

  let textWasMidLine = false;

  try {
    for await (const chunk of result.stream) {
      const chunkType = (chunk as { type: string }).type;

      if (chunkType === "text-delta") {
        const text = (chunk as { payload: { text: string } }).payload.text;
        deps.output.write(text);
        textWasMidLine = text.length > 0 && !text.endsWith("\n");
      } else if (ROUTED_CHUNK_TYPES.has(chunkType)) {
        // Insert newline before tool activity if text was mid-line
        if (textWasMidLine && (chunkType === "tool-call" || chunkType === "tool-error")) {
          deps.output.write("\n");
          textWasMidLine = false;
        }
        deps.onChunk?.(chunk);
      }
    }
  } catch {
    // Stream error — partial text already written remains visible.
    // The readline interface stays functional for subsequent turns.
  }

  // Trailing newline after streaming completes
  if (textWasMidLine) {
    deps.output.write("\n");
  }

  // Await fullOutput to update message history for multi-turn continuity
  try {
    await result.fullOutput;
  } catch {
    // fullOutput may reject if stream errored; conversation continues.
  }
}

export async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));

  if (args.subcommand === "help") {
    console.log(args.text);
    return;
  }

  let env;
  try {
    env = await initEnvironment({
      codebase: args.codebase,
      model: args.model,
      env: process.env as Record<string, string | undefined>,
    });
  } catch (e: unknown) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }

  const { mcp, tools, workspace, researcher } = env;

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

      const metrics = new ExecutionMetrics();
      const spinner = createActivitySpinner(process.stderr);
      const reporter = createActivityReporter({
        output: process.stderr,
        verbose: args.verbose,
        metrics,
        spinner,
      });

      try {
        spinner.start("Agent thinking…");
        await runConversation({
          agent,
          input: process.stdin,
          output: process.stdout,
          streaming: true,
          onStepFinish: reporter.onStepFinish,
          onFinish: reporter.onFinish,
          onChunk: reporter.onChunk,
          onTurnStart: () => {
            metrics.startTurn();
            spinner.start("Agent thinking…");
          },
          onTurnEnd: () => {
            metrics.endTurn();
            spinner.stop();
          },
        });
      } finally {
        spinner.stop();
        await mcp.disconnect();
      }
      break;
    }

    case "plan": {
      await handlePlan({
        args,
        env,
        output: process.stdout,
        createPlanningAgent,
        runFixedCount,
      });
      break;
    }

    case "build": {
      await handleBuild({
        args,
        env,
        output: process.stdout,
        createBuilderAgent,
        runUntilDone,
        loadHooks,
        runHooks,
      });
      break;
    }

    case "run": {
      await handleRun({
        args,
        env,
        output: process.stdout,
        createPlanningAgent,
        createBuilderAgent,
        runJobPipeline,
        loadHooks,
        runHooks,
      });
      break;
    }
  }
}
