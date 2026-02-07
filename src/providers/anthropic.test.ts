import { test, expect, describe, mock } from "bun:test";
import type { Message, ToolDefinition } from "../types.ts";

// We'll import from the implementation once it exists
import {
  extractSystemMessage,
  translateMessages,
  translateTools,
  mapResponse,
  AnthropicProvider,
} from "./anthropic.ts";

// --- extractSystemMessage ---

describe("extractSystemMessage", () => {
  test("returns system message content when present", () => {
    const messages: Message[] = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello" },
    ];
    expect(extractSystemMessage(messages)).toBe("You are a helpful assistant.");
  });

  test("returns undefined when no system message", () => {
    const messages: Message[] = [
      { role: "user", content: "Hello" },
    ];
    expect(extractSystemMessage(messages)).toBeUndefined();
  });
});

// --- translateMessages ---

describe("translateMessages", () => {
  test("maps user messages and excludes system messages", () => {
    const messages: Message[] = [
      { role: "system", content: "System prompt" },
      { role: "user", content: "Hello" },
    ];
    const result = translateMessages(messages);
    expect(result).toEqual([
      { role: "user", content: "Hello" },
    ]);
  });

  test("maps assistant text-only message to string content", () => {
    const messages: Message[] = [
      { role: "assistant", content: "Hi there" },
    ];
    const result = translateMessages(messages);
    expect(result).toEqual([
      { role: "assistant", content: [{ type: "text", text: "Hi there" }] },
    ]);
  });

  test("maps assistant message with tool_calls to content blocks", () => {
    const messages: Message[] = [
      {
        role: "assistant",
        content: "Let me search for that.",
        tool_calls: [
          { id: "tc_1", name: "file_read", args: { path: "src/index.ts" } },
        ],
      },
    ];
    const result = translateMessages(messages);
    expect(result).toEqual([
      {
        role: "assistant",
        content: [
          { type: "text", text: "Let me search for that." },
          { type: "tool_use", id: "tc_1", name: "file_read", input: { path: "src/index.ts" } },
        ],
      },
    ]);
  });

  test("maps tool result message to user message with tool_result block", () => {
    const messages: Message[] = [
      { role: "tool", content: "file contents here", tool_call_id: "tc_1" },
    ];
    const result = translateMessages(messages);
    expect(result).toEqual([
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "tc_1", content: "file contents here" },
        ],
      },
    ]);
  });

  test("preserves message order across mixed types", () => {
    const messages: Message[] = [
      { role: "system", content: "prompt" },
      { role: "user", content: "find files" },
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "tc_1", name: "file_search", args: { pattern: "*.ts" } }],
      },
      { role: "tool", content: "found 3 files", tool_call_id: "tc_1" },
      { role: "assistant", content: "I found 3 TypeScript files." },
    ];
    const result = translateMessages(messages);
    expect(result).toHaveLength(4); // system excluded
    expect(result[0]!.role).toBe("user");
    expect(result[1]!.role).toBe("assistant");
    expect(result[2]!.role).toBe("user"); // tool result becomes user
    expect(result[3]!.role).toBe("assistant");
  });
});

// --- translateTools ---

describe("translateTools", () => {
  test("translates tool definitions to Anthropic input_schema format", () => {
    const tools: ToolDefinition[] = [
      {
        name: "file_read",
        description: "Read a file from disk",
        parameters: {
          path: { type: "string", description: "File path to read", required: true },
          encoding: { type: "string", description: "File encoding" },
        },
      },
    ];
    const result = translateTools(tools);
    expect(result).toEqual([
      {
        name: "file_read",
        description: "Read a file from disk",
        input_schema: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path to read" },
            encoding: { type: "string", description: "File encoding" },
          },
          required: ["path"],
        },
      },
    ]);
  });

  test("handles tool with no required parameters", () => {
    const tools: ToolDefinition[] = [
      {
        name: "session_complete",
        description: "Signal session is done",
        parameters: {},
      },
    ];
    const result = translateTools(tools);
    expect(result[0]!.input_schema.required).toEqual([]);
  });
});

// --- mapResponse ---

describe("mapResponse", () => {
  test("maps text-only response", () => {
    const anthropicResponse = {
      content: [{ type: "text" as const, text: "Hello!" }],
      stop_reason: "end_turn" as const,
    };
    const result = mapResponse(anthropicResponse);
    expect(result.text).toBe("Hello!");
    expect(result.tool_calls).toBeUndefined();
  });

  test("maps tool_use-only response", () => {
    const anthropicResponse = {
      content: [
        { type: "tool_use" as const, id: "tu_1", name: "file_read", input: { path: "README.md" } },
      ],
      stop_reason: "tool_use" as const,
    };
    const result = mapResponse(anthropicResponse);
    expect(result.text).toBeUndefined();
    expect(result.tool_calls).toEqual([
      { id: "tu_1", name: "file_read", args: { path: "README.md" } },
    ]);
  });

  test("maps mixed text + tool_use response", () => {
    const anthropicResponse = {
      content: [
        { type: "text" as const, text: "Let me read that file." },
        { type: "tool_use" as const, id: "tu_2", name: "file_read", input: { path: "src/index.ts" } },
      ],
      stop_reason: "tool_use" as const,
    };
    const result = mapResponse(anthropicResponse);
    expect(result.text).toBe("Let me read that file.");
    expect(result.tool_calls).toEqual([
      { id: "tu_2", name: "file_read", args: { path: "src/index.ts" } },
    ]);
  });

  test("maps response with multiple tool calls", () => {
    const anthropicResponse = {
      content: [
        { type: "tool_use" as const, id: "tu_1", name: "file_read", input: { path: "a.ts" } },
        { type: "tool_use" as const, id: "tu_2", name: "file_read", input: { path: "b.ts" } },
      ],
      stop_reason: "tool_use" as const,
    };
    const result = mapResponse(anthropicResponse);
    expect(result.tool_calls).toHaveLength(2);
    expect(result.tool_calls![0]!.id).toBe("tu_1");
    expect(result.tool_calls![1]!.id).toBe("tu_2");
  });
});

// --- AnthropicProvider.complete() integration ---

describe("AnthropicProvider.complete", () => {
  test("calls Anthropic API and returns mapped response", async () => {
    // Create provider with mock client
    const provider = new AnthropicProvider({ apiKey: "test-key", model: "claude-sonnet-4-5-20250929" });

    // Replace the internal client with a mock
    const mockCreate = mock(() =>
      Promise.resolve({
        content: [{ type: "text" as const, text: "I can help with that." }],
        stop_reason: "end_turn" as const,
        id: "msg_123",
        type: "message" as const,
        role: "assistant" as const,
        model: "claude-sonnet-4-5-20250929",
        usage: { input_tokens: 10, output_tokens: 5 },
      })
    );
    // @ts-expect-error — replacing private client for testing
    provider.client = { messages: { create: mockCreate } };

    const result = await provider.complete(
      [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Hello" },
      ],
      [
        {
          name: "file_read",
          description: "Read a file",
          parameters: { path: { type: "string", description: "File path", required: true } },
        },
      ]
    );

    expect(result.text).toBe("I can help with that.");
    expect(result.tool_calls).toBeUndefined();

    // Verify the mock was called with correct translation
    expect(mockCreate).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callArgs = (mockCreate.mock.calls as any)[0][0] as Record<string, any>;
    expect(callArgs.system).toBe("You are helpful.");
    expect(callArgs.messages).toEqual([{ role: "user", content: "Hello" }]);
    expect(callArgs.tools[0].name).toBe("file_read");
    expect(callArgs.tools[0].input_schema).toBeDefined();
  });
});
