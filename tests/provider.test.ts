/**
 * Provider contract type validation tests.
 *
 * These tests verify that the ProviderEvent discriminated union covers all
 * expected variants, that SummaryInfo is correctly defined, and that the
 * Provider interface and ProviderSessionConfig are usable as contracts.
 *
 * Why: The provider contract is the foundation of the multi-provider system.
 * Every provider, adapter, and renderer depends on these types. Catching
 * structural regressions here prevents cascading failures downstream.
 */

import { test, expect, describe } from "bun:test";
import type {
  Provider,
  ProviderSessionConfig,
  ProviderEvent,
  SummaryInfo,
  InteractiveSessionConfig,
  InteractiveSession,
} from "../src/provider";

describe("ProviderEvent discriminated union", () => {
  test("text_delta variant has type and text fields", () => {
    const event: ProviderEvent = { type: "text_delta", text: "hello" };
    expect(event.type).toBe("text_delta");
    expect((event as { type: "text_delta"; text: string }).text).toBe("hello");
  });

  test("tool_start variant has type and name fields", () => {
    const event: ProviderEvent = { type: "tool_start", name: "Bash" };
    expect(event.type).toBe("tool_start");
    expect((event as { type: "tool_start"; name: string }).name).toBe("Bash");
  });

  test("tool_end variant has type, name, and optional detail fields", () => {
    const withDetail: ProviderEvent = {
      type: "tool_end",
      name: "Read",
      detail: "src/index.ts",
    };
    expect(withDetail.type).toBe("tool_end");
    expect(
      (withDetail as { type: "tool_end"; name: string; detail?: string }).detail
    ).toBe("src/index.ts");

    const withoutDetail: ProviderEvent = { type: "tool_end", name: "Read" };
    expect(withoutDetail.type).toBe("tool_end");
    expect(
      (withoutDetail as { type: "tool_end"; name: string; detail?: string })
        .detail
    ).toBeUndefined();
  });

  test("result variant has type, success, summary, and optional errors", () => {
    const summary: SummaryInfo = {
      inputTokens: 100,
      outputTokens: 50,
      numTurns: 1,
      durationMs: 1500,
    };
    const success: ProviderEvent = {
      type: "result",
      success: true,
      summary,
    };
    expect(success.type).toBe("result");

    const failure: ProviderEvent = {
      type: "result",
      success: false,
      errors: ["something went wrong"],
    };
    expect(failure.type).toBe("result");
    expect(
      (
        failure as {
          type: "result";
          success: false;
          errors?: string[];
        }
      ).errors
    ).toEqual(["something went wrong"]);
  });

  test("error variant has type and message fields", () => {
    const event: ProviderEvent = { type: "error", message: "boom" };
    expect(event.type).toBe("error");
    expect((event as { type: "error"; message: string }).message).toBe("boom");
  });

  test("discriminant field 'type' narrows correctly", () => {
    const events: ProviderEvent[] = [
      { type: "text_delta", text: "hi" },
      { type: "tool_start", name: "Bash" },
      { type: "tool_end", name: "Bash", detail: "ls" },
      {
        type: "result",
        success: true,
        summary: {
          inputTokens: 0,
          outputTokens: 0,
          numTurns: 0,
          durationMs: 0,
        },
      },
      { type: "error", message: "fail" },
    ];

    // Verify all 5 variants are covered
    const types = events.map((e) => e.type);
    expect(types).toEqual([
      "text_delta",
      "tool_start",
      "tool_end",
      "result",
      "error",
    ]);
  });
});

describe("SummaryInfo", () => {
  test("has all required numeric fields", () => {
    const info: SummaryInfo = {
      inputTokens: 1234,
      outputTokens: 567,
      numTurns: 3,
      durationMs: 2100,
    };
    expect(info.inputTokens).toBe(1234);
    expect(info.outputTokens).toBe(567);
    expect(info.numTurns).toBe(3);
    expect(info.durationMs).toBe(2100);
  });
});

describe("ProviderSessionConfig", () => {
  test("has required prompt and context, optional model", () => {
    const withModel: ProviderSessionConfig = {
      prompt: "fix the bug",
      model: "sonnet",
      context: ["src/index.ts"],
    };
    expect(withModel.prompt).toBe("fix the bug");
    expect(withModel.model).toBe("sonnet");
    expect(withModel.context).toEqual(["src/index.ts"]);

    const withoutModel: ProviderSessionConfig = {
      prompt: "fix the bug",
      context: [],
    };
    expect(withoutModel.model).toBeUndefined();
  });
});

describe("Provider interface", () => {
  test("can be implemented as a mock object", () => {
    // Verify the Provider interface shape is usable as a contract.
    // A valid implementation must have all required members.
    const mock: Provider = {
      name: "test",
      isAvailable: () => true,
      resolveModel: (alias?: string) => alias,
      knownAliases: () => ({ short: "full-model-id" }),
      createSession: async function* (_config: ProviderSessionConfig) {
        yield { type: "text_delta" as const, text: "hello" };
        yield {
          type: "result" as const,
          success: true,
          summary: {
            inputTokens: 10,
            outputTokens: 5,
            numTurns: 1,
            durationMs: 100,
          },
        };
      },
      createInteractiveSession: (_config: InteractiveSessionConfig): InteractiveSession => {
        throw new Error("not implemented");
      },
    };

    expect(mock.name).toBe("test");
    expect(mock.isAvailable()).toBe(true);
    expect(mock.resolveModel("short")).toBe("short");
    expect(mock.knownAliases()).toEqual({ short: "full-model-id" });
  });

  test("createSession yields ProviderEvent objects", async () => {
    const mock: Provider = {
      name: "test",
      isAvailable: () => true,
      resolveModel: () => undefined,
      knownAliases: () => ({}),
      createSession: async function* () {
        yield { type: "text_delta" as const, text: "output" };
        yield {
          type: "result" as const,
          success: true,
          summary: {
            inputTokens: 0,
            outputTokens: 0,
            numTurns: 1,
            durationMs: 0,
          },
        };
      },
      createInteractiveSession: (_config: InteractiveSessionConfig): InteractiveSession => {
        throw new Error("not implemented");
      },
    };

    const events: ProviderEvent[] = [];
    for await (const event of mock.createSession({
      prompt: "test",
      context: [],
    })) {
      events.push(event);
    }
    expect(events).toHaveLength(2);
    expect(events[0]!.type).toBe("text_delta");
    expect(events[1]!.type).toBe("result");
  });
});

describe("InteractiveSessionConfig", () => {
  test("has optional model and required context, no prompt field", () => {
    const withModel: InteractiveSessionConfig = {
      model: "sonnet",
      context: ["src/index.ts"],
    };
    expect(withModel.model).toBe("sonnet");
    expect(withModel.context).toEqual(["src/index.ts"]);

    const withoutModel: InteractiveSessionConfig = { context: [] };
    expect(withoutModel.model).toBeUndefined();
    expect(withoutModel.context).toEqual([]);
  });
});

describe("InteractiveSession", () => {
  test("mock session has send, stream, and close methods", async () => {
    const session: InteractiveSession = {
      send: async (_message: string) => {},
      stream: async function* () {
        yield { type: "text_delta" as const, text: "hi" };
        yield {
          type: "result" as const,
          success: true,
          summary: { inputTokens: 1, outputTokens: 1, numTurns: 1, durationMs: 10 },
        };
      },
      close: () => {},
    };

    expect(typeof session.send).toBe("function");
    expect(typeof session.stream).toBe("function");
    expect(typeof session.close).toBe("function");
  });

  test("stream yields ProviderEvent objects and ends after result", async () => {
    const session: InteractiveSession = {
      send: async (_message: string) => {},
      stream: async function* () {
        yield { type: "text_delta" as const, text: "response" };
        yield {
          type: "result" as const,
          success: true,
          summary: { inputTokens: 5, outputTokens: 3, numTurns: 1, durationMs: 50 },
        };
      },
      close: () => {},
    };

    const events: ProviderEvent[] = [];
    for await (const event of session.stream()) {
      events.push(event);
    }
    expect(events).toHaveLength(2);
    expect(events[0]!.type).toBe("text_delta");
    expect(events[1]!.type).toBe("result");
  });
});

describe("Provider interface with createInteractiveSession", () => {
  test("mock provider can implement createInteractiveSession returning InteractiveSession", () => {
    const mockSession: InteractiveSession = {
      send: async (_message: string) => {},
      stream: async function* () {},
      close: () => {},
    };

    const mock: Provider = {
      name: "test",
      isAvailable: () => true,
      resolveModel: (alias?: string) => alias,
      knownAliases: () => ({}),
      createSession: async function* (_config: ProviderSessionConfig) {},
      createInteractiveSession: (_config: InteractiveSessionConfig): InteractiveSession => mockSession,
    };

    const session = mock.createInteractiveSession({ context: ["src/foo.ts"] });
    expect(typeof session.send).toBe("function");
    expect(typeof session.stream).toBe("function");
    expect(typeof session.close).toBe("function");
  });

  test("createInteractiveSession config has no prompt field", () => {
    const config: InteractiveSessionConfig = { model: "opus", context: [] };
    // InteractiveSessionConfig has no `prompt` — messages are sent via send()
    expect("prompt" in config).toBe(false);
    expect(config.model).toBe("opus");
  });
});
