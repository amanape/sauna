/**
 * Tests for src/codex-stream-adapter.ts
 *
 * Pure unit tests using mock async iterables — no real SDK calls.
 * Tests real SDK event types (ThreadEvent from @openai/codex-sdk).
 */
import { test, expect, describe } from "bun:test";
import { adaptCodexEvents, classifyOpenAIError } from "../src/codex-stream-adapter";

/** Helper: collect all yielded values from an async generator. */
async function collect<T>(gen: AsyncIterable<T>): Promise<T[]> {
  const results: T[] = [];
  for await (const item of gen) {
    results.push(item);
  }
  return results;
}

/** Helper: create an async iterable from an array of values. */
async function* mockEvents(events: any[]): AsyncIterable<any> {
  for (const event of events) {
    yield event;
  }
}

/** Helper: create an async iterable that throws after yielding events. */
async function* throwingEvents(events: any[], error: Error): AsyncIterable<any> {
  for (const event of events) {
    yield event;
  }
  throw error;
}

describe("adaptCodexEvents - agent_message item", () => {
  test("item.completed with agent_message yields text_delta", async () => {
    const events = mockEvents([
      { type: "item.completed", item: { type: "agent_message", id: "1", text: "Hello, world!" } },
      { type: "turn.completed", usage: { input_tokens: 10, output_tokens: 5, cached_input_tokens: 0 } },
    ]);

    const msgs = await collect(adaptCodexEvents(events, Date.now()));
    const textMsg = msgs.find(
      (m) => m.type === "stream_event" && m.event.type === "content_block_delta" && m.event.delta?.type === "text_delta"
    );
    expect(textMsg).toBeDefined();
    expect(textMsg!.event.delta.text).toBe("Hello, world!");
  });

  test("item.completed with empty agent_message text is emitted as empty text_delta", async () => {
    const events = mockEvents([
      { type: "item.completed", item: { type: "agent_message", id: "1", text: "" } },
      { type: "turn.completed", usage: { input_tokens: 5, output_tokens: 2, cached_input_tokens: 0 } },
    ]);
    const msgs = await collect(adaptCodexEvents(events, Date.now()));
    const textMsg = msgs.find(
      (m) => m.type === "stream_event" && m.event.type === "content_block_delta"
    );
    expect(textMsg).toBeDefined();
    expect(textMsg!.event.delta.text).toBe("");
  });
});

describe("adaptCodexEvents - command_execution item", () => {
  test("item.completed with command_execution yields tool_use sequence", async () => {
    const events = mockEvents([
      {
        type: "item.completed",
        item: {
          type: "command_execution",
          id: "2",
          command: "ls -la",
          aggregated_output: "file1\nfile2",
          status: "completed",
        },
      },
      { type: "turn.completed", usage: { input_tokens: 20, output_tokens: 10, cached_input_tokens: 0 } },
    ]);

    const msgs = await collect(adaptCodexEvents(events, Date.now()));
    const blockStart = msgs.find(
      (m) => m.type === "stream_event" && m.event.type === "content_block_start"
    );
    const blockStop = msgs.find(
      (m) => m.type === "stream_event" && m.event.type === "content_block_stop"
    );
    expect(blockStart).toBeDefined();
    expect(blockStart!.event.content_block.type).toBe("tool_use");
    expect(blockStart!.event.content_block.name).toBe("Bash");
    expect(blockStop).toBeDefined();
  });

  test("command_execution yields input_json_delta with command field for detail display", async () => {
    const events = mockEvents([
      {
        type: "item.completed",
        item: {
          type: "command_execution",
          id: "2",
          command: "echo hello",
          aggregated_output: "hello",
          status: "completed",
        },
      },
      { type: "turn.completed", usage: { input_tokens: 5, output_tokens: 5, cached_input_tokens: 0 } },
    ]);

    const msgs = await collect(adaptCodexEvents(events, Date.now()));
    const jsonDelta = msgs.find(
      (m) =>
        m.type === "stream_event" &&
        m.event.type === "content_block_delta" &&
        m.event.delta?.type === "input_json_delta"
    );
    expect(jsonDelta).toBeDefined();
    const parsed = JSON.parse(jsonDelta!.event.delta.partial_json);
    expect(parsed.command).toBe("echo hello");
  });
});

describe("adaptCodexEvents - file_change item", () => {
  test("item.completed with file_change yields tool_use sequence", async () => {
    const events = mockEvents([
      {
        type: "item.completed",
        item: {
          type: "file_change",
          id: "3",
          changes: [{ path: "/src/index.ts", kind: "update" }],
          status: "completed",
        },
      },
      { type: "turn.completed", usage: { input_tokens: 15, output_tokens: 8, cached_input_tokens: 0 } },
    ]);

    const msgs = await collect(adaptCodexEvents(events, Date.now()));
    const blockStart = msgs.find(
      (m) => m.type === "stream_event" && m.event.type === "content_block_start"
    );
    expect(blockStart).toBeDefined();
    expect(blockStart!.event.content_block.type).toBe("tool_use");
  });

  test("file_change yields file_path in input_json_delta", async () => {
    const events = mockEvents([
      {
        type: "item.completed",
        item: {
          type: "file_change",
          id: "3",
          changes: [{ path: "/src/foo.ts", kind: "add" }],
          status: "completed",
        },
      },
      { type: "turn.completed", usage: { input_tokens: 5, output_tokens: 5, cached_input_tokens: 0 } },
    ]);

    const msgs = await collect(adaptCodexEvents(events, Date.now()));
    const jsonDelta = msgs.find(
      (m) =>
        m.type === "stream_event" &&
        m.event.type === "content_block_delta" &&
        m.event.delta?.type === "input_json_delta"
    );
    expect(jsonDelta).toBeDefined();
    const parsed = JSON.parse(jsonDelta!.event.delta.partial_json);
    expect(parsed.file_path).toContain("/src/foo.ts");
  });
});

describe("adaptCodexEvents - mcp_tool_call item", () => {
  test("item.completed with mcp_tool_call yields tool_use with tool name", async () => {
    const events = mockEvents([
      {
        type: "item.completed",
        item: {
          type: "mcp_tool_call",
          id: "4",
          server: "filesystem",
          tool: "read_file",
          arguments: {},
          status: "completed",
        },
      },
      { type: "turn.completed", usage: { input_tokens: 10, output_tokens: 5, cached_input_tokens: 0 } },
    ]);

    const msgs = await collect(adaptCodexEvents(events, Date.now()));
    const blockStart = msgs.find(
      (m) => m.type === "stream_event" && m.event.type === "content_block_start"
    );
    expect(blockStart).toBeDefined();
    expect(blockStart!.event.content_block.name).toBe("read_file");
  });
});

describe("adaptCodexEvents - silently skipped item types", () => {
  test("reasoning item is silently skipped", async () => {
    const events = mockEvents([
      { type: "item.completed", item: { type: "reasoning", id: "5", text: "Let me think..." } },
      { type: "turn.completed", usage: { input_tokens: 5, output_tokens: 5, cached_input_tokens: 0 } },
    ]);
    const msgs = await collect(adaptCodexEvents(events, Date.now()));
    const streamEvents = msgs.filter((m) => m.type === "stream_event");
    expect(streamEvents).toHaveLength(0);
  });

  test("web_search item is silently skipped", async () => {
    const events = mockEvents([
      { type: "item.completed", item: { type: "web_search", id: "6", query: "bun js docs" } },
      { type: "turn.completed", usage: { input_tokens: 5, output_tokens: 5, cached_input_tokens: 0 } },
    ]);
    const msgs = await collect(adaptCodexEvents(events, Date.now()));
    const streamEvents = msgs.filter((m) => m.type === "stream_event");
    expect(streamEvents).toHaveLength(0);
  });

  test("todo_list item is silently skipped", async () => {
    const events = mockEvents([
      {
        type: "item.completed",
        item: { type: "todo_list", id: "7", items: [{ text: "step 1", completed: false }] },
      },
      { type: "turn.completed", usage: { input_tokens: 5, output_tokens: 5, cached_input_tokens: 0 } },
    ]);
    const msgs = await collect(adaptCodexEvents(events, Date.now()));
    const streamEvents = msgs.filter((m) => m.type === "stream_event");
    expect(streamEvents).toHaveLength(0);
  });

  test("error item is silently skipped", async () => {
    const events = mockEvents([
      { type: "item.completed", item: { type: "error", id: "8", message: "something went wrong" } },
      { type: "turn.completed", usage: { input_tokens: 5, output_tokens: 5, cached_input_tokens: 0 } },
    ]);
    const msgs = await collect(adaptCodexEvents(events, Date.now()));
    const streamEvents = msgs.filter((m) => m.type === "stream_event");
    expect(streamEvents).toHaveLength(0);
  });
});

describe("adaptCodexEvents - silently skipped event types", () => {
  test("thread.started event is silently skipped", async () => {
    const events = mockEvents([
      { type: "thread.started", thread_id: "abc123" },
      { type: "turn.completed", usage: { input_tokens: 5, output_tokens: 5, cached_input_tokens: 0 } },
    ]);
    const msgs = await collect(adaptCodexEvents(events, Date.now()));
    const streamEvents = msgs.filter((m) => m.type === "stream_event");
    expect(streamEvents).toHaveLength(0);
  });

  test("turn.started event is silently skipped", async () => {
    const events = mockEvents([
      { type: "turn.started" },
      { type: "turn.completed", usage: { input_tokens: 5, output_tokens: 5, cached_input_tokens: 0 } },
    ]);
    const msgs = await collect(adaptCodexEvents(events, Date.now()));
    const streamEvents = msgs.filter((m) => m.type === "stream_event");
    expect(streamEvents).toHaveLength(0);
  });

  test("item.started event is silently skipped", async () => {
    const events = mockEvents([
      { type: "item.started", item: { type: "agent_message", id: "1", text: "" } },
      { type: "turn.completed", usage: { input_tokens: 5, output_tokens: 5, cached_input_tokens: 0 } },
    ]);
    const msgs = await collect(adaptCodexEvents(events, Date.now()));
    const streamEvents = msgs.filter((m) => m.type === "stream_event");
    expect(streamEvents).toHaveLength(0);
  });

  test("item.updated event is silently skipped", async () => {
    const events = mockEvents([
      { type: "item.updated", item: { type: "command_execution", id: "1", command: "ls", aggregated_output: "", status: "in_progress" } },
      { type: "turn.completed", usage: { input_tokens: 5, output_tokens: 5, cached_input_tokens: 0 } },
    ]);
    const msgs = await collect(adaptCodexEvents(events, Date.now()));
    const streamEvents = msgs.filter((m) => m.type === "stream_event");
    expect(streamEvents).toHaveLength(0);
  });

  test("unrecognized event types are silently skipped", async () => {
    const events = mockEvents([
      { type: "some_future_event", data: "unknown" },
      { type: "turn.completed", usage: { input_tokens: 5, output_tokens: 5, cached_input_tokens: 0 } },
    ]);
    const msgs = await collect(adaptCodexEvents(events, Date.now()));
    const streamEvents = msgs.filter((m) => m.type === "stream_event");
    expect(streamEvents).toHaveLength(0);
  });
});

describe("adaptCodexEvents - turn.completed", () => {
  test("turn.completed yields result/success with usage", async () => {
    const events = mockEvents([
      { type: "turn.completed", usage: { input_tokens: 100, output_tokens: 50, cached_input_tokens: 10 } },
    ]);
    const msgs = await collect(adaptCodexEvents(events, Date.now()));
    const result = msgs.find((m) => m.type === "result");
    expect(result).toBeDefined();
    expect(result!.subtype).toBe("success");
    expect(result!.usage.input_tokens).toBe(100);
    expect(result!.usage.output_tokens).toBe(50);
    expect(result!.num_turns).toBe(1);
  });

  test("turn.completed result includes duration_ms ≥ 0", async () => {
    const startTime = Date.now();
    const events = mockEvents([
      { type: "turn.completed", usage: { input_tokens: 10, output_tokens: 5, cached_input_tokens: 0 } },
    ]);
    const msgs = await collect(adaptCodexEvents(events, startTime));
    const result = msgs.find((m) => m.type === "result");
    expect(result!.duration_ms).toBeGreaterThanOrEqual(0);
  });
});

describe("adaptCodexEvents - turn.failed", () => {
  test("turn.failed yields result/error_during_execution with errors string array", async () => {
    const events = mockEvents([
      { type: "turn.failed", error: { message: "Agent timed out" } },
    ]);
    const msgs = await collect(adaptCodexEvents(events, Date.now()));
    const result = msgs.find((m) => m.type === "result");
    expect(result).toBeDefined();
    expect(result!.subtype).toBe("error_during_execution");
    expect(Array.isArray(result!.errors)).toBe(true);
    expect(result!.errors[0]).toBe("Agent timed out");
    expect(typeof result!.errors[0]).toBe("string");
  });

  test("turn.failed stops iteration (no synthetic result emitted after)", async () => {
    const events = mockEvents([
      { type: "turn.failed", error: { message: "Failed" } },
    ]);
    const msgs = await collect(adaptCodexEvents(events, Date.now()));
    const results = msgs.filter((m) => m.type === "result");
    expect(results).toHaveLength(1);
  });
});

describe("adaptCodexEvents - error event type", () => {
  test("error event yields result/error_during_execution", async () => {
    const events = mockEvents([
      { type: "error", message: "Connection refused" },
    ]);
    const msgs = await collect(adaptCodexEvents(events, Date.now()));
    const result = msgs.find((m) => m.type === "result");
    expect(result).toBeDefined();
    expect(result!.subtype).toBe("error_during_execution");
    expect(result!.errors[0]).toBe("Connection refused");
  });

  test("error event stops iteration (no synthetic result emitted after)", async () => {
    const events = mockEvents([
      { type: "error", message: "Fatal" },
    ]);
    const msgs = await collect(adaptCodexEvents(events, Date.now()));
    const results = msgs.filter((m) => m.type === "result");
    expect(results).toHaveLength(1);
  });
});

describe("adaptCodexEvents - thrown error from iterable", () => {
  test("thrown error yields result/error_during_execution with string errors array", async () => {
    const events = throwingEvents([], new Error("Network failure"));
    const msgs = await collect(adaptCodexEvents(events, Date.now()));
    const result = msgs.find((m) => m.type === "result");
    expect(result).toBeDefined();
    expect(result!.subtype).toBe("error_during_execution");
    expect(Array.isArray(result!.errors)).toBe(true);
    expect(typeof result!.errors[0]).toBe("string");
    expect(result!.errors[0]).toBe("Network failure");
  });

  test("non-Error thrown value is converted to string in errors array", async () => {
    async function* badIter() {
      throw "just a string error";
    }
    const msgs = await collect(adaptCodexEvents(badIter(), Date.now()));
    const result = msgs.find((m) => m.type === "result");
    expect(result!.subtype).toBe("error_during_execution");
    expect(typeof result!.errors[0]).toBe("string");
  });

  test("errors array contains strings not objects", async () => {
    const events = throwingEvents([], new Error("Test error"));
    const msgs = await collect(adaptCodexEvents(events, Date.now()));
    const result = msgs.find((m) => m.type === "result");
    for (const err of result!.errors) {
      expect(typeof err).toBe("string");
    }
  });
});

describe("adaptCodexEvents - synthetic result on missing turn.completed", () => {
  test("stream ending without turn.completed yields synthetic zero-usage result", async () => {
    // No turn.completed event
    const events = mockEvents([
      { type: "item.completed", item: { type: "agent_message", id: "1", text: "Hello" } },
    ]);
    const msgs = await collect(adaptCodexEvents(events, Date.now()));
    const result = msgs.find((m) => m.type === "result");
    expect(result).toBeDefined();
    expect(result!.subtype).toBe("success");
    expect(result!.usage.input_tokens).toBe(0);
    expect(result!.usage.output_tokens).toBe(0);
    expect(result!.num_turns).toBe(1);
  });

  test("empty stream yields synthetic zero-usage result", async () => {
    const events = mockEvents([]);
    const msgs = await collect(adaptCodexEvents(events, Date.now()));
    const result = msgs.find((m) => m.type === "result");
    expect(result).toBeDefined();
    expect(result!.subtype).toBe("success");
    expect(result!.usage.input_tokens).toBe(0);
    expect(result!.usage.output_tokens).toBe(0);
  });
});

describe("adaptCodexEvents - message ordering", () => {
  test("tool_use sequence: content_block_start comes before content_block_stop", async () => {
    const events = mockEvents([
      {
        type: "item.completed",
        item: {
          type: "command_execution",
          id: "1",
          command: "ls",
          aggregated_output: "",
          status: "completed",
        },
      },
      { type: "turn.completed", usage: { input_tokens: 5, output_tokens: 5, cached_input_tokens: 0 } },
    ]);

    const msgs = await collect(adaptCodexEvents(events, Date.now()));
    const streamEvents = msgs
      .filter((m) => m.type === "stream_event")
      .map((m) => m.event.type);

    const startIdx = streamEvents.indexOf("content_block_start");
    const stopIdx = streamEvents.indexOf("content_block_stop");
    expect(startIdx).toBeGreaterThanOrEqual(0);
    expect(stopIdx).toBeGreaterThan(startIdx);
  });
});

describe("adaptCodexEvents - robustness edge cases", () => {
  test("item.completed with unrecognized item type yields nothing (no crash)", async () => {
    const events = mockEvents([
      { type: "item.completed", item: { type: "future_unknown_item_type", id: "x", data: "something" } },
      { type: "turn.completed", usage: { input_tokens: 5, output_tokens: 5, cached_input_tokens: 0 } },
    ]);
    const msgs = await collect(adaptCodexEvents(events, Date.now()));
    const streamEvents = msgs.filter((m) => m.type === "stream_event");
    expect(streamEvents).toHaveLength(0);
    const result = msgs.find((m) => m.type === "result");
    expect(result!.subtype).toBe("success");
  });

  test("item.completed with null item yields nothing (no crash)", async () => {
    const events = mockEvents([
      { type: "item.completed", item: null },
      { type: "turn.completed", usage: { input_tokens: 5, output_tokens: 5, cached_input_tokens: 0 } },
    ]);
    const msgs = await collect(adaptCodexEvents(events, Date.now()));
    const streamEvents = msgs.filter((m) => m.type === "stream_event");
    expect(streamEvents).toHaveLength(0);
    const result = msgs.find((m) => m.type === "result");
    expect(result!.subtype).toBe("success");
  });

  test("multiple agent_message items in one turn yield multiple text_deltas", async () => {
    const events = mockEvents([
      { type: "item.completed", item: { type: "agent_message", id: "1", text: "Hello" } },
      { type: "item.completed", item: { type: "agent_message", id: "2", text: " world" } },
      { type: "item.completed", item: { type: "agent_message", id: "3", text: "!" } },
      { type: "turn.completed", usage: { input_tokens: 15, output_tokens: 10, cached_input_tokens: 0 } },
    ]);
    const msgs = await collect(adaptCodexEvents(events, Date.now()));
    const textDeltas = msgs.filter(
      (m) =>
        m.type === "stream_event" &&
        m.event.type === "content_block_delta" &&
        m.event.delta?.type === "text_delta",
    );
    expect(textDeltas).toHaveLength(3);
    expect(textDeltas[0].event.delta.text).toBe("Hello");
    expect(textDeltas[1].event.delta.text).toBe(" world");
    expect(textDeltas[2].event.delta.text).toBe("!");
  });

  test("agent_message item with non-string text is skipped (no crash)", async () => {
    const events = mockEvents([
      { type: "item.completed", item: { type: "agent_message", id: "1", text: null } },
      { type: "turn.completed", usage: { input_tokens: 5, output_tokens: 5, cached_input_tokens: 0 } },
    ]);
    const msgs = await collect(adaptCodexEvents(events, Date.now()));
    const streamEvents = msgs.filter((m) => m.type === "stream_event");
    expect(streamEvents).toHaveLength(0);
  });
});

describe("classifyOpenAIError", () => {
  test("status 401 returns auth error message with API key link", () => {
    const err = Object.assign(new Error("Incorrect API key"), { status: 401 });
    const result = classifyOpenAIError(err);
    expect(result).toContain("OpenAI authentication failed");
    expect(result).toContain("platform.openai.com/api-keys");
  });

  test("'incorrect api key' in message returns auth error", () => {
    const err = new Error("Incorrect API key provided.");
    expect(classifyOpenAIError(err)).toContain("OpenAI authentication failed");
  });

  test("'invalid api key' in message returns auth error", () => {
    const err = new Error("Invalid API key.");
    expect(classifyOpenAIError(err)).toContain("OpenAI authentication failed");
  });

  test("'Unauthorized' in message returns auth error", () => {
    const err = new Error("Unauthorized");
    expect(classifyOpenAIError(err)).toContain("OpenAI authentication failed");
  });

  test("status 429 returns rate limit message", () => {
    const err = Object.assign(new Error("Too many requests"), { status: 429 });
    const result = classifyOpenAIError(err);
    expect(result).toContain("OpenAI rate limit reached");
    expect(result).toContain("Tip:");
  });

  test("'rate limit' in message returns rate limit error", () => {
    const err = new Error("You have exceeded your rate limit.");
    expect(classifyOpenAIError(err)).toContain("OpenAI rate limit reached");
  });

  test("'too many requests' in message returns rate limit error", () => {
    const err = new Error("Too Many Requests");
    expect(classifyOpenAIError(err)).toContain("OpenAI rate limit reached");
  });

  test("ECONNREFUSED code returns network error message", () => {
    const err = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:443"), { code: "ECONNREFUSED" });
    expect(classifyOpenAIError(err)).toContain("Could not connect to OpenAI API");
  });

  test("ENOTFOUND code returns network error message", () => {
    const err = Object.assign(new Error("getaddrinfo ENOTFOUND api.openai.com"), { code: "ENOTFOUND" });
    expect(classifyOpenAIError(err)).toContain("Could not connect to OpenAI API");
  });

  test("'fetch failed' in message returns network error", () => {
    const err = new Error("fetch failed");
    expect(classifyOpenAIError(err)).toContain("Could not connect to OpenAI API");
  });

  test("generic error returns original message unchanged", () => {
    const err = new Error("Something unexpected happened");
    expect(classifyOpenAIError(err)).toBe("Something unexpected happened");
  });

  test("non-Error string value is returned as-is", () => {
    expect(classifyOpenAIError("just a string error")).toBe("just a string error");
  });

  test("non-Error number is converted to string", () => {
    expect(classifyOpenAIError(42)).toBe("42");
  });
});

describe("adaptCodexEvents - error classification in catch", () => {
  test("thrown auth error (status 401) yields classified message", async () => {
    const authErr = Object.assign(new Error("Incorrect API key"), { status: 401 });
    async function* throwing(): AsyncIterable<any> { throw authErr; }
    const msgs = await collect(adaptCodexEvents(throwing(), Date.now()));
    const result = msgs.find((m) => m.type === "result");
    expect(result!.subtype).toBe("error_during_execution");
    expect(result!.errors[0]).toContain("OpenAI authentication failed");
    expect(result!.errors[0]).toContain("platform.openai.com/api-keys");
  });

  test("thrown rate-limit error (status 429) yields classified message", async () => {
    const rateLimitErr = Object.assign(new Error("Too many requests"), { status: 429 });
    async function* throwing(): AsyncIterable<any> { throw rateLimitErr; }
    const msgs = await collect(adaptCodexEvents(throwing(), Date.now()));
    const result = msgs.find((m) => m.type === "result");
    expect(result!.subtype).toBe("error_during_execution");
    expect(result!.errors[0]).toContain("OpenAI rate limit reached");
  });

  test("thrown network error (ECONNREFUSED code) yields classified message", async () => {
    const netErr = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:443"), { code: "ECONNREFUSED" });
    async function* throwing(): AsyncIterable<any> { throw netErr; }
    const msgs = await collect(adaptCodexEvents(throwing(), Date.now()));
    const result = msgs.find((m) => m.type === "result");
    expect(result!.subtype).toBe("error_during_execution");
    expect(result!.errors[0]).toContain("Could not connect to OpenAI API");
  });

  test("thrown generic error still yields original message unchanged", async () => {
    const events = throwingEvents([], new Error("Network failure"));
    const msgs = await collect(adaptCodexEvents(events, Date.now()));
    const result = msgs.find((m) => m.type === "result");
    expect(result!.errors[0]).toBe("Network failure");
  });
});
