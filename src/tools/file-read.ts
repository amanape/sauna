import { resolve } from "node:path";
import { stat } from "node:fs/promises";
import type { Tool } from "../types";

export function createFileReadTool(codebasePath: string): Tool {
  const normalizedBase = resolve(codebasePath);

  return {
    name: "file_read",
    description: "Read the contents of a file at the given path, relative to the codebase root.",
    parameters: {
      path: {
        type: "string",
        description: "File path to read, relative to the codebase root",
        required: true,
      },
    },
    async execute(args: Record<string, unknown>): Promise<string> {
      const filePath = String(args.path);
      const resolved = resolve(normalizedBase, filePath);

      if (!resolved.startsWith(normalizedBase + "/") && resolved !== normalizedBase) {
        return `Error: Path "${filePath}" is outside the codebase directory.`;
      }

      try {
        const stats = await stat(resolved);

        if (stats.isDirectory()) {
          return `Error: "${filePath}" is a directory, not a file.`;
        }

        return await Bun.file(resolved).text();
      } catch (err: unknown) {
        if (err instanceof Error && "code" in err && err.code === "ENOENT") {
          return `Error: File not found — ${filePath}`;
        }
        const msg = err instanceof Error ? err.message : String(err);
        return `Error reading "${filePath}": ${msg}`;
      }
    },
  };
}
