const MODEL_ALIASES: Record<string, string> = {
  sonnet: "claude-sonnet-4-20250514",
  opus: "claude-opus-4-20250514",
  haiku: "claude-haiku-4-20250414",
};

export function resolveModel(model: string | undefined): string | undefined {
  if (model === undefined) return undefined;
  return MODEL_ALIASES[model] ?? model;
}
