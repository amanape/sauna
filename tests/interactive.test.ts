import { test, expect, describe } from "bun:test";
import { PassThrough } from "node:stream";
import { runInteractive, writePrompt } from "../src/interactive";
import { createStreamState } from "../src/stream";
import type {
  InteractiveSession,
  ProviderEvent,
  Provider,
} from "../src/provider";

// Minimal provider stub — createInteractiveSession is never called in these tests
// because overrides.session is always provided.
const stubProvider: Provider = {
  name: "stub",
  isAvailable: () => true,
  resolveModel: (_alias) => undefined,
  knownAliases: () => ({}),
  async *createSession(_config) {},
  createInteractiveSession(_config) {
    throw new Error(
      "stub: createInteractiveSession should not be called in interactive.test.ts",
    );
  },
};

/**
 * Creates a mock InteractiveSession that queues ProviderEvent turns.
 *
 * Each call to stream() yields the next queued turn's events, ending naturally
 * after the last event. Messages sent via send() are recorded for assertion.
 *
 * Why: isolates interactive.ts from provider implementations so tests verify
 * REPL behavior only — not SDK or provider internals.
 */
function createMockSession() {
  const turns: ProviderEvent[][] = [];
  const sentMessages: string[] = [];
  let closeCalled = false;

  const session: InteractiveSession = {
    send: async (message: string) => {
      sentMessages.push(message);
    },
    stream: async function* () {
      const events = turns.shift() ?? [];
      for (const event of events) {
        yield event;
      }
    },
    close: () => {
      closeCalled = true;
    },
  };

  return {
    session,
    /** Queue events the next stream() call will yield */
    queueTurn(events: ProviderEvent[]) {
      turns.push(events);
    },
    /** Messages sent via session.send() in order */
    get messages() {
      return sentMessages;
    },
    /** Whether session.close() has been called */
    get closed() {
      return closeCalled;
    },
  };
}

const successResult = (): ProviderEvent => ({
  type: "result",
  success: true,
  summary: {
    inputTokens: 100,
    outputTokens: 50,
    numTurns: 1,
    durationMs: 1000,
  },
});

const textDelta = (text: string): ProviderEvent => ({
  type: "text_delta",
  text,
});

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
  test("sends first prompt, streams response, then exits on empty input", async () => {
    const mockSession = createMockSession();
    const stdin = createFakeStdin();
    const output: string[] = [];
    const write = (s: string) => output.push(s);

    // Queue response for first turn
    mockSession.queueTurn([textDelta("Hello from agent\n"), successResult()]);

    // After first turn, readline will prompt — send empty line to exit
    setTimeout(() => { stdin.writeLine(""); }, 50);

    await runInteractive(
      {
        prompt: "test prompt",
        model: "claude-sonnet-4-20250514",
        context: ["foo.md"],
        provider: stubProvider,
      },
      write,
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        session: mockSession.session,
      },
    );

    // First message is the raw prompt text — context is the provider's responsibility
    expect(mockSession.messages).toHaveLength(1);
    expect(mockSession.messages[0]).toBe("test prompt");

    // Output should contain the agent's response
    const fullOutput = output.join("");
    expect(fullOutput).toContain("Hello from agent");
  });

  test("empty input exits the REPL immediately", async () => {
    const mockSession = createMockSession();
    const stdin = createFakeStdin();

    // Queue response for first turn
    mockSession.queueTurn([textDelta("response\n"), successResult()]);

    // Send empty line immediately after first turn
    setTimeout(() => { stdin.writeLine(""); }, 50);

    await runInteractive(
      {
        prompt: "go",
        model: "claude-sonnet-4-20250514",
        context: [],
        provider: stubProvider,
      },
      () => {},
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        session: mockSession.session,
      },
    );

    // Only one message should have been sent (the first prompt)
    expect(mockSession.messages).toHaveLength(1);
  });

  test("EOF (Ctrl+D) exits the REPL", async () => {
    const mockSession = createMockSession();
    const stdin = createFakeStdin();

    mockSession.queueTurn([textDelta("hi\n"), successResult()]);

    // Send EOF after first turn
    setTimeout(() => { stdin.end(); }, 50);

    await runInteractive(
      {
        prompt: "go",
        model: "claude-sonnet-4-20250514",
        context: [],
        provider: stubProvider,
      },
      () => {},
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        session: mockSession.session,
      },
    );

    expect(mockSession.messages).toHaveLength(1);
  });

  test("multi-turn: follow-up messages sent via session.send()", async () => {
    const mockSession = createMockSession();
    const stdin = createFakeStdin();

    // Queue responses for two turns
    mockSession.queueTurn([textDelta("first response\n"), successResult()]);
    mockSession.queueTurn([textDelta("second response\n"), successResult()]);

    // After first turn, send a follow-up, then empty to exit
    setTimeout(() => { stdin.writeLine("follow up question"); }, 50);
    setTimeout(() => { stdin.writeLine(""); }, 200);

    await runInteractive(
      {
        prompt: "initial prompt",
        model: "claude-sonnet-4-20250514",
        context: ["ctx.md"],
        provider: stubProvider,
      },
      () => {},
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        session: mockSession.session,
      },
    );

    expect(mockSession.messages).toHaveLength(2);
    expect(mockSession.messages[0]).toBe("initial prompt");
    expect(mockSession.messages[1]).toBe("follow up question");
  });

  test("agent error mid-session does not terminate the REPL", async () => {
    const mockSession = createMockSession();
    const stdin = createFakeStdin();
    const output: string[] = [];

    // First turn: error result
    mockSession.queueTurn([
      textDelta("partial\n"),
      { type: "result", success: false, errors: ["agent exploded"] },
    ]);
    // Second turn succeeds
    mockSession.queueTurn([textDelta("recovered\n"), successResult()]);

    // After error on first turn, send another prompt, then exit
    setTimeout(() => { stdin.writeLine("try again"); }, 50);
    setTimeout(() => { stdin.writeLine(""); }, 200);

    await runInteractive(
      {
        prompt: "cause error",
        model: "claude-sonnet-4-20250514",
        context: [],
        provider: stubProvider,
      },
      (s) => output.push(s),
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        session: mockSession.session,
      },
    );

    // Error and recovery output should both be present
    const fullOutput = output.join("");
    expect(fullOutput).toContain("agent exploded");
    expect(fullOutput).toContain("recovered");

    // Both turns should have received messages
    expect(mockSession.messages).toHaveLength(2);
  });

  test("no CLI prompt reads first input from readline", async () => {
    const mockSession = createMockSession();
    const stdin = createFakeStdin();
    const promptOutput = new PassThrough();

    mockSession.queueTurn([textDelta("hi\n"), successResult()]);

    // Send the first prompt via stdin, then exit
    setTimeout(() => { stdin.writeLine("hello from stdin"); }, 50);
    setTimeout(() => { stdin.writeLine(""); }, 150);

    await runInteractive(
      {
        model: "claude-sonnet-4-20250514",
        context: [],
        provider: stubProvider,
      },
      () => {},
      {
        input: stdin.stream,
        promptOutput,
        session: mockSession.session,
      },
    );

    expect(mockSession.messages).toHaveLength(1);
    expect(mockSession.messages[0]).toBe("hello from stdin");
  });

  test("no CLI prompt with immediate EOF exits without sending", async () => {
    const mockSession = createMockSession();
    const stdin = createFakeStdin();

    // Immediately end stdin — should exit without sending
    setTimeout(() => { stdin.end(); }, 50);

    await runInteractive(
      {
        model: "claude-sonnet-4-20250514",
        context: [],
        provider: stubProvider,
      },
      () => {},
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        session: mockSession.session,
      },
    );

    // No messages should have been sent
    expect(mockSession.messages).toHaveLength(0);
  });

  test("SIGINT during query calls close() for graceful cleanup", async () => {
    const mockSession = createMockSession();
    const stdin = createFakeStdin();

    // Queue a first turn response — the REPL will pause waiting for input after this
    mockSession.queueTurn([textDelta("working...\n"), successResult()]);

    // When the REPL prompts after the first result, simulate SIGINT
    const signalHandlers = new Map<string, (...args: any[]) => void>();
    setTimeout(() => {
      const handler = signalHandlers.get("SIGINT");
      if (handler) handler("SIGINT");
    }, 50);

    await runInteractive(
      {
        prompt: "test",
        model: "claude-sonnet-4-20250514",
        context: [],
        provider: stubProvider,
      },
      () => {},
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        session: mockSession.session,
        addSignalHandler: (signal, handler) => {
          signalHandlers.set(signal, handler);
        },
        removeSignalHandler: (signal) => {
          signalHandlers.delete(signal);
        },
      },
    );

    // session.close() should have been called for cleanup
    expect(mockSession.closed).toBe(true);
  });

  test("SIGTERM during query calls close() for graceful cleanup", async () => {
    const mockSession = createMockSession();
    const stdin = createFakeStdin();

    mockSession.queueTurn([textDelta("working...\n"), successResult()]);

    const signalHandlers = new Map<string, (...args: any[]) => void>();
    setTimeout(() => {
      const handler = signalHandlers.get("SIGTERM");
      if (handler) handler("SIGTERM");
    }, 50);

    await runInteractive(
      {
        prompt: "test",
        model: "claude-sonnet-4-20250514",
        context: [],
        provider: stubProvider,
      },
      () => {},
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        session: mockSession.session,
        addSignalHandler: (signal, handler) => {
          signalHandlers.set(signal, handler);
        },
        removeSignalHandler: (signal) => {
          signalHandlers.delete(signal);
        },
      },
    );

    expect(mockSession.closed).toBe(true);
  });

  test("signal handlers are removed after REPL exits normally", async () => {
    const mockSession = createMockSession();
    const stdin = createFakeStdin();
    const removedSignals: string[] = [];

    mockSession.queueTurn([textDelta("hi\n"), successResult()]);
    setTimeout(() => { stdin.writeLine(""); }, 50);

    await runInteractive(
      {
        prompt: "test",
        model: "claude-sonnet-4-20250514",
        context: [],
        provider: stubProvider,
      },
      () => {},
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        session: mockSession.session,
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
});

describe("P4: error output routing to stderr", () => {
  test("session stream exception goes to errWrite, not write", async () => {
    const stdin = createFakeStdin();
    const stdout: string[] = [];
    const stderr: string[] = [];

    // Session whose stream() throws immediately
    const throwingSession: InteractiveSession = {
      send: async () => {},
      stream: async function* () {
        throw new Error("query exploded");
      },
      close: () => {},
    };

    await runInteractive(
      {
        prompt: "test",
        model: "claude-sonnet-4-20250514",
        context: [],
        provider: stubProvider,
      },
      (s) => stdout.push(s),
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        session: throwingSession,
      },
      (s) => stderr.push(s),
    );

    expect(stderr.join("")).toContain("query exploded");
    expect(stdout.join("")).not.toContain("query exploded");
  });

  test("non-success result event goes to errWrite", async () => {
    const mockSession = createMockSession();
    const stdin = createFakeStdin();
    const stdout: string[] = [];
    const stderr: string[] = [];

    // Queue an error result
    mockSession.queueTurn([
      textDelta("partial\n"),
      { type: "result", success: false, errors: ["agent failed"] },
    ]);

    // After first result, send empty line to exit
    setTimeout(() => { stdin.writeLine(""); }, 50);

    await runInteractive(
      {
        prompt: "test",
        model: "claude-sonnet-4-20250514",
        context: [],
        provider: stubProvider,
      },
      (s) => stdout.push(s),
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        session: mockSession.session,
      },
      (s) => stderr.push(s),
    );

    // Error details should be in stderr
    expect(stderr.join("")).toContain("agent failed");
    // Normal text output stays in stdout
    expect(stdout.join("")).toContain("partial");
    expect(stdout.join("")).not.toContain("agent failed");
  });
});

const BOLD_GREEN_PROMPT = "\x1b[1;32m> \x1b[0m";

describe("P5: prompt visibility", () => {
  test("initial prompt (no CLI --prompt) writes bold green > to promptOutput", async () => {
    const mockSession = createMockSession();
    const stdin = createFakeStdin();
    const promptOutput = new PassThrough();
    const promptChunks: string[] = [];
    promptOutput.on("data", (chunk: Buffer) =>
      promptChunks.push(chunk.toString()),
    );

    mockSession.queueTurn([textDelta("hi\n"), successResult()]);

    // Send first prompt via stdin, then empty to exit
    setTimeout(() => { stdin.writeLine("hello"); }, 50);
    setTimeout(() => { stdin.writeLine(""); }, 150);

    await runInteractive(
      {
        model: "claude-sonnet-4-20250514",
        context: [],
        provider: stubProvider,
      },
      () => {},
      {
        input: stdin.stream,
        promptOutput,
        session: mockSession.session,
      },
    );

    // The initial prompt should contain bold green "> "
    expect(promptChunks.join("")).toContain(BOLD_GREEN_PROMPT);
  });

  test("after agent result, bold green > appears on promptOutput", async () => {
    const mockSession = createMockSession();
    const stdin = createFakeStdin();
    const promptOutput = new PassThrough();
    const promptChunks: string[] = [];
    promptOutput.on("data", (chunk: Buffer) =>
      promptChunks.push(chunk.toString()),
    );

    mockSession.queueTurn([textDelta("response\n"), successResult()]);

    // Send empty line after result to exit
    setTimeout(() => { stdin.writeLine(""); }, 50);

    await runInteractive(
      {
        prompt: "test",
        model: "claude-sonnet-4-20250514",
        context: [],
        provider: stubProvider,
      },
      () => {},
      {
        input: stdin.stream,
        promptOutput,
        session: mockSession.session,
      },
    );

    expect(promptChunks.join("")).toContain(BOLD_GREEN_PROMPT);
  });

  test("writePrompt inserts newline when lastCharWasNewline is false", () => {
    const output = new PassThrough();
    const chunks: string[] = [];
    output.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));

    const state = createStreamState();
    state.lastCharWasNewline = false;

    writePrompt(output, state);

    expect(chunks.join("")).toBe("\n" + BOLD_GREEN_PROMPT);
  });

  test("writePrompt omits newline when lastCharWasNewline is true", () => {
    const output = new PassThrough();
    const chunks: string[] = [];
    output.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));

    const state = createStreamState();
    state.lastCharWasNewline = true;

    writePrompt(output, state);

    expect(chunks.join("")).toBe(BOLD_GREEN_PROMPT);
  });

  test("prompt does not appear on stdout (piped output stays clean)", async () => {
    const mockSession = createMockSession();
    const stdin = createFakeStdin();
    const stdout: string[] = [];

    mockSession.queueTurn([textDelta("hi\n"), successResult()]);
    setTimeout(() => { stdin.writeLine(""); }, 50);

    await runInteractive(
      {
        prompt: "test",
        model: "claude-sonnet-4-20250514",
        context: [],
        provider: stubProvider,
      },
      (s) => stdout.push(s),
      {
        input: stdin.stream,
        promptOutput: new PassThrough(),
        session: mockSession.session,
      },
    );

    const fullOutput = stdout.join("");
    // stdout should NOT contain the prompt characters
    expect(fullOutput).not.toContain(BOLD_GREEN_PROMPT);
    expect(fullOutput).not.toContain("> ");
  });
});
