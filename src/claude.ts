import { realpathSync } from "node:fs";
import { execSync } from "node:child_process";

/** Locates the Claude Code executable by resolving `which claude` through symlinks. */
export function findClaude(): string {
  let which: string;
  try {
    which = execSync("which claude", { encoding: "utf-8" }).trim();
  } catch {
    throw new Error(
      "claude not found on $PATH — install Claude Code and ensure `claude` is in your PATH"
    );
  }

  try {
    return realpathSync(which);
  } catch {
    throw new Error(
      `claude found at ${which} but could not resolve the path — the symlink may be broken or dangling`
    );
  }
}
