import { test, expect, describe } from "bun:test";
import { loadHooks } from "./hooks-loader";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function makeTmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "hooks-loader-"));
}

describe("loadHooks", () => {
  test("returns empty array when .sauna/hooks.json does not exist", async () => {
    const dir = await makeTmpDir();
    try {
      const hooks = await loadHooks(dir);
      expect(hooks).toEqual([]);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("parses array of shell commands from hooks.json", async () => {
    const dir = await makeTmpDir();
    try {
      const saunaDir = join(dir, ".sauna");
      await Bun.write(join(saunaDir, "hooks.json"), JSON.stringify([
        "bun test",
        "bun run lint",
      ]));

      const hooks = await loadHooks(dir);
      expect(hooks).toEqual(["bun test", "bun run lint"]);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("returns empty array when hooks.json contains an empty array", async () => {
    const dir = await makeTmpDir();
    try {
      const saunaDir = join(dir, ".sauna");
      await Bun.write(join(saunaDir, "hooks.json"), "[]");

      const hooks = await loadHooks(dir);
      expect(hooks).toEqual([]);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("throws when hooks.json is not a JSON array", async () => {
    const dir = await makeTmpDir();
    try {
      const saunaDir = join(dir, ".sauna");
      await Bun.write(join(saunaDir, "hooks.json"), JSON.stringify({ cmd: "bun test" }));

      await expect(loadHooks(dir)).rejects.toThrow("hooks.json must contain a JSON array");
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("throws when array contains non-string elements", async () => {
    const dir = await makeTmpDir();
    try {
      const saunaDir = join(dir, ".sauna");
      await Bun.write(join(saunaDir, "hooks.json"), JSON.stringify(["bun test", 42]));

      await expect(loadHooks(dir)).rejects.toThrow("every element in hooks.json must be a string");
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("throws when hooks.json contains invalid JSON", async () => {
    const dir = await makeTmpDir();
    try {
      const saunaDir = join(dir, ".sauna");
      await Bun.write(join(saunaDir, "hooks.json"), "not json {{{");

      await expect(loadHooks(dir)).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
