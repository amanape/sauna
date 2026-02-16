import { test, expect, describe } from "bun:test";
import {
  formatToolTag,
  formatSummary,
  formatError,
  processMessage,
} from "./stream";

/**
 * P3: Streaming Output
 *
 * These tests verify the formatting functions that produce terminal output
 * for tool invocations, success summaries, and error messages.
 * Pure functions are tested directly — no stdout mocking needed.
 */

describe("P3: Streaming Output", () => {
  describe("formatToolTag", () => {
    test("wraps tool name in dim brackets", () => {
      const result = formatToolTag("Read");
      // Should contain the tool name in brackets
      expect(result).toContain("[Read]");
      // Should have ANSI dim escape codes wrapping it
      expect(result).toMatch(/\x1b\[2m\[Read\]\x1b\[22m/);
    });
  });

  describe("formatSummary", () => {
    test("includes token count, turns, and duration", () => {
      const result = formatSummary({
        inputTokens: 1000,
        outputTokens: 500,
        numTurns: 3,
        durationMs: 12345,
      });
      // Should contain total tokens (input + output)
      expect(result).toContain("1500 tokens");
      expect(result).toContain("3 turns");
      expect(result).toContain("12.3s");
      // Should be dim
      expect(result).toMatch(/\x1b\[2m/);
    });

    test("formats duration under 1 second", () => {
      const result = formatSummary({
        inputTokens: 100,
        outputTokens: 50,
        numTurns: 1,
        durationMs: 450,
      });
      expect(result).toContain("0.5s");
    });

    test("singular turn", () => {
      const result = formatSummary({
        inputTokens: 100,
        outputTokens: 50,
        numTurns: 1,
        durationMs: 1000,
      });
      expect(result).toContain("1 turn");
      // Should NOT say "1 turns"
      expect(result).not.toContain("1 turns");
    });
  });

  describe("formatError", () => {
    test("includes subtype and error messages", () => {
      const result = formatError("error_during_execution", [
        "Something went wrong",
      ]);
      expect(result).toContain("error_during_execution");
      expect(result).toContain("Something went wrong");
      // Should have red ANSI escape code
      expect(result).toMatch(/\x1b\[31m/);
    });

    test("handles multiple errors", () => {
      const result = formatError("error_max_turns", [
        "Turn limit reached",
        "Session aborted",
      ]);
      expect(result).toContain("Turn limit reached");
      expect(result).toContain("Session aborted");
    });

    test("handles empty errors array", () => {
      const result = formatError("error_during_execution", []);
      expect(result).toContain("error_during_execution");
    });
  });

  describe("processMessage", () => {
    /**
     * processMessage receives SDK messages and writes formatted output.
     * It accepts a `write` callback to decouple from stdout, making tests
     * deterministic — we capture output in an array instead of mocking process.stdout.
     */
    function collect() {
      const chunks: string[] = [];
      const write = (s: string) => { chunks.push(s); };
      return { chunks, write };
    }

    test("writes text_delta content to output", () => {
      const { chunks, write } = collect();
      processMessage(
        {
          type: "stream_event",
          event: {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: "Hello" },
          },
          parent_tool_use_id: null,
          uuid: "test-uuid" as any,
          session_id: "test-session",
        },
        write
      );
      expect(chunks).toEqual(["Hello"]);
    });

    test("writes dim tool tag on content_block_start for tool_use", () => {
      const { chunks, write } = collect();
      processMessage(
        {
          type: "stream_event",
          event: {
            type: "content_block_start",
            index: 1,
            content_block: {
              type: "tool_use",
              id: "toolu_123",
              name: "Bash",
              input: {},
            },
          },
          parent_tool_use_id: null,
          uuid: "test-uuid" as any,
          session_id: "test-session",
        },
        write
      );
      expect(chunks.length).toBe(1);
      expect(chunks[0]).toContain("[Bash]");
      // Should be dim
      expect(chunks[0]).toMatch(/\x1b\[2m/);
    });

    test("writes summary on success result", () => {
      const { chunks, write } = collect();
      processMessage(
        {
          type: "result",
          subtype: "success",
          duration_ms: 5000,
          duration_api_ms: 4000,
          is_error: false,
          num_turns: 2,
          result: "done",
          stop_reason: "end_turn",
          total_cost_usd: 0.01,
          usage: {
            input_tokens: 800,
            output_tokens: 200,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
          modelUsage: {},
          permission_denials: [],
          uuid: "test-uuid" as any,
          session_id: "test-session",
        },
        write
      );
      expect(chunks.length).toBe(1);
      expect(chunks[0]).toContain("1000 tokens");
      expect(chunks[0]).toContain("2 turns");
      expect(chunks[0]).toContain("5.0s");
    });

    test("writes red error on error result", () => {
      const { chunks, write } = collect();
      processMessage(
        {
          type: "result",
          subtype: "error_during_execution",
          duration_ms: 3000,
          duration_api_ms: 2000,
          is_error: true,
          num_turns: 1,
          stop_reason: null,
          total_cost_usd: 0.005,
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
          modelUsage: {},
          permission_denials: [],
          errors: ["Connection timeout"],
          uuid: "test-uuid" as any,
          session_id: "test-session",
        },
        write
      );
      expect(chunks.length).toBe(1);
      expect(chunks[0]).toContain("error_during_execution");
      expect(chunks[0]).toContain("Connection timeout");
      expect(chunks[0]).toMatch(/\x1b\[31m/);
    });

    test("ignores unrelated message types", () => {
      const { chunks, write } = collect();
      processMessage(
        {
          type: "system",
          subtype: "init",
        } as any,
        write
      );
      expect(chunks).toEqual([]);
    });
  });
});
