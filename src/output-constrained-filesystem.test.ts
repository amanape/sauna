import { test, expect, describe, afterAll } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { realpathSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { LocalFilesystem } from "@mastra/core/workspace";
import { OutputConstrainedFilesystem } from "./output-constrained-filesystem";

// Set up temp directory structure:
//   base/
//     output/         ← allowed write target
//     src/            ← read-only (reads OK, writes blocked)
//       hello.txt
const rawBase = join(tmpdir(), `method6-ocfs-${Date.now()}`);
mkdirSync(join(rawBase, "output"), { recursive: true });
mkdirSync(join(rawBase, "src"), { recursive: true });
const base = realpathSync(rawBase);
writeFileSync(join(base, "src", "hello.txt"), "hello world");

afterAll(() => rmSync(base, { recursive: true, force: true }));

function makeFs(outputDir: string = "output") {
  const inner = new LocalFilesystem({ basePath: base, contained: true });
  return new OutputConstrainedFilesystem(inner, outputDir);
}

describe("OutputConstrainedFilesystem", () => {
  describe("read operations are unrestricted", () => {
    test("readFile works for files outside output directory", async () => {
      const fs = makeFs();
      await fs.init?.();
      const content = await fs.readFile("src/hello.txt");
      expect(content.toString()).toBe("hello world");
    });

    test("readdir works for directories outside output directory", async () => {
      const fs = makeFs();
      await fs.init?.();
      const entries = await fs.readdir("src");
      const names = entries.map((e) => e.name);
      expect(names).toContain("hello.txt");
    });

    test("exists works for files outside output directory", async () => {
      const fs = makeFs();
      await fs.init?.();
      expect(await fs.exists("src/hello.txt")).toBe(true);
    });

    test("stat works for files outside output directory", async () => {
      const fs = makeFs();
      await fs.init?.();
      const stat = await fs.stat("src/hello.txt");
      expect(stat.type).toBe("file");
    });
  });

  describe("writes within output directory succeed", () => {
    test("writeFile to output directory succeeds", async () => {
      const fs = makeFs();
      await fs.init?.();
      await fs.writeFile("output/test.txt", "content");
      const content = await fs.readFile("output/test.txt");
      expect(content.toString()).toBe("content");
    });

    test("mkdir inside output directory succeeds", async () => {
      const fs = makeFs();
      await fs.init?.();
      await fs.mkdir("output/sub", { recursive: true });
      expect(await fs.exists("output/sub")).toBe(true);
    });

    test("appendFile inside output directory succeeds", async () => {
      const fs = makeFs();
      await fs.init?.();
      await fs.writeFile("output/append.txt", "first");
      await fs.appendFile("output/append.txt", " second");
      const content = await fs.readFile("output/append.txt");
      expect(content.toString()).toBe("first second");
    });

    test("deleteFile inside output directory succeeds", async () => {
      const fs = makeFs();
      await fs.init?.();
      await fs.writeFile("output/delete-me.txt", "bye");
      await fs.deleteFile("output/delete-me.txt");
      expect(await fs.exists("output/delete-me.txt")).toBe(false);
    });
  });

  describe("writes outside output directory are blocked", () => {
    test("writeFile outside output directory throws", async () => {
      const fs = makeFs();
      await fs.init?.();
      await expect(fs.writeFile("src/hack.txt", "bad")).rejects.toThrow(
        "output directory",
      );
    });

    test("writeFile to root of codebase throws", async () => {
      const fs = makeFs();
      await fs.init?.();
      await expect(fs.writeFile("root-file.txt", "bad")).rejects.toThrow(
        "output directory",
      );
    });

    test("appendFile outside output directory throws", async () => {
      const fs = makeFs();
      await fs.init?.();
      await expect(fs.appendFile("src/hello.txt", "bad")).rejects.toThrow(
        "output directory",
      );
    });

    test("deleteFile outside output directory throws", async () => {
      const fs = makeFs();
      await fs.init?.();
      await expect(fs.deleteFile("src/hello.txt")).rejects.toThrow(
        "output directory",
      );
    });

    test("mkdir outside output directory throws", async () => {
      const fs = makeFs();
      await fs.init?.();
      await expect(fs.mkdir("forbidden-dir")).rejects.toThrow(
        "output directory",
      );
    });

    test("rmdir outside output directory throws", async () => {
      const fs = makeFs();
      await fs.init?.();
      await expect(fs.rmdir("src")).rejects.toThrow("output directory");
    });

    test("copyFile with destination outside output directory throws", async () => {
      const fs = makeFs();
      await fs.init?.();
      await fs.writeFile("output/source.txt", "data");
      await expect(
        fs.copyFile("output/source.txt", "src/copied.txt"),
      ).rejects.toThrow("output directory");
    });

    test("moveFile with destination outside output directory throws", async () => {
      const fs = makeFs();
      await fs.init?.();
      await fs.writeFile("output/to-move.txt", "data");
      await expect(
        fs.moveFile("output/to-move.txt", "src/moved.txt"),
      ).rejects.toThrow("output directory");
    });
  });

  describe("delegates identity and lifecycle to inner filesystem", () => {
    test("id matches inner filesystem", () => {
      const inner = new LocalFilesystem({ basePath: base, contained: true });
      const fs = new OutputConstrainedFilesystem(inner, "output");
      expect(fs.id).toBe(inner.id);
    });

    test("name matches inner filesystem", () => {
      const inner = new LocalFilesystem({ basePath: base, contained: true });
      const fs = new OutputConstrainedFilesystem(inner, "output");
      expect(fs.name).toBe(inner.name);
    });

    test("provider matches inner filesystem", () => {
      const inner = new LocalFilesystem({ basePath: base, contained: true });
      const fs = new OutputConstrainedFilesystem(inner, "output");
      expect(fs.provider).toBe(inner.provider);
    });

    test("basePath matches inner filesystem", () => {
      const inner = new LocalFilesystem({ basePath: base, contained: true });
      const fs = new OutputConstrainedFilesystem(inner, "output");
      expect(fs.basePath).toBe(inner.basePath);
    });
  });

  describe("path normalization", () => {
    test("handles leading slash in path", async () => {
      const fs = makeFs();
      await fs.init?.();
      await fs.writeFile("/output/slash.txt", "ok");
      const content = await fs.readFile("output/slash.txt");
      expect(content.toString()).toBe("ok");
    });

    test("handles nested paths within output directory", async () => {
      const fs = makeFs();
      await fs.init?.();
      await fs.mkdir("output/deep/nested", { recursive: true });
      await fs.writeFile("output/deep/nested/file.txt", "deep");
      const content = await fs.readFile("output/deep/nested/file.txt");
      expect(content.toString()).toBe("deep");
    });

    test("blocks path traversal attempt from output directory", async () => {
      const fs = makeFs();
      await fs.init?.();
      await expect(
        fs.writeFile("output/../src/escape.txt", "bad"),
      ).rejects.toThrow("output directory");
    });
  });
});
