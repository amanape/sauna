import { test, expect, beforeEach, afterEach } from "bun:test";
import { createWriteJtbdTool, createWriteSpecTool } from "./output-writer";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "write-jtbd-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

test("writes jtbd.md with correct content to slug directory", async () => {
  const tool = createWriteJtbdTool(tempDir);
  await tool.execute({ job_slug: "discovery-agent", content: "# JTBD\nContent here" });

  const written = await readFile(join(tempDir, "discovery-agent", "jtbd.md"), "utf-8");
  expect(written).toBe("# JTBD\nContent here");
});

test("returns confirmation starting with 'Wrote ' for engine detection", async () => {
  const tool = createWriteJtbdTool(tempDir);
  const result = await tool.execute({ job_slug: "my-job", content: "content" });

  expect(result).toBe("Wrote jobs/my-job/jtbd.md");
});

test("overwrites existing file on second write", async () => {
  const tool = createWriteJtbdTool(tempDir);
  await tool.execute({ job_slug: "overwrite-test", content: "original" });
  await tool.execute({ job_slug: "overwrite-test", content: "updated" });

  const written = await readFile(join(tempDir, "overwrite-test", "jtbd.md"), "utf-8");
  expect(written).toBe("updated");
});

test("rejects slug with uppercase letters", async () => {
  const tool = createWriteJtbdTool(tempDir);
  const result = await tool.execute({ job_slug: "MyJob", content: "content" });

  expect(result).toMatch(/error/i);
});

test("rejects slug with spaces", async () => {
  const tool = createWriteJtbdTool(tempDir);
  const result = await tool.execute({ job_slug: "my job", content: "content" });

  expect(result).toMatch(/error/i);
});

test("rejects slug with special characters", async () => {
  const tool = createWriteJtbdTool(tempDir);
  const result = await tool.execute({ job_slug: "my_job!", content: "content" });

  expect(result).toMatch(/error/i);
});

test("rejects missing job_slug", async () => {
  const tool = createWriteJtbdTool(tempDir);
  const result = await tool.execute({ content: "content" });

  expect(result).toMatch(/error/i);
});

test("rejects empty content", async () => {
  const tool = createWriteJtbdTool(tempDir);
  const result = await tool.execute({ job_slug: "test-job", content: "" });

  expect(result).toMatch(/error/i);
});

test("rejects missing content parameter", async () => {
  const tool = createWriteJtbdTool(tempDir);
  const result = await tool.execute({ job_slug: "test-job" });

  expect(result).toMatch(/error/i);
});

// --- write_spec tests ---

test("write_spec writes spec file to correct nested path", async () => {
  const tool = createWriteSpecTool(tempDir);
  await tool.execute({ job_slug: "auth-flow", spec_slug: "login-page", content: "# Login Page\nSpec content" });

  const written = await readFile(join(tempDir, "auth-flow", "specs", "login-page.md"), "utf-8");
  expect(written).toBe("# Login Page\nSpec content");
});

test("write_spec returns confirmation with 'Wrote ' prefix for engine detection", async () => {
  const tool = createWriteSpecTool(tempDir);
  const result = await tool.execute({ job_slug: "auth-flow", spec_slug: "login-page", content: "content" });

  expect(result).toBe("Wrote jobs/auth-flow/specs/login-page.md");
});

test("write_spec overwrites existing spec on second write", async () => {
  const tool = createWriteSpecTool(tempDir);
  await tool.execute({ job_slug: "auth-flow", spec_slug: "login-page", content: "original" });
  await tool.execute({ job_slug: "auth-flow", spec_slug: "login-page", content: "revised" });

  const written = await readFile(join(tempDir, "auth-flow", "specs", "login-page.md"), "utf-8");
  expect(written).toBe("revised");
});

test("write_spec rejects invalid job_slug", async () => {
  const tool = createWriteSpecTool(tempDir);
  const result = await tool.execute({ job_slug: "Bad Slug", spec_slug: "ok-slug", content: "content" });

  expect(result).toMatch(/error/i);
});

test("write_spec rejects invalid spec_slug", async () => {
  const tool = createWriteSpecTool(tempDir);
  const result = await tool.execute({ job_slug: "ok-slug", spec_slug: "Bad_Slug!", content: "content" });

  expect(result).toMatch(/error/i);
});

test("write_spec rejects missing spec_slug", async () => {
  const tool = createWriteSpecTool(tempDir);
  const result = await tool.execute({ job_slug: "ok-slug", content: "content" });

  expect(result).toMatch(/error/i);
});

test("write_spec rejects empty content", async () => {
  const tool = createWriteSpecTool(tempDir);
  const result = await tool.execute({ job_slug: "ok-slug", spec_slug: "ok-spec", content: "" });

  expect(result).toMatch(/error/i);
});

test("write_spec creates multiple specs under same job", async () => {
  const tool = createWriteSpecTool(tempDir);
  await tool.execute({ job_slug: "auth-flow", spec_slug: "login-page", content: "login content" });
  await tool.execute({ job_slug: "auth-flow", spec_slug: "signup-page", content: "signup content" });

  const login = await readFile(join(tempDir, "auth-flow", "specs", "login-page.md"), "utf-8");
  const signup = await readFile(join(tempDir, "auth-flow", "specs", "signup-page.md"), "utf-8");
  expect(login).toBe("login content");
  expect(signup).toBe("signup content");
});
