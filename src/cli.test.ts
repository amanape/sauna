import { test, expect, describe, mock, beforeEach } from "bun:test";
import { parseCliArgs, createTools, type CliArgs } from "./cli";

describe("parseCliArgs", () => {
  test("parses --codebase as required argument", () => {
    const result = parseCliArgs(["--codebase", "/some/path"]);
    expect(result.codebase).toBe("/some/path");
  });

  test("throws when --codebase is missing", () => {
    expect(() => parseCliArgs([])).toThrow("--codebase");
  });

  test("defaults --output to ./jobs/", () => {
    const result = parseCliArgs(["--codebase", "/some/path"]);
    expect(result.output).toBe("./jobs/");
  });

  test("parses custom --output", () => {
    const result = parseCliArgs([
      "--codebase", "/some/path",
      "--output", "/custom/output",
    ]);
    expect(result.output).toBe("/custom/output");
  });

  test("--provider is not accepted", () => {
    expect(() =>
      parseCliArgs(["--codebase", "/some/path", "--provider", "openai"]),
    ).toThrow();
  });

  test("defaults --model to undefined", () => {
    const result = parseCliArgs(["--codebase", "/some/path"]);
    expect(result.model).toBeUndefined();
  });

  test("parses custom --model", () => {
    const result = parseCliArgs([
      "--codebase", "/some/path",
      "--model", "claude-opus-4-20250514",
    ]);
    expect(result.model).toBe("claude-opus-4-20250514");
  });

  test("parses all arguments together", () => {
    const result = parseCliArgs([
      "--codebase", "/my/project",
      "--output", "/my/output",
      "--model", "gpt-4",
    ]);
    expect(result.codebase).toBe("/my/project");
    expect(result.output).toBe("/my/output");
    expect(result.model).toBe("gpt-4");
  });
});

describe("createTools", () => {
  test("returns a record with file_read, file_write, web_search keys", () => {
    const tools = createTools("/some/codebase", "./jobs/");
    expect(Object.keys(tools).sort()).toEqual(["file_read", "file_write", "web_search"]);
  });

  test("all tools have execute functions", () => {
    const tools = createTools("/some/codebase", "./jobs/");
    for (const [name, tool] of Object.entries(tools)) {
      expect(typeof tool.execute).toBe("function");
    }
  });

  test("scopes file_read to codebase path", async () => {
    const tools = createTools("/nonexistent/codebase", "./jobs/");
    const result = await tools.file_read.execute!(
      { path: "../../etc/passwd" },
      { toolCallId: "test", messages: [] },
    );
    expect(result).toContain("outside the codebase");
  });
});
