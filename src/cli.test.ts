import { test, expect, describe, mock, afterAll } from "bun:test";
import { PassThrough } from "node:stream";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { realpathSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Agent, LLMStepResult } from "@mastra/core/agent";
import type { MessageInput } from "@mastra/core/agent/message-list";
import { createTool } from "@mastra/core/tools";
import * as z from "zod";
import { parseCliArgs, runConversation, type ConversationDeps } from "./cli";
import type { OnFinishCallback } from "./session-runner";
import { DEFAULT_MODEL, getProviderFromModel, getApiKeyEnvVar, validateApiKey } from "./model-resolution";
import { createWorkspace } from "./workspace-factory";
import { createDiscoveryAgent, createResearchAgent } from "./agent-definitions";

/** Extract the stream options type from Agent.stream()'s second parameter */
type StreamOptions = NonNullable<Parameters<Agent["stream"]>[1]>;

/** Mock stream function signature matching Agent.stream() */
type MockStreamFn = (messages: MessageInput[], opts: StreamOptions) => ReturnType<Agent["stream"]>;

/** Typed accessor for mock call arguments */
function mockCallArgs(fn: ReturnType<typeof mock>, index: number) {
  return fn.mock.calls[index] as unknown as [MessageInput[], StreamOptions];
}

describe("parseCliArgs", () => {
  // --- Subcommand extraction ---

  test("throws when no subcommand is provided", () => {
    expect(() => parseCliArgs([])).toThrow();
  });

  test("throws when an unknown subcommand is provided", () => {
    expect(() => parseCliArgs(["deploy", "--codebase", "/tmp"])).toThrow();
  });

  // --- discover subcommand ---

  test("parses discover subcommand with required --codebase", () => {
    const result = parseCliArgs(["discover", "--codebase", "/some/path"]);
    expect(result.subcommand).toBe("discover");
    expect(result.codebase).toBe("/some/path");
  });

  test("discover defaults --output to ./jobs/", () => {
    const result = parseCliArgs(["discover", "--codebase", "/some/path"]);
    if (result.subcommand === "discover") {
      expect(result.output).toBe("./jobs/");
    }
  });

  test("discover accepts custom --output", () => {
    const result = parseCliArgs([
      "discover", "--codebase", "/some/path", "--output", "/custom/output",
    ]);
    if (result.subcommand === "discover") {
      expect(result.output).toBe("/custom/output");
    }
  });

  test("discover accepts --model", () => {
    const result = parseCliArgs([
      "discover", "--codebase", "/some/path", "--model", "openai/gpt-4",
    ]);
    expect(result.model).toBe("openai/gpt-4");
  });

  test("discover defaults --model to undefined", () => {
    const result = parseCliArgs(["discover", "--codebase", "/some/path"]);
    expect(result.model).toBeUndefined();
  });

  test("discover throws when --codebase is missing", () => {
    expect(() => parseCliArgs(["discover"])).toThrow("--codebase");
  });

  test("discover rejects unknown flags", () => {
    expect(() =>
      parseCliArgs(["discover", "--codebase", "/tmp", "--provider", "openai"]),
    ).toThrow();
  });

  // --- plan subcommand ---

  test("parses plan subcommand with required flags", () => {
    const tmp = join(tmpdir(), `method6-plan-${Date.now()}`);
    mkdirSync(join(tmp, ".sauna", "jobs", "my-job"), { recursive: true });
    try {
      const result = parseCliArgs(["plan", "--codebase", tmp, "--job", "my-job"]);
      expect(result.subcommand).toBe("plan");
      expect(result.codebase).toBe(tmp);
      if (result.subcommand === "plan") {
        expect(result.job).toBe("my-job");
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("plan defaults --iterations to 1", () => {
    const tmp = join(tmpdir(), `method6-plan-iter-${Date.now()}`);
    mkdirSync(join(tmp, ".sauna", "jobs", "my-job"), { recursive: true });
    try {
      const result = parseCliArgs(["plan", "--codebase", tmp, "--job", "my-job"]);
      if (result.subcommand === "plan") {
        expect(result.iterations).toBe(1);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("plan accepts custom --iterations", () => {
    const tmp = join(tmpdir(), `method6-plan-iter2-${Date.now()}`);
    mkdirSync(join(tmp, ".sauna", "jobs", "my-job"), { recursive: true });
    try {
      const result = parseCliArgs([
        "plan", "--codebase", tmp, "--job", "my-job", "--iterations", "5",
      ]);
      if (result.subcommand === "plan") {
        expect(result.iterations).toBe(5);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("plan rejects --iterations of zero", () => {
    const tmp = join(tmpdir(), `method6-plan-zero-${Date.now()}`);
    mkdirSync(join(tmp, ".sauna", "jobs", "my-job"), { recursive: true });
    try {
      expect(() =>
        parseCliArgs(["plan", "--codebase", tmp, "--job", "my-job", "--iterations", "0"]),
      ).toThrow("positive integer");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("plan rejects negative --iterations", () => {
    const tmp = join(tmpdir(), `method6-plan-neg-${Date.now()}`);
    mkdirSync(join(tmp, ".sauna", "jobs", "my-job"), { recursive: true });
    try {
      // parseArgs treats "-1" as a flag, producing its own error before our validation
      expect(() =>
        parseCliArgs(["plan", "--codebase", tmp, "--job", "my-job", "--iterations=-1"]),
      ).toThrow("positive integer");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("plan rejects non-numeric --iterations", () => {
    const tmp = join(tmpdir(), `method6-plan-nan-${Date.now()}`);
    mkdirSync(join(tmp, ".sauna", "jobs", "my-job"), { recursive: true });
    try {
      expect(() =>
        parseCliArgs(["plan", "--codebase", tmp, "--job", "my-job", "--iterations", "abc"]),
      ).toThrow("positive integer");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("plan throws when --codebase is missing", () => {
    expect(() => parseCliArgs(["plan", "--job", "my-job"])).toThrow("--codebase");
  });

  test("plan throws when --job is missing", () => {
    expect(() => parseCliArgs(["plan", "--codebase", "/tmp"])).toThrow("--job");
  });

  test("plan throws when --job directory does not exist", () => {
    const tmp = join(tmpdir(), `method6-plan-nojob-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    try {
      expect(() =>
        parseCliArgs(["plan", "--codebase", tmp, "--job", "nonexistent"]),
      ).toThrow("nonexistent");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  // --- build subcommand ---

  test("parses build subcommand with required flags", () => {
    const tmp = join(tmpdir(), `method6-build-${Date.now()}`);
    mkdirSync(join(tmp, ".sauna", "jobs", "my-job"), { recursive: true });
    try {
      const result = parseCliArgs(["build", "--codebase", tmp, "--job", "my-job"]);
      expect(result.subcommand).toBe("build");
      if (result.subcommand === "build") {
        expect(result.job).toBe("my-job");
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("build throws when --job is missing", () => {
    expect(() => parseCliArgs(["build", "--codebase", "/tmp"])).toThrow("--job");
  });

  test("build does not accept --iterations", () => {
    const tmp = join(tmpdir(), `method6-build-iter-${Date.now()}`);
    mkdirSync(join(tmp, ".sauna", "jobs", "my-job"), { recursive: true });
    try {
      expect(() =>
        parseCliArgs(["build", "--codebase", tmp, "--job", "my-job", "--iterations", "3"]),
      ).toThrow();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("build does not accept --output", () => {
    const tmp = join(tmpdir(), `method6-build-out-${Date.now()}`);
    mkdirSync(join(tmp, ".sauna", "jobs", "my-job"), { recursive: true });
    try {
      expect(() =>
        parseCliArgs(["build", "--codebase", tmp, "--job", "my-job", "--output", "/out"]),
      ).toThrow();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  // --- run subcommand ---

  test("parses run subcommand with required flags", () => {
    const tmp = join(tmpdir(), `method6-run-${Date.now()}`);
    mkdirSync(join(tmp, ".sauna", "jobs", "my-job"), { recursive: true });
    try {
      const result = parseCliArgs(["run", "--codebase", tmp, "--job", "my-job"]);
      expect(result.subcommand).toBe("run");
      if (result.subcommand === "run") {
        expect(result.job).toBe("my-job");
        expect(result.iterations).toBe(1);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("run accepts --iterations", () => {
    const tmp = join(tmpdir(), `method6-run-iter-${Date.now()}`);
    mkdirSync(join(tmp, ".sauna", "jobs", "my-job"), { recursive: true });
    try {
      const result = parseCliArgs([
        "run", "--codebase", tmp, "--job", "my-job", "--iterations", "3",
      ]);
      if (result.subcommand === "run") {
        expect(result.iterations).toBe(3);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("run throws when --job is missing", () => {
    expect(() => parseCliArgs(["run", "--codebase", "/tmp"])).toThrow("--job");
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
  test("returns env var name when key is set", () => {
    const env = { ANTHROPIC_API_KEY: "test-key" };
    const result = validateApiKey(env);
    expect(result).toBe("ANTHROPIC_API_KEY");
  });

  test("throws when required API key is missing", () => {
    const env = {};
    expect(() => validateApiKey(env, "openai/gpt-4")).toThrow("OPENAI_API_KEY");
  });

  test("validates correct env var based on model prefix", () => {
    const env = { OPENAI_API_KEY: "test-openai-key" };
    const result = validateApiKey(env, "openai/gpt-4");
    expect(result).toBe("OPENAI_API_KEY");
  });
});

/** Stub MCP tools record matching ToolsInput for agent definition tests */
const stubMcpTools = {
  tavily_web_search: createTool({
    id: "tavily_web_search",
    description: "Search the web",
    inputSchema: z.object({ query: z.string() }),
    async execute({ query }) { return `results for ${query}`; },
  }),
  context7_lookup: createTool({
    id: "context7_lookup",
    description: "Look up library documentation",
    inputSchema: z.object({ library: z.string() }),
    async execute({ library }) { return `docs for ${library}`; },
  }),
};

function stubResearcher() {
  const workspace = createWorkspace("/tmp");
  return createResearchAgent({ tools: stubMcpTools, workspace });
}

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

  test("writes anywhere within codebase are allowed", async () => {
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
    const workspace = createWorkspace("/tmp");
    const agent = createDiscoveryAgent({
      systemPrompt: "You are a test agent.",
      tools: stubMcpTools,
      workspace,
      researcher: stubResearcher(),
    });
    expect(agent.model).toBe(DEFAULT_MODEL);
  });

  test("uses provided model when specified", () => {
    const workspace = createWorkspace("/tmp");
    const agent = createDiscoveryAgent({
      systemPrompt: "You are a test agent.",
      model: "openai/gpt-4",
      tools: stubMcpTools,
      workspace,
      researcher: stubResearcher(),
    });
    expect(agent.model).toBe("openai/gpt-4");
  });

  test("wires system prompt as instructions", async () => {
    const workspace = createWorkspace("/tmp");
    const agent = createDiscoveryAgent({
      systemPrompt: "You are a JTBD discovery agent.",
      tools: stubMcpTools,
      workspace,
      researcher: stubResearcher(),
    });
    const instructions = await agent.getInstructions();
    expect(instructions).toBe("You are a JTBD discovery agent.");
  });

  test("appends output directory to system prompt when provided", async () => {
    const workspace = createWorkspace("/tmp");
    const agent = createDiscoveryAgent({
      systemPrompt: "You are a JTBD discovery agent.",
      tools: stubMcpTools,
      workspace,
      researcher: stubResearcher(),
      outputPath: "/my/output",
    });
    const instructions = await agent.getInstructions();
    expect(instructions).toContain("/my/output");
    expect(instructions).toContain("You are a JTBD discovery agent.");
  });

  test("does not modify system prompt when outputPath is absent", async () => {
    const workspace = createWorkspace("/tmp");
    const agent = createDiscoveryAgent({
      systemPrompt: "You are a JTBD discovery agent.",
      tools: stubMcpTools,
      workspace,
      researcher: stubResearcher(),
    });
    const instructions = await agent.getInstructions();
    expect(instructions).toBe("You are a JTBD discovery agent.");
  });

  test("exposes MCP tools passed via config", async () => {
    const workspace = createWorkspace("/tmp");
    const agent = createDiscoveryAgent({
      systemPrompt: "Test",
      tools: stubMcpTools,
      workspace,
      researcher: stubResearcher(),
    });
    const agentTools = await agent.listTools();
    const toolIds = Object.keys(agentTools);
    expect(toolIds).toContain("tavily_web_search");
    expect(toolIds).toContain("context7_lookup");
  });
});

describe("createResearchAgent", () => {
  test("defaults model to DEFAULT_MODEL when not specified", () => {
    const workspace = createWorkspace("/tmp");
    const agent = createResearchAgent({ tools: stubMcpTools, workspace });
    expect(agent.model).toBe(DEFAULT_MODEL);
  });

  test("uses provided model when specified", () => {
    const workspace = createWorkspace("/tmp");
    const agent = createResearchAgent({ tools: stubMcpTools, workspace, model: "openai/gpt-4" });
    expect(agent.model).toBe("openai/gpt-4");
  });

  test("has instructions referencing research, web search, and documentation lookup", async () => {
    const workspace = createWorkspace("/tmp");
    const agent = createResearchAgent({ tools: stubMcpTools, workspace });
    const instructions = await agent.getInstructions();
    expect(instructions).toContain("research");
    expect(instructions).toContain("web search");
    expect(instructions).toContain("documentation lookup");
  });

  test("exposes MCP tools passed via config", async () => {
    const workspace = createWorkspace("/tmp");
    const agent = createResearchAgent({ tools: stubMcpTools, workspace });
    const agentTools = await agent.listTools();
    const toolIds = Object.keys(agentTools);
    expect(toolIds).toContain("tavily_web_search");
    expect(toolIds).toContain("context7_lookup");
  });

  test("sets maxSteps via defaultOptions", async () => {
    const workspace = createWorkspace("/tmp");
    const agent = createResearchAgent({ tools: stubMcpTools, workspace, maxSteps: 25 });
    const opts = await agent.getDefaultOptions();
    expect(opts?.maxSteps).toBe(25);
  });

  test("defaults maxSteps to 30 when not specified", async () => {
    const workspace = createWorkspace("/tmp");
    const agent = createResearchAgent({ tools: stubMcpTools, workspace });
    const opts = await agent.getDefaultOptions();
    expect(opts?.maxSteps).toBe(30);
  });

  test("has a description for parent agent tool exposure", () => {
    const workspace = createWorkspace("/tmp");
    const agent = createResearchAgent({ tools: stubMcpTools, workspace });
    expect(agent.getDescription()).toBeTruthy();
  });
});

describe("createDiscoveryAgent — sub-agents", () => {
  test("registers researcher as a sub-agent", async () => {
    const workspace = createWorkspace("/tmp");
    const researcher = stubResearcher();
    const agent = createDiscoveryAgent({
      systemPrompt: "Test",
      tools: stubMcpTools,
      workspace,
      researcher,
    });
    const agents = await agent.listAgents();
    expect(Object.keys(agents)).toContain("researcher");
  });

  test("researcher agent inherits model from discovery agent config", async () => {
    const workspace = createWorkspace("/tmp");
    const researcher = createResearchAgent({ tools: stubMcpTools, workspace, model: "openai/gpt-4" });
    const agent = createDiscoveryAgent({
      systemPrompt: "Test",
      model: "openai/gpt-4",
      tools: stubMcpTools,
      workspace,
      researcher,
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
    streamImpl?: MockStreamFn;
    onFinish?: OnFinishCallback;
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

    const mockAgent = { stream: mockStream } as unknown as Agent;

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
    const [messages] = mockCallArgs(mockStream, 0);
    expect(messages).toContainEqual({ role: "user", content: "Hello" });
  });

  test("accumulates messages across multiple turns", async () => {
    let callCount = 0;
    const { input, output, mockStream, deps } = makeDeps({
      streamImpl: async (msgs: MessageInput[]) => {
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
    const [secondMessages] = mockCallArgs(mockStream, 1);
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
      streamImpl: async (msgs: MessageInput[], opts: StreamOptions) => {
        opts.onStepFinish!({
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
        } as LLMStepResult);
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
      streamImpl: async (msgs: MessageInput[], opts: StreamOptions) => {
        opts.onStepFinish!({
          toolResults: [
            {
              payload: {
                toolName: "mastra_workspace_write_file",
                result: { success: false, path: "specs/fail.md", size: 0 },
              },
            },
          ],
        } as LLMStepResult);
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
      streamImpl: async (msgs: MessageInput[], opts: StreamOptions) => {
        // Simulate Mastra calling onFinish after completion
        if (opts.onFinish) {
          opts.onFinish({ text: "Done.", messages: msgs, toolResults: [] } as Parameters<NonNullable<StreamOptions["onFinish"]>>[0]);
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
    const [finishEvent] = onFinish.mock.calls[0] as unknown as [Parameters<NonNullable<OnFinishCallback>>[0]];
    expect(finishEvent.text).toBe("Done.");
  });

  test("passes onFinish to agent.stream options so Mastra invokes it", async () => {
    let capturedOpts: StreamOptions | null = null;
    const onFinish = mock(async () => {});
    const { input, output, deps } = makeDeps({
      onFinish,
      streamImpl: async (msgs: MessageInput[], opts: StreamOptions) => {
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

    expect(capturedOpts!.onFinish).toBe(onFinish);
  });

  test("does not pass onFinish when not provided in deps", async () => {
    let capturedOpts: StreamOptions | null = null;
    const { input, output, deps } = makeDeps({
      streamImpl: async (msgs: MessageInput[], opts: StreamOptions) => {
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

    expect(capturedOpts!.onFinish).toBeUndefined();
  });

  test("completes cleanly on EOF", async () => {
    const { input, deps } = makeDeps();

    const done = runConversation(deps);
    input.end();
    await done;
  });
});

describe("main() startup validation", () => {
  test("exits with error when model provider API key is missing", async () => {
    const entrypoint = resolve(import.meta.dirname, "../index.ts");
    // Strip all known API keys so validateApiKey fails for the default provider
    const cleanEnv = Object.fromEntries(
      Object.entries(process.env).filter(
        ([k]) => !k.endsWith("_API_KEY"),
      ),
    );

    const proc = Bun.spawn(["bun", entrypoint, "discover", "--codebase", "/tmp"], {
      env: cleanEnv,
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode).toBe(1);
    expect(stderr).toContain("ANTHROPIC_API_KEY");
    expect(stderr).toContain("is required");
  });

  test("exits with error when TAVILY_API_KEY is missing", async () => {
    const entrypoint = resolve(import.meta.dirname, "../index.ts");
    // Provide the LLM key so the first validation passes, but strip TAVILY_API_KEY
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([k]) => k !== "TAVILY_API_KEY",
      ),
    );
    env.ANTHROPIC_API_KEY = "test-key-for-validation";

    const proc = Bun.spawn(["bun", entrypoint, "discover", "--codebase", "/tmp"], {
      env,
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode).toBe(1);
    expect(stderr).toContain("TAVILY_API_KEY");
    expect(stderr).toContain("is required");
  });
});
