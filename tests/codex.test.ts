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
import { test, expect, describe, afterAll } from "bun:test";
import { resolve, join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
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

    test("returns false when neither OPENAI_API_KEY nor CODEX_API_KEY is set and no auth.json exists", async () => {
      // Use an empty temp dir as CODEX_HOME to prevent the host machine's real
      // ~/.codex/auth.json from causing a false positive.
      const tmpDir = mkdtempSync(join(tmpdir(), "codex-test-false-"));
      try {
        const script = `
          const { CodexProvider } = require("${ROOT}/src/providers/codex.ts");
          process.stdout.write(String(CodexProvider.isAvailable()));
        `;
        const proc = Bun.spawn([BUN, "-e", script], {
          cwd: ROOT,
          stdout: "pipe",
          stderr: "pipe",
          env: { PATH: "/usr/bin:/bin", CODEX_HOME: tmpDir },
        });
        const stdout = await new Response(proc.stdout).text();
        await proc.exited;
        expect(stdout).toBe("false");
      } finally {
        rmSync(tmpDir, { recursive: true });
      }
    });

    test("returns true when auth.json exists at CODEX_HOME", async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "codex-test-auth-"));
      writeFileSync(join(tmpDir, "auth.json"), "{}");
      try {
        const script = `
          const { CodexProvider } = require("${ROOT}/src/providers/codex.ts");
          process.stdout.write(String(CodexProvider.isAvailable()));
        `;
        const proc = Bun.spawn([BUN, "-e", script], {
          cwd: ROOT,
          stdout: "pipe",
          stderr: "pipe",
          env: { PATH: "/usr/bin:/bin", CODEX_HOME: tmpDir },
        });
        const stdout = await new Response(proc.stdout).text();
        await proc.exited;
        expect(stdout).toBe("true");
      } finally {
        rmSync(tmpDir, { recursive: true });
      }
    });

    test("returns true when ~/.codex/auth.json exists (via HOME override)", async () => {
      const tmpHome = mkdtempSync(join(tmpdir(), "codex-test-home-"));
      mkdirSync(join(tmpHome, ".codex"));
      writeFileSync(join(tmpHome, ".codex", "auth.json"), "{}");
      try {
        const script = `
          const { CodexProvider } = require("${ROOT}/src/providers/codex.ts");
          process.stdout.write(String(CodexProvider.isAvailable()));
        `;
        const proc = Bun.spawn([BUN, "-e", script], {
          cwd: ROOT,
          stdout: "pipe",
          stderr: "pipe",
          // No CODEX_HOME — relies on HOME-based default path
          env: { PATH: "/usr/bin:/bin", HOME: tmpHome },
        });
        const stdout = await new Response(proc.stdout).text();
        await proc.exited;
        expect(stdout).toBe("true");
      } finally {
        rmSync(tmpHome, { recursive: true });
      }
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
    test("throws with descriptive error mentioning all auth options when unavailable", async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "codex-test-session-"));
      try {
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
          env: { PATH: "/usr/bin:/bin", CODEX_HOME: tmpDir }, // no API keys, no auth.json
        });
        const stdout = await new Response(proc.stdout).text();
        const exitCode = await proc.exited;
        expect(exitCode).toBe(1);
        expect(stdout.toLowerCase()).toContain("openai_api_key");
        expect(stdout.toLowerCase()).toContain("codex_api_key");
        expect(stdout.toLowerCase()).toContain("codex login");
      } finally {
        rmSync(tmpDir, { recursive: true });
      }
    });
  });

  describe("createInteractiveSession()", () => {
    test("returns object with send, stream, and close methods", async () => {
      const script = `
        const { CodexProvider } = require("${ROOT}/src/providers/codex.ts");
        try {
          const session = CodexProvider.createInteractiveSession({ context: [] });
          const shape = JSON.stringify({
            hasSend: typeof session.send === "function",
            hasStream: typeof session.stream === "function",
            hasClose: typeof session.close === "function",
          });
          process.stdout.write(shape);
          process.exit(0);
        } catch (err) {
          process.stderr.write(err.message);
          process.exit(1);
        }
      `;
      const proc = Bun.spawn([BUN, "-e", script], {
        cwd: ROOT,
        stdout: "pipe",
        stderr: "pipe",
        env: { OPENAI_API_KEY: "sk-test-key-123" },
      });
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);
      const shape = JSON.parse(stdout);
      expect(shape.hasSend).toBe(true);
      expect(shape.hasStream).toBe(true);
      expect(shape.hasClose).toBe(true);
    });

    test("throws when provider is unavailable", async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "codex-test-interactive-unavail-"));
      try {
        const script = `
          const { CodexProvider } = require("${ROOT}/src/providers/codex.ts");
          try {
            CodexProvider.createInteractiveSession({ context: [] });
            process.stdout.write("no-error");
            process.exit(0);
          } catch (err) {
            process.stdout.write(err.message);
            process.exit(1);
          }
        `;
        const proc = Bun.spawn([BUN, "-e", script], {
          cwd: ROOT,
          stdout: "pipe",
          stderr: "pipe",
          env: { PATH: "/usr/bin:/bin", CODEX_HOME: tmpDir },
        });
        const stdout = await new Response(proc.stdout).text();
        const exitCode = await proc.exited;
        expect(exitCode).toBe(1);
        expect(stdout.toLowerCase()).toContain("openai_api_key");
      } finally {
        rmSync(tmpDir, { recursive: true });
      }
    });

    test("first send() call prepends context via buildPrompt()", async () => {
      // @openai/codex-sdk is ESM-only so require()-based monkey-patching doesn't
      // work. Instead, write a temporary bun:test file that uses mock.module()
      // (which integrates with Bun's ESM loader) and run it as a subprocess.
      const tmpDir = mkdtempSync(join(tmpdir(), "codex-buildprompt-test-"));
      const testFile = join(tmpDir, "buildprompt.test.ts");
      writeFileSync(testFile, `
        import { test, expect, mock } from "bun:test";

        let capturedMessage: string | undefined;

        mock.module("@openai/codex-sdk", () => ({
          Codex: class MockCodex {
            startThread(_opts: any) {
              return {
                runStreamed: async (msg: string) => {
                  capturedMessage = msg;
                  return { events: (async function*() {})() };
                },
              };
            }
          },
        }));

        const { CodexProvider } = await import("${ROOT}/src/providers/codex.ts");
        const { buildPrompt } = await import("${ROOT}/src/prompt.ts");

        test("first send prepends context", async () => {
          const session = CodexProvider.createInteractiveSession({ context: ["README.md", "src/"] });
          await session.send("hello world");
          for await (const _ of session.stream()) {}
          const expected = buildPrompt("hello world", ["README.md", "src/"]);
          expect(capturedMessage).toBe(expected);
        });
      `);
      try {
        const proc = Bun.spawn([BUN, "test", testFile], {
          cwd: ROOT,
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, OPENAI_API_KEY: "sk-test-key-123" },
        });
        const exitCode = await proc.exited;
        const stderr = await new Response(proc.stderr).text();
        expect(exitCode).toBe(0);
      } finally {
        rmSync(tmpDir, { recursive: true });
      }
    });
  });
});
