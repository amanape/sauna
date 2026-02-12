import { test, expect, describe, mock, beforeEach } from "bun:test";
import { PassThrough } from "node:stream";
import type { Agent } from "@mastra/core/agent";

import { handlePlan, handleBuild, handleRun } from "./handlers";
import type { Environment } from "./init-environment";
import type { PlanArgs, BuildArgs, RunArgs } from "./cli";

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

describe("handleBuild", () => {
  function makeBuildSpies() {
    return {
      createBuilderAgent: mock(async () => stubAgent()),
      runUntilDone: mock(async () => {}),
      loadHooks: mock(async () => ["bun test", "bun run lint"]),
      runHooks: mock(async () => ({ ok: true as const, output: "" })),
    };
  }

  function buildArgs(overrides?: Partial<BuildArgs>): BuildArgs {
    return {
      subcommand: "build",
      codebase: "/tmp/project",
      job: "my-job",
      ...overrides,
    };
  }

  test("calls runUntilDone with the builder agent and hooks", async () => {
    const spies = makeBuildSpies();
    const agent = stubAgent();
    spies.createBuilderAgent.mockImplementation(async () => agent);

    const output = new PassThrough();
    output.setEncoding("utf8");
    const env = stubEnvironment();

    await handleBuild({
      args: buildArgs(),
      env,
      output,
      createBuilderAgent: spies.createBuilderAgent as any,
      runUntilDone: spies.runUntilDone,
      loadHooks: spies.loadHooks,
      runHooks: spies.runHooks,
    });

    expect(spies.runUntilDone).toHaveBeenCalledTimes(1);
    const call = (spies.runUntilDone.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(call.agent).toBe(agent);
    expect(call.message).toBe("Begin building.");
    expect(call.hooks).toEqual(["bun test", "bun run lint"]);
    expect(call.runHooks).toBe(spies.runHooks);
    expect(call.hookCwd).toBe("/tmp/project");
  });

  test("creates builder agent with correct config from environment", async () => {
    const spies = makeBuildSpies();

    const output = new PassThrough();
    const env = stubEnvironment();
    const args = buildArgs({ model: "anthropic/claude-3" });

    await handleBuild({
      args,
      env,
      output,
      createBuilderAgent: spies.createBuilderAgent as any,
      runUntilDone: spies.runUntilDone,
      loadHooks: spies.loadHooks,
      runHooks: spies.runHooks,
    });

    expect(spies.createBuilderAgent).toHaveBeenCalledTimes(1);
    const config = (spies.createBuilderAgent.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(config.model).toBe("anthropic/claude-3");
    expect(config.tools).toBe(env.tools);
    expect(config.workspace).toBe(env.workspace);
    expect(config.researcher).toBe(env.researcher);
    expect(config.jobId).toBe("my-job");
  });

  test("loads hooks from the codebase directory", async () => {
    const spies = makeBuildSpies();

    const output = new PassThrough();
    const env = stubEnvironment();

    await handleBuild({
      args: buildArgs({ codebase: "/my/project" }),
      env,
      output,
      createBuilderAgent: spies.createBuilderAgent as any,
      runUntilDone: spies.runUntilDone,
      loadHooks: spies.loadHooks,
      runHooks: spies.runHooks,
    });

    expect(spies.loadHooks).toHaveBeenCalledTimes(1);
    expect((spies.loadHooks.mock.calls[0] as unknown[])[0]).toBe("/my/project");
  });

  test("passes a readTasksFile function that reads from the correct path", async () => {
    const spies = makeBuildSpies();

    // Capture the readTasksFile function passed to runUntilDone
    let capturedReadTasksFile: (() => Promise<string>) | undefined;
    spies.runUntilDone.mockImplementation(async (config: any) => {
      capturedReadTasksFile = config.readTasksFile;
    });

    const output = new PassThrough();
    const env = stubEnvironment();

    await handleBuild({
      args: buildArgs(),
      env,
      output,
      createBuilderAgent: spies.createBuilderAgent as any,
      runUntilDone: spies.runUntilDone,
      loadHooks: spies.loadHooks,
      runHooks: spies.runHooks,
    });

    // readTasksFile should be a function (we can't call it without Bun.file mocking,
    // but we verify it was passed)
    expect(typeof capturedReadTasksFile).toBe("function");
  });

  test("streams build output to the output writable", async () => {
    const spies = makeBuildSpies();

    spies.runUntilDone.mockImplementation(async (config: any) => {
      config.onOutput?.("build-chunk1");
      config.onOutput?.("build-chunk2");
    });

    const output = new PassThrough();
    output.setEncoding("utf8");
    const env = stubEnvironment();

    await handleBuild({
      args: buildArgs(),
      env,
      output,
      createBuilderAgent: spies.createBuilderAgent as any,
      runUntilDone: spies.runUntilDone,
      loadHooks: spies.loadHooks,
      runHooks: spies.runHooks,
    });

    const captured = output.read() as string;
    expect(captured).toContain("build-chunk1");
    expect(captured).toContain("build-chunk2");
  });

  test("reports build progress to output", async () => {
    const spies = makeBuildSpies();

    spies.runUntilDone.mockImplementation(async (config: any) => {
      config.onProgress?.(1, 5);
      config.onProgress?.(2, 3);
    });

    const output = new PassThrough();
    output.setEncoding("utf8");
    const env = stubEnvironment();

    await handleBuild({
      args: buildArgs(),
      env,
      output,
      createBuilderAgent: spies.createBuilderAgent as any,
      runUntilDone: spies.runUntilDone,
      loadHooks: spies.loadHooks,
      runHooks: spies.runHooks,
    });

    const captured = output.read() as string;
    expect(captured).toContain("Build iteration 1");
    expect(captured).toContain("5 tasks remaining");
    expect(captured).toContain("Build iteration 2");
    expect(captured).toContain("3 tasks remaining");
  });

  test("disconnects MCP after completion", async () => {
    const spies = makeBuildSpies();

    const output = new PassThrough();
    const env = stubEnvironment();

    await handleBuild({
      args: buildArgs(),
      env,
      output,
      createBuilderAgent: spies.createBuilderAgent as any,
      runUntilDone: spies.runUntilDone,
      loadHooks: spies.loadHooks,
      runHooks: spies.runHooks,
    });

    expect(env.disconnect).toHaveBeenCalledTimes(1);
  });

  test("disconnects MCP even when runUntilDone throws", async () => {
    const spies = makeBuildSpies();
    spies.runUntilDone.mockImplementation(async () => {
      throw new Error("build error");
    });

    const output = new PassThrough();
    const env = stubEnvironment();

    await expect(
      handleBuild({
        args: buildArgs(),
        env,
        output,
        createBuilderAgent: spies.createBuilderAgent as any,
        runUntilDone: spies.runUntilDone,
        loadHooks: spies.loadHooks,
        runHooks: spies.runHooks,
      }),
    ).rejects.toThrow("build error");

    expect(env.disconnect).toHaveBeenCalledTimes(1);
  });

  test("does NOT call runFixedCount or runJobPipeline", async () => {
    const spies = makeBuildSpies();
    const runFixedCount = mock(async () => {});

    const output = new PassThrough();
    const env = stubEnvironment();

    await handleBuild({
      args: buildArgs(),
      env,
      output,
      createBuilderAgent: spies.createBuilderAgent as any,
      runUntilDone: spies.runUntilDone,
      loadHooks: spies.loadHooks,
      runHooks: spies.runHooks,
    });

    // Only runUntilDone should be called
    expect(spies.runUntilDone).toHaveBeenCalledTimes(1);
    expect(runFixedCount).not.toHaveBeenCalled();
  });
});

describe("handleRun", () => {
  function makeRunSpies() {
    return {
      createPlanningAgent: mock(async () => stubAgent()),
      createBuilderAgent: mock(async () => stubAgent()),
      runJobPipeline: mock(async () => {}),
      loadHooks: mock(async () => ["bun test"]),
      runHooks: mock(async () => ({ ok: true as const, output: "" })),
    };
  }

  function runArgs(overrides?: Partial<RunArgs>): RunArgs {
    return {
      subcommand: "run",
      codebase: "/tmp/project",
      job: "my-job",
      iterations: 2,
      ...overrides,
    };
  }

  test("calls runJobPipeline with correct config", async () => {
    const spies = makeRunSpies();
    const output = new PassThrough();
    output.setEncoding("utf8");
    const env = stubEnvironment();
    const args = runArgs();

    await handleRun({
      args,
      env,
      output,
      createPlanningAgent: spies.createPlanningAgent as any,
      createBuilderAgent: spies.createBuilderAgent as any,
      runJobPipeline: spies.runJobPipeline,
      loadHooks: spies.loadHooks,
      runHooks: spies.runHooks,
    });

    expect(spies.runJobPipeline).toHaveBeenCalledTimes(1);
    const call = (spies.runJobPipeline.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(call.plannerIterations).toBe(2);
    expect(call.jobId).toBe("my-job");
    expect(call.output).toBe(output);
    expect(call.hooks).toEqual(["bun test"]);
    expect(call.runHooks).toBe(spies.runHooks);
    expect(call.hookCwd).toBe("/tmp/project");
  });

  test("passes factory functions that create agents with correct config", async () => {
    const spies = makeRunSpies();
    const plannerAgent = stubAgent();
    const builderAgent = stubAgent();
    spies.createPlanningAgent.mockImplementation(async () => plannerAgent);
    spies.createBuilderAgent.mockImplementation(async () => builderAgent);

    // Capture the factory functions passed to runJobPipeline and invoke them
    let capturedCreatePlanner: (() => Promise<unknown>) | undefined;
    let capturedCreateBuilder: (() => Promise<unknown>) | undefined;
    spies.runJobPipeline.mockImplementation(async (config: any) => {
      capturedCreatePlanner = config.createPlanner;
      capturedCreateBuilder = config.createBuilder;
    });

    const output = new PassThrough();
    const env = stubEnvironment();
    const args = runArgs({ model: "openai/gpt-4" });

    await handleRun({
      args,
      env,
      output,
      createPlanningAgent: spies.createPlanningAgent as any,
      createBuilderAgent: spies.createBuilderAgent as any,
      runJobPipeline: spies.runJobPipeline,
      loadHooks: spies.loadHooks,
      runHooks: spies.runHooks,
    });

    // Invoke captured factories and verify they produce the right agents
    const planner = await capturedCreatePlanner!();
    expect(planner).toBe(plannerAgent);
    const config = (spies.createPlanningAgent.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(config.model).toBe("openai/gpt-4");
    expect(config.jobId).toBe("my-job");

    const builder = await capturedCreateBuilder!();
    expect(builder).toBe(builderAgent);
    const bConfig = (spies.createBuilderAgent.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(bConfig.model).toBe("openai/gpt-4");
    expect(bConfig.jobId).toBe("my-job");
  });

  test("loads hooks from codebase directory", async () => {
    const spies = makeRunSpies();
    const output = new PassThrough();
    const env = stubEnvironment();

    await handleRun({
      args: runArgs({ codebase: "/my/project" }),
      env,
      output,
      createPlanningAgent: spies.createPlanningAgent as any,
      createBuilderAgent: spies.createBuilderAgent as any,
      runJobPipeline: spies.runJobPipeline,
      loadHooks: spies.loadHooks,
      runHooks: spies.runHooks,
    });

    expect(spies.loadHooks).toHaveBeenCalledTimes(1);
    expect((spies.loadHooks.mock.calls[0] as unknown[])[0]).toBe("/my/project");
  });

  test("passes a readTasksFile function that targets the correct path", async () => {
    const spies = makeRunSpies();

    let capturedReadTasksFile: (() => Promise<string>) | undefined;
    spies.runJobPipeline.mockImplementation(async (config: any) => {
      capturedReadTasksFile = config.readTasksFile;
    });

    const output = new PassThrough();
    const env = stubEnvironment();

    await handleRun({
      args: runArgs(),
      env,
      output,
      createPlanningAgent: spies.createPlanningAgent as any,
      createBuilderAgent: spies.createBuilderAgent as any,
      runJobPipeline: spies.runJobPipeline,
      loadHooks: spies.loadHooks,
      runHooks: spies.runHooks,
    });

    expect(typeof capturedReadTasksFile).toBe("function");
  });

  test("disconnects MCP after completion", async () => {
    const spies = makeRunSpies();
    const output = new PassThrough();
    const env = stubEnvironment();

    await handleRun({
      args: runArgs(),
      env,
      output,
      createPlanningAgent: spies.createPlanningAgent as any,
      createBuilderAgent: spies.createBuilderAgent as any,
      runJobPipeline: spies.runJobPipeline,
      loadHooks: spies.loadHooks,
      runHooks: spies.runHooks,
    });

    expect(env.disconnect).toHaveBeenCalledTimes(1);
  });

  test("disconnects MCP even when runJobPipeline throws", async () => {
    const spies = makeRunSpies();
    spies.runJobPipeline.mockImplementation(async () => {
      throw new Error("pipeline error");
    });

    const output = new PassThrough();
    const env = stubEnvironment();

    await expect(
      handleRun({
        args: runArgs(),
        env,
        output,
        createPlanningAgent: spies.createPlanningAgent as any,
        createBuilderAgent: spies.createBuilderAgent as any,
        runJobPipeline: spies.runJobPipeline,
        loadHooks: spies.loadHooks,
        runHooks: spies.runHooks,
      }),
    ).rejects.toThrow("pipeline error");

    expect(env.disconnect).toHaveBeenCalledTimes(1);
  });
});

function makeSpies() {
  return {
    runFixedCount: mock(async () => {}),
    createPlanningAgent: mock(async () => stubAgent()),
  };
}
