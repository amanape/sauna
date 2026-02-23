import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { rmSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { isWindows } from "./platform";

const BINARY = isWindows ? "./sauna.exe" : "./sauna";

describe("P0: package setup", () => {
  test("package.json has bin field pointing to index.ts", async () => {
    const pkg = await Bun.file("package.json").json();
    expect(pkg.bin).toEqual({ sauna: "./index.ts" });
  });

  test("package.json has build script with bun build --compile", async () => {
    const pkg = await Bun.file("package.json").json();
    expect(pkg.scripts?.build).toBe(
      "bun build ./index.ts --compile --outfile sauna",
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
    const file = Bun.file(BINARY);
    expect(await file.exists()).toBe(true);
  });

  test("sauna with no args prints help and exits non-zero", async () => {
    const proc = Bun.spawn([BINARY], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();

    expect(exitCode).not.toBe(0);
    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("--help");
  });

  test("sauna --version prints the correct version from a different directory", async () => {
    const pkg = await Bun.file("package.json").json();
    const tmpDir = await import("node:os").then((os) => os.tmpdir());
    const binaryPath = await import("node:path").then((path) =>
      path.resolve(BINARY),
    );

    // Run the binary from a temp directory — no package.json nearby
    const proc = Bun.spawn([binaryPath, "--version"], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: tmpDir,
    });
    const exitCode = await proc.exited;
    const stdout = (await new Response(proc.stdout).text()).trim();

    expect(exitCode).toBe(0);
    expect(stdout).toContain(pkg.version);
  });
});

describe("P1: cross-platform compilation", () => {
  // Expected targets for build:all — Bun does not support windows-arm64,
  // so we compile for five targets instead of six.
  const expectedBinaries = [
    "dist/sauna-darwin-arm64",
    "dist/sauna-darwin-x64",
    "dist/sauna-linux-x64",
    "dist/sauna-linux-arm64",
    "dist/sauna-windows-x64.exe",
  ];

  test("package.json has a build:all script", async () => {
    const pkg = await Bun.file("package.json").json();
    expect(pkg.scripts?.["build:all"]).toBeDefined();
  });

  test("build:all script references all five targets", async () => {
    const pkg = await Bun.file("package.json").json();
    const script = pkg.scripts?.["build:all"] as string;
    expect(script).toContain("bun-darwin-arm64");
    expect(script).toContain("bun-darwin-x64");
    expect(script).toContain("bun-linux-x64");
    expect(script).toContain("bun-linux-arm64");
    expect(script).toContain("bun-windows-x64");
  });

  test("build:all outputs to dist/ directory", async () => {
    const pkg = await Bun.file("package.json").json();
    const script = pkg.scripts?.["build:all"] as string;
    expect(script).toContain("dist/");
  });

  // Cross-compiling five targets is slow — allow up to 60 seconds.
  // Skip on Windows: Bun can't extract darwin/linux executables on Windows.
  test.skipIf(isWindows)(
    "build:all produces all expected binaries",
    async () => {
      // Clean dist/ before building
      rmSync("dist", { recursive: true, force: true });

      const proc = Bun.spawn(["bun", "run", "build:all"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      await proc.exited;
      if (proc.exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        throw new Error(`bun run build:all failed: ${stderr}`);
      }

      for (const binary of expectedBinaries) {
        const file = Bun.file(binary);
        expect(await file.exists()).toBe(true);
      }
    },
    60_000,
  );

  test("existing build script is unchanged", async () => {
    const pkg = await Bun.file("package.json").json();
    expect(pkg.scripts?.build).toBe(
      "bun build ./index.ts --compile --outfile sauna",
    );
  });
});

describe("P2: automated releases", () => {
  const workflowPath = ".github/workflows/release.yml";

  let workflow: any;

  beforeAll(async () => {
    const content = await Bun.file(workflowPath).text();
    workflow = parseYaml(content);
  });

  test("release workflow file exists", async () => {
    expect(await Bun.file(workflowPath).exists()).toBe(true);
  });

  test("workflow triggers on push to main branch", () => {
    const branches = workflow.on?.push?.branches;
    expect(branches).toBeDefined();
    expect(branches).toContainEqual("main");
  });

  test("workflow installs Bun", () => {
    const steps = workflow.jobs?.["build-and-publish"]?.steps;
    expect(steps).toBeDefined();
    const bunStep = steps.find(
      (s: any) =>
        typeof s.uses === "string" && s.uses.startsWith("oven-sh/setup-bun"),
    );
    expect(bunStep).toBeDefined();
  });

  test("workflow installs dependencies", () => {
    const steps = workflow.jobs?.["build-and-publish"]?.steps;
    const installStep = steps.find(
      (s: any) => typeof s.run === "string" && s.run.includes("bun install"),
    );
    expect(installStep).toBeDefined();
  });

  test("build-and-publish job is gated on release_created output", () => {
    const job = workflow.jobs?.["build-and-publish"];
    expect(job).toBeDefined();
    expect(job.if).toContain("release_created");
  });

  test("workflow runs build:all to produce binaries", () => {
    const steps = workflow.jobs?.["build-and-publish"]?.steps;
    const buildStep = steps.find(
      (s: any) => typeof s.run === "string" && s.run.includes("build:all"),
    );
    expect(buildStep).toBeDefined();
  });

  test("workflow creates a GitHub Release with binaries attached", () => {
    const steps = workflow.jobs?.["build-and-publish"]?.steps;
    const releaseStep = steps.find(
      (s: any) =>
        typeof s.uses === "string" &&
        s.uses.startsWith("softprops/action-gh-release"),
    );
    expect(releaseStep).toBeDefined();
    // The release step should attach dist/ binaries
    const files = releaseStep.with?.files;
    expect(files).toBeDefined();
    expect(files).toContain("dist/");
  });
});
