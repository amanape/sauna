import { describe, test, expect } from "bun:test";
import { adaptCodexEvent } from "../src/providers/codex";

// Local ThreadEvent types mirroring @openai/codex-sdk shape (used for test fixtures only)
type ThreadItem =
  | { type: "command_execution"; command: string; exitCode: number | null }
  | { type: "file_change"; changes: Array<{ path: string }> }
  | { type: "mcp_tool_call"; tool: string }
  | { type: "web_search"; query: string }
  | { type: "agent_message"; text: string }
  | { type: "error"; message: string }
  | { type: "reasoning" }
  | { type: "todo_list" };

type ThreadEvent =
  | { type: "thread.started" }
  | { type: "turn.started" }
  | { type: "turn.completed"; usage: { input_tokens: number; output_tokens: number } }
  | { type: "turn.failed"; error: { message: string } }
  | { type: "item.started"; item: ThreadItem }
  | { type: "item.updated"; item: ThreadItem }
  | { type: "item.completed"; item: ThreadItem };

describe("adaptCodexEvent — command_execution", () => {
  test("item.started + command_execution → tool_start Bash", () => {
    const event: ThreadEvent = {
      type: "item.started",
      item: { type: "command_execution", command: "ls -la", exitCode: null },
    };
    expect(adaptCodexEvent(event, 1000)).toEqual([{ type: "tool_start", name: "Bash" }]);
  });

  test("item.completed + command_execution → tool_end Bash with detail", () => {
    const event: ThreadEvent = {
      type: "item.completed",
      item: { type: "command_execution", command: "ls -la", exitCode: 0 },
    };
    expect(adaptCodexEvent(event, 1000)).toEqual([{ type: "tool_end", name: "Bash", detail: "ls -la" }]);
  });

  test("item.completed + command_execution redacts secrets in detail", () => {
    const event: ThreadEvent = {
      type: "item.completed",
      item: { type: "command_execution", command: "SECRET=value ls", exitCode: 0 },
    };
    expect(adaptCodexEvent(event, 1000)).toEqual([{ type: "tool_end", name: "Bash", detail: "SECRET=*** ls" }]);
  });

  test("item.completed + command_execution with null exit code → no events", () => {
    const event: ThreadEvent = {
      type: "item.completed",
      item: { type: "command_execution", command: "ls", exitCode: null },
    };
    expect(adaptCodexEvent(event, 1000)).toEqual([]);
  });
});

describe("adaptCodexEvent — file_change", () => {
  test("item.started + file_change → tool_start Edit", () => {
    const event: ThreadEvent = {
      type: "item.started",
      item: { type: "file_change", changes: [{ path: "src/foo.ts" }] },
    };
    expect(adaptCodexEvent(event, 1000)).toEqual([{ type: "tool_start", name: "Edit" }]);
  });

  test("item.completed + file_change with changes → tool_end Edit with first path", () => {
    const event: ThreadEvent = {
      type: "item.completed",
      item: { type: "file_change", changes: [{ path: "src/foo.ts" }, { path: "src/bar.ts" }] },
    };
    expect(adaptCodexEvent(event, 1000)).toEqual([{ type: "tool_end", name: "Edit", detail: "src/foo.ts" }]);
  });

  test("item.completed + file_change with empty changes → tool_end Edit without detail", () => {
    const event: ThreadEvent = {
      type: "item.completed",
      item: { type: "file_change", changes: [] },
    };
    expect(adaptCodexEvent(event, 1000)).toEqual([{ type: "tool_end", name: "Edit" }]);
  });
});

describe("adaptCodexEvent — mcp_tool_call", () => {
  test("item.started + mcp_tool_call → tool_start with tool name", () => {
    const event: ThreadEvent = {
      type: "item.started",
      item: { type: "mcp_tool_call", tool: "my_tool" },
    };
    expect(adaptCodexEvent(event, 1000)).toEqual([{ type: "tool_start", name: "my_tool" }]);
  });

  test("item.completed + mcp_tool_call → tool_end with tool name", () => {
    const event: ThreadEvent = {
      type: "item.completed",
      item: { type: "mcp_tool_call", tool: "my_tool" },
    };
    expect(adaptCodexEvent(event, 1000)).toEqual([{ type: "tool_end", name: "my_tool" }]);
  });
});

describe("adaptCodexEvent — web_search", () => {
  test("item.completed + web_search → tool_start + tool_end WebSearch with query", () => {
    const event: ThreadEvent = {
      type: "item.completed",
      item: { type: "web_search", query: "bun runtime docs" },
    };
    expect(adaptCodexEvent(event, 1000)).toEqual([
      { type: "tool_start", name: "WebSearch" },
      { type: "tool_end", name: "WebSearch", detail: "bun runtime docs" },
    ]);
  });
});

describe("adaptCodexEvent — agent_message", () => {
  test("item.completed + agent_message → text_delta", () => {
    const event: ThreadEvent = {
      type: "item.completed",
      item: { type: "agent_message", text: "Hello world" },
    };
    expect(adaptCodexEvent(event, 1000)).toEqual([{ type: "text_delta", text: "Hello world" }]);
  });

  test("item.completed + agent_message with empty text → no events", () => {
    const event: ThreadEvent = {
      type: "item.completed",
      item: { type: "agent_message", text: "" },
    };
    expect(adaptCodexEvent(event, 1000)).toEqual([]);
  });
});

describe("adaptCodexEvent — error", () => {
  test("item.completed + error → error event", () => {
    const event: ThreadEvent = {
      type: "item.completed",
      item: { type: "error", message: "something failed" },
    };
    expect(adaptCodexEvent(event, 1000)).toEqual([{ type: "error", message: "something failed" }]);
  });
});

describe("adaptCodexEvent — turn lifecycle", () => {
  test("turn.completed → result success with summary", () => {
    const event: ThreadEvent = {
      type: "turn.completed",
      usage: { input_tokens: 100, output_tokens: 50 },
    };
    expect(adaptCodexEvent(event, 2000)).toEqual([
      {
        type: "result",
        success: true,
        summary: { inputTokens: 100, outputTokens: 50, numTurns: 1, durationMs: 2000 },
      },
    ]);
  });

  test("turn.failed → result failure with error message", () => {
    const event: ThreadEvent = {
      type: "turn.failed",
      error: { message: "model error" },
    };
    expect(adaptCodexEvent(event, 1000)).toEqual([
      { type: "result", success: false, errors: ["model error"] },
    ]);
  });
});

describe("adaptCodexEvent — ignored events", () => {
  test("thread.started → no events", () => {
    expect(adaptCodexEvent({ type: "thread.started" }, 0)).toEqual([]);
  });

  test("turn.started → no events", () => {
    expect(adaptCodexEvent({ type: "turn.started" }, 0)).toEqual([]);
  });

  test("item.updated → no events regardless of item type", () => {
    const event: ThreadEvent = {
      type: "item.updated",
      item: { type: "agent_message", text: "partial text" },
    };
    expect(adaptCodexEvent(event, 0)).toEqual([]);
  });

  test("item.started + reasoning → no events", () => {
    const event: ThreadEvent = { type: "item.started", item: { type: "reasoning" } };
    expect(adaptCodexEvent(event, 0)).toEqual([]);
  });

  test("item.started + todo_list → no events", () => {
    const event: ThreadEvent = { type: "item.started", item: { type: "todo_list" } };
    expect(adaptCodexEvent(event, 0)).toEqual([]);
  });

  test("item.completed + unknown item type → no events", () => {
    const event = { type: "item.completed", item: { type: "unknown_future_item" } } as any;
    expect(adaptCodexEvent(event, 0)).toEqual([]);
  });
});
