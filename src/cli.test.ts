import { test, expect, describe, mock, afterAll } from "bun:test";
import { PassThrough } from "node:stream";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { realpathSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { parseCliArgs, createTools, createWorkspace, runConversation, type ConversationDeps } from "./cli";

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

describe("runConversation", () => {
  function makeDeps(overrides?: {
    generateImpl?: (...args: any[]) => any;
  }) {
    const input = new PassThrough();
    const output = new PassThrough();
    output.setEncoding("utf8");

    const mockGenerate = mock(
      overrides?.generateImpl ??
      (async () => ({
        text: "Hello from AI",
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hello from AI" },
        ],
      })),
    );

    const mockAgent = { generate: mockGenerate } as any;

    return {
      input,
      output,
      mockGenerate,
      deps: {
        agent: mockAgent,
        input,
        output,
      } satisfies ConversationDeps,
    };
  }

  test("passes user input to agent.generate and writes response to output", async () => {
    const { input, output, mockGenerate, deps } = makeDeps();

    const done = runConversation(deps);
    input.write("Hello\n");
    await new Promise((r) => setTimeout(r, 50));
    input.end();
    await done;

    const captured = output.read();
    expect(captured).toContain("Hello from AI");
    expect(mockGenerate.mock.calls.length).toBeGreaterThanOrEqual(1);
    const [messages] = (mockGenerate.mock.calls as any)[0];
    expect(messages).toContainEqual({ role: "user", content: "Hello" });
  });

  test("accumulates messages across multiple turns", async () => {
    let callCount = 0;
    const { input, output, mockGenerate, deps } = makeDeps({
      generateImpl: async (msgs: any[]) => {
        callCount++;
        return {
          text: `Response ${callCount}`,
          messages: [
            ...msgs,
            { role: "assistant", content: `Response ${callCount}` },
          ],
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
    const [secondMessages] = (mockGenerate.mock.calls as any)[1];
    expect(secondMessages).toContainEqual({ role: "user", content: "First" });
    expect(secondMessages).toContainEqual({ role: "assistant", content: "Response 1" });
    expect(secondMessages).toContainEqual({ role: "user", content: "Second" });
  });

  test("skips empty lines", async () => {
    const { input, output, mockGenerate, deps } = makeDeps();

    const done = runConversation(deps);
    input.write("\n");
    input.write("   \n");
    input.write("Real input\n");
    await new Promise((r) => setTimeout(r, 50));
    input.end();
    await done;

    expect(mockGenerate.mock.calls.length).toBe(1);
  });

  test("prints file write notifications from onStepFinish", async () => {
    const { input, output, deps } = makeDeps({
      generateImpl: async (msgs: any[], opts: any) => {
        opts.onStepFinish({
          toolResults: [
            { payload: { result: "Wrote specs/my-spec.md" } },
            { payload: { result: "Some other result" } },
          ],
        });
        return {
          text: "Done writing.",
          messages: [
            ...msgs,
            { role: "assistant", content: "Done writing." },
          ],
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
    expect(captured).not.toContain("Some other result");
  });

  test("completes cleanly on EOF", async () => {
    const { input, deps } = makeDeps();

    const done = runConversation(deps);
    input.end();
    await done;
  });
});
