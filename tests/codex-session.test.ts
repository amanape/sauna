/**
 * Tests for src/codex-session.ts
 *
 * Uses mock.module("@openai/codex-sdk") to avoid real SDK calls.
 */
import { test, expect, describe, mock, afterEach } from "bun:test";

// ---- Mock factories -------------------------------------------------------

/** Creates a mock thread that yields the provided events from runStreamed(). */
function makeMockThread(events: any[] = []) {
  return {
    runStreamedCalls: [] as { input: string; model?: string }[],
    async runStreamed(input: string) {
      async function* gen() {
        yield {
          type: "turn.completed",
          usage: { input_tokens: 10, output_tokens: 5, cached_input_tokens: 0 },
        };
        for (const e of events) {
          yield e;
        }
      }
      return { events: gen() };
    },
  };
}

/** Creates a mock Codex class that records startThread calls. */
function makeMockCodex(thread: ReturnType<typeof makeMockThread>) {
  const startThreadCalls: (any | undefined)[] = [];
  const CodexMock = class {
    startThread(options?: any) {
      startThreadCalls.push(options);
      return thread;
    }
  };
  (CodexMock as any)._startThreadCalls = startThreadCalls;
  return CodexMock;
}

// ---- Helpers ---------------------------------------------------------------

async function collect<T>(gen: AsyncIterable<T>): Promise<T[]> {
  const results: T[] = [];
  for await (const item of gen) results.push(item);
  return results;
}

// ---- Tests ------------------------------------------------------------------

describe("runCodexSession - API key validation", () => {
  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    // @ts-ignore
    delete Bun.env.OPENAI_API_KEY;
  });

  test("missing OPENAI_API_KEY yields error result", async () => {
    mock.module("@openai/codex-sdk", () => ({
      Codex: makeMockCodex(makeMockThread()),
    }));
    // @ts-ignore
    delete Bun.env.OPENAI_API_KEY;

    const { runCodexSession } = await import("../src/codex-session");
    const msgs = await collect(
      runCodexSession({ prompt: "hello", context: [] })
    );
    const err = msgs.find((m) => m.type === "result" && m.subtype === "error_during_execution");
    expect(err).toBeDefined();
    expect(Array.isArray(err!.errors)).toBe(true);
    expect(typeof err!.errors[0]).toBe("string");
    expect(err!.errors[0]).toContain("OPENAI_API_KEY");
  });

  test("OPENAI_API_KEY error message includes step-by-step fix instructions", async () => {
    mock.module("@openai/codex-sdk", () => ({
      Codex: makeMockCodex(makeMockThread()),
    }));
    // @ts-ignore
    delete Bun.env.OPENAI_API_KEY;

    const { runCodexSession } = await import("../src/codex-session");
    const msgs = await collect(
      runCodexSession({ prompt: "hello", context: [] })
    );
    const err = msgs.find((m) => m.type === "result" && m.subtype === "error_during_execution");
    expect(err).toBeDefined();
    const msg = err!.errors[0] as string;
    // Spec: step-by-step instructions with .env file option
    expect(msg).toContain("OPENAI_API_KEY");
    expect(msg).toContain("platform.openai.com/api-keys");
    expect(msg).toContain(".env");
  });

  test("empty string OPENAI_API_KEY yields error result", async () => {
    mock.module("@openai/codex-sdk", () => ({
      Codex: makeMockCodex(makeMockThread()),
    }));
    // @ts-ignore
    Bun.env.OPENAI_API_KEY = "   ";

    const { runCodexSession } = await import("../src/codex-session");
    const msgs = await collect(
      runCodexSession({ prompt: "hello", context: [] })
    );
    const err = msgs.find((m) => m.type === "result" && m.subtype === "error_during_execution");
    expect(err).toBeDefined();
    expect(err!.errors[0]).toContain("OPENAI_API_KEY");
  });
});

describe("runCodexSession - model handling", () => {
  afterEach(() => {
    // @ts-ignore
    Bun.env.OPENAI_API_KEY = "sk-test-key";
  });

  test("model passed to startThread when defined", async () => {
    const thread = makeMockThread();
    const MockCodex = makeMockCodex(thread);
    mock.module("@openai/codex-sdk", () => ({ Codex: MockCodex }));
    // @ts-ignore
    Bun.env.OPENAI_API_KEY = "sk-test-key";

    const { runCodexSession } = await import("../src/codex-session");
    await collect(runCodexSession({ prompt: "hello", model: "gpt-4o", context: [] }));

    const calls = (MockCodex as any)._startThreadCalls;
    expect(calls.length).toBe(1);
    expect(calls[0]).toBeDefined();
    expect(calls[0].model).toBe("gpt-4o");
  });

  test("model omitted from startThread when undefined", async () => {
    const thread = makeMockThread();
    const MockCodex = makeMockCodex(thread);
    mock.module("@openai/codex-sdk", () => ({ Codex: MockCodex }));
    // @ts-ignore
    Bun.env.OPENAI_API_KEY = "sk-test-key";

    const { runCodexSession } = await import("../src/codex-session");
    await collect(runCodexSession({ prompt: "hello", model: undefined, context: [] }));

    const calls = (MockCodex as any)._startThreadCalls;
    expect(calls.length).toBe(1);
    // Either no arg passed or model property absent/undefined
    const opts = calls[0];
    expect(opts === undefined || opts === null || opts?.model === undefined).toBe(true);
  });
});

describe("runCodexSession - context handling", () => {
  test("buildPrompt prepends context paths to the prompt", async () => {
    const capturedInputs: string[] = [];
    const thread = {
      async runStreamed(input: string) {
        capturedInputs.push(input);
        async function* gen() {
          yield {
            type: "turn.completed",
            usage: { input_tokens: 5, output_tokens: 2, cached_input_tokens: 0 },
          };
        }
        return { events: gen() };
      },
    };
    const MockCodex = class {
      startThread() { return thread; }
    };
    mock.module("@openai/codex-sdk", () => ({ Codex: MockCodex }));
    // @ts-ignore
    Bun.env.OPENAI_API_KEY = "sk-test-key";

    const { runCodexSession } = await import("../src/codex-session");
    await collect(
      runCodexSession({ prompt: "do something", context: ["./src", "./README.md"] })
    );

    expect(capturedInputs.length).toBe(1);
    expect(capturedInputs[0]).toContain("Context: ./src");
    expect(capturedInputs[0]).toContain("Context: ./README.md");
    expect(capturedInputs[0]).toContain("do something");
  });

  test("no context results in prompt passed as-is", async () => {
    const capturedInputs: string[] = [];
    const thread = {
      async runStreamed(input: string) {
        capturedInputs.push(input);
        async function* gen() {
          yield {
            type: "turn.completed",
            usage: { input_tokens: 5, output_tokens: 2, cached_input_tokens: 0 },
          };
        }
        return { events: gen() };
      },
    };
    const MockCodex = class {
      startThread() { return thread; }
    };
    mock.module("@openai/codex-sdk", () => ({ Codex: MockCodex }));
    // @ts-ignore
    Bun.env.OPENAI_API_KEY = "sk-test-key";

    const { runCodexSession } = await import("../src/codex-session");
    await collect(runCodexSession({ prompt: "my prompt", context: [] }));

    expect(capturedInputs[0]).toBe("my prompt");
  });
});

describe("runCodexSession - SDK error handling", () => {
  test("runStreamed throwing yields result/error_during_execution (not uncaught exception)", async () => {
    const thread = {
      async runStreamed(_input: string): Promise<any> {
        throw new Error("SDK connection failed");
      },
    };
    const MockCodex = class {
      startThread() { return thread; }
    };
    mock.module("@openai/codex-sdk", () => ({ Codex: MockCodex }));
    // @ts-ignore
    Bun.env.OPENAI_API_KEY = "sk-test-key";

    const { runCodexSession } = await import("../src/codex-session");
    const msgs = await collect(runCodexSession({ prompt: "test", context: [] }));

    const result = msgs.find((m) => m.type === "result");
    expect(result).toBeDefined();
    expect(result!.subtype).toBe("error_during_execution");
    expect(Array.isArray(result!.errors)).toBe(true);
    expect(typeof result!.errors[0]).toBe("string");
    expect(result!.errors[0]).toContain("SDK connection failed");
  });

  test("auth error (status 401) from runStreamed yields classified message", async () => {
    const thread = {
      async runStreamed(_input: string): Promise<any> {
        throw Object.assign(new Error("Incorrect API key"), { status: 401 });
      },
    };
    const MockCodex = class { startThread() { return thread; } };
    mock.module("@openai/codex-sdk", () => ({ Codex: MockCodex }));
    // @ts-ignore
    Bun.env.OPENAI_API_KEY = "sk-invalid-key";

    const { runCodexSession } = await import("../src/codex-session");
    const msgs = await collect(runCodexSession({ prompt: "test", context: [] }));

    const result = msgs.find((m) => m.type === "result");
    expect(result!.subtype).toBe("error_during_execution");
    expect(result!.errors[0]).toContain("OpenAI authentication failed");
    expect(result!.errors[0]).toContain("platform.openai.com/api-keys");
  });

  test("rate limit error (status 429) from runStreamed yields classified message", async () => {
    const thread = {
      async runStreamed(_input: string): Promise<any> {
        throw Object.assign(new Error("Too many requests"), { status: 429 });
      },
    };
    const MockCodex = class { startThread() { return thread; } };
    mock.module("@openai/codex-sdk", () => ({ Codex: MockCodex }));
    // @ts-ignore
    Bun.env.OPENAI_API_KEY = "sk-test-key";

    const { runCodexSession } = await import("../src/codex-session");
    const msgs = await collect(runCodexSession({ prompt: "test", context: [] }));

    const result = msgs.find((m) => m.type === "result");
    expect(result!.subtype).toBe("error_during_execution");
    expect(result!.errors[0]).toContain("OpenAI rate limit reached");
    expect(result!.errors[0]).toContain("Tip:");
  });

  test("network error (ECONNREFUSED) from runStreamed yields classified message", async () => {
    const thread = {
      async runStreamed(_input: string): Promise<any> {
        throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:443"), { code: "ECONNREFUSED" });
      },
    };
    const MockCodex = class { startThread() { return thread; } };
    mock.module("@openai/codex-sdk", () => ({ Codex: MockCodex }));
    // @ts-ignore
    Bun.env.OPENAI_API_KEY = "sk-test-key";

    const { runCodexSession } = await import("../src/codex-session");
    const msgs = await collect(runCodexSession({ prompt: "test", context: [] }));

    const result = msgs.find((m) => m.type === "result");
    expect(result!.subtype).toBe("error_during_execution");
    expect(result!.errors[0]).toContain("Could not connect to OpenAI API");
  });
});

describe("runCodexSession - SDK not installed", () => {
  test("@openai/codex-sdk missing Codex export yields error_during_execution with install instructions", async () => {
    // Simulate corrupted SDK by exporting Codex as undefined.
    // Using { Codex: undefined } (not {}) avoids a named-import SyntaxError
    // while still triggering the runtime typeof-guard in the implementation.
    mock.module("@openai/codex-sdk", () => ({ Codex: undefined }));
    // @ts-ignore
    Bun.env.OPENAI_API_KEY = "sk-test";

    const { runCodexSession } = await import("../src/codex-session");
    const msgs = await collect(runCodexSession({ prompt: "hello", context: [] }));

    const err = msgs.find((m) => m.type === "result" && m.subtype === "error_during_execution");
    expect(err).toBeDefined();
    expect(err!.errors[0]).toContain("@openai/codex-sdk");
    expect(err!.errors[0]).toContain("bun add @openai/codex-sdk");
  });
});

describe("runCodexSession - message adaptation", () => {
  test("yields adapted messages from adaptCodexEvents", async () => {
    const thread = {
      async runStreamed(_input: string) {
        async function* gen() {
          yield {
            type: "item.completed",
            item: { type: "agent_message", id: "1", text: "Done!" },
          };
          yield {
            type: "turn.completed",
            usage: { input_tokens: 20, output_tokens: 10, cached_input_tokens: 0 },
          };
        }
        return { events: gen() };
      },
    };
    const MockCodex = class {
      startThread() { return thread; }
    };
    mock.module("@openai/codex-sdk", () => ({ Codex: MockCodex }));
    // @ts-ignore
    Bun.env.OPENAI_API_KEY = "sk-test-key";

    const { runCodexSession } = await import("../src/codex-session");
    const msgs = await collect(
      runCodexSession({ prompt: "test", context: [] })
    );

    const textMsg = msgs.find(
      (m) =>
        m.type === "stream_event" &&
        m.event?.type === "content_block_delta" &&
        m.event?.delta?.type === "text_delta"
    );
    expect(textMsg).toBeDefined();
    expect(textMsg!.event.delta.text).toBe("Done!");

    const result = msgs.find((m) => m.type === "result" && m.subtype === "success");
    expect(result).toBeDefined();
    expect(result!.usage.input_tokens).toBe(20);
    expect(result!.usage.output_tokens).toBe(10);
  });
});
