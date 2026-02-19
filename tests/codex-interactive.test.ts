/**
 * Tests for src/codex-interactive.ts
 *
 * Uses mock.module("@openai/codex-sdk") and CodexInteractiveOverrides
 * for dependency injection. No real SDK or network calls.
 */
import { test, expect, describe, mock } from "bun:test";
import { Readable, Writable, PassThrough } from "node:stream";

// ---- Mock factories -------------------------------------------------------

/** Creates an in-memory Readable that emits lines from the array. */
function makeInput(lines: (string | null)[]): Readable {
  const r = new Readable({ read() {} });
  const iter = lines[Symbol.iterator]();
  const pushNext = () => {
    const { value, done } = iter.next();
    if (done) {
      r.push(null);
    } else if (value === null) {
      r.push(null);
    } else {
      r.push(value + "\n");
    }
  };
  // Schedule all pushes asynchronously
  for (let i = 0; i < lines.length + 1; i++) {
    setTimeout(pushNext, i * 5);
  }
  return r;
}

/** Creates a writable that collects written data into a string. */
function makeOutput(): { stream: Writable; data: () => string } {
  let buf = "";
  const stream = new Writable({
    write(chunk, _enc, cb) {
      buf += chunk.toString();
      cb();
    },
  });
  return { stream, data: () => buf };
}

/** Creates a mock thread that yields turn.completed events. */
function makeMockThread(agentReplies: string[] = []) {
  let callIndex = 0;
  return {
    id: null,
    async runStreamed(_input: string) {
      const reply = agentReplies[callIndex] ?? "";
      callIndex++;
      async function* gen() {
        if (reply) {
          yield {
            type: "item.completed",
            item: { type: "agent_message", id: "1", text: reply },
          };
        }
        yield {
          type: "turn.completed",
          usage: { input_tokens: 10, output_tokens: 5, cached_input_tokens: 0 },
        };
      }
      return { events: gen() };
    },
  };
}

/** Creates a mock Codex class tracking startThread calls and sharing a thread. */
function makeMockCodex(thread: ReturnType<typeof makeMockThread>) {
  const startThreadCalls: (any | undefined)[] = [];
  const MockCodex = class {
    startThread(opts?: any) {
      startThreadCalls.push(opts);
      return thread;
    }
  };
  (MockCodex as any)._calls = startThreadCalls;
  (MockCodex as any)._thread = thread;
  return MockCodex;
}

// ---- Helpers ---------------------------------------------------------------

async function collect<T>(gen: AsyncIterable<T>): Promise<T[]> {
  const results: T[] = [];
  for await (const item of gen) results.push(item);
  return results;
}

// ---- Tests: SDK not installed ----------------------------------------------

describe("runCodexInteractive - SDK not installed", () => {
  test("@openai/codex-sdk missing Codex export writes error and returns", async () => {
    // Simulate corrupted SDK by exporting Codex as undefined.
    // Using { Codex: undefined } (not {}) avoids a named-import SyntaxError
    // while still triggering the runtime typeof-guard in the implementation.
    mock.module("@openai/codex-sdk", () => ({ Codex: undefined }));
    // @ts-ignore
    Bun.env.OPENAI_API_KEY = "sk-test";

    const { runCodexInteractive } = await import("../src/codex-interactive");
    const errWritten: string[] = [];
    const out = makeOutput();
    await runCodexInteractive(
      { context: [] },
      () => {},
      { input: makeInput([]), promptOutput: out.stream },
      (s) => errWritten.push(s),
    );

    const msg = errWritten.join("");
    expect(msg).toContain("@openai/codex-sdk");
    expect(msg).toContain("bun add @openai/codex-sdk");
  });
});

// ---- Tests: API key validation ---------------------------------------------

describe("runCodexInteractive - API key validation", () => {
  test("missing OPENAI_API_KEY calls errWrite and returns early", async () => {
    mock.module("@openai/codex-sdk", () => ({
      Codex: makeMockCodex(makeMockThread()),
    }));
    // @ts-ignore
    delete Bun.env.OPENAI_API_KEY;

    const { runCodexInteractive } = await import("../src/codex-interactive");

    const written: string[] = [];
    const errWritten: string[] = [];
    const out = makeOutput();
    await runCodexInteractive(
      { context: [] },
      (s) => written.push(s),
      { input: makeInput([]), promptOutput: out.stream },
      (s) => errWritten.push(s),
    );

    const combined = [...written, ...errWritten].join("");
    expect(combined).toContain("OPENAI_API_KEY");
  });

  test("whitespace-only OPENAI_API_KEY calls errWrite and returns early", async () => {
    mock.module("@openai/codex-sdk", () => ({
      Codex: makeMockCodex(makeMockThread()),
    }));
    // @ts-ignore
    Bun.env.OPENAI_API_KEY = "   ";

    const { runCodexInteractive } = await import("../src/codex-interactive");

    const errWritten: string[] = [];
    const out = makeOutput();
    await runCodexInteractive(
      { context: [] },
      () => {},
      { input: makeInput([]), promptOutput: out.stream },
      (s) => errWritten.push(s),
    );

    expect(errWritten.join("")).toContain("OPENAI_API_KEY");
    // @ts-ignore
    Bun.env.OPENAI_API_KEY = "sk-test";
  });
});

// ---- Tests: first prompt handling -----------------------------------------

describe("runCodexInteractive - first prompt", () => {
  test("config.prompt is used as first input when provided", async () => {
    const capturedInputs: string[] = [];
    const thread = {
      id: null,
      async runStreamed(input: string) {
        capturedInputs.push(input);
        async function* gen() {
          yield { type: "turn.completed", usage: { input_tokens: 5, output_tokens: 5, cached_input_tokens: 0 } };
        }
        return { events: gen() };
      },
    };
    const MockCodex = class { startThread() { return thread; } };
    mock.module("@openai/codex-sdk", () => ({ Codex: MockCodex }));
    // @ts-ignore
    Bun.env.OPENAI_API_KEY = "sk-test";

    const { runCodexInteractive } = await import("../src/codex-interactive");
    const out = makeOutput();
    await runCodexInteractive(
      { prompt: "my initial prompt", context: [] },
      () => {},
      { input: makeInput([""]), promptOutput: out.stream },
    );

    expect(capturedInputs[0]).toContain("my initial prompt");
  });

  test("first readline input is used as prompt when config.prompt is absent", async () => {
    const capturedInputs: string[] = [];
    const thread = {
      id: null,
      async runStreamed(input: string) {
        capturedInputs.push(input);
        async function* gen() {
          yield { type: "turn.completed", usage: { input_tokens: 5, output_tokens: 5, cached_input_tokens: 0 } };
        }
        return { events: gen() };
      },
    };
    const MockCodex = class { startThread() { return thread; } };
    mock.module("@openai/codex-sdk", () => ({ Codex: MockCodex }));
    // @ts-ignore
    Bun.env.OPENAI_API_KEY = "sk-test";

    const { runCodexInteractive } = await import("../src/codex-interactive");
    const out = makeOutput();
    await runCodexInteractive(
      { context: [] },
      () => {},
      { input: makeInput(["first line", ""]), promptOutput: out.stream },
    );

    expect(capturedInputs[0]).toContain("first line");
  });

  test("empty first readline input exits immediately without calling runStreamed", async () => {
    let runStreamedCalls = 0;
    const thread = {
      id: null,
      async runStreamed(_input: string) {
        runStreamedCalls++;
        async function* gen() {
          yield { type: "turn.completed", usage: { input_tokens: 5, output_tokens: 5, cached_input_tokens: 0 } };
        }
        return { events: gen() };
      },
    };
    const MockCodex = class { startThread() { return thread; } };
    mock.module("@openai/codex-sdk", () => ({ Codex: MockCodex }));
    // @ts-ignore
    Bun.env.OPENAI_API_KEY = "sk-test";

    const { runCodexInteractive } = await import("../src/codex-interactive");
    const out = makeOutput();
    await runCodexInteractive(
      { context: [] },
      () => {},
      { input: makeInput([""]), promptOutput: out.stream },
    );

    expect(runStreamedCalls).toBe(0);
  });

  test("EOF first input exits immediately without calling runStreamed", async () => {
    let runStreamedCalls = 0;
    const thread = {
      id: null,
      async runStreamed(_input: string) {
        runStreamedCalls++;
        async function* gen() {
          yield { type: "turn.completed", usage: { input_tokens: 5, output_tokens: 5, cached_input_tokens: 0 } };
        }
        return { events: gen() };
      },
    };
    const MockCodex = class { startThread() { return thread; } };
    mock.module("@openai/codex-sdk", () => ({ Codex: MockCodex }));
    // @ts-ignore
    Bun.env.OPENAI_API_KEY = "sk-test";

    const { runCodexInteractive } = await import("../src/codex-interactive");
    const out = makeOutput();
    await runCodexInteractive(
      { context: [] },
      () => {},
      { input: makeInput([null]), promptOutput: out.stream },
    );

    expect(runStreamedCalls).toBe(0);
  });
});

// ---- Tests: context handling -----------------------------------------------

describe("runCodexInteractive - context", () => {
  test("buildPrompt is called on first turn with context paths", async () => {
    const capturedInputs: string[] = [];
    const thread = {
      id: null,
      async runStreamed(input: string) {
        capturedInputs.push(input);
        async function* gen() {
          yield { type: "turn.completed", usage: { input_tokens: 5, output_tokens: 5, cached_input_tokens: 0 } };
        }
        return { events: gen() };
      },
    };
    const MockCodex = class { startThread() { return thread; } };
    mock.module("@openai/codex-sdk", () => ({ Codex: MockCodex }));
    // @ts-ignore
    Bun.env.OPENAI_API_KEY = "sk-test";

    const { runCodexInteractive } = await import("../src/codex-interactive");
    const out = makeOutput();
    await runCodexInteractive(
      { prompt: "do work", context: ["./src", "./tests"] },
      () => {},
      { input: makeInput([""]), promptOutput: out.stream },
    );

    expect(capturedInputs[0]).toContain("Context: ./src");
    expect(capturedInputs[0]).toContain("Context: ./tests");
    expect(capturedInputs[0]).toContain("do work");
  });

  test("context NOT applied on second turn", async () => {
    const capturedInputs: string[] = [];
    const thread = {
      id: null,
      async runStreamed(input: string) {
        capturedInputs.push(input);
        async function* gen() {
          yield { type: "turn.completed", usage: { input_tokens: 5, output_tokens: 5, cached_input_tokens: 0 } };
        }
        return { events: gen() };
      },
    };
    const MockCodex = class { startThread() { return thread; } };
    mock.module("@openai/codex-sdk", () => ({ Codex: MockCodex }));
    // @ts-ignore
    Bun.env.OPENAI_API_KEY = "sk-test";

    const { runCodexInteractive } = await import("../src/codex-interactive");
    const out = makeOutput();
    await runCodexInteractive(
      { prompt: "first", context: ["./src"] },
      () => {},
      { input: makeInput(["second turn", ""]), promptOutput: out.stream },
    );

    // First call has context prepended
    expect(capturedInputs[0]).toContain("Context: ./src");
    // Second call is just the raw input
    expect(capturedInputs[1]).toBe("second turn");
    expect(capturedInputs[1]).not.toContain("Context:");
  });
});

// ---- Tests: multi-turn / thread reuse -----------------------------------------------

describe("runCodexInteractive - thread reuse", () => {
  test("startThread called once and same thread reused across turns", async () => {
    const threadInstance = makeMockThread(["response 1", "response 2"]);
    const MockCodex = makeMockCodex(threadInstance);
    mock.module("@openai/codex-sdk", () => ({ Codex: MockCodex }));
    // @ts-ignore
    Bun.env.OPENAI_API_KEY = "sk-test";

    const { runCodexInteractive } = await import("../src/codex-interactive");
    const out = makeOutput();
    await runCodexInteractive(
      { prompt: "turn1", context: [] },
      () => {},
      { input: makeInput(["turn2", ""]), promptOutput: out.stream },
    );

    // startThread called exactly once
    const calls = (MockCodex as any)._calls;
    expect(calls.length).toBe(1);
  });

  test("empty follow-up input exits after first turn", async () => {
    let runStreamedCalls = 0;
    const thread = {
      id: null,
      async runStreamed(_input: string) {
        runStreamedCalls++;
        async function* gen() {
          yield { type: "turn.completed", usage: { input_tokens: 5, output_tokens: 5, cached_input_tokens: 0 } };
        }
        return { events: gen() };
      },
    };
    const MockCodex = class { startThread() { return thread; } };
    mock.module("@openai/codex-sdk", () => ({ Codex: MockCodex }));
    // @ts-ignore
    Bun.env.OPENAI_API_KEY = "sk-test";

    const { runCodexInteractive } = await import("../src/codex-interactive");
    const out = makeOutput();
    await runCodexInteractive(
      { prompt: "first", context: [] },
      () => {},
      { input: makeInput([""]), promptOutput: out.stream },
    );

    expect(runStreamedCalls).toBe(1);
  });
});

// ---- Tests: model passing --------------------------------------------------

describe("runCodexInteractive - model", () => {
  test("model passed to startThread when defined", async () => {
    const threadInstance = makeMockThread();
    const MockCodex = makeMockCodex(threadInstance);
    mock.module("@openai/codex-sdk", () => ({ Codex: MockCodex }));
    // @ts-ignore
    Bun.env.OPENAI_API_KEY = "sk-test";

    const { runCodexInteractive } = await import("../src/codex-interactive");
    const out = makeOutput();
    await runCodexInteractive(
      { prompt: "hello", model: "gpt-4o", context: [] },
      () => {},
      { input: makeInput([""]), promptOutput: out.stream },
    );

    const calls = (MockCodex as any)._calls;
    expect(calls[0]?.model).toBe("gpt-4o");
  });

  test("model omitted from startThread when undefined", async () => {
    const threadInstance = makeMockThread();
    const MockCodex = makeMockCodex(threadInstance);
    mock.module("@openai/codex-sdk", () => ({ Codex: MockCodex }));
    // @ts-ignore
    Bun.env.OPENAI_API_KEY = "sk-test";

    const { runCodexInteractive } = await import("../src/codex-interactive");
    const out = makeOutput();
    await runCodexInteractive(
      { prompt: "hello", model: undefined, context: [] },
      () => {},
      { input: makeInput([""]), promptOutput: out.stream },
    );

    const calls = (MockCodex as any)._calls;
    const opts = calls[0];
    expect(opts === undefined || opts === null || opts?.model === undefined).toBe(true);
  });
});

// ---- Tests: prompt output --------------------------------------------------

describe("runCodexInteractive - prompt output", () => {
  test("prompt written to promptOutput (stderr by convention)", async () => {
    const thread = {
      id: null,
      async runStreamed(_input: string) {
        async function* gen() {
          yield { type: "turn.completed", usage: { input_tokens: 5, output_tokens: 5, cached_input_tokens: 0 } };
        }
        return { events: gen() };
      },
    };
    const MockCodex = class { startThread() { return thread; } };
    mock.module("@openai/codex-sdk", () => ({ Codex: MockCodex }));
    // @ts-ignore
    Bun.env.OPENAI_API_KEY = "sk-test";

    const { runCodexInteractive } = await import("../src/codex-interactive");
    const { stream: promptOut, data: promptData } = makeOutput();
    await runCodexInteractive(
      { context: [] },
      () => {},
      { input: makeInput(["hello", ""]), promptOutput: promptOut },
    );

    // The > prompt should have been written to promptOutput
    expect(promptData()).toContain(">");
  });
});

// ---- Tests: SIGINT/SIGTERM handling ----------------------------------------

describe("runCodexInteractive - signal handling", () => {
  test("SIGINT and SIGTERM handlers are registered and removed", async () => {
    const thread = {
      id: null,
      async runStreamed(_input: string) {
        async function* gen() {
          yield { type: "turn.completed", usage: { input_tokens: 5, output_tokens: 5, cached_input_tokens: 0 } };
        }
        return { events: gen() };
      },
    };
    const MockCodex = class { startThread() { return thread; } };
    mock.module("@openai/codex-sdk", () => ({ Codex: MockCodex }));
    // @ts-ignore
    Bun.env.OPENAI_API_KEY = "sk-test";

    const addedSignals: string[] = [];
    const removedSignals: string[] = [];

    const { runCodexInteractive } = await import("../src/codex-interactive");
    const out = makeOutput();
    await runCodexInteractive(
      { prompt: "hi", context: [] },
      () => {},
      {
        input: makeInput([""]),
        promptOutput: out.stream,
        addSignalHandler: (sig) => addedSignals.push(sig),
        removeSignalHandler: (sig) => removedSignals.push(sig),
      },
    );

    expect(addedSignals).toContain("SIGINT");
    expect(addedSignals).toContain("SIGTERM");
    expect(removedSignals).toContain("SIGINT");
    expect(removedSignals).toContain("SIGTERM");
  });
});
