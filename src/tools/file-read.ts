import { createTool } from "@mastra/core/tools";
import * as z from "zod";
import { resolve } from "node:path";
import { stat } from "node:fs/promises";

export function createFileReadTool(codebasePath: string) {
  const normalizedBase = resolve(codebasePath);

  return createTool({
    id: "file_read",
    description: "Read the contents of a file at the given path, relative to the codebase root.",
    inputSchema: z.object({
      path: z.string().describe("File path to read, relative to the codebase root"),
    }),
    async execute({ path: filePath }) {
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
  });
}
