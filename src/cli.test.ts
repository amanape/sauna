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
import { parseCliArgs, runConversation, type ConversationDeps, type StreamingChunkCallback, type HelpResult } from "./cli";
import type { OnFinishCallback } from "./session-runner";
import { stripAnsi } from "./terminal-formatting";
import { DEFAULT_MODEL, getProviderFromModel, getApiKeyEnvVar, validateApiKey } from "./model-resolution";
import { createWorkspace } from "./workspace-factory";
import { createDiscoveryAgent, createResearchAgent } from "./agent-definitions";

/** Extract the generate options type from Agent.generate()'s second parameter */
type GenerateOptions = NonNullable<Parameters<Agent["generate"]>[1]>;

/** Typed accessor for mock call arguments */
function mockCallArgs(fn: ReturnType<typeof mock>, index: number) {
  return fn.mock.calls[index] as unknown as [MessageInput[], GenerateOptions];
}

/** Create a mock generate result from text and messages */
function mockGenerateResult(text: string, messages: MessageInput[]) {
  return { text, messages };
}

/** Mock generate function — returns only the fields our code uses */
type MockGenerateFn = (messages: MessageInput[], opts: GenerateOptions) => Promise<{ text: string; messages: MessageInput[] }>;

describe("parseCliArgs", () => {
  // --- Help and usage ---

  test("returns help result when no subcommand is provided", () => {
    const result = parseCliArgs([]);
    expect(result.subcommand).toBe("help");
  });

  test("returns help result when --help is the only argument", () => {
    const result = parseCliArgs(["--help"]);
    expect(result.subcommand).toBe("help");
  });

  test("root help text lists all four subcommands", () => {
    const result = parseCliArgs([]) as HelpResult;
    expect(result.text).toContain("discover");
    expect(result.text).toContain("plan");
    expect(result.text).toContain("build");
    expect(result.text).toContain("run");
  });

  test("root help text includes subcommand descriptions", () => {
    const result = parseCliArgs([]) as HelpResult;
    expect(result.text).toContain("discovery");
    expect(result.text).toContain("planning");
    expect(result.text).toContain("builder");
  });

  // --- Per-subcommand help ---

  test("discover --help returns help listing discover flags", () => {
    const result = parseCliArgs(["discover", "--help"]) as HelpResult;
    expect(result.subcommand).toBe("help");
    expect(result.text).toContain("--codebase");
    expect(result.text).toContain("--output");
    expect(result.text).toContain("--model");
    expect(result.text).toContain("--verbose");
  });

  test("plan --help returns help listing plan flags", () => {
    const result = parseCliArgs(["plan", "--help"]) as HelpResult;
    expect(result.subcommand).toBe("help");
    expect(result.text).toContain("--codebase");
    expect(result.text).toContain("--job");
    expect(result.text).toContain("--iterations");
    expect(result.text).toContain("--model");
    expect(result.text).toContain("--verbose");
  });

  test("build --help returns help listing build flags", () => {
    const result = parseCliArgs(["build", "--help"]) as HelpResult;
    expect(result.subcommand).toBe("help");
    expect(result.text).toContain("--codebase");
    expect(result.text).toContain("--job");
    expect(result.text).toContain("--model");
    expect(result.text).toContain("--verbose");
  });

  test("build --help does not list --iterations", () => {
    const result = parseCliArgs(["build", "--help"]) as HelpResult;
    expect(result.text).not.toContain("--iterations");
  });

  test("run --help returns help listing run flags", () => {
    const result = parseCliArgs(["run", "--help"]) as HelpResult;
    expect(result.subcommand).toBe("help");
    expect(result.text).toContain("--codebase");
    expect(result.text).toContain("--job");
    expect(result.text).toContain("--iterations");
    expect(result.text).toContain("--model");
    expect(result.text).toContain("--verbose");
  });

  test("per-subcommand help includes subcommand name", () => {
    const result = parseCliArgs(["discover", "--help"]) as HelpResult;
    expect(result.text).toContain("discover");
  });

  // --- Subcommand extraction ---

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

  test("discover accepts --verbose flag", () => {
    const result = parseCliArgs(["discover", "--codebase", "/some/path", "--verbose"]);
    if (result.subcommand === "discover") {
      expect(result.verbose).toBe(true);
    }
  });

  test("discover defaults verbose to false", () => {
    const result = parseCliArgs(["discover", "--codebase", "/some/path"]);
    if (result.subcommand === "discover") {
      expect(result.verbose).toBe(false);
    }
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

  test("plan accepts --verbose flag", () => {
    const tmp = join(tmpdir(), `method6-plan-verbose-${Date.now()}`);
    mkdirSync(join(tmp, ".sauna", "jobs", "my-job"), { recursive: true });
    try {
      const result = parseCliArgs(["plan", "--codebase", tmp, "--job", "my-job", "--verbose"]);
      if (result.subcommand === "plan") {
        expect(result.verbose).toBe(true);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("plan defaults verbose to false", () => {
    const tmp = join(tmpdir(), `method6-plan-noverbose-${Date.now()}`);
    mkdirSync(join(tmp, ".sauna", "jobs", "my-job"), { recursive: true });
    try {
      const result = parseCliArgs(["plan", "--codebase", tmp, "--job", "my-job"]);
      if (result.subcommand === "plan") {
        expect(result.verbose).toBe(false);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
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

  test("build accepts --verbose flag", () => {
    const tmp = join(tmpdir(), `method6-build-verbose-${Date.now()}`);
    mkdirSync(join(tmp, ".sauna", "jobs", "my-job"), { recursive: true });
    try {
      const result = parseCliArgs(["build", "--codebase", tmp, "--job", "my-job", "--verbose"]);
      if (result.subcommand === "build") {
        expect(result.verbose).toBe(true);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("build defaults verbose to false", () => {
    const tmp = join(tmpdir(), `method6-build-noverbose-${Date.now()}`);
    mkdirSync(join(tmp, ".sauna", "jobs", "my-job"), { recursive: true });
    try {
      const result = parseCliArgs(["build", "--codebase", tmp, "--job", "my-job"]);
      if (result.subcommand === "build") {
        expect(result.verbose).toBe(false);
      }
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

  test("run accepts --verbose flag", () => {
    const tmp = join(tmpdir(), `method6-run-verbose-${Date.now()}`);
    mkdirSync(join(tmp, ".sauna", "jobs", "my-job"), { recursive: true });
    try {
      const result = parseCliArgs(["run", "--codebase", tmp, "--job", "my-job", "--verbose"]);
      if (result.subcommand === "run") {
        expect(result.verbose).toBe(true);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("run defaults verbose to false", () => {
    const tmp = join(tmpdir(), `method6-run-noverbose-${Date.now()}`);
    mkdirSync(join(tmp, ".sauna", "jobs", "my-job"), { recursive: true });
    try {
      const result = parseCliArgs(["run", "--codebase", tmp, "--job", "my-job"]);
      if (result.subcommand === "run") {
        expect(result.verbose).toBe(false);
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
  function makeDeps(overrides?: {
    generateImpl?: MockGenerateFn;
    onStepFinish?: ConversationDeps["onStepFinish"];
    onFinish?: OnFinishCallback;
  }) {
    const input = new PassThrough();
    const output = new PassThrough();
    output.setEncoding("utf8");

    const mockGenerate = mock(
      overrides?.generateImpl ??
      (async () => mockGenerateResult(
        "Hello from AI",
        [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hello from AI" },
        ],
      )),
    );

    const mockAgent = { generate: mockGenerate } as unknown as Agent;

    const deps: ConversationDeps = {
      agent: mockAgent,
      input,
      output,
      ...(overrides?.onStepFinish ? { onStepFinish: overrides.onStepFinish } : {}),
      ...(overrides?.onFinish ? { onFinish: overrides.onFinish } : {}),
    };

    return {
      input,
      output,
      mockGenerate,
      deps,
    };
  }

  test("writes agent response text to output", async () => {
    const { input, output, deps } = makeDeps({
      generateImpl: async () => mockGenerateResult(
        "Hello from AI",
        [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hello from AI" },
        ],
      ),
    });

    const done = runConversation(deps);
    input.write("Hello\n");
    await new Promise((r) => setTimeout(r, 50));
    input.end();
    await done;

    const captured = output.read();
    expect(captured).toContain("Hello from AI");
  });

  test("passes user input to agent.generate and writes response", async () => {
    const { input, output, mockGenerate, deps } = makeDeps();

    const done = runConversation(deps);
    input.write("Hello\n");
    await new Promise((r) => setTimeout(r, 50));
    input.end();
    await done;

    const captured = output.read();
    expect(captured).toContain("Hello from AI");
    expect(mockGenerate.mock.calls.length).toBeGreaterThanOrEqual(1);
    const [messages] = mockCallArgs(mockGenerate, 0);
    expect(messages).toContainEqual({ role: "user", content: "Hello" });
  });

  test("accumulates messages across multiple turns", async () => {
    let callCount = 0;
    const { input, output, mockGenerate, deps } = makeDeps({
      generateImpl: async (msgs: MessageInput[]) => {
        callCount++;
        const text = `Response ${callCount}`;
        return mockGenerateResult(
          text,
          [
            ...msgs,
            { role: "assistant", content: text },
          ],
        );
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
    const [secondMessages] = mockCallArgs(mockGenerate, 1);
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

  test("invokes onStepFinish callback when provided", async () => {
    const stepResults: LLMStepResult[] = [];
    const onStepFinish = (step: LLMStepResult) => { stepResults.push(step); };
    const fakeStep = {
      toolResults: [
        {
          payload: {
            toolName: "mastra_workspace_write_file",
            result: { success: true, path: "specs/my-spec.md", size: 42 },
          },
        },
      ],
    } as LLMStepResult;

    const { input, output, deps } = makeDeps({
      onStepFinish,
      generateImpl: async (msgs: MessageInput[], opts: GenerateOptions) => {
        // Simulate Mastra invoking onStepFinish during generation
        if (opts.onStepFinish) {
          opts.onStepFinish(fakeStep);
        }
        return mockGenerateResult(
          "Done writing.",
          [
            ...msgs,
            { role: "assistant", content: "Done writing." },
          ],
        );
      },
    });

    const done = runConversation(deps);
    input.write("Write a spec\n");
    await new Promise((r) => setTimeout(r, 50));
    input.end();
    await done;

    expect(stepResults).toHaveLength(1);
    expect(stepResults[0]).toBe(fakeStep);
  });

  test("does not pass onStepFinish when not provided in deps", async () => {
    let capturedOpts: GenerateOptions | null = null;
    const { input, output, deps } = makeDeps({
      generateImpl: async (msgs: MessageInput[], opts: GenerateOptions) => {
        capturedOpts = opts;
        return mockGenerateResult(
          "Response",
          [...msgs, { role: "assistant", content: "Response" }],
        );
      },
    });

    const done = runConversation(deps);
    input.write("Test\n");
    await new Promise((r) => setTimeout(r, 50));
    input.end();
    await done;

    expect(capturedOpts!.onStepFinish).toBeUndefined();
  });

  test("onFinish callback is invokable by Mastra when passed through generate options", async () => {
    const onFinish = mock(async () => {});
    const { input, output, deps } = makeDeps({
      onFinish,
      generateImpl: async (msgs: MessageInput[], opts: GenerateOptions) => {
        // Simulate Mastra calling onFinish after completion
        if (opts.onFinish) {
          opts.onFinish({ text: "Done.", messages: msgs, toolResults: [] } as unknown as Parameters<NonNullable<GenerateOptions["onFinish"]>>[0]);
        }
        return mockGenerateResult(
          "Done.",
          [
            ...msgs,
            { role: "assistant", content: "Done." },
          ],
        );
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

  test("passes onFinish to agent.generate options so Mastra invokes it", async () => {
    let capturedOpts: GenerateOptions | null = null;
    const onFinish = mock(async () => {});
    const { input, output, deps } = makeDeps({
      onFinish,
      generateImpl: async (msgs: MessageInput[], opts: GenerateOptions) => {
        capturedOpts = opts;
        return mockGenerateResult(
          "Response",
          [...msgs, { role: "assistant", content: "Response" }],
        );
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
    let capturedOpts: GenerateOptions | null = null;
    const { input, output, deps } = makeDeps({
      generateImpl: async (msgs: MessageInput[], opts: GenerateOptions) => {
        capturedOpts = opts;
        return mockGenerateResult(
          "Response",
          [...msgs, { role: "assistant", content: "Response" }],
        );
      },
    });

    const done = runConversation(deps);
    input.write("Test\n");
    await new Promise((r) => setTimeout(r, 50));
    input.end();
    await done;

    expect(capturedOpts!.onFinish).toBeUndefined();
  });

  test("calls onTurnStart before agent.generate and onTurnEnd after", async () => {
    const events: string[] = [];
    const input = new PassThrough();
    const output = new PassThrough();
    output.setEncoding("utf8");

    const mockGenerate = mock(async () => {
      events.push("generate");
      return mockGenerateResult("OK", [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "OK" },
      ]);
    });

    const deps: ConversationDeps = {
      agent: { generate: mockGenerate } as unknown as Agent,
      input,
      output,
      onTurnStart: () => { events.push("turnStart"); },
      onTurnEnd: () => { events.push("turnEnd"); },
    };

    const done = runConversation(deps);
    input.write("Hi\n");
    await new Promise((r) => setTimeout(r, 50));
    input.end();
    await done;

    expect(events).toEqual(["turnStart", "generate", "turnEnd"]);
  });

  test("calls onTurnStart and onTurnEnd for each turn in multi-turn conversation", async () => {
    const events: string[] = [];
    let callCount = 0;
    const input = new PassThrough();
    const output = new PassThrough();
    output.setEncoding("utf8");

    const mockGenerate = mock(async (msgs: MessageInput[]) => {
      callCount++;
      events.push(`generate${callCount}`);
      return mockGenerateResult(`R${callCount}`, [
        ...msgs,
        { role: "assistant", content: `R${callCount}` },
      ]);
    });

    const deps: ConversationDeps = {
      agent: { generate: mockGenerate } as unknown as Agent,
      input,
      output,
      onTurnStart: () => { events.push("turnStart"); },
      onTurnEnd: () => { events.push("turnEnd"); },
    };

    const done = runConversation(deps);
    input.write("First\n");
    await new Promise((r) => setTimeout(r, 50));
    input.write("Second\n");
    await new Promise((r) => setTimeout(r, 50));
    input.end();
    await done;

    expect(events).toEqual([
      "turnStart", "generate1", "turnEnd",
      "turnStart", "generate2", "turnEnd",
    ]);
  });

  test("does not call turn hooks when they are not provided", async () => {
    let capturedOpts: GenerateOptions | null = null;
    const { input, output, deps } = makeDeps({
      generateImpl: async (msgs: MessageInput[], opts: GenerateOptions) => {
        capturedOpts = opts;
        return mockGenerateResult("Response", [
          ...msgs,
          { role: "assistant", content: "Response" },
        ]);
      },
    });

    const done = runConversation(deps);
    input.write("Test\n");
    await new Promise((r) => setTimeout(r, 50));
    input.end();
    await done;

    // No error thrown — turn hooks gracefully absent
    expect(capturedOpts).toBeTruthy();
  });

  test("does not call turn hooks for empty/whitespace-only lines", async () => {
    const events: string[] = [];
    const input = new PassThrough();
    const output = new PassThrough();
    output.setEncoding("utf8");

    const mockGenerate = mock(async (msgs: MessageInput[]) => {
      events.push("generate");
      return mockGenerateResult("OK", [
        ...msgs,
        { role: "assistant", content: "OK" },
      ]);
    });

    const deps: ConversationDeps = {
      agent: { generate: mockGenerate } as unknown as Agent,
      input,
      output,
      onTurnStart: () => { events.push("turnStart"); },
      onTurnEnd: () => { events.push("turnEnd"); },
    };

    const done = runConversation(deps);
    input.write("\n");
    input.write("   \n");
    input.write("Real\n");
    await new Promise((r) => setTimeout(r, 50));
    input.end();
    await done;

    // Only one turn for "Real", empty lines are skipped
    expect(events).toEqual(["turnStart", "generate", "turnEnd"]);
  });

  test("calls onTurnEnd even when agent.generate rejects", async () => {
    const onTurnEnd = mock(() => {});
    const input = new PassThrough();
    const output = new PassThrough();
    output.setEncoding("utf8");

    const mockGenerate = mock(async () => {
      throw new Error("Agent failed");
    });

    const deps: ConversationDeps = {
      agent: { generate: mockGenerate } as unknown as Agent,
      input,
      output,
      onTurnStart: () => {},
      onTurnEnd,
    };

    input.write("Hi\n");
    input.end();

    try { await runConversation(deps); } catch { /* expected */ }

    expect(onTurnEnd).toHaveBeenCalledTimes(1);
  });

  test("completes cleanly on EOF", async () => {
    const { input, deps } = makeDeps();

    const done = runConversation(deps);
    input.end();
    await done;
  });

  // ── Streaming mode tests ────────────────────────────────────────────────

  /** Helper to create a mock agent with a stream method that yields chunks */
  function makeStreamingDeps(overrides: {
    chunks: Array<{ type: string; payload: Record<string, unknown> }>;
    fullOutputMessages?: MessageInput[];
    onChunk?: StreamingChunkCallback;
    onTurnStart?: () => void;
    onTurnEnd?: () => void;
  }) {
    const input = new PassThrough();
    const output = new PassThrough();
    output.setEncoding("utf8");

    const messages = overrides.fullOutputMessages ?? [
      { role: "user" as const, content: "Hello" },
      { role: "assistant" as const, content: "Hi there" },
    ];

    const mockStream = mock(async () => {
      // Create a ReadableStream from the chunks array
      const chunks = overrides.chunks;
      const fullStream = new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      });

      return {
        fullStream,
        getFullOutput: async () => ({
          text: "Hi there",
          messages,
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          totalUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          steps: [],
          finishReason: "stop",
          warnings: [],
          providerMetadata: undefined,
          request: {},
          reasoning: [],
          reasoningText: undefined,
          toolCalls: [],
          toolResults: [],
          sources: [],
          files: [],
          response: {},
          object: undefined,
          error: undefined,
          tripwire: undefined,
          traceId: undefined,
          runId: undefined,
          suspendPayload: undefined,
          rememberedMessages: [],
        }),
      };
    });

    const mockAgent = {
      generate: mock(async () => { throw new Error("should not call generate in streaming mode"); }),
      stream: mockStream,
    } as unknown as Agent;

    const deps: ConversationDeps = {
      agent: mockAgent,
      input,
      output,
      streaming: true,
      onChunk: overrides.onChunk,
      onTurnStart: overrides.onTurnStart,
      onTurnEnd: overrides.onTurnEnd,
    };

    return { input, output, mockStream, deps };
  }

  test("streaming: writes text-delta chunks to output stream", async () => {
    const { input, output, deps } = makeStreamingDeps({
      chunks: [
        { type: "text-delta", payload: { id: "1", text: "Hello " } },
        { type: "text-delta", payload: { id: "1", text: "world" } },
      ],
    });

    const done = runConversation(deps);
    input.write("Hi\n");
    await new Promise((r) => setTimeout(r, 50));
    input.end();
    await done;

    const captured = output.read();
    expect(captured).toContain("Hello ");
    expect(captured).toContain("world");
  });

  test("streaming: routes tool-call chunks to onChunk callback", async () => {
    const received: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const onChunk: StreamingChunkCallback = (chunk) => { received.push(chunk as typeof received[0]); };

    const toolCallChunk = {
      type: "tool-call",
      payload: { toolCallId: "tc1", toolName: "read_file", args: { path: "/foo.ts" } },
    };

    const { input, deps } = makeStreamingDeps({
      chunks: [toolCallChunk],
      onChunk,
    });

    const done = runConversation(deps);
    input.write("Read file\n");
    await new Promise((r) => setTimeout(r, 50));
    input.end();
    await done;

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe("tool-call");
    expect(received[0].payload.toolName).toBe("read_file");
  });

  test("streaming: routes tool-result chunks to onChunk callback", async () => {
    const received: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const onChunk: StreamingChunkCallback = (chunk) => { received.push(chunk as typeof received[0]); };

    const { input, deps } = makeStreamingDeps({
      chunks: [
        { type: "tool-call", payload: { toolCallId: "tc1", toolName: "read_file", args: { path: "/foo.ts" } } },
        { type: "tool-result", payload: { toolCallId: "tc1", toolName: "read_file", result: "content" } },
      ],
      onChunk,
    });

    const done = runConversation(deps);
    input.write("Read\n");
    await new Promise((r) => setTimeout(r, 50));
    input.end();
    await done;

    expect(received).toHaveLength(2);
    expect(received[0].type).toBe("tool-call");
    expect(received[1].type).toBe("tool-result");
  });

  test("streaming: routes step-finish and finish chunks to onChunk callback", async () => {
    const received: Array<{ type: string }> = [];
    const onChunk: StreamingChunkCallback = (chunk) => { received.push(chunk as typeof received[0]); };

    const { input, deps } = makeStreamingDeps({
      chunks: [
        { type: "text-delta", payload: { id: "1", text: "OK" } },
        { type: "step-finish", payload: { stepResult: {}, output: { usage: {} }, metadata: {}, messages: [] } },
        { type: "finish", payload: { output: {}, messages: [] } },
      ],
      onChunk,
    });

    const done = runConversation(deps);
    input.write("Go\n");
    await new Promise((r) => setTimeout(r, 50));
    input.end();
    await done;

    const types = received.map((c) => c.type);
    expect(types).toContain("step-finish");
    expect(types).toContain("finish");
    // text-delta should NOT be in onChunk — it goes to output stream
    expect(types).not.toContain("text-delta");
  });

  test("streaming: inserts newline before tool activity when text was mid-line", async () => {
    const { input, output, deps } = makeStreamingDeps({
      chunks: [
        { type: "text-delta", payload: { id: "1", text: "Starting" } },
        { type: "tool-call", payload: { toolCallId: "tc1", toolName: "search", args: { query: "test" } } },
        { type: "tool-result", payload: { toolCallId: "tc1", toolName: "search", result: "found" } },
        { type: "text-delta", payload: { id: "1", text: "Done" } },
      ],
      onChunk: () => {},
    });

    const done = runConversation(deps);
    input.write("Go\n");
    await new Promise((r) => setTimeout(r, 50));
    input.end();
    await done;

    const captured = output.read() as string;
    // After "Starting" text and before tool activity, a newline should be inserted
    // After tool activity and before "Done", text should resume on a new line
    expect(captured).toContain("Starting");
    expect(captured).toContain("Done");
    // The text "Starting" should be followed by a newline (not immediately followed by "Done")
    const startIdx = captured.indexOf("Starting");
    const doneIdx = captured.indexOf("Done");
    const between = captured.slice(startIdx + "Starting".length, doneIdx);
    expect(between).toContain("\n");
  });

  test("streaming: adds trailing newline after streaming completes", async () => {
    const { input, output, deps } = makeStreamingDeps({
      chunks: [
        { type: "text-delta", payload: { id: "1", text: "Hello" } },
      ],
    });

    const done = runConversation(deps);
    input.write("Hi\n");
    await new Promise((r) => setTimeout(r, 50));
    input.end();
    await done;

    const captured = output.read() as string;
    expect(captured).toMatch(/Hello\n$/);
  });

  test("streaming: does not call agent.generate", async () => {
    const { input, deps } = makeStreamingDeps({
      chunks: [
        { type: "text-delta", payload: { id: "1", text: "Response" } },
      ],
    });

    const done = runConversation(deps);
    input.write("Hi\n");
    await new Promise((r) => setTimeout(r, 50));
    input.end();
    await done;

    const mockGenerate = (deps.agent as unknown as { generate: ReturnType<typeof mock> }).generate;
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  test("streaming: calls onTurnStart and onTurnEnd around streaming turn", async () => {
    const events: string[] = [];
    const { input, deps } = makeStreamingDeps({
      chunks: [
        { type: "text-delta", payload: { id: "1", text: "OK" } },
      ],
      onTurnStart: () => events.push("turnStart"),
      onTurnEnd: () => events.push("turnEnd"),
    });

    const done = runConversation(deps);
    input.write("Hi\n");
    await new Promise((r) => setTimeout(r, 50));
    input.end();
    await done;

    expect(events[0]).toBe("turnStart");
    expect(events[events.length - 1]).toBe("turnEnd");
  });

  test("streaming: continues conversation after stream error", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    output.setEncoding("utf8");

    let callCount = 0;

    const mockStream = mock(async () => {
      callCount++;
      if (callCount === 1) {
        // First call: stream that errors
        const fullStream = new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "text-delta", payload: { id: "1", text: "partial" } });
            controller.error(new Error("stream broke"));
          },
        });
        return {
          fullStream,
          getFullOutput: async () => ({
            text: "partial", messages: [{ role: "user", content: "Hi" }],
            usage: {}, totalUsage: {}, steps: [], finishReason: undefined,
            warnings: [], providerMetadata: undefined, request: {},
            reasoning: [], reasoningText: undefined, toolCalls: [],
            toolResults: [], sources: [], files: [], response: {},
            object: undefined, error: new Error("stream broke"), tripwire: undefined,
            traceId: undefined, runId: undefined, suspendPayload: undefined,
            rememberedMessages: [],
          }),
        };
      }
      // Second call: succeeds
      const fullStream = new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "text-delta", payload: { id: "2", text: "recovered" } });
          controller.close();
        },
      });
      return {
        fullStream,
        getFullOutput: async () => ({
          text: "recovered", messages: [
            { role: "user", content: "Hi" },
            { role: "assistant", content: "recovered" },
          ],
          usage: {}, totalUsage: {}, steps: [], finishReason: "stop",
          warnings: [], providerMetadata: undefined, request: {},
          reasoning: [], reasoningText: undefined, toolCalls: [],
          toolResults: [], sources: [], files: [], response: {},
          object: undefined, error: undefined, tripwire: undefined,
          traceId: undefined, runId: undefined, suspendPayload: undefined,
          rememberedMessages: [],
        }),
      };
    });

    const mockAgent = {
      generate: mock(async () => { throw new Error("should not call"); }),
      stream: mockStream,
    } as unknown as Agent;

    const deps: ConversationDeps = {
      agent: mockAgent,
      input,
      output,
      streaming: true,
    };

    const done = runConversation(deps);
    input.write("Hi\n");
    await new Promise((r) => setTimeout(r, 100));
    input.write("Again\n");
    await new Promise((r) => setTimeout(r, 100));
    input.end();
    await done;

    const captured = output.read() as string;
    expect(captured).toContain("recovered");
  });

  test("streaming: displays stream error to user instead of swallowing it", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    output.setEncoding("utf8");

    const mockStream = mock(async () => {
      const fullStream = new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "text-delta", payload: { id: "1", text: "partial" } });
          controller.error(new Error("connection reset"));
        },
      });
      return {
        fullStream,
        getFullOutput: async () => ({
          text: "partial", messages: [{ role: "user", content: "Hi" }],
          usage: {}, totalUsage: {}, steps: [], finishReason: undefined,
          warnings: [], providerMetadata: undefined, request: {},
          reasoning: [], reasoningText: undefined, toolCalls: [],
          toolResults: [], sources: [], files: [], response: {},
          object: undefined, error: new Error("connection reset"), tripwire: undefined,
          traceId: undefined, runId: undefined, suspendPayload: undefined,
          rememberedMessages: [],
        }),
      };
    });

    const mockAgent = {
      generate: mock(async () => { throw new Error("should not call"); }),
      stream: mockStream,
    } as unknown as Agent;

    const deps: ConversationDeps = {
      agent: mockAgent,
      input,
      output,
      streaming: true,
    };

    const done = runConversation(deps);
    input.write("Hi\n");
    await new Promise((r) => setTimeout(r, 100));
    input.end();
    await done;

    const captured = (output.read() as string) ?? "";
    const plain = stripAnsi(captured);
    // The error message must be displayed to the user, not swallowed
    expect(plain).toContain("connection reset");
  });

  test("streaming: displays non-Error stream failures as strings", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    output.setEncoding("utf8");

    const mockStream = mock(async () => {
      const fullStream = new ReadableStream({
        start(controller) {
          controller.error("network timeout");
        },
      });
      return {
        fullStream,
        getFullOutput: async () => ({
          text: "", messages: [{ role: "user", content: "Hi" }],
          usage: {}, totalUsage: {}, steps: [], finishReason: undefined,
          warnings: [], providerMetadata: undefined, request: {},
          reasoning: [], reasoningText: undefined, toolCalls: [],
          toolResults: [], sources: [], files: [], response: {},
          object: undefined, error: "network timeout", tripwire: undefined,
          traceId: undefined, runId: undefined, suspendPayload: undefined,
          rememberedMessages: [],
        }),
      };
    });

    const mockAgent = {
      generate: mock(async () => { throw new Error("should not call"); }),
      stream: mockStream,
    } as unknown as Agent;

    const deps: ConversationDeps = {
      agent: mockAgent,
      input,
      output,
      streaming: true,
    };

    const done = runConversation(deps);
    input.write("Hi\n");
    await new Promise((r) => setTimeout(r, 100));
    input.end();
    await done;

    const captured = (output.read() as string) ?? "";
    const plain = stripAnsi(captured);
    expect(plain).toContain("network timeout");
  });

  test("streaming: stream error display uses failure symbol", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    output.setEncoding("utf8");

    const mockStream = mock(async () => {
      const fullStream = new ReadableStream({
        start(controller) {
          controller.error(new Error("api error"));
        },
      });
      return {
        fullStream,
        getFullOutput: async () => ({
          text: "", messages: [{ role: "user", content: "Hi" }],
          usage: {}, totalUsage: {}, steps: [], finishReason: undefined,
          warnings: [], providerMetadata: undefined, request: {},
          reasoning: [], reasoningText: undefined, toolCalls: [],
          toolResults: [], sources: [], files: [], response: {},
          object: undefined, error: new Error("api error"), tripwire: undefined,
          traceId: undefined, runId: undefined, suspendPayload: undefined,
          rememberedMessages: [],
        }),
      };
    });

    const mockAgent = {
      generate: mock(async () => { throw new Error("should not call"); }),
      stream: mockStream,
    } as unknown as Agent;

    const deps: ConversationDeps = {
      agent: mockAgent,
      input,
      output,
      streaming: true,
    };

    const done = runConversation(deps);
    input.write("Hi\n");
    await new Promise((r) => setTimeout(r, 100));
    input.end();
    await done;

    const captured = (output.read() as string) ?? "";
    const plain = stripAnsi(captured);
    // Should contain the cross/failure symbol from figures (U+2718 HEAVY BALLOT X)
    expect(plain).toContain("✘");
  });

  test("streaming: conversation continues after displayed stream error", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    output.setEncoding("utf8");

    let callCount = 0;

    const mockStream = mock(async () => {
      callCount++;
      if (callCount === 1) {
        const fullStream = new ReadableStream({
          start(controller) {
            controller.error(new Error("transient failure"));
          },
        });
        return {
          fullStream,
          getFullOutput: async () => ({
            text: "", messages: [{ role: "user", content: "Hi" }],
            usage: {}, totalUsage: {}, steps: [], finishReason: undefined,
            warnings: [], providerMetadata: undefined, request: {},
            reasoning: [], reasoningText: undefined, toolCalls: [],
            toolResults: [], sources: [], files: [], response: {},
            object: undefined, error: new Error("transient failure"), tripwire: undefined,
            traceId: undefined, runId: undefined, suspendPayload: undefined,
            rememberedMessages: [],
          }),
        };
      }
      const fullStream = new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "text-delta", payload: { id: "2", text: "success" } });
          controller.close();
        },
      });
      return {
        fullStream,
        getFullOutput: async () => ({
          text: "success", messages: [
            { role: "user", content: "Hi" },
            { role: "assistant", content: "success" },
          ],
          usage: {}, totalUsage: {}, steps: [], finishReason: "stop",
          warnings: [], providerMetadata: undefined, request: {},
          reasoning: [], reasoningText: undefined, toolCalls: [],
          toolResults: [], sources: [], files: [], response: {},
          object: undefined, error: undefined, tripwire: undefined,
          traceId: undefined, runId: undefined, suspendPayload: undefined,
          rememberedMessages: [],
        }),
      };
    });

    const mockAgent = {
      generate: mock(async () => { throw new Error("should not call"); }),
      stream: mockStream,
    } as unknown as Agent;

    const deps: ConversationDeps = {
      agent: mockAgent,
      input,
      output,
      streaming: true,
    };

    const done = runConversation(deps);
    input.write("Hi\n");
    await new Promise((r) => setTimeout(r, 100));
    input.write("Again\n");
    await new Promise((r) => setTimeout(r, 100));
    input.end();
    await done;

    const captured = (output.read() as string) ?? "";
    const plain = stripAnsi(captured);
    // Error was displayed AND conversation recovered
    expect(plain).toContain("transient failure");
    expect(plain).toContain("success");
  });

  test("streaming: routes tool-error chunks to onChunk callback", async () => {
    const received: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const onChunk: StreamingChunkCallback = (chunk) => { received.push(chunk as typeof received[0]); };

    const { input, deps } = makeStreamingDeps({
      chunks: [
        { type: "tool-error", payload: { toolCallId: "tc1", toolName: "bad_tool", error: "fail" } },
      ],
      onChunk,
    });

    const done = runConversation(deps);
    input.write("Try\n");
    await new Promise((r) => setTimeout(r, 50));
    input.end();
    await done;

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe("tool-error");
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
