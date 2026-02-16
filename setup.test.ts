import { test, expect, describe } from "bun:test";

describe("P0: package setup", () => {
  test("package.json has bin field pointing to index.ts", async () => {
    const pkg = await Bun.file("package.json").json();
    expect(pkg.bin).toBe("./index.ts");
  });

  test("package.json has build script with bun build --compile", async () => {
    const pkg = await Bun.file("package.json").json();
    expect(pkg.scripts?.build).toBe(
      "bun build ./index.ts --compile --outfile sauna"
    );
  });

  test("package.json has a version field", async () => {
    const pkg = await Bun.file("package.json").json();
    expect(pkg.version).toBeDefined();
    expect(typeof pkg.version).toBe("string");
  });

  test("cleye is listed as a dependency", async () => {
    const pkg = await Bun.file("package.json").json();
    expect(pkg.dependencies?.cleye).toBeDefined();
  });

  test("@anthropic-ai/claude-agent-sdk is listed as a dependency", async () => {
    const pkg = await Bun.file("package.json").json();
    expect(pkg.dependencies?.["@anthropic-ai/claude-agent-sdk"]).toBeDefined();
  });

  test("cleye is importable", async () => {
    const { cli } = await import("cleye");
    expect(typeof cli).toBe("function");
  });

  test(".gitignore includes sauna binary", async () => {
    const gitignore = await Bun.file(".gitignore").text();
    expect(gitignore).toContain("sauna");
  });
});
