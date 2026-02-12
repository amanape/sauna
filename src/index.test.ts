import { test, expect } from "bun:test";

import * as publicApi from "./index";

test("exports createPlanningAgent", () => {
  expect(typeof publicApi.createPlanningAgent).toBe("function");
});

test("exports createBuilderAgent", () => {
  expect(typeof publicApi.createBuilderAgent).toBe("function");
});

test("exports runFixedCount", () => {
  expect(typeof publicApi.runFixedCount).toBe("function");
});

test("exports runUntilDone", () => {
  expect(typeof publicApi.runUntilDone).toBe("function");
});

test("exports runJobPipeline", () => {
  expect(typeof publicApi.runJobPipeline).toBe("function");
});

test("exports loadHooks", () => {
  expect(typeof publicApi.loadHooks).toBe("function");
});

test("exports runHooks", () => {
  expect(typeof publicApi.runHooks).toBe("function");
});

test("exports SessionRunner", () => {
  expect(typeof publicApi.SessionRunner).toBe("function");
});

test("exports parseCliArgs", () => {
  expect(typeof publicApi.parseCliArgs).toBe("function");
});

test("exports runConversation", () => {
  expect(typeof publicApi.runConversation).toBe("function");
});

test("exports createDiscoveryAgent", () => {
  expect(typeof publicApi.createDiscoveryAgent).toBe("function");
});

test("exports createResearchAgent", () => {
  expect(typeof publicApi.createResearchAgent).toBe("function");
});
