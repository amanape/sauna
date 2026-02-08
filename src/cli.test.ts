import { test, expect, describe } from "bun:test";
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

  test("defaults --provider to anthropic", () => {
    const result = parseCliArgs(["--codebase", "/some/path"]);
    expect(result.provider).toBe("anthropic");
  });

  test("parses custom --provider", () => {
    const result = parseCliArgs([
      "--codebase", "/some/path",
      "--provider", "openai",
    ]);
    expect(result.provider).toBe("openai");
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
      "--provider", "openai",
      "--model", "gpt-4",
    ]);
    expect(result.codebase).toBe("/my/project");
    expect(result.output).toBe("/my/output");
    expect(result.provider).toBe("openai");
    expect(result.model).toBe("gpt-4");
  });
});

describe("createTools", () => {
  test("returns all 6 tools with correct names", () => {
    const tools = createTools("/some/codebase", "./jobs/");
    const names = tools.map((t) => t.name);
    expect(names).toEqual([
      "file_read",
      "file_search",
      "web_search",
      "write_jtbd",
      "write_spec",
      "session_complete",
    ]);
  });

  test("returns exactly 6 tools", () => {
    const tools = createTools("/some/codebase", "./jobs/");
    expect(tools).toHaveLength(6);
  });

  test("all tools have execute functions", () => {
    const tools = createTools("/some/codebase", "./jobs/");
    for (const tool of tools) {
      expect(typeof tool.execute).toBe("function");
    }
  });

  test("scopes file_read to codebase path", async () => {
    const tools = createTools("/nonexistent/codebase", "./jobs/");
    const fileRead = tools.find((t) => t.name === "file_read")!;
    const result = await fileRead.execute({ path: "../../etc/passwd" });
    expect(result).toContain("outside the codebase");
  });
});
