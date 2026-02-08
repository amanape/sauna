import { resolve, relative } from "node:path";
import { readdir, stat } from "node:fs/promises";
import type { Tool } from "../types";

export function createFileSearchTool(codebasePath: string): Tool {
  const normalizedBase = resolve(codebasePath);

  return {
    name: "file_search",
    description:
      "Search across the codebase for a text or regex pattern, returning matching file paths, line numbers, and line contents.",
    parameters: {
      pattern: {
        type: "string",
        description: "Text or regex pattern to search for",
        required: true,
      },
    },
    async execute(args: Record<string, unknown>): Promise<string> {
      const pattern = String(args.pattern);

      let regex: RegExp;
      try {
        regex = new RegExp(pattern);
      } catch {
        return `Error: Invalid regex pattern — ${pattern}`;
      }

      const matches: string[] = [];
      const entries = await readdir(normalizedBase, { recursive: true });

      // Sort for deterministic output order
      entries.sort();

      for (const entry of entries) {
        const fullPath = resolve(normalizedBase, entry);
        const fileStat = await stat(fullPath);
        if (!fileStat.isFile()) continue;

        try {
          const content = await Bun.file(fullPath).text();

          // Skip binary files (contain null bytes)
          if (content.includes("\0")) continue;

          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]!;
            if (regex.test(line)) {
              const relPath = relative(normalizedBase, fullPath);
              matches.push(`${relPath}:${i + 1}: ${line}`);
            }
          }
        } catch {
          // Skip files that can't be read
          continue;
        }
      }

      if (matches.length === 0) {
        return `No matches found for pattern: ${pattern}`;
      }

      return matches.join("\n");
    },
  };
}
