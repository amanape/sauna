// Output Writer — tools for writing JTBD and spec files
// Traces to: specs/output-writer.md

import type { Tool } from "../types";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function validateSlug(value: unknown, label: string): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    return `Error: ${label} is required and must be a non-empty string.`;
  }
  if (!SLUG_PATTERN.test(value)) {
    return `Error: ${label} must be lowercase, hyphenated, with no spaces or special characters.`;
  }
  return null;
}

function validateContent(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    return "Error: content is required and must be a non-empty string.";
  }
  return null;
}

export function createWriteJtbdTool(outputBasePath: string): Tool {
  return {
    name: "write_jtbd",
    description:
      "Write a JTBD (Jobs to Be Done) document for a job. Creates the directory structure and writes the file.",
    parameters: {
      job_slug: {
        type: "string",
        description:
          "The job slug (lowercase, hyphenated). Example: 'discovery-agent'",
        required: true,
      },
      content: {
        type: "string",
        description: "The full markdown content of the JTBD document",
        required: true,
      },
    },
    async execute(args: Record<string, unknown>): Promise<string> {
      const slugError = validateSlug(args.job_slug, "job_slug");
      if (slugError) return slugError;

      const contentError = validateContent(args.content);
      if (contentError) return contentError;

      const slug = args.job_slug as string;
      const content = args.content as string;
      const dirPath = join(outputBasePath, slug);
      const filePath = join(dirPath, "jtbd.md");

      try {
        await mkdir(dirPath, { recursive: true });
        await Bun.write(filePath, content);
        return `Wrote jobs/${slug}/jtbd.md`;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Error writing JTBD: ${msg}`;
      }
    },
  };
}
