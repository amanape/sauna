const MODEL_ALIASES: Record<string, string> = {
  sonnet: "claude-sonnet-4-20250514",
  opus: "claude-opus-4-20250514",
  haiku: "claude-haiku-4-20250414",
};

const OPENAI_ALIASES: Record<string, string> = {
  "gpt-4o": "gpt-4o",
  "o1": "o1",
};

const KNOWN_PROVIDERS = new Set(["anthropic", "openai"]);

export type ResolvedProvider = {
  provider: "anthropic" | "openai";
  model: string | undefined;
};

export function resolveProvider(
  model: string | undefined,
  errWrite?: (s: string) => void,
): ResolvedProvider {
  const _errWrite = errWrite ?? ((s: string) => process.stderr.write(s));

  if (model === undefined || model === "") {
    return { provider: "anthropic", model: undefined };
  }

  const colonIdx = model.indexOf(":");
  if (colonIdx !== -1) {
    const prefix = model.slice(0, colonIdx);
    const rest = model.slice(colonIdx + 1);

    if (prefix === "anthropic") {
      return { provider: "anthropic", model: MODEL_ALIASES[rest] ?? rest };
    } else if (prefix === "openai") {
      return { provider: "openai", model: OPENAI_ALIASES[rest] ?? rest };
    } else if (
      MODEL_ALIASES[prefix] !== undefined ||
      OPENAI_ALIASES[prefix] !== undefined
    ) {
      // Known model alias used as the prefix (e.g. "gpt-4o:latest").
      // Fall through to bare-string handling of the entire input string.
    } else {
      // Unknown provider prefix (e.g. "google:foo") — fatal error.
      _errWrite(
        `error: Unknown provider "${prefix}".\n\nAvailable providers:\n  anthropic  (models: sonnet, opus, haiku)\n  openai     (models: gpt-4o, o1)\n`,
      );
      process.exit(1);
    }
  }

  // Bare-string handling (also reached by falling through from colon branch)
  if (MODEL_ALIASES[model] !== undefined) {
    return { provider: "anthropic", model: MODEL_ALIASES[model] };
  }
  if (OPENAI_ALIASES[model] !== undefined) {
    return { provider: "openai", model: OPENAI_ALIASES[model] };
  }

  // Unknown bare string — default to anthropic for backward compatibility
  return { provider: "anthropic", model };
}

/** @deprecated Use resolveProvider instead */
export function resolveModel(model: string | undefined): string | undefined {
  if (model === undefined) return undefined;
  return MODEL_ALIASES[model] ?? model;
}
