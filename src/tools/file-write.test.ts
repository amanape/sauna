import { test, expect, beforeEach, afterEach } from "bun:test";
import { createFileWriteTool } from "./file-write";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let outputDir: string;

beforeEach(() => {
  outputDir = mkdtempSync(join(tmpdir(), "file-write-test-"));
});

afterEach(() => {
  rmSync(outputDir, { recursive: true, force: true });
});

function execute(tool: ReturnType<typeof createFileWriteTool>, input: { path: string; content: string }) {
  return tool.execute!(input, {} as any);
}

test("writes file and returns confirmation with relative path", async () => {
  const tool = createFileWriteTool(outputDir);
  const result = await execute(tool, { path: "output.md", content: "# Hello" });
  expect(result).toBe("Wrote output.md");
  expect(readFileSync(join(outputDir, "output.md"), "utf-8")).toBe("# Hello");
});

test("creates parent directories as needed", async () => {
  const tool = createFileWriteTool(outputDir);
  const result = await execute(tool, { path: "deep/nested/dir/file.md", content: "nested content" });
  expect(result).toBe("Wrote deep/nested/dir/file.md");
  expect(readFileSync(join(outputDir, "deep/nested/dir/file.md"), "utf-8")).toBe("nested content");
});

test("overwrites existing files", async () => {
  writeFileSync(join(outputDir, "exists.md"), "old content");
  const tool = createFileWriteTool(outputDir);
  const result = await execute(tool, { path: "exists.md", content: "new content" });
  expect(result).toBe("Wrote exists.md");
  expect(readFileSync(join(outputDir, "exists.md"), "utf-8")).toBe("new content");
});

test("rejects path traversal outside output directory", async () => {
  const tool = createFileWriteTool(outputDir);
  const result = await execute(tool, { path: "../../etc/evil", content: "pwned" });
  expect(result).toMatch(/outside.*output/i);
});

test("rejects absolute path outside output directory", async () => {
  const tool = createFileWriteTool(outputDir);
  const result = await execute(tool, { path: "/etc/evil", content: "pwned" });
  expect(result).toMatch(/outside.*output/i);
});

test("allows absolute path inside output directory", async () => {
  const tool = createFileWriteTool(outputDir);
  const absPath = join(outputDir, "allowed.md");
  const result = await execute(tool, { path: absPath, content: "allowed" });
  expect(result).toBe(`Wrote ${absPath}`);
  expect(readFileSync(absPath, "utf-8")).toBe("allowed");
});

test("rejects path with output dir as prefix but different directory", async () => {
  const tool = createFileWriteTool(outputDir);
  const siblingPath = outputDir + "-evil/secret.txt";
  const result = await execute(tool, { path: siblingPath, content: "pwned" });
  expect(result).toMatch(/outside.*output/i);
});

test("resolves .. segments that stay inside output directory", async () => {
  mkdirSync(join(outputDir, "sub"));
  const tool = createFileWriteTool(outputDir);
  const result = await execute(tool, { path: "sub/../root.md", content: "at root" });
  expect(result).toBe("Wrote sub/../root.md");
  expect(readFileSync(join(outputDir, "root.md"), "utf-8")).toBe("at root");
});
