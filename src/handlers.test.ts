import { test, expect, describe, mock, beforeEach } from "bun:test";
import { PassThrough } from "node:stream";
import type { Agent } from "@mastra/core/agent";

import { handlePlan } from "./handlers";
import type { Environment } from "./init-environment";
import type { PlanArgs } from "./cli";

/** Create a ReadableStream<string> from an array of chunks */
function textStreamFrom(chunks: string[]): ReadableStream<string> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

function stubAgent(): Agent {
  return {
    stream: mock(async () => ({
      textStream: textStreamFrom(["planning output"]),
      getFullOutput: async () => ({
        messages: [
          { role: "user", content: "Begin planning." },
          { role: "assistant", content: "planning output" },
        ],
      }),
    })),
  } as unknown as Agent;
}

function stubEnvironment(): Environment & { disconnect: ReturnType<typeof mock> } {
  const disconnect = mock(async () => {});
  return {
    mcp: { disconnect } as unknown as Environment["mcp"],
    tools: {},
    workspace: {} as unknown as Environment["workspace"],
    researcher: {} as unknown as Agent,
    disconnect,
  };
}

describe("handlePlan", () => {
  test("calls runFixedCount with the planner agent and configured iterations", async () => {
    const { runFixedCount, createPlanningAgent } = makeSpies();
    const agent = stubAgent();
    createPlanningAgent.mockImplementation(async () => agent);

    const output = new PassThrough();
    output.setEncoding("utf8");
    const env = stubEnvironment();

    const args: PlanArgs = {
      subcommand: "plan",
      codebase: "/tmp/project",
      job: "my-job",
      iterations: 3,
      model: undefined,
    };

    await handlePlan({
      args,
      env,
      output,
      createPlanningAgent: createPlanningAgent as any,
      runFixedCount,
    });

    expect(runFixedCount).toHaveBeenCalledTimes(1);
    const call = (runFixedCount.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(call.agent).toBe(agent);
    expect(call.iterations).toBe(3);
    expect(call.message).toBe("Begin planning.");
  });

  test("does NOT call runJobPipeline or runUntilDone", async () => {
    const { runFixedCount, createPlanningAgent } = makeSpies();
    createPlanningAgent.mockImplementation(async () => stubAgent());

    const output = new PassThrough();
    const env = stubEnvironment();

    const args: PlanArgs = {
      subcommand: "plan",
      codebase: "/tmp/project",
      job: "my-job",
      iterations: 1,
    };

    await handlePlan({
      args,
      env,
      output,
      createPlanningAgent: createPlanningAgent as any,
      runFixedCount,
    });

    // Only runFixedCount should be called — not runUntilDone (building)
    expect(runFixedCount).toHaveBeenCalledTimes(1);
  });

  test("creates planner agent with correct config from environment", async () => {
    const { runFixedCount, createPlanningAgent } = makeSpies();
    createPlanningAgent.mockImplementation(async () => stubAgent());

    const output = new PassThrough();
    const env = stubEnvironment();

    const args: PlanArgs = {
      subcommand: "plan",
      codebase: "/tmp/project",
      job: "my-job",
      iterations: 1,
      model: "openai/gpt-4",
    };

    await handlePlan({
      args,
      env,
      output,
      createPlanningAgent: createPlanningAgent as any,
      runFixedCount,
    });

    expect(createPlanningAgent).toHaveBeenCalledTimes(1);
    const config = (createPlanningAgent.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(config.model).toBe("openai/gpt-4");
    expect(config.tools).toBe(env.tools);
    expect(config.workspace).toBe(env.workspace);
    expect(config.researcher).toBe(env.researcher);
    expect(config.jobId).toBe("my-job");
  });

  test("streams agent output to the output writable", async () => {
    const { runFixedCount, createPlanningAgent } = makeSpies();
    createPlanningAgent.mockImplementation(async () => stubAgent());

    // Make runFixedCount invoke its onOutput callback
    runFixedCount.mockImplementation(async (config: any) => {
      config.onOutput?.("chunk1");
      config.onOutput?.("chunk2");
    });

    const output = new PassThrough();
    output.setEncoding("utf8");
    const env = stubEnvironment();

    const args: PlanArgs = {
      subcommand: "plan",
      codebase: "/tmp/project",
      job: "my-job",
      iterations: 1,
    };

    await handlePlan({
      args,
      env,
      output,
      createPlanningAgent: createPlanningAgent as any,
      runFixedCount,
    });

    const captured = output.read();
    expect(captured).toContain("chunk1");
    expect(captured).toContain("chunk2");
  });

  test("reports progress to output", async () => {
    const { runFixedCount, createPlanningAgent } = makeSpies();
    createPlanningAgent.mockImplementation(async () => stubAgent());

    runFixedCount.mockImplementation(async (config: any) => {
      config.onProgress?.(1, 3);
      config.onProgress?.(2, 3);
      config.onProgress?.(3, 3);
    });

    const output = new PassThrough();
    output.setEncoding("utf8");
    const env = stubEnvironment();

    const args: PlanArgs = {
      subcommand: "plan",
      codebase: "/tmp/project",
      job: "my-job",
      iterations: 3,
    };

    await handlePlan({
      args,
      env,
      output,
      createPlanningAgent: createPlanningAgent as any,
      runFixedCount,
    });

    const captured = output.read() as string;
    expect(captured).toContain("1/3");
    expect(captured).toContain("2/3");
    expect(captured).toContain("3/3");
  });

  test("disconnects MCP after completion", async () => {
    const { runFixedCount, createPlanningAgent } = makeSpies();
    createPlanningAgent.mockImplementation(async () => stubAgent());

    const output = new PassThrough();
    const env = stubEnvironment();

    const args: PlanArgs = {
      subcommand: "plan",
      codebase: "/tmp/project",
      job: "my-job",
      iterations: 1,
    };

    await handlePlan({
      args,
      env,
      output,
      createPlanningAgent: createPlanningAgent as any,
      runFixedCount,
    });

    expect(env.disconnect).toHaveBeenCalledTimes(1);
  });

  test("disconnects MCP even when runFixedCount throws", async () => {
    const { runFixedCount, createPlanningAgent } = makeSpies();
    createPlanningAgent.mockImplementation(async () => stubAgent());
    runFixedCount.mockImplementation(async () => {
      throw new Error("agent error");
    });

    const output = new PassThrough();
    const env = stubEnvironment();

    const args: PlanArgs = {
      subcommand: "plan",
      codebase: "/tmp/project",
      job: "my-job",
      iterations: 1,
    };

    await expect(
      handlePlan({
        args,
        env,
        output,
        createPlanningAgent: createPlanningAgent as any,
        runFixedCount,
      }),
    ).rejects.toThrow("agent error");

    expect(env.disconnect).toHaveBeenCalledTimes(1);
  });
});

function makeSpies() {
  return {
    runFixedCount: mock(async () => {}),
    createPlanningAgent: mock(async () => stubAgent()),
  };
}
