/**
 * Cross-platform test helpers.
 *
 * Windows subprocesses fail when env is replaced wholesale because they need
 * SystemRoot/PATHEXT/COMSPEC to load DLLs. And backslash paths get mangled
 * when embedded in `bun -e` script strings via template literals.
 */
import { dirname, delimiter } from "node:path";

export const isWindows = process.platform === "win32";

/** ROOT path with forward slashes — safe to embed in require() strings */
export const ROOT = import.meta.dir
  .replace(/[\\/]tests$/, "")
  .replaceAll("\\", "/");

/** Full path to the bun executable */
export const BUN = process.execPath;

/**
 * Build an env object that keeps subprocesses alive on all platforms.
 *
 * On Windows, injects SystemRoot, PATHEXT, and COMSPEC so the subprocess
 * can load DLLs and resolve executables. On Unix, returns overrides as-is.
 */
export function safeEnv(
  overrides: Record<string, string>,
): Record<string, string> {
  if (!isWindows) return overrides;
  const base: Record<string, string> = {};
  for (const key of ["SystemRoot", "PATHEXT", "COMSPEC", "TEMP", "TMP"]) {
    if (process.env[key]) base[key] = process.env[key]!;
  }
  return { ...base, ...overrides };
}

/**
 * A minimal PATH that includes bun's directory plus basic system paths.
 * Uses the correct delimiter for the platform.
 */
export function minimalPath(...extra: string[]): string {
  const bunDir = dirname(BUN);
  const parts = [bunDir, ...extra];
  if (isWindows) {
    parts.push("C:\\Windows\\System32");
  } else {
    parts.push("/usr/bin", "/bin");
  }
  return parts.join(delimiter);
}
