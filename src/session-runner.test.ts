import { test, expect, describe, mock } from "bun:test";
import type { Agent, LLMStepResult } from "@mastra/core/agent";
import type { MessageInput } from "@mastra/core/agent/message-list";
import { SessionRunner } from "./session-runner";

/** Extract the generate options type from Agent.generate()'s second parameter */
type GenerateOptions = NonNullable<Parameters<Agent["generate"]>[1]>;

/** Mock generate function signature matching Agent.generate() */
type MockGenerateFn = (messages: MessageInput[], opts: GenerateOptions) => ReturnType<Agent["generate"]>;

/** Typed accessor for mock call arguments */
function mockCallArgs(fn: ReturnType<typeof mock>, index: number) {
  return fn.mock.calls[index] as unknown as [MessageInput[], GenerateOptions];
}

function makeMockAgent(generateImpl?: MockGenerateFn) {
  const mockGenerate = mock(
    generateImpl ??
    (async () => ({
      text: "Hello from AI",
      messages: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hello from AI" },
      ],
    })),
  );
  return { generate: mockGenerate } as unknown as Agent;
}

describe("SessionRunner", () => {
  test("sendMessage calls agent.generate and returns the result", async () => {
    const agent = makeMockAgent();
    const runner = new SessionRunner({ agent });

    const result = await runner.sendMessage("Hello");

    expect(result).toBeDefined();
    expect(result!.text).toBe("Hello from AI");
    expect(agent.generate).toHaveBeenCalledTimes(1);
  });

  test("sendMessage passes user message in messages array to agent.generate", async () => {
    const agent = makeMockAgent();
    const runner = new SessionRunner({ agent });

    await runner.sendMessage("Hello");

    const [messages] = mockCallArgs(agent.generate, 0);
    expect(messages).toContainEqual({ role: "user", content: "Hello" });
  });

  test("accumulates messages across multiple turns", async () => {
    let callCount = 0;
    const agent = makeMockAgent(async (msgs: MessageInput[]) => {
      callCount++;
      return {
        text: `Response ${callCount}`,
        messages: [
          ...msgs,
          { role: "assistant", content: `Response ${callCount}` },
        ],
      };
    });
    const runner = new SessionRunner({ agent });

    await runner.sendMessage("First");
    await runner.sendMessage("Second");

    const [secondMessages] = mockCallArgs(agent.generate, 1);
    expect(secondMessages).toContainEqual({ role: "user", content: "First" });
    expect(secondMessages).toContainEqual({ role: "assistant", content: "Response 1" });
    expect(secondMessages).toContainEqual({ role: "user", content: "Second" });
  });

  test("replaces message array with generate result messages after each turn", async () => {
    const canonicalMessages = [
      { id: "1", role: "user", content: { format: 2, parts: [] } },
      { id: "2", role: "assistant", content: { format: 2, parts: [] } },
    ];
    const agent = makeMockAgent(async () => ({
      text: "OK",
      messages: canonicalMessages,
    }));
    const runner = new SessionRunner({ agent });

    await runner.sendMessage("Hello");

    // Second call should use the canonical messages from generate result, not our raw push
    await runner.sendMessage("Second");
    const [secondMessages] = mockCallArgs(agent.generate, 1);
    expect(secondMessages[0]).toBe(canonicalMessages[0]);
    expect(secondMessages[1]).toBe(canonicalMessages[1]);
  });

  test("skips empty messages without calling agent", async () => {
    const agent = makeMockAgent();
    const runner = new SessionRunner({ agent });

    const result = await runner.sendMessage("");
    expect(result).toBeNull();
    expect(agent.generate).not.toHaveBeenCalled();
  });

  test("skips whitespace-only messages without calling agent", async () => {
    const agent = makeMockAgent();
    const runner = new SessionRunner({ agent });

    const result = await runner.sendMessage("   \t\n  ");
    expect(result).toBeNull();
    expect(agent.generate).not.toHaveBeenCalled();
  });

  test("passes maxSteps to agent.generate options", async () => {
    const agent = makeMockAgent();
    const runner = new SessionRunner({ agent, maxSteps: 25 });

    await runner.sendMessage("Hello");

    const [, opts] = mockCallArgs(agent.generate, 0);
    expect(opts.maxSteps).toBe(25);
  });

  test("defaults maxSteps to 50", async () => {
    const agent = makeMockAgent();
    const runner = new SessionRunner({ agent });

    await runner.sendMessage("Hello");

    const [, opts] = mockCallArgs(agent.generate, 0);
    expect(opts.maxSteps).toBe(50);
  });

  test("passes onStepFinish callback to agent.generate options", async () => {
    const onStepFinish = mock(() => {});
    const agent = makeMockAgent(async (_msgs: MessageInput[], opts: GenerateOptions) => {
      opts.onStepFinish!({ toolResults: [] } as LLMStepResult);
      return { text: "OK", messages: [] };
    });
    const runner = new SessionRunner({ agent, onStepFinish });

    await runner.sendMessage("Hello");

    expect(onStepFinish).toHaveBeenCalledTimes(1);
  });

  test("passes onFinish callback to agent.generate options", async () => {
    const onFinish = mock(() => {});
    const agent = makeMockAgent(async (_msgs: MessageInput[], opts: GenerateOptions) => {
      opts.onFinish!({ text: "Done" } as Parameters<NonNullable<GenerateOptions["onFinish"]>>[0]);
      return { text: "Done", messages: [] };
    });
    const runner = new SessionRunner({ agent, onFinish });

    await runner.sendMessage("Hello");

    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  test("does not include onFinish in generate options when not provided", async () => {
    let capturedOpts: GenerateOptions | null = null;
    const agent = makeMockAgent(async (_msgs: MessageInput[], opts: GenerateOptions) => {
      capturedOpts = opts;
      return { text: "OK", messages: [] };
    });
    const runner = new SessionRunner({ agent });

    await runner.sendMessage("Hello");

    expect(capturedOpts!.onFinish).toBeUndefined();
  });

  test("module does not import I/O primitives", async () => {
    const source = await Bun.file(
      new URL("./session-runner.ts", import.meta.url).pathname,
    ).text();
    expect(source).not.toContain("readline");
    expect(source).not.toContain("node:stream");
    expect(source).not.toContain("Readable");
    expect(source).not.toContain("Writable");
    expect(source).not.toContain("process");
    expect(source).not.toContain("stdin");
    expect(source).not.toContain("stdout");
  });
});

// --- Streaming mode tests ---

/** Extract the stream options type from Agent.stream()'s second parameter */
type StreamOptions = NonNullable<Parameters<Agent["stream"]>[1]>;

/** Typed accessor for mock stream call arguments */
function streamCallArgs(fn: ReturnType<typeof mock>, index: number) {
  return fn.mock.calls[index] as unknown as [MessageInput[], StreamOptions];
}

/** Helper: create a ReadableStream from an array of chunks */
function chunksToStream<T>(chunks: T[]): ReadableStream<T> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

/** Helper: create a mock MastraModelOutput-like object with only the fields SessionRunner uses */
function makeMockStreamOutput(chunks: unknown[], fullOutputOverrides?: Record<string, unknown>) {
  const canonicalMessages = fullOutputOverrides?.messages ?? [
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hello from AI" },
  ];
  return {
    fullStream: chunksToStream(chunks),
    getFullOutput: mock(async () => ({
      text: "Hello from AI",
      messages: canonicalMessages,
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      steps: [],
      finishReason: "stop",
      ...fullOutputOverrides,
    })),
  };
}

function makeMockStreamAgent(streamImpl?: (...args: any[]) => any) {
  const mockStream = mock(
    streamImpl ??
    (async () => makeMockStreamOutput([
      { type: "text-delta", payload: { id: "1", text: "Hello from AI" }, runId: "r1", from: "AGENT" },
    ])),
  );
  // Also include generate so the agent can still be used in batch mode tests
  const mockGenerate = mock(async () => ({
    text: "Hello from AI",
    messages: [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hello from AI" },
    ],
  }));
  return { stream: mockStream, generate: mockGenerate } as unknown as Agent;
}

/** Collect all chunks from sendMessageStreaming into an array */
async function collectChunks(runner: SessionRunner, message: string) {
  const chunks: unknown[] = [];
  const result = runner.sendMessageStreaming(message);
  if (!result) return { chunks, result: null };
  for await (const chunk of result.stream) {
    chunks.push(chunk);
  }
  const fullOutput = await result.fullOutput;
  return { chunks, fullOutput };
}

describe("SessionRunner streaming mode", () => {
  test("sendMessageStreaming calls agent.stream instead of agent.generate", async () => {
    const agent = makeMockStreamAgent();
    const runner = new SessionRunner({ agent });

    await collectChunks(runner, "Hello");

    expect(agent.stream).toHaveBeenCalledTimes(1);
    expect(agent.generate).not.toHaveBeenCalled();
  });

  test("sendMessageStreaming yields chunks from fullStream", async () => {
    const inputChunks = [
      { type: "text-delta", payload: { id: "1", text: "Hello " }, runId: "r1", from: "AGENT" },
      { type: "text-delta", payload: { id: "2", text: "world" }, runId: "r1", from: "AGENT" },
    ];
    const agent = makeMockStreamAgent(async () => makeMockStreamOutput(inputChunks));
    const runner = new SessionRunner({ agent });

    const { chunks } = await collectChunks(runner, "Hello");

    expect(chunks).toHaveLength(2);
    expect((chunks[0] as any).payload.text).toBe("Hello ");
    expect((chunks[1] as any).payload.text).toBe("world");
  });

  test("sendMessageStreaming calls getFullOutput and updates message history", async () => {
    const canonicalMessages = [
      { id: "1", role: "user", content: { format: 2, parts: [] } },
      { id: "2", role: "assistant", content: { format: 2, parts: [] } },
    ];
    const output = makeMockStreamOutput(
      [{ type: "text-delta", payload: { id: "1", text: "OK" }, runId: "r1", from: "AGENT" }],
      { messages: canonicalMessages },
    );
    const agent = makeMockStreamAgent(async () => output);
    const runner = new SessionRunner({ agent });

    await collectChunks(runner, "Hello");

    expect(output.getFullOutput).toHaveBeenCalledTimes(1);

    // Second call should use canonical messages from getFullOutput
    await collectChunks(runner, "Second");
    const [secondMessages] = streamCallArgs(agent.stream, 1);
    expect(secondMessages[0]).toBe(canonicalMessages[0]);
    expect(secondMessages[1]).toBe(canonicalMessages[1]);
  });

  test("sendMessageStreaming returns null for empty messages", () => {
    const agent = makeMockStreamAgent();
    const runner = new SessionRunner({ agent });

    const result = runner.sendMessageStreaming("");
    expect(result).toBeNull();
    expect(agent.stream).not.toHaveBeenCalled();
  });

  test("sendMessageStreaming returns null for whitespace-only messages", () => {
    const agent = makeMockStreamAgent();
    const runner = new SessionRunner({ agent });

    const result = runner.sendMessageStreaming("   \t\n  ");
    expect(result).toBeNull();
    expect(agent.stream).not.toHaveBeenCalled();
  });

  test("sendMessageStreaming passes maxSteps to agent.stream options", async () => {
    const agent = makeMockStreamAgent();
    const runner = new SessionRunner({ agent, maxSteps: 25 });

    await collectChunks(runner, "Hello");

    const [, opts] = streamCallArgs(agent.stream, 0);
    expect(opts.maxSteps).toBe(25);
  });

  test("sendMessageStreaming passes onStepFinish callback to agent.stream options", async () => {
    const onStepFinish = mock(() => {});
    const agent = makeMockStreamAgent(async (_msgs, opts) => {
      // Simulate onStepFinish being called during streaming
      opts.onStepFinish!({ toolResults: [] } as LLMStepResult);
      return makeMockStreamOutput([]);
    });
    const runner = new SessionRunner({ agent, onStepFinish });

    await collectChunks(runner, "Hello");

    expect(onStepFinish).toHaveBeenCalledTimes(1);
  });

  test("sendMessageStreaming passes onFinish callback to agent.stream options", async () => {
    const onFinish = mock(() => {});
    const agent = makeMockStreamAgent(async (_msgs, opts) => {
      opts.onFinish!({ text: "Done" } as any);
      return makeMockStreamOutput([]);
    });
    const runner = new SessionRunner({ agent, onFinish });

    await collectChunks(runner, "Hello");

    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  test("sendMessageStreaming accumulates messages across multiple turns", async () => {
    let callCount = 0;
    const agent = makeMockStreamAgent(async (msgs) => {
      callCount++;
      return makeMockStreamOutput(
        [{ type: "text-delta", payload: { id: "1", text: `Response ${callCount}` }, runId: "r1", from: "AGENT" }],
        {
          messages: [
            ...msgs,
            { role: "assistant", content: `Response ${callCount}` },
          ],
        },
      );
    });
    const runner = new SessionRunner({ agent });

    await collectChunks(runner, "First");
    await collectChunks(runner, "Second");

    const [secondMessages] = streamCallArgs(agent.stream, 1);
    expect(secondMessages).toContainEqual({ role: "user", content: "First" });
    expect(secondMessages).toContainEqual({ role: "assistant", content: "Response 1" });
    expect(secondMessages).toContainEqual({ role: "user", content: "Second" });
  });

  test("sendMessageStreaming fullOutput resolves with getFullOutput result", async () => {
    const expectedUsage = { inputTokens: 100, outputTokens: 50, totalTokens: 150 };
    const agent = makeMockStreamAgent(async () =>
      makeMockStreamOutput(
        [{ type: "text-delta", payload: { id: "1", text: "Hi" }, runId: "r1", from: "AGENT" }],
        { text: "Hi", usage: expectedUsage },
      ),
    );
    const runner = new SessionRunner({ agent });

    const { fullOutput } = await collectChunks(runner, "Hello");

    expect(fullOutput!.text).toBe("Hi");
    expect(fullOutput!.usage).toEqual(expectedUsage);
  });

  test("sendMessageStreaming propagates stream errors", async () => {
    const agent = makeMockStreamAgent(async () => ({
      fullStream: new ReadableStream({
        async pull(controller) {
          controller.enqueue({ type: "text-delta", payload: { id: "1", text: "partial" }, runId: "r1", from: "AGENT" });
          // Yield control so the reader can consume the enqueued chunk before we error
          await new Promise((r) => setTimeout(r, 0));
          controller.error(new Error("stream broke"));
        },
      }),
      getFullOutput: mock(async () => ({
        text: "partial",
        messages: [],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        steps: [],
        finishReason: "error",
      })),
    }));
    const runner = new SessionRunner({ agent });

    const chunks: unknown[] = [];
    const result = runner.sendMessageStreaming("Hello")!;
    let caughtError: Error | null = null;
    try {
      for await (const chunk of result.stream) {
        chunks.push(chunk);
      }
    } catch (e) {
      caughtError = e as Error;
    }

    expect(chunks).toHaveLength(1);
    expect(caughtError).toBeDefined();
    expect(caughtError!.message).toBe("stream broke");
  });
});
