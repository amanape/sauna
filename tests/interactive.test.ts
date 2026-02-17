import { test, expect, describe, mock } from "bun:test";
import { PassThrough } from "node:stream";

// Mock the SDK so interactive.ts's import of `query` resolves
mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: () => {
    throw new Error("should not be called — use overrides.createQuery");
  },
}));

const { runInteractive } = await import("../src/interactive");

const successResult = (overrides?: Partial<any>) => ({
  type: "result",
  subtype: "success",
  result: "ok",
  usage: { input_tokens: 100, output_tokens: 50 },
  num_turns: 1,
  duration_ms: 1000,
  session_id: "test-session-id",
  ...overrides,
});

const textDelta = (text: string) => ({
  type: "stream_event",
  event: {
    type: "content_block_delta",
    delta: { type: "text_delta", text },
  },
  session_id: "test-session-id",
});

/**
 * Creates a mock Query object that reads from an AsyncIterable prompt.
 *
 * For each message read from the prompt iterable, the mock yields the
 * next queued turn's messages. This mirrors how the real SDK processes
 * multi-turn conversations via AsyncIterable prompts.
 */
function createMockQuery() {
  const turns: any[][] = [];
  const receivedMessages: any[] = [];

  function createQuery(params: { prompt: AsyncIterable<any>; options: any }) {
    const gen = (async function* () {
      for await (const inputMsg of params.prompt) {
        receivedMessages.push(inputMsg);
        const turnMsgs = turns.shift() ?? [];
        for (const msg of turnMsgs) {
          yield msg;
        }
      }
    })();

    const q = gen as any;
    q.close = mock(() => {
      gen.return(undefined as any);
    });
    return q;
  }

  return {
    createQuery,
    /** Queue messages that the generator will yield for the next turn */
    queueTurn(msgs: any[]) {
      turns.push(msgs);
    },
    /** Get all user messages received from the prompt iterable */
    get messages() {
      return receivedMessages;
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

describe("P2: Interactive Mode", () => {
  test("sends first prompt with context, streams response, then exits on empty input", async () => {
    const mockQuery = createMockQuery();
    const stdin = createFakeStdin();
    const output: string[] = [];
    const write = (s: string) => output.push(s);

    // Queue response for first turn
    mockQuery.queueTurn([textDelta("Hello from agent\n"), successResult()]);

    // After first turn, readline will prompt — send empty line to exit
    setTimeout(() => stdin.writeLine(""), 50);

    await runInteractive(
      { prompt: "test prompt", model: "claude-sonnet-4-20250514", context: ["foo.md"], claudePath: "/fake/claude" },
      write,
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        createQuery: mockQuery.createQuery,
      },
    );

    // First message should contain prompt with context
    expect(mockQuery.messages).toHaveLength(1);
    expect(mockQuery.messages[0].message.content).toContain("foo.md");
    expect(mockQuery.messages[0].message.content).toContain("test prompt");

    // Output should contain the agent's response
    const fullOutput = output.join("");
    expect(fullOutput).toContain("Hello from agent");
  });

  test("empty input exits the REPL immediately", async () => {
    const mockQuery = createMockQuery();
    const stdin = createFakeStdin();
    const output: string[] = [];

    // Queue response for first turn
    mockQuery.queueTurn([textDelta("response\n"), successResult()]);

    // Send empty line immediately after first turn
    setTimeout(() => stdin.writeLine(""), 50);

    await runInteractive(
      { prompt: "go", model: "claude-sonnet-4-20250514", context: [], claudePath: "/fake/claude" },
      (s) => output.push(s),
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        createQuery: mockQuery.createQuery,
      },
    );

    // Only one message should have been sent (the first prompt)
    expect(mockQuery.messages).toHaveLength(1);
  });

  test("EOF (Ctrl+D) exits the REPL", async () => {
    const mockQuery = createMockQuery();
    const stdin = createFakeStdin();

    mockQuery.queueTurn([textDelta("hi\n"), successResult()]);

    // Send EOF after first turn
    setTimeout(() => stdin.end(), 50);

    await runInteractive(
      { prompt: "go", model: "claude-sonnet-4-20250514", context: [], claudePath: "/fake/claude" },
      () => {},
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        createQuery: mockQuery.createQuery,
      },
    );

    expect(mockQuery.messages).toHaveLength(1);
  });

  test("multi-turn: follow-up messages are sent via the prompt iterable", async () => {
    const mockQuery = createMockQuery();
    const stdin = createFakeStdin();

    // Queue responses for two turns
    mockQuery.queueTurn([textDelta("first response\n"), successResult()]);
    mockQuery.queueTurn([textDelta("second response\n"), successResult()]);

    // After first turn, send a follow-up, then empty to exit
    setTimeout(() => stdin.writeLine("follow up question"), 50);
    setTimeout(() => stdin.writeLine(""), 200);

    await runInteractive(
      { prompt: "initial prompt", model: "claude-sonnet-4-20250514", context: ["ctx.md"], claudePath: "/fake/claude" },
      () => {},
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        createQuery: mockQuery.createQuery,
      },
    );

    // First message includes context
    expect(mockQuery.messages[0].message.content).toContain("ctx.md");
    expect(mockQuery.messages[0].message.content).toContain("initial prompt");

    // Follow-up was sent via the prompt iterable (not streamInput)
    expect(mockQuery.messages).toHaveLength(2);
    const followUp = mockQuery.messages[1];
    expect(followUp.type).toBe("user");
    expect(followUp.message.content).toBe("follow up question");
    expect(followUp.session_id).toBe("test-session-id");
    expect(followUp.parent_tool_use_id).toBeNull();
  });

  test("agent error mid-session does not terminate the REPL", async () => {
    const mockQuery = createMockQuery();
    const stdin = createFakeStdin();
    const output: string[] = [];

    // First turn throws an error result
    mockQuery.queueTurn([
      textDelta("partial\n"),
      {
        type: "result",
        subtype: "error_during_execution",
        errors: ["agent exploded"],
        usage: { input_tokens: 10, output_tokens: 5 },
        num_turns: 1,
        duration_ms: 500,
        session_id: "test-session-id",
      },
    ]);
    // Second turn succeeds
    mockQuery.queueTurn([textDelta("recovered\n"), successResult()]);

    // After error on first turn, send another prompt, then exit
    setTimeout(() => stdin.writeLine("try again"), 50);
    setTimeout(() => stdin.writeLine(""), 200);

    await runInteractive(
      { prompt: "cause error", model: "claude-sonnet-4-20250514", context: [], claudePath: "/fake/claude" },
      (s) => output.push(s),
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        createQuery: mockQuery.createQuery,
      },
    );

    // Error should have been written
    const fullOutput = output.join("");
    expect(fullOutput).toContain("agent exploded");

    // Second turn should have succeeded
    expect(fullOutput).toContain("recovered");

    // Both turns should have messages
    expect(mockQuery.messages).toHaveLength(2);
  });

  test("no CLI prompt reads first input from readline", async () => {
    const mockQuery = createMockQuery();
    const stdin = createFakeStdin();
    const promptOutput = new PassThrough();

    mockQuery.queueTurn([textDelta("hi\n"), successResult()]);

    // Send the first prompt via stdin, then exit
    setTimeout(() => stdin.writeLine("hello from stdin"), 50);
    setTimeout(() => stdin.writeLine(""), 150);

    await runInteractive(
      { model: "claude-sonnet-4-20250514", context: [], claudePath: "/fake/claude" },
      () => {},
      {
        input: stdin.stream,
        promptOutput,
        createQuery: mockQuery.createQuery,
      },
    );

    expect(mockQuery.messages).toHaveLength(1);
    expect(mockQuery.messages[0].message.content).toBe("hello from stdin");
  });

  test("no CLI prompt with immediate EOF exits without sending", async () => {
    const mockQuery = createMockQuery();
    const stdin = createFakeStdin();

    // Immediately end stdin — should exit without sending
    setTimeout(() => stdin.end(), 50);

    await runInteractive(
      { model: "claude-sonnet-4-20250514", context: [], claudePath: "/fake/claude" },
      () => {},
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        createQuery: mockQuery.createQuery,
      },
    );

    // No query should have been created — no messages received
    expect(mockQuery.messages).toHaveLength(0);
  });

  test("query options match non-interactive session configuration", async () => {
    let capturedOptions: any = null;
    const stdin = createFakeStdin();

    function createQuery(params: { prompt: AsyncIterable<any>; options: any }) {
      capturedOptions = params.options;
      // Return a minimal query-like object that consumes the iterable
      const gen = (async function* () {
        for await (const _ of params.prompt) {
          yield successResult();
          break;
        }
      })();
      const q = gen as any;
      q.close = mock(() => { gen.return(undefined); });
      return q;
    }

    setTimeout(() => stdin.writeLine(""), 50);

    await runInteractive(
      { prompt: "test", context: [], claudePath: "/fake/claude" },
      () => {},
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        createQuery,
      },
    );

    // Verify all config parity options are present
    expect(capturedOptions.systemPrompt).toEqual({ type: "preset", preset: "claude_code" });
    expect(capturedOptions.settingSources).toEqual(["user", "project"]);
    expect(capturedOptions.permissionMode).toBe("bypassPermissions");
    expect(capturedOptions.allowDangerouslySkipPermissions).toBe(true);
    expect(capturedOptions.includePartialMessages).toBe(true);
  });

  test("model is omitted from options when not specified", async () => {
    let capturedOptions: any = null;
    const stdin = createFakeStdin();

    function createQuery(params: { prompt: AsyncIterable<any>; options: any }) {
      capturedOptions = params.options;
      const gen = (async function* () {
        for await (const _ of params.prompt) {
          yield successResult();
          break;
        }
      })();
      const q = gen as any;
      q.close = mock(() => { gen.return(undefined); });
      return q;
    }

    setTimeout(() => stdin.writeLine(""), 50);

    await runInteractive(
      { prompt: "test", context: [], claudePath: "/fake/claude" },
      () => {},
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        createQuery,
      },
    );

    // Model should NOT be in options — defer to SDK default
    expect(capturedOptions).not.toHaveProperty("model");
  });

  test("SIGINT during query calls close() for graceful cleanup", async () => {
    const mockQuery = createMockQuery();
    const stdin = createFakeStdin();
    let capturedQuery: any = null;

    const originalCreateQuery = mockQuery.createQuery;
    function wrappedCreateQuery(params: { prompt: AsyncIterable<any>; options: any }) {
      capturedQuery = originalCreateQuery(params);
      return capturedQuery;
    }

    // Queue a first turn response — the generator will pause after this
    mockQuery.queueTurn([textDelta("working...\n"), successResult()]);

    // When the REPL prompts after the first result, simulate SIGINT
    // before the user types anything
    const signalHandlers: Map<string, (...args: any[]) => void> = new Map();

    setTimeout(() => {
      // Simulate SIGINT while waiting for input
      const handler = signalHandlers.get("SIGINT");
      if (handler) handler("SIGINT");
    }, 50);

    await runInteractive(
      { prompt: "test", model: "claude-sonnet-4-20250514", context: [], claudePath: "/fake/claude" },
      () => {},
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        createQuery: wrappedCreateQuery,
        addSignalHandler: (signal, handler) => {
          signalHandlers.set(signal, handler);
        },
        removeSignalHandler: (signal) => {
          signalHandlers.delete(signal);
        },
      },
    );

    // q.close() should have been called for cleanup
    expect(capturedQuery.close).toHaveBeenCalled();
  });

  test("SIGTERM during query calls close() for graceful cleanup", async () => {
    const mockQuery = createMockQuery();
    const stdin = createFakeStdin();
    let capturedQuery: any = null;

    const originalCreateQuery = mockQuery.createQuery;
    function wrappedCreateQuery(params: { prompt: AsyncIterable<any>; options: any }) {
      capturedQuery = originalCreateQuery(params);
      return capturedQuery;
    }

    mockQuery.queueTurn([textDelta("working...\n"), successResult()]);

    const signalHandlers: Map<string, (...args: any[]) => void> = new Map();

    setTimeout(() => {
      const handler = signalHandlers.get("SIGTERM");
      if (handler) handler("SIGTERM");
    }, 50);

    await runInteractive(
      { prompt: "test", model: "claude-sonnet-4-20250514", context: [], claudePath: "/fake/claude" },
      () => {},
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        createQuery: wrappedCreateQuery,
        addSignalHandler: (signal, handler) => {
          signalHandlers.set(signal, handler);
        },
        removeSignalHandler: (signal) => {
          signalHandlers.delete(signal);
        },
      },
    );

    expect(capturedQuery.close).toHaveBeenCalled();
  });

  test("signal handlers are removed after REPL exits normally", async () => {
    const mockQuery = createMockQuery();
    const stdin = createFakeStdin();
    const removedSignals: string[] = [];

    mockQuery.queueTurn([textDelta("hi\n"), successResult()]);
    setTimeout(() => stdin.writeLine(""), 50);

    await runInteractive(
      { prompt: "test", model: "claude-sonnet-4-20250514", context: [], claudePath: "/fake/claude" },
      () => {},
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        createQuery: mockQuery.createQuery,
        addSignalHandler: () => {},
        removeSignalHandler: (signal) => {
          removedSignals.push(signal);
        },
      },
    );

    // Both handlers should have been cleaned up
    expect(removedSignals).toContain("SIGINT");
    expect(removedSignals).toContain("SIGTERM");
  });

  test("model is forwarded when specified via --model", async () => {
    let capturedOptions: any = null;
    const stdin = createFakeStdin();

    function createQuery(params: { prompt: AsyncIterable<any>; options: any }) {
      capturedOptions = params.options;
      const gen = (async function* () {
        for await (const _ of params.prompt) {
          yield successResult();
          break;
        }
      })();
      const q = gen as any;
      q.close = mock(() => { gen.return(undefined); });
      return q;
    }

    setTimeout(() => stdin.writeLine(""), 50);

    await runInteractive(
      { prompt: "test", model: "claude-opus-4-20250514", context: [], claudePath: "/fake/claude" },
      () => {},
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        createQuery,
      },
    );

    expect(capturedOptions.model).toBe("claude-opus-4-20250514");
  });
});

describe("P4: error output routing to stderr", () => {
  test("query exception goes to errWrite, not write", async () => {
    const stdin = createFakeStdin();
    const stdout: string[] = [];
    const stderr: string[] = [];

    // Create a query that throws mid-iteration
    function createQuery(params: { prompt: AsyncIterable<any>; options: any }) {
      const gen = (async function* () {
        for await (const _ of params.prompt) {
          throw new Error("query exploded");
        }
      })();
      const q = gen as any;
      q.close = mock(() => { gen.return(undefined); });
      return q;
    }

    await runInteractive(
      { prompt: "test", model: "claude-sonnet-4-20250514", context: [], claudePath: "/fake/claude" },
      (s) => stdout.push(s),
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        createQuery,
      },
      (s) => stderr.push(s),
    );

    const stdoutJoined = stdout.join("");
    const stderrJoined = stderr.join("");
    expect(stderrJoined).toContain("query exploded");
    expect(stdoutJoined).not.toContain("query exploded");
  });

  test("non-success SDK result goes to errWrite via processMessage", async () => {
    const mockQuery = createMockQuery();
    const stdin = createFakeStdin();
    const stdout: string[] = [];
    const stderr: string[] = [];

    // Queue an error result
    mockQuery.queueTurn([
      textDelta("partial\n"),
      {
        type: "result",
        subtype: "error_during_execution",
        errors: ["agent failed"],
        usage: { input_tokens: 10, output_tokens: 5 },
        num_turns: 1,
        duration_ms: 500,
        session_id: "test-session-id",
      },
    ]);

    // After first result, send empty line to exit
    setTimeout(() => stdin.writeLine(""), 50);

    await runInteractive(
      { prompt: "test", model: "claude-sonnet-4-20250514", context: [], claudePath: "/fake/claude" },
      (s) => stdout.push(s),
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        createQuery: mockQuery.createQuery,
      },
      (s) => stderr.push(s),
    );

    const stdoutJoined = stdout.join("");
    const stderrJoined = stderr.join("");
    // Error details should be in stderr
    expect(stderrJoined).toContain("agent failed");
    // Normal text output stays in stdout
    expect(stdoutJoined).toContain("partial");
    expect(stdoutJoined).not.toContain("agent failed");
  });
});
