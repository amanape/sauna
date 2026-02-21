import type { AliasDefinition } from "./aliases";

/**
 * Print all aliases in a compact table format.
 * Each row: name, truncated prompt, flags in short CLI notation.
 */
export function aliasList(
  aliases: Record<string, AliasDefinition>,
  write: (s: string) => void,
): void {
  const names = Object.keys(aliases);
  if (names.length === 0) {
    write("No aliases defined. Create .sauna/aliases.toml to get started.\n");
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
