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

function execute(tool: ReturnType<typeof createFileReadTool>, input: { path: string }) {
  return tool.execute!(input, { toolCallId: "test", messages: [], abortSignal: new AbortController().signal });
}

test("reads file contents at a relative path", async () => {
  writeFileSync(join(codebaseDir, "hello.txt"), "hello world");
  const tool = createFileReadTool(codebaseDir);
  const result = await execute(tool, { path: "hello.txt" });
  expect(result).toBe("hello world");
});

test("reads file in a nested subdirectory", async () => {
  mkdirSync(join(codebaseDir, "src", "lib"), { recursive: true });
  writeFileSync(join(codebaseDir, "src", "lib", "main.ts"), "export const x = 1;");
  const tool = createFileReadTool(codebaseDir);
  const result = await execute(tool, { path: "src/lib/main.ts" });
  expect(result).toBe("export const x = 1;");
});

test("rejects path traversal outside codebase", async () => {
  const tool = createFileReadTool(codebaseDir);
  const result = await execute(tool, { path: "../../etc/passwd" });
  expect(result).toMatch(/outside.*codebase/i);
});

test("rejects absolute path outside codebase", async () => {
  const tool = createFileReadTool(codebaseDir);
  const result = await execute(tool, { path: "/etc/passwd" });
  expect(result).toMatch(/outside.*codebase/i);
});

test("allows absolute path inside codebase", async () => {
  writeFileSync(join(codebaseDir, "ok.txt"), "allowed");
  const tool = createFileReadTool(codebaseDir);
  const result = await execute(tool, { path: join(codebaseDir, "ok.txt") });
  expect(result).toBe("allowed");
});

test("returns error for nonexistent file", async () => {
  const tool = createFileReadTool(codebaseDir);
  const result = await execute(tool, { path: "ghost.txt" });
  expect(result).toContain("File not found");
  expect(result).toContain("ghost.txt");
});

test("returns error when path is a directory", async () => {
  mkdirSync(join(codebaseDir, "subdir"));
  const tool = createFileReadTool(codebaseDir);
  const result = await execute(tool, { path: "subdir" });
  expect(result).toMatch(/error/i);
  expect(result).toContain("directory");
  expect(result).toContain("subdir");
});

test("resolves .. segments that stay inside codebase", async () => {
  mkdirSync(join(codebaseDir, "src"));
  writeFileSync(join(codebaseDir, "root.txt"), "at root");
  const tool = createFileReadTool(codebaseDir);
  const result = await execute(tool, { path: "src/../root.txt" });
  expect(result).toBe("at root");
});

test("rejects path with codebase as prefix but different directory", async () => {
  // If codebase is /tmp/abc123, then /tmp/abc123-evil/secret must be rejected.
  // This catches the mutation of removing "+ '/'" from the startsWith check.
  const tool = createFileReadTool(codebaseDir);
  const siblingPath = codebaseDir + "-evil/secret.txt";
  const result = await execute(tool, { path: siblingPath });
  expect(result).toMatch(/outside.*codebase/i);
});
