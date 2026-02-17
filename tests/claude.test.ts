/**
 * Claude Resolution Tests (P0)
 *
 * Tests that findClaude() produces clear, actionable error messages
 * instead of stack traces when the Claude Code executable is not found.
 * Uses subprocess isolation because findClaude() calls execSync/realpathSync.
 */
import { test, expect, describe } from "bun:test";
import { resolve } from "node:path";
import { mkdirSync, symlinkSync, rmSync } from "node:fs";

const ROOT = resolve(import.meta.dir, "..");
const BUN = process.execPath;

describe("P0: Claude resolution", () => {
  test("findClaude throws descriptive error when claude is not on PATH", async () => {
    const script = `
      const { findClaude } = require("${ROOT}/src/claude.ts");
      try {
        findClaude();
        process.exit(0);
      } catch (err) {
        console.log(err.message);
        process.exit(1);
      }
    `;
    const proc = Bun.spawn([BUN, "-e", script], {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { PATH: "/usr/bin:/bin" },
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(1);
    // Error message should be actionable — not the raw "Command failed: which claude"
    expect(stdout).not.toContain("Command failed");
    expect(stdout.toLowerCase()).toContain("claude");
    // Should mention installation or PATH
    expect(stdout.toLowerCase()).toMatch(/install|path/);
  });

  test("findClaude throws descriptive error for dangling symlink", async () => {
    const tmpDir = `/tmp/sauna-test-claude-${Date.now()}`;
    mkdirSync(tmpDir, { recursive: true });

    try {
      symlinkSync("/nonexistent/path/claude", resolve(tmpDir, "claude"));

      const script = `
        const { findClaude } = require("${ROOT}/src/claude.ts");
        try {
          findClaude();
          process.exit(0);
        } catch (err) {
          console.log(err.message);
          process.exit(1);
        }
      `;
      const proc = Bun.spawn([BUN, "-e", script], {
        cwd: ROOT,
        stdout: "pipe",
        stderr: "pipe",
        env: { PATH: `${tmpDir}:/usr/bin:/bin` },
      });
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      expect(exitCode).toBe(1);
      // Should mention the dangling symlink issue clearly
      expect(stdout).not.toContain("ENOENT");
      expect(stdout.toLowerCase()).toContain("claude");
      expect(stdout.toLowerCase()).toMatch(/symlink|resolve|broken|dangling|not found|install/);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
