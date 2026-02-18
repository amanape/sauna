import { stringify } from "smol-toml";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadAliases, type AliasDefinition } from "./aliases";

const RESERVED_NAMES = new Set([
  "alias",
  "help",
  "version",
  "model",
  "m",
  "forever",
  "count",
  "n",
  "interactive",
  "i",
  "context",
  "c",
]);

/**
 * Print all aliases in a compact table format.
 * Each row: name, truncated prompt, flags in short CLI notation.
 */
export function aliasList(
  aliases: Record<string, AliasDefinition>,
  write: (s: string) => void
): void {
  const names = Object.keys(aliases);
  if (names.length === 0) {
    write(
      "No aliases defined. Create .sauna/aliases.toml to get started.\n"
    );
    return;
  }

  const maxNameLen = Math.max(...names.map((n) => n.length));

  for (const name of names) {
    const alias = aliases[name]!;
    const prompt = truncate(alias.prompt, 25);
    const flags = formatFlags(alias);
    const paddedName = name.padEnd(maxNameLen);
    write(`${paddedName}  ${prompt}${flags ? "  " + flags : ""}\n`);
  }
}

/**
 * Print the full TOML definition of a single alias.
 */
export function aliasShow(
  aliases: Record<string, AliasDefinition>,
  name: string,
  write: (s: string) => void
): void {
  const alias = aliases[name];
  if (!alias) {
    throw new Error(`Alias "${name}" not found`);
  }

  const toml = stringify({ [name]: alias });
  write(toml);
}

/**
 * Create a new alias stub in .sauna/aliases.toml.
 * Creates the file (and .sauna directory) if needed.
 */
export function aliasSet(
  name: string,
  root?: string,
  write?: (s: string) => void
): void {
  if (RESERVED_NAMES.has(name)) {
    throw new Error(`Reserved name "${name}" cannot be used as an alias`);
  }

  const dir = root ?? process.cwd();
  const saunaDir = join(dir, ".sauna");
  const filePath = join(saunaDir, "aliases.toml");

  // Check for duplicates by loading existing aliases
  if (existsSync(filePath)) {
    const existing = loadAliases(dir);
    if (name in existing) {
      throw new Error(
        `Alias "${name}" already exists. Edit .sauna/aliases.toml directly to modify it.`
      );
    }
  }

  // Ensure .sauna directory exists
  if (!existsSync(saunaDir)) {
    mkdirSync(saunaDir, { recursive: true });
  }

  // Append stub entry
  const stub = `\n[${name}]\nprompt = ""\n`;
  const existing = existsSync(filePath)
    ? readFileSync(filePath, "utf-8")
    : "";
  writeFileSync(filePath, existing + stub);

  write?.(`Created alias "${name}" in .sauna/aliases.toml\nEdit the file to configure it:\n\n  [${name}]\n  prompt = ""\n`);
}

/**
 * Remove an alias section from .sauna/aliases.toml.
 */
export function aliasRm(
  name: string,
  root?: string,
  write?: (s: string) => void
): void {
  const dir = root ?? process.cwd();
  const filePath = join(dir, ".sauna", "aliases.toml");

  if (!existsSync(filePath)) {
    throw new Error(`Alias "${name}" not found`);
  }

  const aliases = loadAliases(dir);
  if (!(name in aliases)) {
    throw new Error(`Alias "${name}" not found`);
  }

  // Remove the alias and rewrite the file
  delete aliases[name];
  const toml = Object.keys(aliases).length > 0 ? stringify(aliases) : "";
  writeFileSync(filePath, toml);

  write?.(`Removed alias "${name}" from .sauna/aliases.toml\n`);
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + "\u2026";
}

function formatFlags(alias: AliasDefinition): string {
  const parts: string[] = [];
  if (alias.model) parts.push(`-m ${alias.model}`);
  if (alias.context) {
    for (const ctx of alias.context) {
      parts.push(`-c ${ctx}`);
    }
  }
  if (alias.count !== undefined) parts.push(`-n ${alias.count}`);
  if (alias.forever) parts.push("--forever");
  if (alias.interactive) parts.push("-i");
  return parts.join(" ");
}
