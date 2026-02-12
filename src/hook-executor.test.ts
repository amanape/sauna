import { test, expect, describe } from "bun:test";
import { runHooks, type HookResult } from "./hook-executor";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function makeTmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "hook-executor-"));
}

describe("runHooks", () => {
  test("returns success when hooks list is empty", async () => {
    const dir = await makeTmpDir();
    try {
      const result = await runHooks([], dir);
      expect(result.ok).toBe(true);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("runs a passing command and returns success", async () => {
    const dir = await makeTmpDir();
    try {
      const result = await runHooks(["echo hello"], dir);
      expect(result.ok).toBe(true);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("captures stdout from a passing command", async () => {
    const dir = await makeTmpDir();
    try {
      const result = await runHooks(["echo hello"], dir);
      expect(result.ok).toBe(true);
      expect(result.output).toContain("hello");
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("runs multiple passing commands sequentially", async () => {
    const dir = await makeTmpDir();
    try {
      // Create a file in the first command, read it in the second
      const result = await runHooks(
        [
          `echo first > ${join(dir, "seq.txt")}`,
          `cat ${join(dir, "seq.txt")}`,
        ],
        dir,
      );
      expect(result.ok).toBe(true);
      expect(result.output).toContain("first");
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("stops at first failing command and returns failure", async () => {
    const dir = await makeTmpDir();
    try {
      const result = await runHooks(
        ["exit 1", "echo should-not-run"],
        dir,
      );
      expect(result.ok).toBe(false);
      expect(result.failedCommand).toBe("exit 1");
      expect(result.output).not.toContain("should-not-run");
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("captures stderr from a failing command", async () => {
    const dir = await makeTmpDir();
    try {
      const result = await runHooks(
        ["echo failure-message >&2 && exit 1"],
        dir,
      );
      expect(result.ok).toBe(false);
      expect(result.output).toContain("failure-message");
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("reports the correct failed command when second hook fails", async () => {
    const dir = await makeTmpDir();
    try {
      const result = await runHooks(
        ["echo ok", "echo bad >&2 && exit 42"],
        dir,
      );
      expect(result.ok).toBe(false);
      expect(result.failedCommand).toBe("echo bad >&2 && exit 42");
      expect(result.exitCode).toBe(42);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("executes commands in the specified working directory", async () => {
    const dir = await makeTmpDir();
    try {
      const result = await runHooks(["pwd"], dir);
      expect(result.ok).toBe(true);
      // Resolve symlinks for macOS /private/var/folders vs /var/folders
      const { realpathSync } = await import("node:fs");
      const realDir = realpathSync(dir);
      expect(result.output.trim()).toBe(realDir);
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
