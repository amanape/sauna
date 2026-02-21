import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

const ROOT = resolve(import.meta.dir, "..");

describe("P1: CLI parsing", () => {
  describe("missing prompt", () => {
    test("exits non-zero when no prompt is provided", async () => {
      const proc = Bun.spawn(["bun", "index.ts"], {
        cwd: ROOT,
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      expect(exitCode).not.toBe(0);
    });
  });

  describe("prompt parsing", () => {
    test("special characters in prompt are preserved", async () => {
      const input = 'hello "world" & <foo> $bar';
      const proc = Bun.spawn(["bun", "index.ts", input], {
        cwd: ROOT,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, SAUNA_DRY_RUN: "1" },
      });
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;
      const parsed = JSON.parse(stdout);
      expect(parsed.prompt).toBe(input);
    });
  });

  describe("--count alone enables looping", () => {
    test("--count without --forever passes count through for fixed-count mode", async () => {
      const proc = Bun.spawn(
        ["bun", "index.ts", "--count", "5", "test prompt"],
        {
          cwd: ROOT,
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, SAUNA_DRY_RUN: "1" },
        },
      );
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.forever).toBe(false);
      expect(parsed.count).toBe(5);
    });
  });

  describe("--count validation", () => {
    test("--count 0 prints error and exits non-zero", async () => {
      const proc = Bun.spawn(
        ["bun", "index.ts", "--count", "0", "test prompt"],
        {
          cwd: ROOT,
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, SAUNA_DRY_RUN: "1" },
        },
      );
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("--count");
      expect(stderr).toContain("at least 1");
    });

    test("--count -1 prints error and exits non-zero", async () => {
      // cleye parses --count -1 as NaN (treats -1 as a flag), so this
      // triggers the NaN validation rather than the positive-integer check
      const proc = Bun.spawn(
        ["bun", "index.ts", "--count", "-1", "test prompt"],
        {
          cwd: ROOT,
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, SAUNA_DRY_RUN: "1" },
        },
      );
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("--count");
    });

    test("--count 1.5 prints error and exits non-zero", async () => {
      const proc = Bun.spawn(
        ["bun", "index.ts", "--count", "1.5", "test prompt"],
        {
          cwd: ROOT,
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, SAUNA_DRY_RUN: "1" },
        },
      );
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("--count");
      expect(stderr).toContain("whole number");
    });

    test("--count abc prints error and exits non-zero", async () => {
      const proc = Bun.spawn(
        ["bun", "index.ts", "--count", "abc", "test prompt"],
        {
          cwd: ROOT,
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, SAUNA_DRY_RUN: "1" },
        },
      );
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("--count");
    });
  });

  describe("--forever and --count mutual exclusivity", () => {
    test("--forever --count N prints error and exits non-zero", async () => {
      const proc = Bun.spawn(
        ["bun", "index.ts", "--forever", "--count", "3", "test prompt"],
        {
          cwd: ROOT,
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, SAUNA_DRY_RUN: "1" },
        },
      );
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("--forever");
      expect(stderr).toContain("--count");
    });
  });

  describe("--interactive and --count mutual exclusivity", () => {
    test("--interactive --forever prints error and exits non-zero", async () => {
      const proc = Bun.spawn(
        ["bun", "index.ts", "--interactive", "--forever", "test prompt"],
        {
          cwd: ROOT,
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, SAUNA_DRY_RUN: "1" },
        },
      );
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("--interactive");
      expect(stderr).toContain("--forever");
    });

    test("--interactive --count N prints error and exits non-zero", async () => {
      const proc = Bun.spawn(
        ["bun", "index.ts", "--interactive", "--count", "3", "test prompt"],
        {
          cwd: ROOT,
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, SAUNA_DRY_RUN: "1" },
        },
      );
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("--interactive");
      expect(stderr).toContain("--count");
    });
  });

  describe("--interactive without prompt", () => {
    test("--interactive without prompt does not exit with help (dry-run prints config)", async () => {
      const proc = Bun.spawn(["bun", "index.ts", "--interactive"], {
        cwd: ROOT,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, SAUNA_DRY_RUN: "1" },
      });
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.interactive).toBe(true);
    });
  });

  describe("startup error handling", () => {
    test("missing claude binary prints error to stderr and exits 1 — no stack trace", async () => {
      const proc = Bun.spawn(["bun", "index.ts", "test prompt"], {
        cwd: ROOT,
        stdout: "pipe",
        stderr: "pipe",
        // PATH has bun but no claude
        env: {
          PATH: `${process.execPath.replace(/\/bun$/, "")}:/usr/bin:/bin`,
        },
      });
      const stderr = await new Response(proc.stderr).text();
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      expect(exitCode).toBe(1);
      // Error should be on stderr
      expect(stderr.toLowerCase()).toContain("claude");
      // No stack traces on stdout or stderr
      expect(stdout).not.toContain("at ");
      expect(stderr).not.toContain("at findClaude");
      expect(stderr).not.toContain("at execSync");
    });
  });

  describe("--context paths", () => {
    test("multiple --context paths are collected into an array", async () => {
      const proc = Bun.spawn(
        ["bun", "index.ts", "-c", "foo.md", "-c", "bar/", "test prompt"],
        {
          cwd: ROOT,
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, SAUNA_DRY_RUN: "1" },
        },
      );
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;
      expect(stdout).toContain("foo.md");
      expect(stdout).toContain("bar/");
    });
  });

  describe("alias-list command", () => {
    const tmpDir = resolve(ROOT, "tests", ".tmp-cli-alias-test");

    function setupAliasFile(content: string) {
      const saunaDir = resolve(tmpDir, ".sauna");
      mkdirSync(saunaDir, { recursive: true });
      writeFileSync(resolve(saunaDir, "aliases.toml"), content);
    }

    beforeEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
      mkdirSync(tmpDir, { recursive: true });
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    // Helper that runs the CLI from the temp directory
    function spawnSauna(args: string[]) {
      return Bun.spawn(["bun", resolve(ROOT, "index.ts"), ...args], {
        cwd: tmpDir,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, SAUNA_DRY_RUN: "1" },
      });
    }

    test("`sauna alias-list` prints aliases when file exists", async () => {
      setupAliasFile(
        '[build]\nprompt = "do the build"\ncount = 3\n\n[review]\nprompt = "review code"\nmodel = "opus"\n',
      );
      const proc = spawnSauna(["alias-list"]);
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);
      expect(stdout).toContain("build");
      expect(stdout).toContain("review");
    });

    test("`sauna alias-list` prints helpful message when no aliases", async () => {
      const proc = spawnSauna(["alias-list"]);
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);
      expect(stdout).toContain("No aliases defined");
    });
  });

  describe("--provider flag", () => {
    test('--provider claude in dry-run includes provider: "claude"', async () => {
      const proc = Bun.spawn(
        ["bun", "index.ts", "--provider", "claude", "test prompt"],
        {
          cwd: ROOT,
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, SAUNA_DRY_RUN: "1" },
        },
      );
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.provider).toBe("claude");
    });

    test('--provider codex in dry-run includes provider: "codex"', async () => {
      const proc = Bun.spawn(
        ["bun", "index.ts", "--provider", "codex", "test prompt"],
        {
          cwd: ROOT,
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, SAUNA_DRY_RUN: "1" },
        },
      );
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.provider).toBe("codex");
    });

    test("dry-run JSON always includes provider field", async () => {
      const proc = Bun.spawn(["bun", "index.ts", "test prompt"], {
        cwd: ROOT,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, SAUNA_DRY_RUN: "1" },
      });
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed).toHaveProperty("provider");
    });

    test("--provider codex --interactive succeeds in dry-run", async () => {
      const proc = Bun.spawn(
        ["bun", "index.ts", "--provider", "codex", "--interactive"],
        {
          cwd: ROOT,
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, SAUNA_DRY_RUN: "1" },
        },
      );
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.provider).toBe("codex");
      expect(parsed.interactive).toBe(true);
    });

    test("--provider invalidname prints error and exits non-zero", async () => {
      const proc = Bun.spawn(
        ["bun", "index.ts", "--provider", "invalidname", "test prompt"],
        {
          cwd: ROOT,
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, SAUNA_DRY_RUN: "1" },
        },
      );
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("invalidname");
    });

    test("--model codex in dry-run infers Codex provider", async () => {
      const proc = Bun.spawn(
        ["bun", "index.ts", "--model", "codex", "test prompt"],
        {
          cwd: ROOT,
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, SAUNA_DRY_RUN: "1" },
        },
      );
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.provider).toBe("codex");
    });

    test("-p is accepted as shorthand for --provider", async () => {
      const proc = Bun.spawn(
        ["bun", "index.ts", "-p", "claude", "test prompt"],
        {
          cwd: ROOT,
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, SAUNA_DRY_RUN: "1" },
        },
      );
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.provider).toBe("claude");
    });
  });

  describe("alias resolution", () => {
    const tmpDir = resolve(ROOT, "tests", ".tmp-cli-resolution-test");

    function setupAliasFile(content: string) {
      const saunaDir = resolve(tmpDir, ".sauna");
      mkdirSync(saunaDir, { recursive: true });
      writeFileSync(resolve(saunaDir, "aliases.toml"), content);
    }

    beforeEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
      mkdirSync(tmpDir, { recursive: true });
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    function spawnSauna(args: string[]) {
      return Bun.spawn(["bun", resolve(ROOT, "index.ts"), ...args], {
        cwd: tmpDir,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, SAUNA_DRY_RUN: "1" },
      });
    }

    test("`sauna <alias>` expands and runs via SAUNA_DRY_RUN", async () => {
      setupAliasFile(
        '[build]\nprompt = ".sauna/prompts/build.md"\ncontext = [".sauna/specs", ".sauna/tasks.md"]\ncount = 5\n',
      );
      const proc = spawnSauna(["build"]);
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.prompt).toBe(".sauna/prompts/build.md");
      expect(parsed.count).toBe(5);
      expect(parsed.context).toContain(".sauna/specs");
      expect(parsed.context).toContain(".sauna/tasks.md");
    });

    test("`sauna <alias> -n 2` overrides count", async () => {
      setupAliasFile('[build]\nprompt = "do build"\ncount = 5\n');
      const proc = spawnSauna(["build", "-n", "2"]);
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.prompt).toBe("do build");
      expect(parsed.count).toBe(2);
    });

    test("`sauna <alias> -c /extra` appends context", async () => {
      setupAliasFile(
        '[build]\nprompt = "do build"\ncontext = [".sauna/specs"]\n',
      );
      const proc = spawnSauna(["build", "-c", "/extra"]);
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.context).toContain(".sauna/specs");
      expect(parsed.context).toContain("/extra");
    });

    test("`sauna <not-an-alias>` falls through unchanged", async () => {
      setupAliasFile('[build]\nprompt = "do build"\n');
      const proc = spawnSauna(["my-custom-prompt"]);
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.prompt).toBe("my-custom-prompt");
    });

    test("missing .sauna/aliases.toml — existing behavior unchanged", async () => {
      // No alias file in tmpDir
      const proc = spawnSauna(["test prompt here"]);
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.prompt).toBe("test prompt here");
    });

    test("`sauna alias-list` routes to alias-list subcommand, not alias resolution", async () => {
      const proc = spawnSauna(["alias-list"]);
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);
      expect(stdout).toContain("No aliases defined");
    });
  });
});
