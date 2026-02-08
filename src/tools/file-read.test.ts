import { test, expect, beforeEach, afterEach } from "bun:test";
import { createFileReadTool } from "./file-read";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let codebaseDir: string;

beforeEach(() => {
  codebaseDir = mkdtempSync(join(tmpdir(), "file-read-test-"));
});

afterEach(() => {
  rmSync(codebaseDir, { recursive: true, force: true });
});

test("reads file contents at a relative path", async () => {
  writeFileSync(join(codebaseDir, "hello.txt"), "hello world");
  const tool = createFileReadTool(codebaseDir);
  const result = await tool.execute({ path: "hello.txt" });
  expect(result).toBe("hello world");
});

test("reads file in a nested subdirectory", async () => {
  mkdirSync(join(codebaseDir, "src", "lib"), { recursive: true });
  writeFileSync(join(codebaseDir, "src", "lib", "main.ts"), "export const x = 1;");
  const tool = createFileReadTool(codebaseDir);
  const result = await tool.execute({ path: "src/lib/main.ts" });
  expect(result).toBe("export const x = 1;");
});

test("rejects path traversal outside codebase", async () => {
  const tool = createFileReadTool(codebaseDir);
  const result = await tool.execute({ path: "../../etc/passwd" });
  expect(result).toMatch(/outside.*codebase/i);
});

test("rejects absolute path outside codebase", async () => {
  const tool = createFileReadTool(codebaseDir);
  const result = await tool.execute({ path: "/etc/passwd" });
  expect(result).toMatch(/outside.*codebase/i);
});

test("allows absolute path inside codebase", async () => {
  writeFileSync(join(codebaseDir, "ok.txt"), "allowed");
  const tool = createFileReadTool(codebaseDir);
  const result = await tool.execute({ path: join(codebaseDir, "ok.txt") });
  expect(result).toBe("allowed");
});

test("returns error for nonexistent file", async () => {
  const tool = createFileReadTool(codebaseDir);
  const result = await tool.execute({ path: "ghost.txt" });
  expect(result).toContain("File not found");
  expect(result).toContain("ghost.txt");
});

test("returns error when path is a directory", async () => {
  mkdirSync(join(codebaseDir, "subdir"));
  const tool = createFileReadTool(codebaseDir);
  const result = await tool.execute({ path: "subdir" });
  expect(result).toMatch(/error/i);
});
