import { parse } from "smol-toml";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type AliasDefinition = {
  prompt: string;
  model?: string;
  context?: string[];
  count?: number;
  forever?: boolean;
  interactive?: boolean;
};

const VALID_FIELDS = new Set([
  "prompt",
  "model",
  "context",
  "count",
  "forever",
  "interactive",
]);

const RESERVED_NAMES = new Set([
  "alias-list",
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

const ALIAS_NAME_RE = /^[a-zA-Z0-9_-]+$/;

function validateAliasName(name: string): void {
  if (!name || !ALIAS_NAME_RE.test(name)) {
    throw new Error(
      `Invalid alias name "${name}": must be non-empty and contain only [a-zA-Z0-9_-]`,
    );
  }
  if (RESERVED_NAMES.has(name)) {
    throw new Error(`Reserved name "${name}" cannot be used as an alias`);
  }
}

function validateAliasDefinition(
  name: string,
  raw: Record<string, unknown>,
): AliasDefinition {
  // Check for unknown fields
  for (const key of Object.keys(raw)) {
    if (!VALID_FIELDS.has(key)) {
      throw new Error(`Alias "${name}": unknown field "${key}"`);
    }
  }

  // prompt is required and must be a string
  if (!("prompt" in raw) || typeof raw.prompt !== "string") {
    throw new Error(
      `Alias "${name}": "prompt" is required and must be a string`,
    );
  }

  const def: AliasDefinition = { prompt: raw.prompt };

  if ("model" in raw) {
    if (typeof raw.model !== "string") {
      throw new Error(`Alias "${name}": "model" must be a string`);
    }
    def.model = raw.model;
  }

  if ("context" in raw) {
    if (
      !Array.isArray(raw.context) ||
      !raw.context.every((v: unknown) => typeof v === "string")
    ) {
      throw new Error(`Alias "${name}": "context" must be an array of strings`);
    }
    def.context = raw.context;
  }

  if ("count" in raw) {
    const count = raw.count;
    if (typeof count !== "number" || !Number.isInteger(count) || count <= 0) {
      throw new Error(`Alias "${name}": "count" must be a positive integer`);
    }
    def.count = count;
  }

  if ("forever" in raw) {
    if (typeof raw.forever !== "boolean") {
      throw new Error(`Alias "${name}": "forever" must be a boolean`);
    }
    def.forever = raw.forever;
  }

  if ("interactive" in raw) {
    if (typeof raw.interactive !== "boolean") {
      throw new Error(`Alias "${name}": "interactive" must be a boolean`);
    }
    def.interactive = raw.interactive;
  }

  // Mutual exclusivity checks
  if (def.forever && def.count !== undefined) {
    throw new Error(
      `Alias "${name}": "forever" and "count" are mutually exclusive`,
    );
  }
  if (def.interactive && (def.forever || def.count !== undefined)) {
    const conflict = def.forever ? "forever" : "count";
    throw new Error(
      `Alias "${name}": "interactive" and "${conflict}" are mutually exclusive`,
    );
  }

  return def;
}

/**
 * Load and validate aliases from .sauna/aliases.toml.
 * Returns an empty object if the file does not exist.
 * Throws on malformed TOML or schema violations.
 */
export function loadAliases(root?: string): Record<string, AliasDefinition> {
  const dir = root ?? process.cwd();
  const filePath = join(dir, ".sauna", "aliases.toml");

  if (!existsSync(filePath)) {
    return {};
  }

  const content = readFileSync(filePath, "utf-8");
  const parsed = parse(content);

  const aliases: Record<string, AliasDefinition> = {};

  for (const [name, value] of Object.entries(parsed)) {
    validateAliasName(name);

    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(`Alias "${name}": expected a table, got ${typeof value}`);
    }

    aliases[name] = validateAliasDefinition(
      name,
      value as Record<string, unknown>,
    );
  }

  return aliases;
}

/**
 * Expand an alias definition into an argv array.
 * Alias defaults come first so user CLI args (appended via extraArgs) win for scalars.
 *
 * Rejects positional arguments in extraArgs — aliases lock the prompt.
 */
export function expandAlias(
  alias: AliasDefinition,
  extraArgs: string[],
): string[] {
  // Reject positional arguments: anything that doesn't start with "-"
  // and isn't the value of a preceding flag
  for (let i = 0; i < extraArgs.length; i++) {
    const arg = extraArgs[i]!;
    if (!arg.startsWith("-")) {
      // Check if this is a value for a preceding flag
      if (i === 0 || !extraArgs[i - 1]!.startsWith("-")) {
        throw new Error(
          `Aliases do not accept positional arguments. Got: "${arg}"`,
        );
      }
    }
  }

  const argv: string[] = [alias.prompt];

  if (alias.model) {
    argv.push("-m", alias.model);
  }

  if (alias.context) {
    for (const ctx of alias.context) {
      argv.push("-c", ctx);
    }
  }

  if (alias.count !== undefined) {
    argv.push("-n", String(alias.count));
  }

  if (alias.forever) {
    argv.push("--forever");
  }

  if (alias.interactive) {
    argv.push("--interactive");
  }

  // Append user's extra args after alias defaults (last wins for scalars)
  argv.push(...extraArgs);

  return argv;
}
