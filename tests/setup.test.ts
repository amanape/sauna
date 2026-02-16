import { test, expect, describe, beforeAll } from "bun:test";

describe("P0: package setup", () => {
  test("package.json has bin field pointing to index.ts", async () => {
    const pkg = await Bun.file("package.json").json();
    expect(pkg.bin).toBe("./sauna");
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

describe("P5: binary compilation", () => {
  // Build the binary once before all tests in this suite.
  // The compiled binary must behave identically to `bun index.ts`.
  beforeAll(async () => {
    const proc = Bun.spawn(["bun", "run", "build"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    if (proc.exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`bun run build failed: ${stderr}`);
    }
  });

  test("bun run build produces a sauna binary", async () => {
    const file = Bun.file("./sauna");
    expect(await file.exists()).toBe(true);
  });

  test("sauna with no args prints help and exits non-zero", async () => {
    const proc = Bun.spawn(["./sauna"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();

    expect(exitCode).not.toBe(0);
    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("--help");
  });
});
