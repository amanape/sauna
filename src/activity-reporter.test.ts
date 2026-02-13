import { test, expect, describe } from "bun:test";
import { Writable } from "node:stream";
import type { LLMStepResult } from "@mastra/core/agent";

import { createActivityReporter, cleanToolName } from "./activity-reporter";
import { stripAnsi } from "./terminal-formatting";

// ── Test helpers ────────────────────────────────────────────────────────────

/** Capture all writes to a writable stream as a single string. */
function createCapture(): { stream: Writable; output: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return { stream, output: () => chunks.join("") };
}

/** Build a minimal LLMStepResult with tool calls and results. */
function makeStep(overrides: Partial<LLMStepResult> = {}): LLMStepResult {
  return {
    toolCalls: [],
    toolResults: [],
    dynamicToolCalls: [],
    dynamicToolResults: [],
    staticToolCalls: [],
    staticToolResults: [],
    files: [],
    sources: [],
    text: "",
    reasoning: [],
    content: [],
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    warnings: [],
    request: {},
    response: {},
    reasoningText: undefined,
    providerMetadata: undefined,
    ...overrides,
  } as LLMStepResult;
}

function makeToolCall(toolName: string, args: Record<string, unknown> = {}) {
  return {
    type: "tool-call",
    runId: "r1",
    from: "AGENT",
    payload: { toolCallId: "tc1", toolName, args },
  } as LLMStepResult["toolCalls"][number];
}

function makeToolResult(
  toolName: string,
  result: unknown,
  isError = false,
) {
  return {
    type: "tool-result",
    runId: "r1",
    from: "AGENT",
    payload: { toolCallId: "tc1", toolName, result, isError },
  } as LLMStepResult["toolResults"][number];
}

// ── cleanToolName ───────────────────────────────────────────────────────────

describe("cleanToolName", () => {
  test("strips mastra_workspace_ prefix", () => {
    expect(cleanToolName("mastra_workspace_read_file")).toBe("read_file");
  });

  test("strips tavily_ prefix", () => {
    expect(cleanToolName("tavily_web_search")).toBe("web_search");
  });

  test("strips context7_ prefix", () => {
    expect(cleanToolName("context7_resolve_library")).toBe("resolve_library");
  });

  test("leaves unprefixed names unchanged", () => {
    expect(cleanToolName("custom_tool")).toBe("custom_tool");
  });

  test("strips only the first matching prefix", () => {
    expect(cleanToolName("mastra_workspace_tavily_thing")).toBe("tavily_thing");
  });
});

// ── Tool call display (normal mode) ─────────────────────────────────────────

describe("activity reporter — normal mode", () => {
  test("displays file read tool call with file path", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: false });

    const step = makeStep({
      toolCalls: [makeToolCall("mastra_workspace_read_file", { path: "src/index.ts" })],
      toolResults: [makeToolResult("mastra_workspace_read_file", { content: "..." })],
      finishReason: "tool-calls",
    });

    reporter.onStepFinish(step);
    const text = stripAnsi(output());
    expect(text).toContain("read_file");
    expect(text).toContain("src/index.ts");
  });

  test("displays file write tool call with path and success", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: false });

    const step = makeStep({
      toolCalls: [makeToolCall("mastra_workspace_write_file", { path: "out.ts", content: "x" })],
      toolResults: [makeToolResult("mastra_workspace_write_file", { success: true, path: "out.ts" })],
      finishReason: "tool-calls",
    });

    reporter.onStepFinish(step);
    const text = stripAnsi(output());
    expect(text).toContain("write_file");
    expect(text).toContain("out.ts");
  });

  test("displays web search tool call with query", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: false });

    const step = makeStep({
      toolCalls: [makeToolCall("tavily_web_search", { query: "bun runtime" })],
      toolResults: [makeToolResult("tavily_web_search", { results: [] })],
      finishReason: "tool-calls",
    });

    reporter.onStepFinish(step);
    const text = stripAnsi(output());
    expect(text).toContain("web_search");
    expect(text).toContain("bun runtime");
  });

  test("displays directory listing tool call with path", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: false });

    const step = makeStep({
      toolCalls: [makeToolCall("mastra_workspace_list_directory", { path: "src/" })],
      toolResults: [makeToolResult("mastra_workspace_list_directory", { entries: [] })],
      finishReason: "tool-calls",
    });

    reporter.onStepFinish(step);
    const text = stripAnsi(output());
    expect(text).toContain("list_directory");
    expect(text).toContain("src/");
  });

  test("displays generic MCP tool with name and args summary", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: false });

    const step = makeStep({
      toolCalls: [makeToolCall("context7_resolve_library", { name: "react" })],
      toolResults: [makeToolResult("context7_resolve_library", { id: "/facebook/react" })],
      finishReason: "tool-calls",
    });

    reporter.onStepFinish(step);
    const text = stripAnsi(output());
    expect(text).toContain("resolve_library");
  });

  test("displays success indicator for successful tool result", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: false });

    const step = makeStep({
      toolCalls: [makeToolCall("mastra_workspace_read_file", { path: "f.ts" })],
      toolResults: [makeToolResult("mastra_workspace_read_file", { content: "ok" }, false)],
      finishReason: "tool-calls",
    });

    reporter.onStepFinish(step);
    const text = stripAnsi(output());
    // Should contain success symbol (tick / checkmark)
    expect(text).toMatch(/✔|✓|√/);
  });

  test("displays failure indicator for errored tool result", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: false });

    const step = makeStep({
      toolCalls: [makeToolCall("mastra_workspace_read_file", { path: "missing.ts" })],
      toolResults: [makeToolResult("mastra_workspace_read_file", { error: "File not found" }, true)],
      finishReason: "tool-calls",
    });

    reporter.onStepFinish(step);
    const text = stripAnsi(output());
    // Should contain failure symbol (cross / x)
    expect(text).toMatch(/✖|✗|✘|×|x/i);
  });

  test("handles multiple tool calls in a single step", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: false });

    const step = makeStep({
      toolCalls: [
        makeToolCall("mastra_workspace_read_file", { path: "a.ts" }),
        makeToolCall("mastra_workspace_read_file", { path: "b.ts" }),
      ],
      toolResults: [
        makeToolResult("mastra_workspace_read_file", { content: "a" }),
        makeToolResult("mastra_workspace_read_file", { content: "b" }),
      ],
      finishReason: "tool-calls",
    });

    reporter.onStepFinish(step);
    const text = stripAnsi(output());
    expect(text).toContain("a.ts");
    expect(text).toContain("b.ts");
  });

  test("does not display full args or result in normal mode", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: false });

    const step = makeStep({
      toolCalls: [makeToolCall("mastra_workspace_write_file", { path: "x.ts", content: "long content here that should not appear" })],
      toolResults: [makeToolResult("mastra_workspace_write_file", { success: true, path: "x.ts" })],
      finishReason: "tool-calls",
    });

    reporter.onStepFinish(step);
    const text = stripAnsi(output());
    expect(text).not.toContain("long content here that should not appear");
  });

  test("does not display reasoning text in normal mode", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: false });

    const step = makeStep({
      toolCalls: [makeToolCall("mastra_workspace_read_file", { path: "f.ts" })],
      toolResults: [makeToolResult("mastra_workspace_read_file", { content: "ok" })],
      reasoningText: "I should read this file to understand the code structure",
      finishReason: "tool-calls",
    });

    reporter.onStepFinish(step);
    const text = stripAnsi(output());
    expect(text).not.toContain("I should read this file");
  });
});

// ── Verbose mode ────────────────────────────────────────────────────────────

describe("activity reporter — verbose mode", () => {
  test("displays full tool args as truncated JSON", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: true });

    const step = makeStep({
      toolCalls: [makeToolCall("mastra_workspace_write_file", { path: "x.ts", content: "hello" })],
      toolResults: [makeToolResult("mastra_workspace_write_file", { success: true, path: "x.ts" })],
      finishReason: "tool-calls",
    });

    reporter.onStepFinish(step);
    const text = stripAnsi(output());
    expect(text).toContain('"path"');
    expect(text).toContain("x.ts");
  });

  test("truncates long JSON to ~500 characters", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: true });

    const longContent = "x".repeat(1000);
    const step = makeStep({
      toolCalls: [makeToolCall("mastra_workspace_write_file", { path: "x.ts", content: longContent })],
      toolResults: [makeToolResult("mastra_workspace_write_file", { success: true, path: "x.ts" })],
      finishReason: "tool-calls",
    });

    reporter.onStepFinish(step);
    const text = stripAnsi(output());
    // The full 1000-char string should NOT appear
    expect(text).not.toContain(longContent);
    // But a truncation indicator should appear
    expect(text).toContain("…");
  });

  test("displays reasoning text when present", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: true });

    const step = makeStep({
      toolCalls: [makeToolCall("mastra_workspace_read_file", { path: "f.ts" })],
      toolResults: [makeToolResult("mastra_workspace_read_file", { content: "ok" })],
      reasoningText: "Analyzing the file structure to find the entry point",
      finishReason: "tool-calls",
    });

    reporter.onStepFinish(step);
    const text = stripAnsi(output());
    expect(text).toContain("Analyzing the file structure");
  });

  test("displays finish reason", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: true });

    const step = makeStep({
      toolCalls: [makeToolCall("mastra_workspace_read_file", { path: "f.ts" })],
      toolResults: [makeToolResult("mastra_workspace_read_file", { content: "ok" })],
      finishReason: "tool-calls",
    });

    reporter.onStepFinish(step);
    const text = stripAnsi(output());
    expect(text).toContain("tool-calls");
  });
});

// ── Sub-agent delegation ────────────────────────────────────────────────────

describe("activity reporter — sub-agent display", () => {
  test("shows delegation message for agent-as-tool calls", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: false });

    const step = makeStep({
      toolCalls: [makeToolCall("researcher", { message: "find docs for bun test" })],
      toolResults: [makeToolResult("researcher", { text: "Found documentation at..." })],
      finishReason: "tool-calls",
    });

    reporter.onStepFinish(step);
    const text = stripAnsi(output());
    // Should indicate delegation or researcher activity
    expect(text).toMatch(/researcher/i);
  });
});

// ── Error handling ──────────────────────────────────────────────────────────

describe("activity reporter — error handling", () => {
  test("never throws even with malformed step data", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: false });

    // Deliberately pass an almost-empty step
    const step = makeStep({
      toolCalls: [{ type: "tool-call", runId: "r1", from: "agent", payload: {} } as any],
      toolResults: [],
    });

    expect(() => reporter.onStepFinish(step)).not.toThrow();
  });

  test("handles step with no tool calls gracefully", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: false });

    const step = makeStep({ finishReason: "stop" });
    reporter.onStepFinish(step);
    // Should not crash and may produce no output
    expect(() => {}).not.toThrow();
  });
});

// ── Stream injection ────────────────────────────────────────────────────────

describe("activity reporter — stream injection", () => {
  test("writes output to the injected stream, not stdout", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: false });

    const step = makeStep({
      toolCalls: [makeToolCall("mastra_workspace_read_file", { path: "test.ts" })],
      toolResults: [makeToolResult("mastra_workspace_read_file", { content: "ok" })],
      finishReason: "tool-calls",
    });

    reporter.onStepFinish(step);
    // Output captured from the injected stream should have content
    expect(output().length).toBeGreaterThan(0);
  });
});
