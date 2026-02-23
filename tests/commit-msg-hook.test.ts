import { test, expect, describe } from "bun:test";
import { existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const PROJECT_ROOT = join(import.meta.dir, "..");
const COMMITLINT_BIN = join(PROJECT_ROOT, "node_modules/.bin/commitlint");

describe("commit-msg-hook", () => {
  test("simple-git-hooks is in devDependencies", async () => {
    const pkg = await import("../package.json");
    expect(Object.keys(pkg.devDependencies)).toContain("simple-git-hooks");
  });

  test("package.json has simple-git-hooks.commit-msg set to 'bunx commitlint --edit $1'", async () => {
    const pkg = await import("../package.json");
    const hooks = (pkg as any)["simple-git-hooks"];
    expect(hooks).toBeDefined();
    expect(hooks["commit-msg"]).toBe("bunx commitlint --edit $1");
  });

  test("package.json has scripts.prepare set to 'bunx simple-git-hooks'", async () => {
    const pkg = await import("../package.json");
    expect((pkg.scripts as any).prepare).toBe("bunx simple-git-hooks");
  });

  test(".git/hooks/commit-msg is installed by bunx simple-git-hooks", async () => {
    const proc = Bun.spawn(["bunx", "simple-git-hooks"], {
      cwd: PROJECT_ROOT,
      stderr: "pipe",
      stdout: "pipe",
    });
    await proc.exited;
    expect(existsSync(join(PROJECT_ROOT, ".git/hooks/commit-msg"))).toBe(true);
  });

  test("commitlint rejects non-conventional commit message", async () => {
    const tmpFile = join(tmpdir(), `commit-msg-invalid-${Date.now()}`);
    await Bun.write(tmpFile, "bad message");
    const proc = Bun.spawn([COMMITLINT_BIN, "--edit", tmpFile], {
      cwd: PROJECT_ROOT,
      stderr: "pipe",
      stdout: "pipe",
    });
    const exitCode = await proc.exited;
    expect(exitCode).not.toBe(0);
  });

  test("commitlint accepts conventional commit message", async () => {
    const tmpFile = join(tmpdir(), `commit-msg-valid-${Date.now()}`);
    await Bun.write(tmpFile, "chore: valid message");
    const proc = Bun.spawn([COMMITLINT_BIN, "--edit", tmpFile], {
      cwd: PROJECT_ROOT,
      stderr: "pipe",
      stdout: "pipe",
    });
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
  });
});
