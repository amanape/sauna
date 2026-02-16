import { realpathSync } from "node:fs";
import { execSync } from "node:child_process";

/** Locates the Claude Code executable by resolving `which claude` through symlinks. */
export function findClaude(): string {
  const which = execSync("which claude", { encoding: "utf-8" }).trim();
  return realpathSync(which);
}
