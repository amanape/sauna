import { test, expect, describe, mock } from "bun:test";
import { runFixedCount } from "./loop-runner";

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
