import { test, expect, describe, mock } from "bun:test";
import { runFixedCount, runUntilDone } from "./loop-runner";

function textStreamFrom(chunks: string[]): ReadableStream<string> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

function makeMockAgent() {
  const streamMock = mock(async () => ({
    textStream: textStreamFrom(["response"]),
    getFullOutput: async () => ({
      messages: [
        { role: "user", content: "msg" },
        { role: "assistant", content: "response" },
      ],
    }),
  }));
  return { stream: streamMock } as any;
}

describe("runFixedCount", () => {
  test("executes agent exactly N times", async () => {
    const agent = makeMockAgent();
    const onProgress = mock(() => {});

    await runFixedCount({
      agent,
      iterations: 3,
      message: "Do the work",
      onProgress,
    });

    expect(agent.stream).toHaveBeenCalledTimes(3);
  });

  test("sends the configured message each iteration", async () => {
    const agent = makeMockAgent();

    await runFixedCount({
      agent,
      iterations: 2,
      message: "Plan the task",
    });

    for (const call of agent.stream.mock.calls as any[]) {
      const [messages] = call;
      expect(messages).toContainEqual({ role: "user", content: "Plan the task" });
    }
  });

  test("calls onProgress with iteration index and total", async () => {
    const agent = makeMockAgent();
    const onProgress = mock(() => {});

    await runFixedCount({
      agent,
      iterations: 3,
      message: "Go",
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress.mock.calls[0]).toEqual([1, 3]);
    expect(onProgress.mock.calls[1]).toEqual([2, 3]);
    expect(onProgress.mock.calls[2]).toEqual([3, 3]);
  });

  test("each iteration uses a fresh session (no accumulated messages)", async () => {
    const agent = makeMockAgent();

    await runFixedCount({
      agent,
      iterations: 3,
      message: "Go",
    });

    // Each call should receive exactly one user message (fresh session)
    for (const call of agent.stream.mock.calls as any[]) {
      const [messages] = call;
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({ role: "user", content: "Go" });
    }
  });

  test("consumes the stream for each iteration (drives getFullOutput)", async () => {
    let getFullOutputCalls = 0;
    const agent = {
      stream: mock(async () => ({
        textStream: textStreamFrom(["chunk"]),
        getFullOutput: async () => {
          getFullOutputCalls++;
          return { messages: [] };
        },
      })),
    } as any;

    await runFixedCount({
      agent,
      iterations: 2,
      message: "Go",
    });

    expect(getFullOutputCalls).toBe(2);
  });

  test("throws if iterations is less than 1", async () => {
    const agent = makeMockAgent();

    expect(
      runFixedCount({ agent, iterations: 0, message: "Go" }),
    ).rejects.toThrow();
  });

  test("calls onOutput for each text chunk streamed", async () => {
    const agent = {
      stream: mock(async () => ({
        textStream: textStreamFrom(["Hello ", "world"]),
        getFullOutput: async () => ({ messages: [] }),
      })),
    } as any;
    const onOutput = mock(() => {});

    await runFixedCount({
      agent,
      iterations: 1,
      message: "Go",
      onOutput,
    });

    expect(onOutput).toHaveBeenCalledTimes(2);
    expect(onOutput.mock.calls[0]).toEqual(["Hello "]);
    expect(onOutput.mock.calls[1]).toEqual(["world"]);
  });
});

describe("runUntilDone", () => {
  test("does not run agent if tasks file has no pending tasks", async () => {
    const agent = makeMockAgent();
    const readTasksFile = mock(async () => "- [x] Done task\n- [x] Also done\n");

    await runUntilDone({
      agent,
      message: "Go",
      readTasksFile,
    });

    expect(agent.stream).toHaveBeenCalledTimes(0);
  });

  test("runs agent until no pending tasks remain", async () => {
    const agent = makeMockAgent();
    let callCount = 0;
    const readTasksFile = mock(async () => {
      callCount++;
      // First two reads: tasks pending. Third read: all done.
      if (callCount <= 2) return "- [ ] Task A\n- [x] Task B\n";
      return "- [x] Task A\n- [x] Task B\n";
    });

    await runUntilDone({
      agent,
      message: "Go",
      readTasksFile,
    });

    // Agent runs twice (once per pending check that finds tasks)
    expect(agent.stream).toHaveBeenCalledTimes(2);
  });

  test("throws when safety limit is exceeded", async () => {
    const agent = makeMockAgent();
    // Always returns pending tasks — should hit safety limit
    const readTasksFile = mock(async () => "- [ ] Eternal task\n");

    await expect(
      runUntilDone({
        agent,
        message: "Go",
        readTasksFile,
        safetyLimit: 3,
      }),
    ).rejects.toThrow("Safety limit reached (3 iterations)");
  });

  test("default safety limit is initial pending count + 5", async () => {
    const agent = makeMockAgent();
    let callCount = 0;
    // 2 pending tasks → safety limit = 2 + 5 = 7
    const readTasksFile = mock(async () => {
      callCount++;
      return "- [ ] Task A\n- [ ] Task B\n";
    });

    await expect(
      runUntilDone({
        agent,
        message: "Go",
        readTasksFile,
      }),
    ).rejects.toThrow("Safety limit reached (7 iterations)");

    // Should have run exactly 7 times before throwing
    expect(agent.stream).toHaveBeenCalledTimes(7);
  });

  test("each iteration uses a fresh session", async () => {
    const agent = makeMockAgent();
    let callCount = 0;
    const readTasksFile = mock(async () => {
      callCount++;
      if (callCount <= 3) return "- [ ] Task\n";
      return "- [x] Task\n";
    });

    await runUntilDone({
      agent,
      message: "Build it",
      readTasksFile,
    });

    // Each call should receive exactly one user message (fresh session)
    for (const call of agent.stream.mock.calls as any[]) {
      const [messages] = call;
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({ role: "user", content: "Build it" });
    }
  });

  test("calls onProgress with iteration number and remaining task count", async () => {
    const agent = makeMockAgent();
    let callCount = 0;
    const readTasksFile = mock(async () => {
      callCount++;
      if (callCount === 1) return "- [ ] A\n- [ ] B\n- [ ] C\n";
      if (callCount === 2) return "- [ ] A\n- [x] B\n- [ ] C\n";
      if (callCount === 3) return "- [ ] A\n- [x] B\n- [x] C\n";
      return "- [x] A\n- [x] B\n- [x] C\n";
    });
    const onProgress = mock(() => {});

    await runUntilDone({
      agent,
      message: "Go",
      readTasksFile,
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress.mock.calls[0]).toEqual([1, 3]); // iteration 1, 3 remaining
    expect(onProgress.mock.calls[1]).toEqual([2, 2]); // iteration 2, 2 remaining
    expect(onProgress.mock.calls[2]).toEqual([3, 1]); // iteration 3, 1 remaining
  });

  test("calls onOutput for streamed text chunks", async () => {
    const agent = {
      stream: mock(async () => ({
        textStream: textStreamFrom(["chunk1", "chunk2"]),
        getFullOutput: async () => ({ messages: [] }),
      })),
    } as any;
    let callCount = 0;
    const readTasksFile = mock(async () => {
      callCount++;
      if (callCount === 1) return "- [ ] Task\n";
      return "- [x] Task\n";
    });
    const onOutput = mock(() => {});

    await runUntilDone({
      agent,
      message: "Go",
      readTasksFile,
      onOutput,
    });

    expect(onOutput).toHaveBeenCalledTimes(2);
    expect(onOutput.mock.calls[0]).toEqual(["chunk1"]);
    expect(onOutput.mock.calls[1]).toEqual(["chunk2"]);
  });

  test("counts only unchecked checkboxes as pending tasks", async () => {
    const agent = makeMockAgent();
    let callCount = 0;
    const readTasksFile = mock(async () => {
      callCount++;
      if (callCount === 1) {
        // Mix of checked, unchecked, and non-checkbox lines
        return "# Tasks\n- [x] Done\n- [ ] Pending\n- Some text\n- [x] Also done\n";
      }
      return "# Tasks\n- [x] Done\n- [x] Pending\n- Some text\n- [x] Also done\n";
    });
    const onProgress = mock(() => {});

    await runUntilDone({
      agent,
      message: "Go",
      readTasksFile,
      onProgress,
    });

    expect(agent.stream).toHaveBeenCalledTimes(1);
    // Only 1 pending task detected
    expect(onProgress.mock.calls[0]).toEqual([1, 1]);
  });
});
