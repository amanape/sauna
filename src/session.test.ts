import { test, expect, describe, mock, beforeEach } from "bun:test";
import { buildPrompt } from "./session";

// Track calls to query() so we can verify options without running a real agent
const queryCalls: Array<{ prompt: string; options: any }> = [];

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: (params: any) => {
    queryCalls.push(params);
    // Return an async generator that immediately yields a result
    return (async function* () {
      yield {
        type: "result",
        subtype: "success",
        result: "mocked",
        duration_ms: 0,
        num_turns: 0,
        usage: { input_tokens: 0, output_tokens: 0 },
      };
    })();
  },
}));

// Must import after mock.module so the mock is applied
const { runSession } = await import("./session");

describe("P2: Agent Session", () => {
  beforeEach(() => {
    queryCalls.length = 0;
  });

  describe("buildPrompt", () => {
    test("returns prompt unchanged when no context paths", () => {
      expect(buildPrompt("do something", [])).toBe("do something");
    });

    test("prepends single context path as reference", () => {
      const result = buildPrompt("do something", ["foo.md"]);
      expect(result).toContain("foo.md");
      expect(result).toContain("do something");
      // Context path should appear before the prompt
      expect(result.indexOf("foo.md")).toBeLessThan(
        result.indexOf("do something")
      );
    });

    test("prepends multiple context paths as references", () => {
      const result = buildPrompt("do something", ["foo.md", "bar/", "baz.ts"]);
      expect(result).toContain("foo.md");
      expect(result).toContain("bar/");
      expect(result).toContain("baz.ts");
      expect(result).toContain("do something");
      // All context paths should appear before the prompt
      expect(result.indexOf("baz.ts")).toBeLessThan(
        result.indexOf("do something")
      );
    });
  });

  describe("runSession", () => {
    test("calls query with claude_code preset and bypassPermissions", async () => {
      const session = runSession({ prompt: "test", context: [] });
      // Drain the generator to trigger the call
      for await (const _ of session) {
      }
      expect(queryCalls).toHaveLength(1);
      const opts = queryCalls[0]!.options;
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
      const session = runSession({
        prompt: "test",
        model: "claude-opus-4-20250514",
        context: [],
      });
      for await (const _ of session) {
      }
      expect(queryCalls[0]!.options.model).toBe("claude-opus-4-20250514");
    });

    test("omits model from query options when not provided", async () => {
      const session = runSession({ prompt: "test", context: [] });
      for await (const _ of session) {
      }
      expect(queryCalls[0]!.options.model).toBeUndefined();
    });

    test("prepends context paths to the prompt sent to query", async () => {
      const session = runSession({
        prompt: "do something",
        context: ["README.md", "src/"],
      });
      for await (const _ of session) {
      }
      const sentPrompt = queryCalls[0]!.prompt;
      expect(sentPrompt).toContain("README.md");
      expect(sentPrompt).toContain("src/");
      expect(sentPrompt).toContain("do something");
      // Context should appear before the prompt text
      expect(sentPrompt.indexOf("README.md")).toBeLessThan(
        sentPrompt.indexOf("do something")
      );
    });
  });
});
