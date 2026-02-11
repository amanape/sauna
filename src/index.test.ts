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
