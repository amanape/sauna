import { test, expect, describe, mock } from "bun:test";
import { runJobPipeline, type JobPipelineDeps } from "./job-pipeline";

function textStreamFrom(chunks: string[]): ReadableStream<string> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

function makeMockAgent() {
  return {
    stream: mock(async () => ({
      textStream: textStreamFrom(["response"]),
      getFullOutput: async () => ({
        messages: [
          { role: "user", content: "msg" },
          { role: "assistant", content: "response" },
        ],
      }),
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

    expect(planner.stream).toHaveBeenCalledTimes(3);
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

    expect(builder.stream).toHaveBeenCalledTimes(2);
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
      stream: mock(async () => {
        order.push("planner");
        return {
          textStream: textStreamFrom(["plan"]),
          getFullOutput: async () => ({ messages: [] }),
        };
      }),
    } as any;
    const builder = {
      stream: mock(async () => {
        order.push("builder");
        return {
          textStream: textStreamFrom(["build"]),
          getFullOutput: async () => ({ messages: [] }),
        };
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

  test("streams agent output to output writable", async () => {
    const output = { write: mock(() => true) } as any;
    const planner = {
      stream: mock(async () => ({
        textStream: textStreamFrom(["planning output"]),
        getFullOutput: async () => ({ messages: [] }),
      })),
    } as any;
    const deps = makeDeps({
      output,
      createPlanner: mock(async () => planner),
    });

    await runJobPipeline(deps);

    const writes = (output.write as any).mock.calls.map((c: any) => c[0]);
    expect(writes).toContain("planning output");
  });
});
