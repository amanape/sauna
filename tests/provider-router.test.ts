import { test, expect, describe } from "bun:test";
import { resolveProvider } from "../src/cli";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

describe("resolveProvider - defaults", () => {
  test("undefined returns anthropic with model undefined", () => {
    expect(resolveProvider(undefined)).toEqual({
      provider: "anthropic",
      model: undefined,
    });
  });

  test("empty string returns anthropic with model undefined", () => {
    expect(resolveProvider("")).toEqual({
      provider: "anthropic",
      model: undefined,
    });
  });
});

describe("resolveProvider - bare Anthropic aliases", () => {
  test("'sonnet' resolves to anthropic full model ID", () => {
    expect(resolveProvider("sonnet")).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    });
  });

  test("'opus' resolves to anthropic full model ID", () => {
    expect(resolveProvider("opus")).toEqual({
      provider: "anthropic",
      model: "claude-opus-4-20250514",
    });
  });

  test("'haiku' resolves to anthropic full model ID", () => {
    expect(resolveProvider("haiku")).toEqual({
      provider: "anthropic",
      model: "claude-haiku-4-20250414",
    });
  });
});

describe("resolveProvider - bare OpenAI aliases", () => {
  test("'gpt-4o' routes to openai", () => {
    expect(resolveProvider("gpt-4o")).toEqual({
      provider: "openai",
      model: "gpt-4o",
    });
  });

  test("'o1' routes to openai", () => {
    expect(resolveProvider("o1")).toEqual({
      provider: "openai",
      model: "o1",
    });
  });
});

describe("resolveProvider - unknown bare strings (backward compat)", () => {
  test("unknown bare string defaults to anthropic with model passed through", () => {
    expect(resolveProvider("my-custom-model")).toEqual({
      provider: "anthropic",
      model: "my-custom-model",
    });
  });

  test("full anthropic model ID passes through to anthropic", () => {
    expect(resolveProvider("claude-sonnet-4-20250514")).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    });
  });
});

describe("resolveProvider - colon syntax", () => {
  test("'openai:gpt-4o' yields openai provider with gpt-4o model", () => {
    expect(resolveProvider("openai:gpt-4o")).toEqual({
      provider: "openai",
      model: "gpt-4o",
    });
  });

  test("'openai:o1' yields openai provider with o1 model", () => {
    expect(resolveProvider("openai:o1")).toEqual({
      provider: "openai",
      model: "o1",
    });
  });

  test("'openai:custom-model' yields openai with pass-through model", () => {
    expect(resolveProvider("openai:custom-model")).toEqual({
      provider: "openai",
      model: "custom-model",
    });
  });

  test("'anthropic:sonnet' resolves alias to full model ID", () => {
    expect(resolveProvider("anthropic:sonnet")).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    });
  });

  test("'anthropic:opus' resolves alias to full model ID", () => {
    expect(resolveProvider("anthropic:opus")).toEqual({
      provider: "anthropic",
      model: "claude-opus-4-20250514",
    });
  });

  test("'anthropic:claude-opus-4-20250514' passes through without modification", () => {
    expect(resolveProvider("anthropic:claude-opus-4-20250514")).toEqual({
      provider: "anthropic",
      model: "claude-opus-4-20250514",
    });
  });

  test("'gpt-4o:latest' has no known provider prefix — treated as bare string defaulting to anthropic", () => {
    expect(resolveProvider("gpt-4o:latest")).toEqual({
      provider: "anthropic",
      model: "gpt-4o:latest",
    });
  });
});

describe("resolveProvider - unknown provider prefix (fatal)", () => {
  function withMockedExit(fn: () => void): { errMessages: string[]; exitCode: number | undefined } {
    const errMessages: string[] = [];
    const errWrite = (s: string) => errMessages.push(s);
    const origExit = process.exit;
    let exitCode: number | undefined;
    (process as any).exit = (code: number) => {
      exitCode = code;
      throw new Error("process.exit called");
    };
    try {
      fn();
    } catch {
      // expected: process.exit throws
    } finally {
      (process as any).exit = origExit;
    }
    return { errMessages, exitCode };
  }

  test("'google:foo' calls errWrite and exits with code 1", () => {
    const errMessages: string[] = [];
    const { exitCode } = withMockedExit(() => resolveProvider("google:foo", (s) => errMessages.push(s)));
    expect(exitCode).toBe(1);
    expect(errMessages.length).toBeGreaterThan(0);
  });

  test("error message for unknown provider mentions valid providers", () => {
    const errMessages: string[] = [];
    withMockedExit(() => resolveProvider("google:foo", (s) => errMessages.push(s)));
    const combined = errMessages.join("");
    expect(combined).toContain("anthropic");
    expect(combined).toContain("openai");
  });

  test("error message for unknown provider lists models for each provider", () => {
    const errMessages: string[] = [];
    withMockedExit(() => resolveProvider("google:foo", (s) => errMessages.push(s)));
    const combined = errMessages.join("");
    // Spec: lists Anthropic models
    expect(combined).toContain("sonnet");
    expect(combined).toContain("opus");
    expect(combined).toContain("haiku");
    // Spec: lists OpenAI models
    expect(combined).toContain("gpt-4o");
    expect(combined).toContain("o1");
  });

  test("error message for unknown provider names the bad provider", () => {
    const errMessages: string[] = [];
    withMockedExit(() => resolveProvider("google:foo", (s) => errMessages.push(s)));
    const combined = errMessages.join("");
    expect(combined).toContain("google");
  });

  test("'azure:gpt-4' is treated as unknown provider and exits", () => {
    const errMessages: string[] = [];
    const { exitCode } = withMockedExit(() => resolveProvider("azure:gpt-4", (s) => errMessages.push(s)));
    expect(exitCode).toBe(1);
  });

  test("errWrite defaults to process.stderr.write when not provided", () => {
    const origExit = process.exit;
    let exitCalled = false;
    (process as any).exit = () => {
      exitCalled = true;
      throw new Error("exit");
    };
    let stderrOutput = "";
    const origStderr = process.stderr.write.bind(process.stderr);
    process.stderr.write = (s: any) => {
      stderrOutput += typeof s === "string" ? s : String(s);
      return true;
    };
    try {
      resolveProvider("google:foo");
    } catch {}
    (process as any).exit = origExit;
    process.stderr.write = origStderr;
    expect(exitCalled).toBe(true);
    expect(stderrOutput.length).toBeGreaterThan(0);
  });
});

describe("resolveProvider - SAUNA_DRY_RUN integration", () => {
  test("--model sonnet emits provider=anthropic and resolvedModel in dry-run output", async () => {
    const proc = Bun.spawn(
      ["bun", "index.ts", "--model", "sonnet", "test prompt"],
      {
        cwd: ROOT,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, SAUNA_DRY_RUN: "1" },
      }
    );
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    const parsed = JSON.parse(stdout);
    expect(parsed.provider).toBe("anthropic");
    expect(parsed.resolvedModel).toBe("claude-sonnet-4-20250514");
  });

  test("--model gpt-4o emits provider=openai in dry-run output", async () => {
    const proc = Bun.spawn(
      ["bun", "index.ts", "--model", "gpt-4o", "test prompt"],
      {
        cwd: ROOT,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, SAUNA_DRY_RUN: "1" },
      }
    );
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    const parsed = JSON.parse(stdout);
    expect(parsed.provider).toBe("openai");
    expect(parsed.resolvedModel).toBe("gpt-4o");
  });

  test("--model openai:o1 emits provider=openai and resolvedModel=o1 in dry-run output", async () => {
    const proc = Bun.spawn(
      ["bun", "index.ts", "--model", "openai:o1", "test prompt"],
      {
        cwd: ROOT,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, SAUNA_DRY_RUN: "1" },
      }
    );
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    const parsed = JSON.parse(stdout);
    expect(parsed.provider).toBe("openai");
    expect(parsed.resolvedModel).toBe("o1");
  });

  test("no --model flag emits provider=anthropic and resolvedModel undefined in dry-run output", async () => {
    const proc = Bun.spawn(
      ["bun", "index.ts", "test prompt"],
      {
        cwd: ROOT,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, SAUNA_DRY_RUN: "1" },
      }
    );
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    const parsed = JSON.parse(stdout);
    expect(parsed.provider).toBe("anthropic");
    expect(parsed.resolvedModel).toBeUndefined();
  });

  test("--model google:foo exits non-zero with error on stderr", async () => {
    const proc = Bun.spawn(
      ["bun", "index.ts", "--model", "google:foo", "test prompt"],
      {
        cwd: ROOT,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, SAUNA_DRY_RUN: "1" },
      }
    );
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("anthropic");
  });
});
