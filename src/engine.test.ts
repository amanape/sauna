import { describe, test, expect, mock } from "bun:test";
import { ConversationEngine } from "./engine";
// Inline types — src/types.ts removed during SDK migration

interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: { id: string; name: string; args: Record<string, unknown> }[];
  tool_call_id?: string;
}

interface LLMResponse {
  text?: string;
  tool_calls?: { id: string; name: string; args: Record<string, unknown> }[];
}

interface LLMProvider {
  complete(messages: Message[], tools?: any[]): Promise<LLMResponse>;
}

interface Tool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute(args: Record<string, unknown>): Promise<string>;
}

function mockProvider(responses: LLMResponse[]): LLMProvider {
  let callIndex = 0;
  return {
    complete: mock(async () => responses[callIndex++]!),
  };
}

function mockTool(name: string, result: string): Tool {
  return {
    name,
    description: `Mock ${name} tool`,
    parameters: {},
    execute: mock(async () => result),
  };
}

describe("ConversationEngine", () => {
  test("start() prepends system prompt and user message, returns LLM text", async () => {
    const provider = mockProvider([
      { text: "Hello! What problem are you trying to solve?" },
    ]);
    const engine = new ConversationEngine(
      provider,
      [],
      "You are a discovery agent.",
      "/code"
    );

    const output = await engine.start("I need a login system");

    expect(output.text).toBe("Hello! What problem are you trying to solve?");
    expect(output.done).toBe(false);
    const calls = (provider.complete as any).mock.calls;
    expect(calls[0][0][0]).toEqual({
      role: "system",
      content: "You are a discovery agent.",
    });
    expect(calls[0][0][1]).toEqual({
      role: "user",
      content: "I need a login system",
    });
  });

  test("respond() appends user message to growing conversation history", async () => {
    const provider = mockProvider([
      { text: "What's your problem?" },
      { text: "Got it, tell me more." },
    ]);
    const engine = new ConversationEngine(
      provider,
      [],
      "System prompt",
      "/code"
    );

    await engine.start("Problem X");
    const output = await engine.respond("More details");

    expect(output.text).toBe("Got it, tell me more.");
    const calls = (provider.complete as any).mock.calls;
    const secondCallMessages = calls[1][0] as Message[];
    expect(secondCallMessages).toHaveLength(4); // system, user, assistant, user
    expect(secondCallMessages[3]).toEqual({
      role: "user",
      content: "More details",
    });
  });

  test("executes tool calls and loops back to LLM", async () => {
    const provider = mockProvider([
      {
        tool_calls: [
          { id: "tc1", name: "file_read", args: { path: "src/index.ts" } },
        ],
      },
      { text: "I read the file." },
    ]);
    const fileTool = mockTool("file_read", "console.log('hello')");
    const engine = new ConversationEngine(
      provider,
      [fileTool],
      "System",
      "/code"
    );

    const output = await engine.start("Read my code");

    expect(output.text).toBe("I read the file.");
    expect((fileTool.execute as any).mock.calls[0][0]).toEqual({
      path: "src/index.ts",
    });
    expect((provider.complete as any).mock.calls).toHaveLength(2);
  });

  test("session_complete tool sets done to true", async () => {
    const provider = mockProvider([
      {
        tool_calls: [{ id: "tc1", name: "session_complete", args: {} }],
      },
      { text: "All done!" },
    ]);
    const sessionTool = mockTool("session_complete", "Session complete.");
    const engine = new ConversationEngine(
      provider,
      [sessionTool],
      "System",
      "/code"
    );

    const output = await engine.start("Start");

    expect(output.done).toBe(true);
    expect(output.text).toBe("All done!");
  });

  test("tracks files written via Wrote convention", async () => {
    const provider = mockProvider([
      {
        tool_calls: [
          {
            id: "tc1",
            name: "write_jtbd",
            args: { slug: "auth", content: "# Auth" },
          },
        ],
      },
      { text: "I wrote the JTBD file." },
    ]);
    const writeTool = mockTool("write_jtbd", "Wrote jobs/auth/jtbd.md");
    const engine = new ConversationEngine(
      provider,
      [writeTool],
      "System",
      "/code"
    );

    const output = await engine.start("Write a JTBD");

    expect(output.files_written).toEqual(["jobs/auth/jtbd.md"]);
  });

  test("handles multiple tool calls in single response", async () => {
    const provider = mockProvider([
      {
        tool_calls: [
          { id: "tc1", name: "file_read", args: { path: "a.ts" } },
          { id: "tc2", name: "file_search", args: { pattern: "auth" } },
        ],
      },
      { text: "Read both." },
    ]);
    const readTool = mockTool("file_read", "content A");
    const searchTool = mockTool("file_search", "match in b.ts");
    const engine = new ConversationEngine(
      provider,
      [readTool, searchTool],
      "System",
      "/code"
    );

    const output = await engine.start("Read files");

    expect((readTool.execute as any).mock.calls).toHaveLength(1);
    expect((searchTool.execute as any).mock.calls).toHaveLength(1);
    expect(output.text).toBe("Read both.");
  });

  test("handles multiple loop iterations before text response", async () => {
    const provider = mockProvider([
      {
        tool_calls: [
          { id: "tc1", name: "file_read", args: { path: "a.ts" } },
        ],
      },
      {
        tool_calls: [
          { id: "tc2", name: "file_search", args: { pattern: "auth" } },
        ],
      },
      { text: "Found what I need." },
    ]);
    const readTool = mockTool("file_read", "file content");
    const searchTool = mockTool("file_search", "match in b.ts");
    const engine = new ConversationEngine(
      provider,
      [readTool, searchTool],
      "System",
      "/code"
    );

    const output = await engine.start("Investigate auth");

    expect(output.text).toBe("Found what I need.");
    expect((provider.complete as any).mock.calls).toHaveLength(3);
  });

  test("returns error result when tool not found in registry", async () => {
    const provider = mockProvider([
      {
        tool_calls: [{ id: "tc1", name: "nonexistent", args: {} }],
      },
      { text: "I see the error." },
    ]);
    const engine = new ConversationEngine(provider, [], "System", "/code");

    await engine.start("Do something");

    const calls = (provider.complete as any).mock.calls;
    const secondCallMessages = calls[1][0] as Message[];
    const toolResult = secondCallMessages.find(
      (m: Message) => m.role === "tool"
    );
    expect(toolResult!.content).toContain("not found");
  });

  test("catches tool execution errors and returns error as result", async () => {
    const failTool: Tool = {
      name: "buggy_tool",
      description: "A tool that throws",
      parameters: {},
      execute: mock(async () => {
        throw new Error("disk full");
      }),
    };
    const provider = mockProvider([
      {
        tool_calls: [{ id: "tc1", name: "buggy_tool", args: {} }],
      },
      { text: "I see the error." },
    ]);
    const engine = new ConversationEngine(
      provider,
      [failTool],
      "System",
      "/code"
    );

    await engine.start("Run buggy tool");

    const calls = (provider.complete as any).mock.calls;
    const secondCallMessages = calls[1][0] as Message[];
    const toolResult = secondCallMessages.find(
      (m: Message) => m.role === "tool"
    );
    expect(toolResult!.content).toContain("disk full");
  });

  test("appends assistant message with tool_calls to history", async () => {
    const provider = mockProvider([
      {
        text: "Let me check...",
        tool_calls: [
          { id: "tc1", name: "file_read", args: { path: "x.ts" } },
        ],
      },
      { text: "Done." },
    ]);
    const fileTool = mockTool("file_read", "content");
    const engine = new ConversationEngine(
      provider,
      [fileTool],
      "System",
      "/code"
    );

    await engine.start("Read x.ts");

    const calls = (provider.complete as any).mock.calls;
    const secondCallMessages = calls[1][0] as Message[];
    const assistantMsg = secondCallMessages.find(
      (m: Message) => m.role === "assistant" && m.tool_calls
    );
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg!.tool_calls![0]!.name).toBe("file_read");
    expect(assistantMsg!.content).toBe("Let me check...");
  });

  test("passes tool definitions to provider on every LLM call", async () => {
    const provider = mockProvider([{ text: "Hi." }]);
    const fileTool = mockTool("file_read", "content");
    const engine = new ConversationEngine(
      provider,
      [fileTool],
      "System",
      "/code"
    );

    await engine.start("Hello");

    const calls = (provider.complete as any).mock.calls;
    const toolDefs = calls[0][1];
    expect(toolDefs).toHaveLength(1);
    expect(toolDefs[0].name).toBe("file_read");
  });

  test("accumulates files_written across multiple tool calls in one turn", async () => {
    const provider = mockProvider([
      {
        tool_calls: [
          {
            id: "tc1",
            name: "write_jtbd",
            args: { slug: "auth", content: "# Auth" },
          },
        ],
      },
      {
        tool_calls: [
          {
            id: "tc2",
            name: "write_spec",
            args: {
              job_slug: "auth",
              spec_slug: "login",
              content: "# Login",
            },
          },
        ],
      },
      { text: "Wrote both files." },
    ]);
    const jtbdTool = mockTool("write_jtbd", "Wrote jobs/auth/jtbd.md");
    const specTool = mockTool(
      "write_spec",
      "Wrote jobs/auth/specs/login.md"
    );
    const engine = new ConversationEngine(
      provider,
      [jtbdTool, specTool],
      "System",
      "/code"
    );

    const output = await engine.start("Write everything");

    expect(output.files_written).toEqual([
      "jobs/auth/jtbd.md",
      "jobs/auth/specs/login.md",
    ]);
  });
});
