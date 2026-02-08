import { test, expect, beforeEach, afterEach } from "bun:test";
import { createFileSearchTool } from "./file-search";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let codebaseDir: string;

beforeEach(() => {
  codebaseDir = mkdtempSync(join(tmpdir(), "file-search-test-"));
});

afterEach(() => {
  rmSync(codebaseDir, { recursive: true, force: true });
});

test("finds matching lines and returns file path with line number", async () => {
  writeFileSync(join(codebaseDir, "app.ts"), "const x = 42;\nconst y = 99;\n");
  const tool = createFileSearchTool(codebaseDir);
  const result = await tool.execute({ pattern: "42" });
  expect(result).toContain("app.ts:1:");
  expect(result).toContain("const x = 42;");
});

test("searches recursively through subdirectories", async () => {
  mkdirSync(join(codebaseDir, "src", "lib"), { recursive: true });
  writeFileSync(join(codebaseDir, "src", "lib", "utils.ts"), "export function hello() {}\n");
  writeFileSync(join(codebaseDir, "top.ts"), "// no match here\n");
  const tool = createFileSearchTool(codebaseDir);
  const result = await tool.execute({ pattern: "hello" });
  expect(result).toContain("src/lib/utils.ts:1:");
  expect(result).not.toContain("top.ts");
});

test("returns matches from multiple files", async () => {
  writeFileSync(join(codebaseDir, "a.ts"), "foo bar\n");
  writeFileSync(join(codebaseDir, "b.ts"), "baz foo\n");
  const tool = createFileSearchTool(codebaseDir);
  const result = await tool.execute({ pattern: "foo" });
  expect(result).toContain("a.ts:1:");
  expect(result).toContain("b.ts:1:");
});

test("returns informative message when no matches found", async () => {
  writeFileSync(join(codebaseDir, "a.ts"), "nothing here\n");
  const tool = createFileSearchTool(codebaseDir);
  const result = await tool.execute({ pattern: "zzzzz" });
  expect(result).toMatch(/no match/i);
});

test("matches using regex patterns", async () => {
  writeFileSync(join(codebaseDir, "data.ts"), "count = 123;\nname = 'test';\n");
  const tool = createFileSearchTool(codebaseDir);
  const result = await tool.execute({ pattern: "\\d+" });
  expect(result).toContain("data.ts:1:");
  expect(result).toContain("count = 123;");
  expect(result).not.toContain("data.ts:2:");
});

test("skips binary files without error", async () => {
  writeFileSync(join(codebaseDir, "image.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]));
  writeFileSync(join(codebaseDir, "code.ts"), "PNG header\n");
  const tool = createFileSearchTool(codebaseDir);
  const result = await tool.execute({ pattern: "PNG" });
  expect(result).toContain("code.ts:1:");
  expect(result).not.toContain("image.png");
});

test("reports correct line numbers for multi-line files", async () => {
  writeFileSync(join(codebaseDir, "multi.ts"), "line one\nline two\nline three\n");
  const tool = createFileSearchTool(codebaseDir);
  const result = await tool.execute({ pattern: "three" });
  expect(result).toContain("multi.ts:3:");
  expect(result).not.toContain("multi.ts:1:");
  expect(result).not.toContain("multi.ts:2:");
});

test("returns error for invalid regex pattern", async () => {
  const tool = createFileSearchTool(codebaseDir);
  const result = await tool.execute({ pattern: "[invalid" });
  expect(result).toMatch(/error/i);
  expect(result).toContain("[invalid");
});

test("no-match message includes the searched pattern", async () => {
  writeFileSync(join(codebaseDir, "a.ts"), "nothing here\n");
  const tool = createFileSearchTool(codebaseDir);
  const result = await tool.execute({ pattern: "xyzzy_unique" });
  expect(result).toContain("xyzzy_unique");
});

test("finds multiple matches across different lines of same file", async () => {
  writeFileSync(
    join(codebaseDir, "multi.ts"),
    "foo at start\nbar in middle\nfoo again\n",
  );
  const tool = createFileSearchTool(codebaseDir);
  const result = await tool.execute({ pattern: "foo" });
  expect(result).toContain("multi.ts:1:");
  expect(result).toContain("multi.ts:3:");
  expect(result).not.toContain("multi.ts:2:");
});
