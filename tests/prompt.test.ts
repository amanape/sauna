import { test, expect, describe } from "bun:test";
import { buildPrompt } from "../src/prompt";

describe("buildPrompt", () => {
  test("returns prompt unchanged when no context paths", () => {
    expect(buildPrompt("do something", [])).toBe("do something");
  });

  test("prepends single context path as reference", () => {
    const result = buildPrompt("do something", ["foo.md"]);
    expect(result).toContain("foo.md");
    expect(result).toContain("do something");
    expect(result.indexOf("foo.md")).toBeLessThan(result.indexOf("do something"));
  });

  test("prepends multiple context paths as references", () => {
    const result = buildPrompt("do something", ["foo.md", "bar/", "baz.ts"]);
    expect(result).toContain("foo.md");
    expect(result).toContain("bar/");
    expect(result).toContain("baz.ts");
    expect(result).toContain("do something");
    expect(result.indexOf("baz.ts")).toBeLessThan(result.indexOf("do something"));
  });
});
