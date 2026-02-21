/**
 * CodexProvider Tests
 *
 * Tests the CodexProvider implementation of the Provider interface.
 *
 * isAvailable() tests use subprocess isolation because they manipulate
 * environment variables (OPENAI_API_KEY / CODEX_API_KEY) and Bun.env is
 * process-global.
 *
 * resolveModel() and knownAliases() tests import directly — they are pure
 * functions with no I/O or env var reads.
 *
 * Why these tests matter:
 * - isAvailable() is the gate that guards createSession(); a wrong env check
 *   could silently succeed or block valid users.
 * - The alias map is the public contract for model selection; regressions
 *   here cascade to CLI model inference.
 * - createSession() throwing with a clear error when the key is missing
 *   ensures users get actionable feedback instead of an SDK crash.
 */
import { test, expect, describe } from "bun:test";
import { resolve } from "node:path";
import { CodexProvider } from "../src/providers/codex";

const ROOT = resolve(import.meta.dir, "..");
const BUN = process.execPath;

describe("CodexProvider", () => {
  describe("name", () => {
    test("is 'codex'", () => {
      expect(CodexProvider.name).toBe("codex");
    });
  });

  describe("isAvailable()", () => {
    test("returns true when OPENAI_API_KEY is set", async () => {
      const script = `
        const { CodexProvider } = require("${ROOT}/src/providers/codex.ts");
        process.stdout.write(String(CodexProvider.isAvailable()));
      `;
      const proc = Bun.spawn([BUN, "-e", script], {
        cwd: ROOT,
        stdout: "pipe",
        stderr: "pipe",
        env: { OPENAI_API_KEY: "sk-test-key-123" },
      });
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;
      expect(stdout).toBe("true");
    });

    test("returns true when CODEX_API_KEY is set", async () => {
      const script = `
        const { CodexProvider } = require("${ROOT}/src/providers/codex.ts");
        process.stdout.write(String(CodexProvider.isAvailable()));
      `;
      const proc = Bun.spawn([BUN, "-e", script], {
        cwd: ROOT,
        stdout: "pipe",
        stderr: "pipe",
        env: { CODEX_API_KEY: "cdx-test-key-456" },
      });
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;
      expect(stdout).toBe("true");
    });

    test("returns false when neither OPENAI_API_KEY nor CODEX_API_KEY is set", async () => {
      const script = `
        const { CodexProvider } = require("${ROOT}/src/providers/codex.ts");
        process.stdout.write(String(CodexProvider.isAvailable()));
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
  });

  describe("resolveModel()", () => {
    test("resolves 'codex' alias", () => {
      expect(CodexProvider.resolveModel("codex")).toBe("gpt-5.2-codex");
    });

    test("resolves 'codex-mini' alias", () => {
      expect(CodexProvider.resolveModel("codex-mini")).toBe("codex-mini-latest");
    });

    test("passes through unknown model IDs unchanged", () => {
      expect(CodexProvider.resolveModel("gpt-5.2-codex")).toBe("gpt-5.2-codex");
    });

    test("passes through full model IDs unchanged", () => {
      expect(CodexProvider.resolveModel("gpt-5.3-codex")).toBe("gpt-5.3-codex");
    });

    test("returns undefined for undefined input", () => {
      expect(CodexProvider.resolveModel(undefined)).toBeUndefined();
    });

    test("returns undefined for empty string", () => {
      expect(CodexProvider.resolveModel("")).toBeUndefined();
    });
  });

  describe("knownAliases()", () => {
    test("returns map containing both Codex aliases", () => {
      const aliases = CodexProvider.knownAliases();
      expect(aliases["codex"]).toBe("gpt-5.2-codex");
      expect(aliases["codex-mini"]).toBe("codex-mini-latest");
    });

    test("returns exactly two aliases", () => {
      const aliases = CodexProvider.knownAliases();
      expect(Object.keys(aliases)).toHaveLength(2);
    });
  });

  describe("createSession()", () => {
    test("throws with descriptive error mentioning OPENAI_API_KEY when unavailable", async () => {
      const script = `
        const { CodexProvider } = require("${ROOT}/src/providers/codex.ts");
        async function run() {
          const gen = CodexProvider.createSession({ prompt: "test", context: [] });
          try {
            await gen.next();
          } catch (err) {
            process.stdout.write(err.message);
            process.exit(1);
          }
          process.exit(0);
        }
        run();
      `;
      const proc = Bun.spawn([BUN, "-e", script], {
        cwd: ROOT,
        stdout: "pipe",
        stderr: "pipe",
        env: { PATH: "/usr/bin:/bin" }, // no API keys in env
      });
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      expect(exitCode).toBe(1);
      expect(stdout.toLowerCase()).toContain("openai_api_key");
    });
  });
});
