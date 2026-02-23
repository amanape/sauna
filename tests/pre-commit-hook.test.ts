import { test, expect, describe } from "bun:test";
import { join } from "path";

const PROJECT_ROOT = join(import.meta.dir, "..");

describe("lint-staged-dependency", () => {
  test("lint-staged is in devDependencies", async () => {
    const pkg = await Bun.file(join(PROJECT_ROOT, "package.json")).json();
    expect(Object.keys(pkg.devDependencies ?? {})).toContain("lint-staged");
  });

  test("lint-staged binary exists in node_modules/.bin", async () => {
    const bin = Bun.file(join(PROJECT_ROOT, "node_modules/.bin/lint-staged"));
    expect(await bin.exists()).toBe(true);
  });
});

describe("staged-typescript-linting", () => {
  test("lint-staged config exists in package.json", async () => {
    const pkg = await Bun.file(join(PROJECT_ROOT, "package.json")).json();
    expect(pkg["lint-staged"]).toBeDefined();
  });

  test("lint-staged maps *.{ts,mts} to eslint --fix", async () => {
    const pkg = await Bun.file(join(PROJECT_ROOT, "package.json")).json();
    const config = pkg["lint-staged"];
    const commands: string[] = [config["*.{ts,mts}"]].flat();
    expect(
      commands.some((cmd) => cmd.includes("eslint") && cmd.includes("--fix")),
    ).toBe(true);
  });
});

describe("staged-file-formatting", () => {
  test("lint-staged maps *.{ts,mts} to prettier --write", async () => {
    const pkg = await Bun.file(join(PROJECT_ROOT, "package.json")).json();
    const config = pkg["lint-staged"];
    const commands: string[] = [config["*.{ts,mts}"]].flat();
    expect(
      commands.some(
        (cmd) => cmd.includes("prettier") && cmd.includes("--write"),
      ),
    ).toBe(true);
  });

  test("lint-staged maps *.{json,md,yml,yaml,mjs} to prettier --write", async () => {
    const pkg = await Bun.file(join(PROJECT_ROOT, "package.json")).json();
    const config = pkg["lint-staged"];
    const commands: string[] = [config["*.{json,md,yml,yaml,mjs}"]].flat();
    expect(
      commands.some(
        (cmd) => cmd.includes("prettier") && cmd.includes("--write"),
      ),
    ).toBe(true);
  });
});

describe("pre-commit-hook-wiring", () => {
  test("simple-git-hooks.pre-commit is set to bunx lint-staged", async () => {
    const pkg = await Bun.file(join(PROJECT_ROOT, "package.json")).json();
    expect(pkg["simple-git-hooks"]["pre-commit"]).toBe("bunx lint-staged");
  });

  test("simple-git-hooks.commit-msg is preserved", async () => {
    const pkg = await Bun.file(join(PROJECT_ROOT, "package.json")).json();
    expect(pkg["simple-git-hooks"]["commit-msg"]).toBe(
      "bunx commitlint --edit $1",
    );
  });

  test(".git/hooks/pre-commit exists", async () => {
    const hook = Bun.file(join(PROJECT_ROOT, ".git/hooks/pre-commit"));
    expect(await hook.exists()).toBe(true);
  });

  test(".git/hooks/pre-commit contains lint-staged", async () => {
    const content = await Bun.file(
      join(PROJECT_ROOT, ".git/hooks/pre-commit"),
    ).text();
    expect(content).toContain("lint-staged");
  });

  test(".git/hooks/commit-msg still contains commitlint", async () => {
    const content = await Bun.file(
      join(PROJECT_ROOT, ".git/hooks/commit-msg"),
    ).text();
    expect(content).toContain("commitlint");
  });
});
