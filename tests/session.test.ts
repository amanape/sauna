import { test, expect, describe, mock, beforeEach } from "bun:test";
import { realpathSync } from "node:fs";

// Track calls to query() so we can verify options without running a real agent
const queryCalls: { prompt: any; options: any }[] = [];
let closeCallCount = 0;

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: (params: any) => {
    queryCalls.push(params);
    // Return an async generator that immediately yields a success result, with a tracked close()
    const gen = (async function* () {
      yield {
        type: "result",
        subtype: "success",
        result: "",
        duration_ms: 0,
        num_turns: 0,
        usage: { input_tokens: 0, output_tokens: 0 },
      };
    })();
    return Object.assign(gen, {
      close() {
        closeCallCount++;
      },
    });
  },
}));

// Stub execSync so createSession() resolves a "claude" path without needing a real install.
// process.execPath points to the Bun binary — it exists on disk, so realpathSync won't throw.
mock.module("node:child_process", () => ({
  execSync: (cmd: string) => {
    if (cmd === "which claude") return process.execPath + "\n";
    return "";
  },
}));

// Must import after mock.module so the mocks are applied
const { ClaudeProvider } = await import("../src/providers/claude");

// Compute expected claudePath the same way createSession() does:
// execSync returns process.execPath + '\n', trimmed → process.execPath, then realpathSync resolves symlinks.
const EXPECTED_CLAUDE_PATH = realpathSync(process.execPath);

describe("ClaudeProvider.createSession()", () => {
  beforeEach(() => {
    queryCalls.length = 0;
    closeCallCount = 0;
  });

  test("calls query with claude_code preset and bypassPermissions", async () => {
    const session = ClaudeProvider.createSession({
      prompt: "test",
      context: [],
    });
    // Drain the generator to trigger the query() call
    for await (const _ of session) {
    }
    expect(queryCalls).toHaveLength(1);
    const opts = queryCalls[0]!.options;
    expect(opts.pathToClaudeCodeExecutable).toBe(EXPECTED_CLAUDE_PATH);
    expect(opts.systemPrompt).toEqual({
      type: "preset",
      preset: "claude_code",
    });
    expect(opts.permissionMode).toBe("bypassPermissions");
    expect(opts.allowDangerouslySkipPermissions).toBe(true);
    expect(opts.settingSources).toEqual(["user", "project"]);
    expect(opts.includePartialMessages).toBe(true);
  });

  test("passes model to query when provided", async () => {
    const session = ClaudeProvider.createSession({
      prompt: "test",
      model: "claude-opus-4-20250514",
      context: [],
    });
    for await (const _ of session) {
    }
    expect(queryCalls[0]!.options.model).toBe("claude-opus-4-20250514");
  });

  test("omits model from query options when not provided", async () => {
    const session = ClaudeProvider.createSession({
      prompt: "test",
      context: [],
    });
    for await (const _ of session) {
    }
    expect(queryCalls[0]!.options.model).toBeUndefined();
  });

  test("prepends context paths to the prompt sent to query", async () => {
    const session = ClaudeProvider.createSession({
      prompt: "do something",
      context: ["README.md", "src/"],
    });
    for await (const _ of session) {
    }
    const sentPrompt = queryCalls[0]!.prompt;
    expect(sentPrompt).toContain("README.md");
    expect(sentPrompt).toContain("src/");
    expect(sentPrompt).toContain("do something");
    // Context paths should appear before the prompt text
    expect(sentPrompt.indexOf("README.md")).toBeLessThan(
      sentPrompt.indexOf("do something"),
    );
  });

  test("yields ProviderEvent objects instead of raw SDK messages", async () => {
    const events: any[] = [];
    const session = ClaudeProvider.createSession({
      prompt: "test",
      context: [],
    });
    for await (const event of session) {
      events.push(event);
    }
    // Adapter converts raw { type: 'result', subtype: 'success', ... } to a ProviderEvent
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "result",
      success: true,
      summary: { inputTokens: 0, outputTokens: 0, numTurns: 0, durationMs: 0 },
    });
  });
});

describe("ClaudeProvider.createInteractiveSession()", () => {
  beforeEach(() => {
    queryCalls.length = 0;
    closeCallCount = 0;
  });

  test("calls query with correct options at construction time", () => {
    ClaudeProvider.createInteractiveSession({ context: [] });
    expect(queryCalls).toHaveLength(1);
    const opts = queryCalls[0]!.options;
    expect(opts.pathToClaudeCodeExecutable).toBe(EXPECTED_CLAUDE_PATH);
    expect(opts.systemPrompt).toEqual({
      type: "preset",
      preset: "claude_code",
    });
    expect(opts.permissionMode).toBe("bypassPermissions");
    expect(opts.allowDangerouslySkipPermissions).toBe(true);
    expect(opts.settingSources).toEqual(["user", "project"]);
    expect(opts.includePartialMessages).toBe(true);
  });

  test("omits model from query options when config.model is undefined", () => {
    ClaudeProvider.createInteractiveSession({ context: [] });
    expect(queryCalls[0]!.options.model).toBeUndefined();
  });

  test("first send() call prepends context via buildPrompt()", async () => {
    const session = ClaudeProvider.createInteractiveSession({
      context: ["README.md", "src/"],
    });
    await session.send("hello world");
    // Pull the first message from the channel to verify buildPrompt was applied
    const channel = queryCalls[0]!.prompt;
    const iter = channel[Symbol.asyncIterator]();
    const msg = (await iter.next()).value;
    expect(msg.message.content).toContain("README.md");
    expect(msg.message.content).toContain("src/");
    expect(msg.message.content).toContain("hello world");
    // Context references should appear before the prompt text
    expect(msg.message.content.indexOf("README.md")).toBeLessThan(
      msg.message.content.indexOf("hello world"),
    );
  });

  test("close() calls q.close() on the underlying query", () => {
    const session = ClaudeProvider.createInteractiveSession({ context: [] });
    session.close();
    expect(closeCallCount).toBe(1);
  });
});
