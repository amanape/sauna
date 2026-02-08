import { test, expect } from "bun:test";
import { createSessionCompleteTool } from "./session-complete";

test("execute returns a non-error confirmation string", async () => {
  const tool = createSessionCompleteTool();
  const result = await tool.execute({});

  expect(result).not.toMatch(/^Error/);
  expect(result.length).toBeGreaterThan(0);
});

test("tool name matches the engine's session_complete detection", async () => {
  // Engine (engine.ts:68) checks: toolCall.name === 'session_complete'
  // If this name drifts, the engine won't set done=true.
  const tool = createSessionCompleteTool();
  expect(tool.name).toBe("session_complete");
});

test("execute succeeds even when unexpected args are passed", async () => {
  const tool = createSessionCompleteTool();
  const result = await tool.execute({ unexpected: "value", extra: 42 });

  expect(result).not.toMatch(/^Error/);
});
