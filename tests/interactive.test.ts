import { test, expect, describe, mock, beforeEach } from "bun:test";
import { PassThrough } from "node:stream";

// Mock the SDK so session.ts's import of `query` resolves
mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  unstable_v2_createSession: () => {
    throw new Error("should not be called — use overrides.createSession");
  },
  query: () => (async function* () {})(),
}));

const { runInteractive } = await import("../src/interactive");

/** Creates a fake SDKSession with controllable stream output */
function createMockSession() {
  const messages: any[][] = [];
  let currentMessages: any[] = [];

  return {
    session: {
      sessionId: "test-session-id",
      send: mock(async () => {}),
      stream: mock(async function* () {
        const msgs = messages.shift() ?? [];
        for (const msg of msgs) {
          yield msg;
        }
      }),
      close: mock(() => {}),
    },
    /** Queue messages that stream() will yield on the next call */
    queueMessages(msgs: any[]) {
      messages.push(msgs);
    },
  };
}

/** Creates a PassThrough stream that feeds lines to readline one at a time */
function createFakeStdin() {
  const stream = new PassThrough();
  return {
    stream,
    writeLine(line: string) {
      stream.write(line + "\n");
    },
    end() {
      stream.end();
    },
  };
}

const successResult = (overrides?: Partial<any>) => ({
  type: "result",
  subtype: "success",
  usage: { input_tokens: 100, output_tokens: 50 },
  num_turns: 1,
  duration_ms: 1000,
  ...overrides,
});

const textDelta = (text: string) => ({
  type: "stream_event",
  event: {
    type: "content_block_delta",
    delta: { type: "text_delta", text },
  },
});

describe("P2: Interactive Mode", () => {
  test("sends first prompt with context, streams response, then exits on empty input", async () => {
    const { session, queueMessages } = createMockSession();
    const stdin = createFakeStdin();
    const output: string[] = [];
    const write = (s: string) => output.push(s);

    // Queue response for first turn
    queueMessages([textDelta("Hello from agent\n"), successResult()]);

    // After first turn, readline will prompt — send empty line to exit
    // Use setTimeout to send after readline is waiting
    setTimeout(() => stdin.writeLine(""), 50);

    await runInteractive(
      { prompt: "test prompt", model: "claude-sonnet-4-20250514", context: ["foo.md"] },
      write,
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        createSession: () => session,
      },
    );

    // First turn should have sent the prompt with context
    expect(session.send).toHaveBeenCalledTimes(1);
    const sentPrompt = (session.send as any).mock.calls[0][0];
    expect(sentPrompt).toContain("foo.md");
    expect(sentPrompt).toContain("test prompt");

    // Should have streamed the response
    expect(session.stream).toHaveBeenCalledTimes(1);

    // Output should contain the agent's response
    const fullOutput = output.join("");
    expect(fullOutput).toContain("Hello from agent");

    // Session should be closed
    expect(session.close).toHaveBeenCalledTimes(1);
  });

  test("empty input exits the REPL immediately", async () => {
    const { session, queueMessages } = createMockSession();
    const stdin = createFakeStdin();
    const output: string[] = [];

    // Queue response for first turn
    queueMessages([textDelta("response\n"), successResult()]);

    // Send empty line immediately after first turn
    setTimeout(() => stdin.writeLine(""), 50);

    await runInteractive(
      { prompt: "go", model: "claude-sonnet-4-20250514", context: [] },
      (s) => output.push(s),
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        createSession: () => session,
      },
    );

    // Only one turn should have been sent
    expect(session.send).toHaveBeenCalledTimes(1);
    expect(session.close).toHaveBeenCalledTimes(1);
  });

  test("EOF (Ctrl+D) exits the REPL", async () => {
    const { session, queueMessages } = createMockSession();
    const stdin = createFakeStdin();

    queueMessages([textDelta("hi\n"), successResult()]);

    // Send EOF after first turn
    setTimeout(() => stdin.end(), 50);

    await runInteractive(
      { prompt: "go", model: "claude-sonnet-4-20250514", context: [] },
      () => {},
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        createSession: () => session,
      },
    );

    expect(session.send).toHaveBeenCalledTimes(1);
    expect(session.close).toHaveBeenCalledTimes(1);
  });

  test("multi-turn: subsequent turns do not include context paths", async () => {
    const { session, queueMessages } = createMockSession();
    const stdin = createFakeStdin();

    // Queue responses for two turns
    queueMessages([textDelta("first response\n"), successResult()]);
    queueMessages([textDelta("second response\n"), successResult()]);

    // After first turn, send a follow-up, then empty to exit
    setTimeout(() => stdin.writeLine("follow up question"), 50);
    setTimeout(() => stdin.writeLine(""), 150);

    await runInteractive(
      { prompt: "initial prompt", model: "claude-sonnet-4-20250514", context: ["ctx.md"] },
      () => {},
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        createSession: () => session,
      },
    );

    expect(session.send).toHaveBeenCalledTimes(2);

    // First call: includes context
    const firstCall = (session.send as any).mock.calls[0][0];
    expect(firstCall).toContain("ctx.md");
    expect(firstCall).toContain("initial prompt");

    // Second call: raw input, no context
    const secondCall = (session.send as any).mock.calls[1][0];
    expect(secondCall).toBe("follow up question");
    expect(secondCall).not.toContain("ctx.md");
  });

  test("agent error mid-session does not terminate the REPL", async () => {
    const { session } = createMockSession();
    const stdin = createFakeStdin();
    const output: string[] = [];

    // First turn: stream throws an error
    let streamCallCount = 0;
    session.stream = mock(async function* () {
      streamCallCount++;
      if (streamCallCount === 1) {
        throw new Error("agent exploded");
      }
      yield textDelta("recovered\n");
      yield successResult();
    }) as any;

    // After error on first turn, send another prompt, then exit
    setTimeout(() => stdin.writeLine("try again"), 50);
    setTimeout(() => stdin.writeLine(""), 150);

    await runInteractive(
      { prompt: "cause error", model: "claude-sonnet-4-20250514", context: [] },
      (s) => output.push(s),
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        createSession: () => session,
      },
    );

    // Error should have been written
    const fullOutput = output.join("");
    expect(fullOutput).toContain("agent exploded");

    // Second turn should have succeeded
    expect(fullOutput).toContain("recovered");

    // Two sends total
    expect(session.send).toHaveBeenCalledTimes(2);
    expect(session.close).toHaveBeenCalledTimes(1);
  });

  test("no CLI prompt reads first input from readline", async () => {
    const { session, queueMessages } = createMockSession();
    const stdin = createFakeStdin();
    const promptOutput = new PassThrough();

    queueMessages([textDelta("hi\n"), successResult()]);

    // Send the first prompt via stdin, then exit
    setTimeout(() => stdin.writeLine("hello from stdin"), 50);
    setTimeout(() => stdin.writeLine(""), 150);

    await runInteractive(
      { model: "claude-sonnet-4-20250514", context: [] },
      () => {},
      {
        input: stdin.stream,
        promptOutput,
        createSession: () => session,
      },
    );

    expect(session.send).toHaveBeenCalledTimes(1);
    const sent = (session.send as any).mock.calls[0][0];
    expect(sent).toBe("hello from stdin");
  });

  test("no CLI prompt with immediate EOF exits without sending", async () => {
    const { session } = createMockSession();
    const stdin = createFakeStdin();

    // Immediately end stdin — should exit without sending
    setTimeout(() => stdin.end(), 50);

    await runInteractive(
      { model: "claude-sonnet-4-20250514", context: [] },
      () => {},
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        createSession: () => session,
      },
    );

    expect(session.send).not.toHaveBeenCalled();
    expect(session.close).toHaveBeenCalledTimes(1);
  });
});
