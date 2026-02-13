import { test, expect, describe } from "bun:test";

import { ExecutionMetrics, type TokenUsage } from "./execution-metrics";

function makeClock() {
  let now = 0;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const fullUsage: TokenUsage = {
  inputTokens: 1000,
  outputTokens: 500,
  totalTokens: 1500,
  reasoningTokens: 200,
  cachedInputTokens: 300,
};

describe("ExecutionMetrics", () => {
  describe("token tracking", () => {
    test("recordTurnUsage accumulates tokens across turns", () => {
      const metrics = new ExecutionMetrics();

      metrics.recordTurnUsage({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });
      metrics.recordTurnUsage({
        inputTokens: 200,
        outputTokens: 100,
        totalTokens: 300,
      });

      const cumulative = metrics.getCumulativeUsage();
      expect(cumulative.inputTokens).toBe(300);
      expect(cumulative.outputTokens).toBe(150);
      expect(cumulative.totalTokens).toBe(450);
    });

    test("recordTurnUsage tracks optional reasoning and cached tokens", () => {
      const metrics = new ExecutionMetrics();

      metrics.recordTurnUsage(fullUsage);
      metrics.recordTurnUsage({
        inputTokens: 500,
        outputTokens: 250,
        totalTokens: 750,
        reasoningTokens: 100,
        cachedInputTokens: 50,
      });

      const cumulative = metrics.getCumulativeUsage();
      expect(cumulative.reasoningTokens).toBe(300);
      expect(cumulative.cachedInputTokens).toBe(350);
    });

    test("getLastTurnUsage returns the most recent turn usage", () => {
      const metrics = new ExecutionMetrics();

      metrics.recordTurnUsage({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });
      metrics.recordTurnUsage({
        inputTokens: 200,
        outputTokens: 100,
        totalTokens: 300,
      });

      const last = metrics.getLastTurnUsage();
      expect(last?.inputTokens).toBe(200);
      expect(last?.outputTokens).toBe(100);
      expect(last?.totalTokens).toBe(300);
    });

    test("getLastTurnUsage returns undefined when no turns recorded", () => {
      const metrics = new ExecutionMetrics();
      expect(metrics.getLastTurnUsage()).toBeUndefined();
    });

    test("getCumulativeUsage returns zeroes when no turns recorded", () => {
      const metrics = new ExecutionMetrics();
      const cumulative = metrics.getCumulativeUsage();
      expect(cumulative.inputTokens).toBe(0);
      expect(cumulative.outputTokens).toBe(0);
      expect(cumulative.totalTokens).toBe(0);
      expect(cumulative.reasoningTokens).toBe(0);
      expect(cumulative.cachedInputTokens).toBe(0);
    });

    test("handles missing optional fields by treating them as zero", () => {
      const metrics = new ExecutionMetrics();

      metrics.recordTurnUsage({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        // no reasoningTokens, no cachedInputTokens
      });

      const cumulative = metrics.getCumulativeUsage();
      expect(cumulative.reasoningTokens).toBe(0);
      expect(cumulative.cachedInputTokens).toBe(0);
    });

    test("skips recording when usage is undefined", () => {
      const metrics = new ExecutionMetrics();
      metrics.recordTurnUsage(undefined);
      expect(metrics.getLastTurnUsage()).toBeUndefined();
      const cumulative = metrics.getCumulativeUsage();
      expect(cumulative.totalTokens).toBe(0);
    });
  });

  describe("turn timing", () => {
    test("measures wall-clock duration of a turn", () => {
      const clock = makeClock();
      const metrics = new ExecutionMetrics(clock.now);

      metrics.startTurn();
      clock.advance(2500);
      const duration = metrics.endTurn();

      expect(duration).toBe(2500);
    });

    test("endTurn returns 0 when no turn was started", () => {
      const metrics = new ExecutionMetrics();
      expect(metrics.endTurn()).toBe(0);
    });

    test("getLastTurnDuration returns the most recent turn duration", () => {
      const clock = makeClock();
      const metrics = new ExecutionMetrics(clock.now);

      metrics.startTurn();
      clock.advance(1000);
      metrics.endTurn();

      metrics.startTurn();
      clock.advance(3000);
      metrics.endTurn();

      expect(metrics.getLastTurnDuration()).toBe(3000);
    });

    test("getLastTurnDuration returns 0 when no turns completed", () => {
      const metrics = new ExecutionMetrics();
      expect(metrics.getLastTurnDuration()).toBe(0);
    });
  });

  describe("tool call timing", () => {
    test("measures wall-clock duration of a tool call", () => {
      const clock = makeClock();
      const metrics = new ExecutionMetrics(clock.now);

      metrics.startToolCall("tool-1");
      clock.advance(500);
      const duration = metrics.endToolCall("tool-1");

      expect(duration).toBe(500);
    });

    test("tracks multiple concurrent tool calls independently", () => {
      const clock = makeClock();
      const metrics = new ExecutionMetrics(clock.now);

      metrics.startToolCall("tool-a");
      clock.advance(200);
      metrics.startToolCall("tool-b");
      clock.advance(300);
      const durationA = metrics.endToolCall("tool-a");
      clock.advance(100);
      const durationB = metrics.endToolCall("tool-b");

      expect(durationA).toBe(500); // 200 + 300
      expect(durationB).toBe(400); // 300 + 100
    });

    test("endToolCall returns 0 for unknown tool call id", () => {
      const metrics = new ExecutionMetrics();
      expect(metrics.endToolCall("nonexistent")).toBe(0);
    });

    test("cleans up tool call tracking after endToolCall", () => {
      const clock = makeClock();
      const metrics = new ExecutionMetrics(clock.now);

      metrics.startToolCall("tool-1");
      clock.advance(100);
      metrics.endToolCall("tool-1");

      // Second end for same id should return 0 (already cleaned up)
      expect(metrics.endToolCall("tool-1")).toBe(0);
    });
  });

  describe("reset", () => {
    test("clears all accumulated metrics", () => {
      const clock = makeClock();
      const metrics = new ExecutionMetrics(clock.now);

      metrics.recordTurnUsage(fullUsage);
      metrics.startTurn();
      clock.advance(1000);
      metrics.endTurn();

      metrics.reset();

      expect(metrics.getCumulativeUsage().totalTokens).toBe(0);
      expect(metrics.getLastTurnUsage()).toBeUndefined();
      expect(metrics.getLastTurnDuration()).toBe(0);
    });
  });
});
