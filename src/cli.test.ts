import { test, expect, describe, mock, afterAll } from "bun:test";
import { PassThrough } from "node:stream";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { realpathSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseCliArgs, runConversation, type ConversationDeps } from "./cli";
import { DEFAULT_MODEL, getProviderFromModel, getApiKeyEnvVar, validateApiKey } from "./model-resolution";
import { createTools, resolveSearchFn } from "./tool-factory";
import { createWorkspace } from "./workspace-factory";
import { createDiscoveryAgent, createResearchAgent } from "./agent-definitions";

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

describe("getProviderFromModel", () => {
  test("extracts provider from prefixed model string", () => {
    expect(getProviderFromModel("anthropic/claude-sonnet-4-5-20250929")).toBe("anthropic");
  });

  test("extracts provider from openai-prefixed model string", () => {
    expect(getProviderFromModel("openai/gpt-4")).toBe("openai");
  });

  test("defaults to anthropic when no prefix", () => {
    expect(getProviderFromModel("claude-opus-4-20250514")).toBe("anthropic");
  });

  test("defaults to anthropic when model is undefined", () => {
    expect(getProviderFromModel(undefined)).toBe("anthropic");
  });
});

describe("getApiKeyEnvVar", () => {
  test("maps anthropic to ANTHROPIC_API_KEY", () => {
    expect(getApiKeyEnvVar("anthropic")).toBe("ANTHROPIC_API_KEY");
  });

  test("maps openai to OPENAI_API_KEY", () => {
    expect(getApiKeyEnvVar("openai")).toBe("OPENAI_API_KEY");
  });

  test("maps google to GOOGLE_API_KEY", () => {
    expect(getApiKeyEnvVar("google")).toBe("GOOGLE_API_KEY");
  });

  test("uppercases arbitrary provider and appends _API_KEY", () => {
    expect(getApiKeyEnvVar("mistral")).toBe("MISTRAL_API_KEY");
  });
});

describe("validateApiKey", () => {
  const originalEnv = { ...process.env };

  afterAll(() => {
    // Restore env after tests
    process.env = originalEnv;
  });

  test("returns env var name when key is set", () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const result = validateApiKey(undefined);
    expect(result).toBe("ANTHROPIC_API_KEY");
  });

  test("throws when required API key is missing", () => {
    delete process.env.OPENAI_API_KEY;
    expect(() => validateApiKey("openai/gpt-4")).toThrow("OPENAI_API_KEY");
  });

  test("validates correct env var based on model prefix", () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    const result = validateApiKey("openai/gpt-4");
    expect(result).toBe("OPENAI_API_KEY");
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

describe("resolveSearchFn", () => {
  test("returns a Tavily-backed search function when TAVILY_API_KEY is set", async () => {
    const searchFn = resolveSearchFn({ TAVILY_API_KEY: "tvly-test-key" });
    // The returned function should be callable (not the default error thrower)
    // We can't call a real API, but we can verify it doesn't throw synchronously
    expect(typeof searchFn).toBe("function");
    // Calling it should attempt a fetch (not throw "not configured")
    // We verify by checking it doesn't throw the default error message
    try {
      await searchFn("test query");
    } catch (e: any) {
      // Should NOT be the "not configured" error — it should be a network/fetch error
      expect(e.message).not.toContain("not configured");
    }
  });

  test("returns error-throwing function when TAVILY_API_KEY is absent", async () => {
    const searchFn = resolveSearchFn({});
    await expect(searchFn("test")).rejects.toThrow("TAVILY_API_KEY");
  });

  test("error message suggests setting the environment variable", async () => {
    const searchFn = resolveSearchFn({});
    await expect(searchFn("test")).rejects.toThrow("TAVILY_API_KEY");
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

  test("workspace discovers skills from configured skill directories", async () => {
    // Create a skill directory with a valid SKILL.md
    const skillDir = join(testDir, "test-skills", "greet");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      "---\nname: greet\ndescription: Greets users warmly\n---\n\nAlways greet the user by name.\n",
    );

    const workspace = createWorkspace(testDir, { skillsPaths: ["test-skills"] });
    await workspace.init();
    try {
      const skills = await workspace.skills!.list();
      const names = skills.map((s) => s.name);
      expect(names).toContain("greet");
    } finally {
      await workspace.destroy();
      rmSync(join(testDir, "test-skills"), { recursive: true, force: true });
    }
  });

  test("workspace has no skills when skillsPaths is not provided", async () => {
    const workspace = createWorkspace(testDir);
    await workspace.init();
    try {
      expect(workspace.skills).toBeUndefined();
    } finally {
      await workspace.destroy();
    }
  });

  test("project .sauna/skills/ contains valid discoverable skills", async () => {
    // Validate that the actual .sauna/skills/ directory in the project root
    // contains properly formatted SKILL.md files that the pipeline can discover
    const projectRoot = resolve(import.meta.dirname, "..");
    const workspace = createWorkspace(projectRoot, { skillsPaths: [".sauna/skills"] });
    await workspace.init();
    try {
      const skills = await workspace.skills!.list();
      const names = skills.map((s) => s.name);
      expect(names).toContain("spec-writing");
    } finally {
      await workspace.destroy();
    }
  });

  test("with outputDir, writes inside output directory succeed", async () => {
    mkdirSync(join(testDir, "jobs"), { recursive: true });
    const workspace = createWorkspace(testDir, { outputDir: "jobs" });
    await workspace.init();
    try {
      await workspace.filesystem!.writeFile("jobs/spec.md", "# Spec");
      const content = await workspace.filesystem!.readFile("jobs/spec.md");
      expect(content.toString()).toBe("# Spec");
    } finally {
      await workspace.destroy();
      rmSync(join(testDir, "jobs"), { recursive: true, force: true });
    }
  });

  test("with outputDir, writes outside output directory are blocked", async () => {
    const workspace = createWorkspace(testDir, { outputDir: "jobs" });
    await workspace.init();
    try {
      await expect(
        workspace.filesystem!.writeFile("src/hack.txt", "bad"),
      ).rejects.toThrow("output directory");
    } finally {
      await workspace.destroy();
    }
  });

  test("with outputDir, reads outside output directory still work", async () => {
    const workspace = createWorkspace(testDir, { outputDir: "jobs" });
    await workspace.init();
    try {
      const content = await workspace.filesystem!.readFile("hello.txt");
      expect(content.toString()).toBe("hello world");
    } finally {
      await workspace.destroy();
    }
  });

  test("without outputDir, writes anywhere within codebase are allowed", async () => {
    const workspace = createWorkspace(testDir);
    await workspace.init();
    try {
      await workspace.filesystem!.writeFile("anywhere.txt", "ok");
      const content = await workspace.filesystem!.readFile("anywhere.txt");
      expect(content.toString()).toBe("ok");
    } finally {
      await workspace.filesystem!.deleteFile("anywhere.txt");
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

  test("appends output directory to system prompt when provided", async () => {
    const tools = createTools();
    const workspace = createWorkspace("/tmp");
    const agent = createDiscoveryAgent({
      systemPrompt: "You are a JTBD discovery agent.",
      tools,
      workspace,
      outputPath: "/my/output",
    });
    const instructions = await agent.getInstructions();
    expect(instructions).toContain("/my/output");
    expect(instructions).toContain("You are a JTBD discovery agent.");
  });

  test("does not modify system prompt when outputPath is absent", async () => {
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

describe("createResearchAgent", () => {
  test("defaults model to DEFAULT_MODEL when not specified", () => {
    const tools = createTools();
    const workspace = createWorkspace("/tmp");
    const agent = createResearchAgent({ tools, workspace });
    expect(agent.model).toBe(DEFAULT_MODEL);
  });

  test("uses provided model when specified", () => {
    const tools = createTools();
    const workspace = createWorkspace("/tmp");
    const agent = createResearchAgent({ tools, workspace, model: "openai/gpt-4" });
    expect(agent.model).toBe("openai/gpt-4");
  });

  test("has instructions describing autonomous research role", async () => {
    const tools = createTools();
    const workspace = createWorkspace("/tmp");
    const agent = createResearchAgent({ tools, workspace });
    const instructions = await agent.getInstructions();
    expect(instructions).toContain("research");
  });

  test("includes web_search in agent tools", async () => {
    const tools = createTools();
    const workspace = createWorkspace("/tmp");
    const agent = createResearchAgent({ tools, workspace });
    const agentTools = await agent.listTools();
    const toolIds = Object.keys(agentTools);
    expect(toolIds).toContain("web_search");
  });

  test("sets maxSteps via defaultOptions", async () => {
    const tools = createTools();
    const workspace = createWorkspace("/tmp");
    const agent = createResearchAgent({ tools, workspace, maxSteps: 25 });
    const opts = await agent.getDefaultOptions();
    expect(opts?.maxSteps).toBe(25);
  });

  test("defaults maxSteps to 30 when not specified", async () => {
    const tools = createTools();
    const workspace = createWorkspace("/tmp");
    const agent = createResearchAgent({ tools, workspace });
    const opts = await agent.getDefaultOptions();
    expect(opts?.maxSteps).toBe(30);
  });

  test("has a description for parent agent tool exposure", () => {
    const tools = createTools();
    const workspace = createWorkspace("/tmp");
    const agent = createResearchAgent({ tools, workspace });
    expect(agent.getDescription()).toBeTruthy();
  });
});

describe("createDiscoveryAgent — sub-agents", () => {
  test("registers researcher as a sub-agent", async () => {
    const tools = createTools();
    const workspace = createWorkspace("/tmp");
    const agent = createDiscoveryAgent({
      systemPrompt: "Test",
      tools,
      workspace,
    });
    const agents = await agent.listAgents();
    expect(Object.keys(agents)).toContain("researcher");
  });

  test("researcher agent inherits model from discovery agent config", async () => {
    const tools = createTools();
    const workspace = createWorkspace("/tmp");
    const agent = createDiscoveryAgent({
      systemPrompt: "Test",
      model: "openai/gpt-4",
      tools,
      workspace,
    });
    const agents = await agent.listAgents();
    expect(agents.researcher!.model).toBe("openai/gpt-4");
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
    onFinish?: (event: any) => Promise<void> | void;
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

    const deps: ConversationDeps = {
      agent: mockAgent,
      input,
      output,
      ...(overrides?.onFinish ? { onFinish: overrides.onFinish } : {}),
    };

    return {
      input,
      output,
      mockStream,
      deps,
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

  test("onFinish callback is invokable by Mastra when passed through stream options", async () => {
    const onFinish = mock(async () => {});
    const { input, output, deps } = makeDeps({
      onFinish,
      streamImpl: async (msgs: any[], opts: any) => {
        // Simulate Mastra calling onFinish after completion
        if (opts.onFinish) {
          opts.onFinish({ text: "Done.", messages: msgs, toolResults: [] });
        }
        return {
          textStream: textStreamFrom(["Done."]),
          getFullOutput: async () => ({
            messages: [
              ...msgs,
              { role: "assistant", content: "Done." },
            ],
          }),
        };
      },
    });

    const done = runConversation(deps);
    input.write("Hello\n");
    await new Promise((r) => setTimeout(r, 50));
    input.end();
    await done;

    expect(onFinish).toHaveBeenCalledTimes(1);
    const [finishEvent] = (onFinish.mock.calls as any)[0];
    expect(finishEvent.text).toBe("Done.");
  });

  test("passes onFinish to agent.stream options so Mastra invokes it", async () => {
    let capturedOpts: any = null;
    const onFinish = mock(async () => {});
    const { input, output, deps } = makeDeps({
      onFinish,
      streamImpl: async (msgs: any[], opts: any) => {
        capturedOpts = opts;
        return {
          textStream: textStreamFrom(["Response"]),
          getFullOutput: async () => ({
            messages: [...msgs, { role: "assistant", content: "Response" }],
          }),
        };
      },
    });

    const done = runConversation(deps);
    input.write("Test\n");
    await new Promise((r) => setTimeout(r, 50));
    input.end();
    await done;

    expect(capturedOpts.onFinish).toBe(onFinish);
  });

  test("does not pass onFinish when not provided in deps", async () => {
    let capturedOpts: any = null;
    const { input, output, deps } = makeDeps({
      streamImpl: async (msgs: any[], opts: any) => {
        capturedOpts = opts;
        return {
          textStream: textStreamFrom(["Response"]),
          getFullOutput: async () => ({
            messages: [...msgs, { role: "assistant", content: "Response" }],
          }),
        };
      },
    });

    const done = runConversation(deps);
    input.write("Test\n");
    await new Promise((r) => setTimeout(r, 50));
    input.end();
    await done;

    expect(capturedOpts.onFinish).toBeUndefined();
  });

  test("completes cleanly on EOF", async () => {
    const { input, deps } = makeDeps();

    const done = runConversation(deps);
    input.end();
    await done;
  });
});
