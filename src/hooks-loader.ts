import { join } from "node:path";

export async function loadHooks(projectRoot: string): Promise<string[]> {
  const hooksPath = join(projectRoot, ".sauna", "hooks.json");
  const file = Bun.file(hooksPath);

  if (!(await file.exists())) {
    return [];
  }

  const raw = await file.text();
  const parsed: unknown = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error("hooks.json must contain a JSON array");
  }

  if (!parsed.every((item): item is string => typeof item === "string")) {
    throw new Error("every element in hooks.json must be a string");
  }

  return parsed;
}
