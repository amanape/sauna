import { tool } from "ai";
import * as z from "zod";
import { resolve, dirname } from "node:path";
import { mkdir } from "node:fs/promises";

export function createFileWriteTool(outputPath: string) {
  const normalizedBase = resolve(outputPath);

  return tool({
    description: "Write content to a file at the given path, relative to the output directory. Creates parent directories as needed.",
    inputSchema: z.object({
      path: z.string().describe("File path to write, relative to the output directory"),
      content: z.string().describe("The full content to write to the file"),
    }),
    async execute({ path: filePath, content }) {
      const resolved = resolve(normalizedBase, filePath);

      if (!resolved.startsWith(normalizedBase + "/") && resolved !== normalizedBase) {
        return `Error: Path "${filePath}" is outside the output directory.`;
      }

      try {
        await mkdir(dirname(resolved), { recursive: true });
        await Bun.write(resolved, content);
        return `Wrote ${filePath}`;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Error writing "${filePath}": ${msg}`;
      }
    },
  });
}
