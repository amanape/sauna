import { test, expect, describe, mock } from "bun:test";
import { PassThrough } from "node:stream";
import { parseCliArgs, createTools, type CliArgs } from "./cli";

// Mock generateText before importing runConversation
const mockGenerateText = mock(async (): Promise<any> => ({
  text: "",
  response: { messages: [] },
}));

mock.module("ai", () => ({
  generateText: mockGenerateText,
  stepCountIs: () => () => false,
}));

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
  test("returns a record with file_read, file_write, web_search keys", () => {
    const tools = createTools("/some/codebase", "./jobs/");
    expect(Object.keys(tools).sort()).toEqual(["file_read", "file_write", "web_search"]);
  });

  test("all tools have execute functions", () => {
    const tools = createTools("/some/codebase", "./jobs/");
    for (const [name, tool] of Object.entries(tools)) {
      expect(typeof tool.execute).toBe("function");
    }
  });

  test("scopes file_read to codebase path", async () => {
    const tools = createTools("/nonexistent/codebase", "./jobs/");
    const result = await tools.file_read.execute!(
      { path: "../../etc/passwd" },
      { toolCallId: "test", messages: [] },
    );
    expect(result).toContain("outside the codebase");
  });
});

describe("runConversation", () => {
  // Dynamic import so mock.module takes effect
  const getRunConversation = async () => {
    const mod = await import("./cli");
    return mod.runConversation;
  };

  function makeDeps(overrides?: Partial<{
    generateTextImpl: (...args: any[]) => any;
  }>) {
    const input = new PassThrough();
    const output = new PassThrough();
    output.setEncoding("utf8");

    if (overrides?.generateTextImpl) {
      mockGenerateText.mockImplementation(overrides.generateTextImpl);
    } else {
      mockGenerateText.mockImplementation(async () => ({
        text: "Hello from AI",
        response: { messages: [{ role: "assistant", content: "Hello from AI" }] },
      }));
    }

    return {
      input,
      output,
      deps: {
        model: {} as any,
        tools: {},
        systemPrompt: "You are a test agent.",
        input,
        output,
      },
    };
  }

  test("passes user input to generateText and writes response to output", async () => {
    const runConversation = await getRunConversation();
    const { input, output, deps } = makeDeps();

    const done = runConversation(deps);
    input.write("Hello\n");
    // Allow async processing
    await new Promise((r) => setTimeout(r, 50));
    input.end();
    await done;

    const captured = output.read();
    expect(captured).toContain("Hello from AI");
    expect(mockGenerateText.mock.calls.length).toBeGreaterThanOrEqual(1);
    const callArgs = (mockGenerateText.mock.calls as any)[0][0];
    expect(callArgs.system).toBe("You are a test agent.");
    expect(callArgs.messages).toContainEqual({ role: "user", content: "Hello" });
  });

  test("accumulates messages across multiple turns", async () => {
    const runConversation = await getRunConversation();
    let callCount = 0;
    const { input, output, deps } = makeDeps({
      generateTextImpl: async () => {
        callCount++;
        return {
          text: `Response ${callCount}`,
          response: { messages: [{ role: "assistant", content: `Response ${callCount}` }] },
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

    // Second call should have accumulated messages from first turn
    expect(callCount).toBe(2);
    const secondCallArgs = (mockGenerateText.mock.calls as any)[1][0];
    const messages = secondCallArgs.messages;
    expect(messages).toContainEqual({ role: "user", content: "First" });
    expect(messages).toContainEqual({ role: "assistant", content: "Response 1" });
    expect(messages).toContainEqual({ role: "user", content: "Second" });
  });

  test("skips empty lines", async () => {
    const runConversation = await getRunConversation();
    mockGenerateText.mockClear();
    const { input, output, deps } = makeDeps();

    const done = runConversation(deps);
    input.write("\n");
    input.write("   \n");
    input.write("Real input\n");
    await new Promise((r) => setTimeout(r, 50));
    input.end();
    await done;

    expect(mockGenerateText.mock.calls.length).toBe(1);
  });

  test("prints file write notifications from onStepFinish", async () => {
    const runConversation = await getRunConversation();
    const { input, output, deps } = makeDeps({
      generateTextImpl: async (opts: any) => {
        // Simulate onStepFinish being called with a file write result
        opts.onStepFinish({
          toolResults: [
            { output: "Wrote specs/my-spec.md" },
            { output: "Some other result" },
          ],
        });
        return {
          text: "Done writing.",
          response: { messages: [{ role: "assistant", content: "Done writing." }] },
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
    // Should NOT print non-"Wrote " results
    expect(captured).not.toContain("Some other result");
  });

  test("completes cleanly on EOF", async () => {
    const runConversation = await getRunConversation();
    const { input, deps } = makeDeps();

    const done = runConversation(deps);
    input.end();
    // Should resolve without throwing
    await done;
  });
});
