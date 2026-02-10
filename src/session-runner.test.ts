import { test, expect, describe, mock } from "bun:test";
import { SessionRunner } from "./session-runner";

/** Create a ReadableStream<string> from an array of chunks */
function textStreamFrom(chunks: string[]): ReadableStream<string> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

function makeMockAgent(streamImpl?: (...args: any[]) => any) {
  const mockStream = mock(
    streamImpl ??
    (async () => ({
      textStream: textStreamFrom(["Hello from AI"]),
      getFullOutput: async () => ({
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hello from AI" },
        ],
      }),
    })),
  );
  return { stream: mockStream } as any;
}

describe("SessionRunner", () => {
  test("sendMessage calls agent.stream and returns the stream result", async () => {
    const agent = makeMockAgent();
    const runner = new SessionRunner({ agent });

    const result = await runner.sendMessage("Hello");

    expect(result).toBeDefined();
    expect(result!.textStream).toBeDefined();
    expect(agent.stream).toHaveBeenCalledTimes(1);
  });

  test("sendMessage passes user message in messages array to agent.stream", async () => {
    const agent = makeMockAgent();
    const runner = new SessionRunner({ agent });

    await runner.sendMessage("Hello");

    const [messages] = (agent.stream.mock.calls as any)[0];
    expect(messages).toContainEqual({ role: "user", content: "Hello" });
  });

  test("accumulates messages across multiple turns", async () => {
    let callCount = 0;
    const agent = makeMockAgent(async (msgs: any[]) => {
      callCount++;
      return {
        textStream: textStreamFrom([`Response ${callCount}`]),
        getFullOutput: async () => ({
          messages: [
            ...msgs,
            { role: "assistant", content: `Response ${callCount}` },
          ],
        }),
      };
    });
    const runner = new SessionRunner({ agent });

    const result1 = await runner.sendMessage("First");
    // Consume the stream to trigger getFullOutput
    await result1!.getFullOutput();

    await runner.sendMessage("Second");

    const [secondMessages] = (agent.stream.mock.calls as any)[1];
    expect(secondMessages).toContainEqual({ role: "user", content: "First" });
    expect(secondMessages).toContainEqual({ role: "assistant", content: "Response 1" });
    expect(secondMessages).toContainEqual({ role: "user", content: "Second" });
  });

  test("replaces message array with getFullOutput().messages after each turn", async () => {
    const canonicalMessages = [
      { id: "1", role: "user", content: { format: 2, parts: [] } },
      { id: "2", role: "assistant", content: { format: 2, parts: [] } },
    ];
    const agent = makeMockAgent(async () => ({
      textStream: textStreamFrom(["OK"]),
      getFullOutput: async () => ({ messages: canonicalMessages }),
    }));
    const runner = new SessionRunner({ agent });

    const result = await runner.sendMessage("Hello");
    await result!.getFullOutput();

    // Second call should use the canonical messages from getFullOutput, not our raw push
    await runner.sendMessage("Second");
    const [secondMessages] = (agent.stream.mock.calls as any)[1];
    expect(secondMessages[0]).toBe(canonicalMessages[0]);
    expect(secondMessages[1]).toBe(canonicalMessages[1]);
  });

  test("skips empty messages without calling agent", async () => {
    const agent = makeMockAgent();
    const runner = new SessionRunner({ agent });

    const result = await runner.sendMessage("");
    expect(result).toBeNull();
    expect(agent.stream).not.toHaveBeenCalled();
  });

  test("skips whitespace-only messages without calling agent", async () => {
    const agent = makeMockAgent();
    const runner = new SessionRunner({ agent });

    const result = await runner.sendMessage("   \t\n  ");
    expect(result).toBeNull();
    expect(agent.stream).not.toHaveBeenCalled();
  });

  test("passes maxSteps to agent.stream options", async () => {
    const agent = makeMockAgent();
    const runner = new SessionRunner({ agent, maxSteps: 25 });

    await runner.sendMessage("Hello");

    const [, opts] = (agent.stream.mock.calls as any)[0];
    expect(opts.maxSteps).toBe(25);
  });

  test("defaults maxSteps to 50", async () => {
    const agent = makeMockAgent();
    const runner = new SessionRunner({ agent });

    await runner.sendMessage("Hello");

    const [, opts] = (agent.stream.mock.calls as any)[0];
    expect(opts.maxSteps).toBe(50);
  });

  test("passes onStepFinish callback to agent.stream options", async () => {
    const onStepFinish = mock(() => {});
    const agent = makeMockAgent(async (_msgs: any[], opts: any) => {
      opts.onStepFinish({ toolResults: [] });
      return {
        textStream: textStreamFrom(["OK"]),
        getFullOutput: async () => ({ messages: [] }),
      };
    });
    const runner = new SessionRunner({ agent, onStepFinish });

    await runner.sendMessage("Hello");

    expect(onStepFinish).toHaveBeenCalledTimes(1);
  });

  test("passes onFinish callback to agent.stream options", async () => {
    const onFinish = mock(() => {});
    const agent = makeMockAgent(async (_msgs: any[], opts: any) => {
      opts.onFinish({ text: "Done" });
      return {
        textStream: textStreamFrom(["Done"]),
        getFullOutput: async () => ({ messages: [] }),
      };
    });
    const runner = new SessionRunner({ agent, onFinish });

    await runner.sendMessage("Hello");

    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  test("does not include onFinish in stream options when not provided", async () => {
    let capturedOpts: any = null;
    const agent = makeMockAgent(async (_msgs: any[], opts: any) => {
      capturedOpts = opts;
      return {
        textStream: textStreamFrom(["OK"]),
        getFullOutput: async () => ({ messages: [] }),
      };
    });
    const runner = new SessionRunner({ agent });

    await runner.sendMessage("Hello");

    expect(capturedOpts.onFinish).toBeUndefined();
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
