import { test, expect, describe, mock } from "bun:test";
import { runJobPipeline, type JobPipelineDeps } from "./job-pipeline";
import type { HookResult } from "./hook-executor";

function makeMockAgent() {
  return {
    generate: mock(async () => ({
      text: "response",
      messages: [
        { role: "user", content: "msg" },
        { role: "assistant", content: "response" },
      ],
    })),
  } as any;
}

function makeDeps(overrides?: Partial<JobPipelineDeps>): JobPipelineDeps {
  const planner = makeMockAgent();
  const builder = makeMockAgent();
  return {
    createPlanner: mock(async () => planner),
    createBuilder: mock(async () => builder),
    readTasksFile: mock(async () => "- [x] All done\n"),
    output: { write: mock(() => true) } as any,
    plannerIterations: 1,
    jobId: "test-job",
    ...overrides,
  };
}

describe("runJobPipeline", () => {
  test("creates planning and builder agents", async () => {
    const deps = makeDeps();

    await runJobPipeline(deps);

    expect(deps.createPlanner).toHaveBeenCalledTimes(1);
    expect(deps.createBuilder).toHaveBeenCalledTimes(1);
  });

  test("runs planner via runFixedCount for configured iterations", async () => {
    const planner = makeMockAgent();
    const deps = makeDeps({
      createPlanner: mock(async () => planner),
      plannerIterations: 3,
    });

    await runJobPipeline(deps);

    expect(planner.generate).toHaveBeenCalledTimes(3);
  });

  test("runs builder via runUntilDone after planner completes", async () => {
    const builder = makeMockAgent();
    let builderCallCount = 0;
    const readTasksFile = mock(async () => {
      builderCallCount++;
      if (builderCallCount <= 2) return "- [ ] Task A\n";
      return "- [x] Task A\n";
    });
    const deps = makeDeps({
      createBuilder: mock(async () => builder),
      readTasksFile,
    });

    await runJobPipeline(deps);

    expect(builder.generate).toHaveBeenCalledTimes(2);
  });

  test("prints planner progress to output", async () => {
    const output = { write: mock(() => true) } as any;
    const deps = makeDeps({ output, plannerIterations: 2 });

    await runJobPipeline(deps);

    const writes = (output.write as any).mock.calls.map((c: any) => c[0]);
    expect(writes.some((w: string) => w.includes("Planning iteration 1/2"))).toBe(true);
    expect(writes.some((w: string) => w.includes("Planning iteration 2/2"))).toBe(true);
  });

  test("prints builder progress to output", async () => {
    const output = { write: mock(() => true) } as any;
    const builder = makeMockAgent();
    let callCount = 0;
    const readTasksFile = mock(async () => {
      callCount++;
      if (callCount <= 2) return "- [ ] Task A\n- [ ] Task B\n";
      return "- [x] Task A\n- [x] Task B\n";
    });
    const deps = makeDeps({
      output,
      createBuilder: mock(async () => builder),
      readTasksFile,
    });

    await runJobPipeline(deps);

    const writes = (output.write as any).mock.calls.map((c: any) => c[0]);
    expect(writes.some((w: string) => w.includes("tasks remaining"))).toBe(true);
  });

  test("prints completion message when done", async () => {
    const output = { write: mock(() => true) } as any;
    const deps = makeDeps({ output });

    await runJobPipeline(deps);

    const writes = (output.write as any).mock.calls.map((c: any) => c[0]);
    expect(writes.some((w: string) => w.includes("complete"))).toBe(true);
  });

  test("runs planner before builder (sequential ordering)", async () => {
    const order: string[] = [];
    const planner = {
      generate: mock(async () => {
        order.push("planner");
        return { text: "plan", messages: [] };
      }),
    } as any;
    const builder = {
      generate: mock(async () => {
        order.push("builder");
        return { text: "build", messages: [] };
      }),
    } as any;
    let callCount = 0;
    const readTasksFile = mock(async () => {
      callCount++;
      if (callCount <= 2) return "- [ ] Task\n";
      return "- [x] Task\n";
    });

    await runJobPipeline({
      createPlanner: mock(async () => planner),
      createBuilder: mock(async () => builder),
      readTasksFile,
      output: { write: mock(() => true) } as any,
      plannerIterations: 1,
      jobId: "test-job",
    });

    expect(order[0]).toBe("planner");
    expect(order.at(-1)).toBe("builder");
  });

  test("passes hooks to runUntilDone when provided", async () => {
    const hookRunner = mock(async (): Promise<HookResult> => ({ ok: true, output: "" }));
    const builder = makeMockAgent();
    let callCount = 0;
    const readTasksFile = mock(async () => {
      callCount++;
      if (callCount <= 2) return "- [ ] Task A\n";
      return "- [x] Task A\n";
    });
    const deps = makeDeps({
      createBuilder: mock(async () => builder),
      readTasksFile,
      hooks: ["bun test"],
      runHooks: hookRunner,
      hookCwd: "/project",
    });

    await runJobPipeline(deps);

    expect(hookRunner).toHaveBeenCalled();
  });

  test("does not run hooks when hooks array is empty", async () => {
    const hookRunner = mock(async (): Promise<HookResult> => ({ ok: true, output: "" }));
    const deps = makeDeps({
      hooks: [],
      runHooks: hookRunner,
      hookCwd: "/project",
    });

    await runJobPipeline(deps);

    expect(hookRunner).not.toHaveBeenCalled();
  });

  test("does not run hooks when hooks are not configured", async () => {
    const deps = makeDeps();

    // Should complete without error when no hooks are provided
    await runJobPipeline(deps);
  });

  test("passes onHookFailure callback through to runUntilDone", async () => {
    const onHookFailure = mock(() => {});
    let hookCallCount = 0;
    const hookRunner = mock(async (): Promise<HookResult> => {
      hookCallCount++;
      if (hookCallCount === 1) {
        return { ok: false, failedCommand: "bun test", exitCode: 1, output: "fail" };
      }
      return { ok: true, output: "" };
    });
    const builder = makeMockAgent();
    let taskCallCount = 0;
    const readTasksFile = mock(async () => {
      taskCallCount++;
      if (taskCallCount <= 2) return "- [ ] Task\n";
      return "- [x] Task\n";
    });
    const deps = makeDeps({
      createBuilder: mock(async () => builder),
      readTasksFile,
      hooks: ["bun test"],
      runHooks: hookRunner,
      hookCwd: "/project",
      onHookFailure,
    });

    await runJobPipeline(deps);

    expect(onHookFailure).toHaveBeenCalled();
  });
});
