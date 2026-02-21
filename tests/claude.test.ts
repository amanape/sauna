/**
 * ClaudeProvider Tests
 *
 * Tests ClaudeProvider — the Provider-interface implementation that absorbs
 * findClaude() / runSession() logic from the legacy modules.
 * Uses subprocess isolation because isAvailable() calls execSync/realpathSync.
 */
import { test, expect, describe } from "bun:test";
import { resolve } from "node:path";
import { mkdirSync, symlinkSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { ClaudeProvider } from "../src/providers/claude";

const ROOT = resolve(import.meta.dir, "..");
const BUN = process.execPath;

describe("ClaudeProvider", () => {
  describe("isAvailable()", () => {
    test("returns false when claude is not on PATH", async () => {
      const script = `
        const { ClaudeProvider } = require("${ROOT}/src/providers/claude.ts");
        process.stdout.write(String(ClaudeProvider.isAvailable()));
      `;
      const proc = Bun.spawn([BUN, "-e", script], {
        cwd: ROOT,
        stdout: "pipe",
        stderr: "pipe",
        env: { PATH: "/usr/bin:/bin" },
      });
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;
      expect(stdout).toBe("false");
    });

    test("returns false for dangling symlink", async () => {
      const tmpDir = `/tmp/sauna-test-claude-provider-${Date.now()}`;
      mkdirSync(tmpDir, { recursive: true });
      try {
        symlinkSync("/nonexistent/path/claude", resolve(tmpDir, "claude"));
        const script = `
          const { ClaudeProvider } = require("${ROOT}/src/providers/claude.ts");
          process.stdout.write(String(ClaudeProvider.isAvailable()));
        `;
        const proc = Bun.spawn([BUN, "-e", script], {
          cwd: ROOT,
          stdout: "pipe",
          stderr: "pipe",
          env: { PATH: `${tmpDir}:/usr/bin:/bin` },
        });
        const stdout = await new Response(proc.stdout).text();
        await proc.exited;
        expect(stdout).toBe("false");
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test("returns true when a valid claude executable is on PATH", async () => {
      const tmpDir = `/tmp/sauna-test-claude-provider-real-${Date.now()}`;
      mkdirSync(tmpDir, { recursive: true });
      try {
        const fakeClaude = resolve(tmpDir, "claude");
        writeFileSync(fakeClaude, "#!/bin/sh\necho claude\n");
        chmodSync(fakeClaude, 0o755);
        const script = `
          const { ClaudeProvider } = require("${ROOT}/src/providers/claude.ts");
          process.stdout.write(String(ClaudeProvider.isAvailable()));
        `;
        const proc = Bun.spawn([BUN, "-e", script], {
          cwd: ROOT,
          stdout: "pipe",
          stderr: "pipe",
          env: { PATH: `${tmpDir}:/usr/bin:/bin` },
        });
        const stdout = await new Response(proc.stdout).text();
        await proc.exited;
        expect(stdout).toBe("true");
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("resolveModel()", () => {
    test("resolves 'sonnet' alias", () => {
      expect(ClaudeProvider.resolveModel("sonnet")).toBe("claude-sonnet-4-20250514");
    });

    test("resolves 'opus' alias", () => {
      expect(ClaudeProvider.resolveModel("opus")).toBe("claude-opus-4-20250514");
    });

    test("resolves 'haiku' alias", () => {
      expect(ClaudeProvider.resolveModel("haiku")).toBe("claude-haiku-4-20250414");
    });

    test("passes through unknown model IDs unchanged", () => {
      expect(ClaudeProvider.resolveModel("claude-opus-4-20250514")).toBe("claude-opus-4-20250514");
    });

    test("returns undefined for undefined input", () => {
      expect(ClaudeProvider.resolveModel(undefined)).toBeUndefined();
    });

    test("returns undefined for empty string", () => {
      expect(ClaudeProvider.resolveModel("")).toBeUndefined();
    });
  });

  describe("knownAliases()", () => {
    test("returns map containing all three Claude aliases", () => {
      const aliases = ClaudeProvider.knownAliases();
      expect(aliases["sonnet"]).toBe("claude-sonnet-4-20250514");
      expect(aliases["opus"]).toBe("claude-opus-4-20250514");
      expect(aliases["haiku"]).toBe("claude-haiku-4-20250414");
    });
  });
});
