import { test, expect, describe, mock, afterAll } from "bun:test";
import { PassThrough } from "node:stream";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { realpathSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { parseCliArgs, createTools, createWorkspace, createDiscoveryAgent, DEFAULT_MODEL, runConversation, type ConversationDeps } from "./cli";

describe("parseCliArgs", () => {
  test("parses --codebase as required argument", () => {
    const result = parseCliArgs(["--codebase", "/some/path"]);
    expect(result.codebase).toBe("/some/path");
  });

  test("throws when --codebase is missing", () => {
    expect(() => parseCliArgs([])).toThrow("--codebase");
  });

  test("defaults --output to ./jobs/", () => {
    const result = parseCliArgs(["--codebase", "/some/path"]);
    expect(result.output).toBe("./jobs/");
  });

  test("parses custom --output", () => {
    const result = parseCliArgs([
      "--codebase", "/some/path",
      "--output", "/custom/output",
    ]);
    expect(result.output).toBe("/custom/output");
  });

  test("--provider is not accepted", () => {
    expect(() =>
      parseCliArgs(["--codebase", "/some/path", "--provider", "openai"]),
    ).toThrow();
  });

  test("defaults --model to undefined", () => {
    const result = parseCliArgs(["--codebase", "/some/path"]);
    expect(result.model).toBeUndefined();
  });

  test("parses custom --model", () => {
    const result = parseCliArgs([
      "--codebase", "/some/path",
      "--model", "claude-opus-4-20250514",
    ]);
    expect(result.model).toBe("claude-opus-4-20250514");
  });

  test("parses all arguments together", () => {
    const result = parseCliArgs([
      "--codebase", "/my/project",
      "--output", "/my/output",
      "--model", "gpt-4",
    ]);
    expect(result.codebase).toBe("/my/project");
    expect(result.output).toBe("/my/output");
    expect(result.model).toBe("gpt-4");
  });
});

describe("createTools", () => {
  test("returns a record with only web_search key", () => {
    const tools = createTools();
    expect(Object.keys(tools)).toEqual(["web_search"]);
  });

  test("web_search tool has execute function", () => {
    const tools = createTools();
    expect(typeof tools.web_search.execute).toBe("function");
  });

  test("injects custom search function", async () => {
    const searchFn = async (query: string) => [
      { title: "Result", snippet: "A result", url: "https://example.com" },
    ];
    const tools = createTools(searchFn);
    const result = await tools.web_search.execute!({ query: "test" }, {} as any);
    expect(result).toContain("Result");
  });
});

describe("createWorkspace", () => {
  // Create temp dirs: parent has an outside file, child is the workspace base
  const rawParent = join(tmpdir(), `method6-ws-${Date.now()}`);
  const rawDir = join(rawParent, "codebase");
  mkdirSync(rawDir, { recursive: true });
  writeFileSync(join(rawParent, "outside.txt"), "should not read");
  const testDir = realpathSync(rawDir);
  writeFileSync(join(testDir, "hello.txt"), "hello world");

  afterAll(() => rmSync(testDir, { recursive: true, force: true }));

  test("workspace filesystem can read files within codebase", async () => {
    const workspace = createWorkspace(testDir);
    await workspace.init();
    try {
      const content = await workspace.filesystem!.readFile("hello.txt");
      expect(content.toString()).toBe("hello world");
    } finally {
      await workspace.destroy();
    }
  });

  test("workspace filesystem rejects path traversal", async () => {
    const workspace = createWorkspace(testDir);
    await workspace.init();
    try {
      // outside.txt exists in parent dir but must not be readable via traversal
      await expect(workspace.filesystem!.readFile("../outside.txt")).rejects.toThrow("Permission denied");
    } finally {
      await workspace.destroy();
    }
  });

  test("workspace sandbox executes commands in codebase directory", async () => {
    const workspace = createWorkspace(testDir);
    await workspace.init();
    try {
      const result = await workspace.sandbox!.executeCommand!("pwd");
      expect(result.stdout.trim()).toBe(testDir);
    } finally {
      await workspace.destroy();
    }
  });
});

describe("createDiscoveryAgent", () => {
  test("defaults model to DEFAULT_MODEL when not specified", () => {
    const tools = createTools();
    const workspace = createWorkspace("/tmp");
    const agent = createDiscoveryAgent({
      systemPrompt: "You are a test agent.",
      tools,
      workspace,
    });
    expect(agent.model).toBe(DEFAULT_MODEL);
  });

  test("uses provided model when specified", () => {
    const tools = createTools();
    const workspace = createWorkspace("/tmp");
    const agent = createDiscoveryAgent({
      systemPrompt: "You are a test agent.",
      model: "openai/gpt-4",
      tools,
      workspace,
    });
    expect(agent.model).toBe("openai/gpt-4");
  });

  test("wires system prompt as instructions", async () => {
    const tools = createTools();
    const workspace = createWorkspace("/tmp");
    const agent = createDiscoveryAgent({
      systemPrompt: "You are a JTBD discovery agent.",
      tools,
      workspace,
    });
    const instructions = await agent.getInstructions();
    expect(instructions).toBe("You are a JTBD discovery agent.");
  });

  test("includes web_search in agent tools", async () => {
    const tools = createTools();
    const workspace = createWorkspace("/tmp");
    const agent = createDiscoveryAgent({
      systemPrompt: "Test",
      tools,
      workspace,
    });
    const agentTools = await agent.listTools();
    const toolIds = Object.keys(agentTools);
    expect(toolIds).toContain("web_search");
  });
});

describe("runConversation", () => {
  /** Create a ReadableStream<string> from an array of chunks */
  function textStreamFrom(chunks: string[]): ReadableStream<string> {
    return new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    });
  }

  function makeDeps(overrides?: {
    streamImpl?: (...args: any[]) => any;
  }) {
    const input = new PassThrough();
    const output = new PassThrough();
    output.setEncoding("utf8");

    const mockStream = mock(
      overrides?.streamImpl ??
      (async () => ({
        textStream: textStreamFrom(["Hello from AI"]),
        getFullOutput: async () => ({
          messages: [
            { role: "user", content: "Hello" },
            { role: "assistant", content: "Hello from AI" },
          ],
        }),
      })),
    );

    const mockAgent = { stream: mockStream } as any;

    return {
      input,
      output,
      mockStream,
      deps: {
        agent: mockAgent,
        input,
        output,
      } satisfies ConversationDeps,
    };
  }

  test("streams text chunks to output in real time", async () => {
    const { input, output, mockStream, deps } = makeDeps({
      streamImpl: async () => ({
        textStream: textStreamFrom(["Hello", " from", " AI"]),
        getFullOutput: async () => ({
          messages: [
            { role: "user", content: "Hello" },
            { role: "assistant", content: "Hello from AI" },
          ],
        }),
      }),
    });

    const done = runConversation(deps);
    input.write("Hello\n");
    await new Promise((r) => setTimeout(r, 50));
    input.end();
    await done;

    const captured = output.read();
    // All chunks should appear in output (streamed, not batched)
    expect(captured).toContain("Hello from AI");
  });

  test("passes user input to agent.stream and writes streamed response", async () => {
    const { input, output, mockStream, deps } = makeDeps();

    const done = runConversation(deps);
    input.write("Hello\n");
    await new Promise((r) => setTimeout(r, 50));
    input.end();
    await done;

    const captured = output.read();
    expect(captured).toContain("Hello from AI");
    expect(mockStream.mock.calls.length).toBeGreaterThanOrEqual(1);
    const [messages] = (mockStream.mock.calls as any)[0];
    expect(messages).toContainEqual({ role: "user", content: "Hello" });
  });

  test("accumulates messages across multiple turns", async () => {
    let callCount = 0;
    const { input, output, mockStream, deps } = makeDeps({
      streamImpl: async (msgs: any[]) => {
        callCount++;
        const text = `Response ${callCount}`;
        return {
          textStream: textStreamFrom([text]),
          getFullOutput: async () => ({
            messages: [
              ...msgs,
              { role: "assistant", content: text },
            ],
          }),
        };
      },
    });

    const done = runConversation(deps);
    input.write("First\n");
    await new Promise((r) => setTimeout(r, 50));
    input.write("Second\n");
    await new Promise((r) => setTimeout(r, 50));
    input.end();
    await done;

    expect(callCount).toBe(2);
    const [secondMessages] = (mockStream.mock.calls as any)[1];
    expect(secondMessages).toContainEqual({ role: "user", content: "First" });
    expect(secondMessages).toContainEqual({ role: "assistant", content: "Response 1" });
    expect(secondMessages).toContainEqual({ role: "user", content: "Second" });
  });

  test("skips empty lines", async () => {
    const { input, output, mockStream, deps } = makeDeps();

    const done = runConversation(deps);
    input.write("\n");
    input.write("   \n");
    input.write("Real input\n");
    await new Promise((r) => setTimeout(r, 50));
    input.end();
    await done;

    expect(mockStream.mock.calls.length).toBe(1);
  });

  test("surfaces workspace write_file results as notifications", async () => {
    const { input, output, deps } = makeDeps({
      streamImpl: async (msgs: any[], opts: any) => {
        opts.onStepFinish({
          toolResults: [
            {
              payload: {
                toolName: "mastra_workspace_write_file",
                result: { success: true, path: "specs/my-spec.md", size: 42 },
              },
            },
            {
              payload: {
                toolName: "mastra_workspace_edit_file",
                result: { success: true, path: "src/edited.ts", replacements: 1 },
              },
            },
          ],
        });
        return {
          textStream: textStreamFrom(["Done writing."]),
          getFullOutput: async () => ({
            messages: [
              ...msgs,
              { role: "assistant", content: "Done writing." },
            ],
          }),
        };
      },
    });

    const done = runConversation(deps);
    input.write("Write a spec\n");
    await new Promise((r) => setTimeout(r, 50));
    input.end();
    await done;

    const captured = output.read();
    expect(captured).toContain("Wrote specs/my-spec.md");
    expect(captured).not.toContain("src/edited.ts");
  });

  test("does not surface failed workspace write_file results", async () => {
    const { input, output, deps } = makeDeps({
      streamImpl: async (msgs: any[], opts: any) => {
        opts.onStepFinish({
          toolResults: [
            {
              payload: {
                toolName: "mastra_workspace_write_file",
                result: { success: false, path: "specs/fail.md", size: 0 },
              },
            },
          ],
        });
        return {
          textStream: textStreamFrom(["Failed."]),
          getFullOutput: async () => ({
            messages: [
              ...msgs,
              { role: "assistant", content: "Failed." },
            ],
          }),
        };
      },
    });

    const done = runConversation(deps);
    input.write("Write a spec\n");
    await new Promise((r) => setTimeout(r, 50));
    input.end();
    await done;

    const captured = output.read();
    expect(captured).not.toContain("Wrote specs/fail.md");
  });

  test("completes cleanly on EOF", async () => {
    const { input, deps } = makeDeps();

    const done = runConversation(deps);
    input.end();
    await done;
  });
});
