import { test, expect, describe } from "bun:test";
import { Writable } from "node:stream";
import type { LLMStepResult } from "@mastra/core/agent";

import { createActivityReporter, cleanToolName } from "./activity-reporter";
import { ExecutionMetrics } from "./execution-metrics";
import { stripAnsi, createActivitySpinner } from "./terminal-formatting";

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

// ── Token usage and duration display ────────────────────────────────────────

function makeClock() {
  let now = 0;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("activity reporter — token usage display", () => {
  test("displays per-turn token counts when metrics provided", () => {
    const { stream, output } = createCapture();
    const metrics = new ExecutionMetrics();
    const reporter = createActivityReporter({
      output: stream,
      verbose: false,
      metrics,
    });

    const step = makeStep({
      toolCalls: [makeToolCall("mastra_workspace_read_file", { path: "f.ts" })],
      toolResults: [makeToolResult("mastra_workspace_read_file", { content: "ok" })],
      usage: { inputTokens: 1247, outputTokens: 523, totalTokens: 1770 },
      finishReason: "tool-calls",
    });

    reporter.onStepFinish(step);
    const text = stripAnsi(output());
    expect(text).toContain("1,247");
    expect(text).toContain("523");
    expect(text).toContain("1,770");
  });

  test("displays cumulative totals across multiple steps", () => {
    const { stream, output } = createCapture();
    const metrics = new ExecutionMetrics();
    const reporter = createActivityReporter({
      output: stream,
      verbose: false,
      metrics,
    });

    const step1 = makeStep({
      toolCalls: [makeToolCall("mastra_workspace_read_file", { path: "a.ts" })],
      toolResults: [makeToolResult("mastra_workspace_read_file", { content: "a" })],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      finishReason: "tool-calls",
    });
    reporter.onStepFinish(step1);

    const step2 = makeStep({
      toolCalls: [makeToolCall("mastra_workspace_read_file", { path: "b.ts" })],
      toolResults: [makeToolResult("mastra_workspace_read_file", { content: "b" })],
      usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
      finishReason: "tool-calls",
    });
    reporter.onStepFinish(step2);

    const text = stripAnsi(output());
    // After step2, cumulative should be 450
    expect(text).toContain("450");
  });

  test("shows reasoning tokens when non-zero", () => {
    const { stream, output } = createCapture();
    const metrics = new ExecutionMetrics();
    const reporter = createActivityReporter({
      output: stream,
      verbose: false,
      metrics,
    });

    const step = makeStep({
      toolCalls: [makeToolCall("mastra_workspace_read_file", { path: "f.ts" })],
      toolResults: [makeToolResult("mastra_workspace_read_file", { content: "ok" })],
      usage: {
        inputTokens: 500,
        outputTokens: 200,
        totalTokens: 700,
        reasoningTokens: 150,
      },
      finishReason: "tool-calls",
    });

    reporter.onStepFinish(step);
    const text = stripAnsi(output());
    expect(text).toContain("reasoning");
    expect(text).toContain("150");
  });

  test("shows cached tokens when non-zero", () => {
    const { stream, output } = createCapture();
    const metrics = new ExecutionMetrics();
    const reporter = createActivityReporter({
      output: stream,
      verbose: false,
      metrics,
    });

    const step = makeStep({
      toolCalls: [makeToolCall("mastra_workspace_read_file", { path: "f.ts" })],
      toolResults: [makeToolResult("mastra_workspace_read_file", { content: "ok" })],
      usage: {
        inputTokens: 500,
        outputTokens: 200,
        totalTokens: 700,
        cachedInputTokens: 300,
      },
      finishReason: "tool-calls",
    });

    reporter.onStepFinish(step);
    const text = stripAnsi(output());
    expect(text).toContain("cached");
    expect(text).toContain("300");
  });

  test("omits reasoning tokens when zero", () => {
    const { stream, output } = createCapture();
    const metrics = new ExecutionMetrics();
    const reporter = createActivityReporter({
      output: stream,
      verbose: false,
      metrics,
    });

    const step = makeStep({
      toolCalls: [makeToolCall("mastra_workspace_read_file", { path: "f.ts" })],
      toolResults: [makeToolResult("mastra_workspace_read_file", { content: "ok" })],
      usage: { inputTokens: 500, outputTokens: 200, totalTokens: 700 },
      finishReason: "tool-calls",
    });

    reporter.onStepFinish(step);
    const text = stripAnsi(output());
    expect(text).not.toContain("reasoning");
  });

  test("does not display tokens when metrics not provided", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({
      output: stream,
      verbose: false,
    });

    const step = makeStep({
      toolCalls: [makeToolCall("mastra_workspace_read_file", { path: "f.ts" })],
      toolResults: [makeToolResult("mastra_workspace_read_file", { content: "ok" })],
      usage: { inputTokens: 500, outputTokens: 200, totalTokens: 700 },
      finishReason: "tool-calls",
    });

    reporter.onStepFinish(step);
    const text = stripAnsi(output());
    expect(text).not.toContain("500");
    expect(text).not.toContain("tokens");
  });

  test("does not crash when step has no usage data", () => {
    const { stream, output } = createCapture();
    const metrics = new ExecutionMetrics();
    const reporter = createActivityReporter({
      output: stream,
      verbose: false,
      metrics,
    });

    const step = makeStep({
      toolCalls: [makeToolCall("mastra_workspace_read_file", { path: "f.ts" })],
      toolResults: [makeToolResult("mastra_workspace_read_file", { content: "ok" })],
      finishReason: "tool-calls",
    });

    expect(() => reporter.onStepFinish(step)).not.toThrow();
  });
});

describe("activity reporter — turn duration display", () => {
  test("displays turn duration when metrics has timing", () => {
    const clock = makeClock();
    const { stream, output } = createCapture();
    const metrics = new ExecutionMetrics(clock.now);
    const reporter = createActivityReporter({
      output: stream,
      verbose: false,
      metrics,
    });

    metrics.startTurn();
    clock.advance(2500);
    metrics.endTurn();

    const step = makeStep({
      toolCalls: [makeToolCall("mastra_workspace_read_file", { path: "f.ts" })],
      toolResults: [makeToolResult("mastra_workspace_read_file", { content: "ok" })],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      finishReason: "tool-calls",
    });

    reporter.onStepFinish(step);
    const text = stripAnsi(output());
    expect(text).toContain("2.5s");
  });

  test("does not display duration when no turn was timed", () => {
    const { stream, output } = createCapture();
    const metrics = new ExecutionMetrics();
    const reporter = createActivityReporter({
      output: stream,
      verbose: false,
      metrics,
    });

    const step = makeStep({
      toolCalls: [makeToolCall("mastra_workspace_read_file", { path: "f.ts" })],
      toolResults: [makeToolResult("mastra_workspace_read_file", { content: "ok" })],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      finishReason: "tool-calls",
    });

    reporter.onStepFinish(step);
    const text = stripAnsi(output());
    // Should have token info but not a duration of "0ms"
    expect(text).not.toMatch(/\b0ms\b/);
  });
});

// ── Spinner integration ──────────────────────────────────────────────────────

describe("activity reporter — spinner integration", () => {
  /** Create a fake spinner that tracks withPause calls. */
  function createFakeSpinner() {
    let spinning = false;
    let pauseCount = 0;
    return {
      spinner: {
        start(_text: string) { spinning = true; },
        update(_text: string) {},
        success(_text?: string) { spinning = false; },
        error(_text?: string) { spinning = false; },
        stop() { spinning = false; },
        isSpinning() { return spinning; },
        withPause(fn: () => void) {
          pauseCount++;
          const was = spinning;
          spinning = false;
          fn();
          spinning = was;
        },
      },
      getPauseCount: () => pauseCount,
    };
  }

  test("calls withPause on spinner when writing step output", () => {
    const { stream, output } = createCapture();
    const { spinner, getPauseCount } = createFakeSpinner();
    spinner.start("Agent thinking...");

    const reporter = createActivityReporter({
      output: stream,
      verbose: false,
      spinner,
    });

    const step = makeStep({
      toolCalls: [makeToolCall("mastra_workspace_read_file", { path: "f.ts" })],
      toolResults: [makeToolResult("mastra_workspace_read_file", { content: "ok" })],
      finishReason: "tool-calls",
    });

    reporter.onStepFinish(step);

    expect(getPauseCount()).toBeGreaterThan(0);
    const text = stripAnsi(output());
    expect(text).toContain("read_file");
  });

  test("writes output without issue when no spinner provided", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({
      output: stream,
      verbose: false,
    });

    const step = makeStep({
      toolCalls: [makeToolCall("mastra_workspace_read_file", { path: "f.ts" })],
      toolResults: [makeToolResult("mastra_workspace_read_file", { content: "ok" })],
      finishReason: "tool-calls",
    });

    reporter.onStepFinish(step);
    const text = stripAnsi(output());
    expect(text).toContain("read_file");
  });

  test("does not call withPause when step has no tool calls", () => {
    const { stream } = createCapture();
    const { spinner, getPauseCount } = createFakeSpinner();
    spinner.start("Agent thinking...");

    const reporter = createActivityReporter({
      output: stream,
      verbose: false,
      spinner,
    });

    const step = makeStep({ finishReason: "stop" });
    reporter.onStepFinish(step);

    // No tool calls and no metrics means no output — no need to pause
    expect(getPauseCount()).toBe(0);
  });
});

// ── onChunk handler — streaming chunk formatting ────────────────────────────

function makeChunk(type: string, payload: Record<string, unknown>) {
  return { type, runId: "r1", from: "AGENT", payload };
}

describe("activity reporter — onChunk handler", () => {
  test("formats tool-call chunk with cleaned name and arg summary", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: false });

    reporter.onChunk(
      makeChunk("tool-call", {
        toolCallId: "tc1",
        toolName: "mastra_workspace_read_file",
        args: { path: "src/index.ts" },
      }),
    );

    const text = stripAnsi(output());
    expect(text).toContain("read_file");
    expect(text).toContain("src/index.ts");
  });

  test("formats tool-result chunk with success indicator", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: false });

    reporter.onChunk(
      makeChunk("tool-result", {
        toolCallId: "tc1",
        toolName: "mastra_workspace_read_file",
        result: { content: "file contents" },
      }),
    );

    const text = stripAnsi(output());
    expect(text).toContain("read_file");
    expect(text).toMatch(/✔|✓|√/);
  });

  test("formats tool-result chunk with failure indicator when isError is true", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: false });

    reporter.onChunk(
      makeChunk("tool-result", {
        toolCallId: "tc1",
        toolName: "mastra_workspace_read_file",
        result: { error: "File not found" },
        isError: true,
      }),
    );

    const text = stripAnsi(output());
    expect(text).toMatch(/✖|✗|✘|×|x/i);
    expect(text).toContain("File not found");
  });

  test("formats tool-error chunk with error indicator and message", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: false });

    reporter.onChunk(
      makeChunk("tool-error", {
        toolCallId: "tc1",
        toolName: "mastra_workspace_write_file",
        error: "Permission denied",
      }),
    );

    const text = stripAnsi(output());
    expect(text).toMatch(/✖|✗|✘|×|x/i);
    expect(text).toContain("write_file");
    expect(text).toContain("Permission denied");
  });

  test("verbose mode shows full args on tool-call chunk", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: true });

    reporter.onChunk(
      makeChunk("tool-call", {
        toolCallId: "tc1",
        toolName: "mastra_workspace_write_file",
        args: { path: "out.ts", content: "hello world" },
      }),
    );

    const text = stripAnsi(output());
    expect(text).toContain('"path"');
    expect(text).toContain("out.ts");
    expect(text).toContain("hello world");
  });

  test("verbose mode shows full result on tool-result chunk", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: true });

    reporter.onChunk(
      makeChunk("tool-result", {
        toolCallId: "tc1",
        toolName: "mastra_workspace_read_file",
        result: { content: "file body here" },
      }),
    );

    const text = stripAnsi(output());
    expect(text).toContain("file body here");
  });

  test("pauses spinner during chunk output", () => {
    const { stream } = createCapture();

    let pauseCount = 0;
    const spinner = {
      start(_text: string) {},
      update(_text: string) {},
      success(_text?: string) {},
      error(_text?: string) {},
      stop() {},
      isSpinning() { return true; },
      withPause(fn: () => void) {
        pauseCount++;
        fn();
      },
    };

    const reporter = createActivityReporter({
      output: stream,
      verbose: false,
      spinner,
    });

    reporter.onChunk(
      makeChunk("tool-call", {
        toolCallId: "tc1",
        toolName: "read_file",
        args: { path: "f.ts" },
      }),
    );

    expect(pauseCount).toBeGreaterThan(0);
  });

  test("starts tool call timing on tool-call chunk when metrics provided", () => {
    const clock = makeClock();
    const { stream, output } = createCapture();
    const metrics = new ExecutionMetrics(clock.now);
    const reporter = createActivityReporter({
      output: stream,
      verbose: false,
      metrics,
    });

    // tool-call starts timing
    reporter.onChunk(
      makeChunk("tool-call", {
        toolCallId: "tc1",
        toolName: "read_file",
        args: { path: "f.ts" },
      }),
    );

    clock.advance(350);

    // tool-result ends timing — duration should appear
    reporter.onChunk(
      makeChunk("tool-result", {
        toolCallId: "tc1",
        toolName: "read_file",
        result: { content: "ok" },
      }),
    );

    const text = stripAnsi(output());
    expect(text).toContain("350ms");
  });

  test("ignores unrecognized chunk types without crashing", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: false });

    expect(() =>
      reporter.onChunk(makeChunk("text-delta", { id: "1", text: "hi" })),
    ).not.toThrow();

    // Should produce no output for unrecognized chunks
    expect(output()).toBe("");
  });

  test("never throws on malformed chunk data", () => {
    const { stream } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: false });

    expect(() =>
      reporter.onChunk(makeChunk("tool-call", {})),
    ).not.toThrow();

    expect(() =>
      reporter.onChunk(makeChunk("tool-result", {})),
    ).not.toThrow();

    expect(() =>
      reporter.onChunk(makeChunk("tool-error", {})),
    ).not.toThrow();
  });
});

// ── onFinish handler — generation-level error display ────────────────────────

describe("activity reporter — onFinish handler", () => {
  test("displays generation-level error message with bold red formatting", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: false });

    reporter.onFinish({
      error: new Error("Context window exceeded"),
      steps: [],
      totalUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });

    const text = stripAnsi(output());
    expect(text).toContain("Context window exceeded");
  });

  test("displays string error in onFinish", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: false });

    reporter.onFinish({
      error: "Rate limit reached",
      steps: [],
      totalUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });

    const text = stripAnsi(output());
    expect(text).toContain("Rate limit reached");
  });

  test("displays error object with message property", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: false });

    reporter.onFinish({
      error: { message: "API timeout", stack: "" },
      steps: [],
      totalUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });

    const text = stripAnsi(output());
    expect(text).toContain("API timeout");
  });

  test("does not output anything when there is no error", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: false });

    reporter.onFinish({
      steps: [],
      totalUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });

    expect(output()).toBe("");
  });

  test("never throws even with malformed onFinish data", () => {
    const { stream } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: false });

    expect(() => reporter.onFinish({} as any)).not.toThrow();
    expect(() => reporter.onFinish(null as any)).not.toThrow();
    expect(() => reporter.onFinish(undefined as any)).not.toThrow();
  });

  test("pauses spinner when displaying error", () => {
    const { stream } = createCapture();
    let pauseCount = 0;
    const spinner = {
      start(_text: string) {},
      update(_text: string) {},
      success(_text?: string) {},
      error(_text?: string) {},
      stop() {},
      isSpinning() { return true; },
      withPause(fn: () => void) {
        pauseCount++;
        fn();
      },
    };

    const reporter = createActivityReporter({
      output: stream,
      verbose: false,
      spinner,
    });

    reporter.onFinish({
      error: new Error("something broke"),
      steps: [],
      totalUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });

    expect(pauseCount).toBeGreaterThan(0);
  });

  test("includes failure symbol in error output", () => {
    const { stream, output } = createCapture();
    const reporter = createActivityReporter({ output: stream, verbose: false });

    reporter.onFinish({
      error: new Error("generation failed"),
      steps: [],
      totalUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });

    const text = stripAnsi(output());
    expect(text).toMatch(/✖|✗|✘|×|x/i);
  });
});
