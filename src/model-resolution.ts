export const DEFAULT_MODEL = "anthropic/claude-opus-4-6";

export function getProviderFromModel(model?: string): string {
  const m = model ?? DEFAULT_MODEL;
  const slashIndex = m.indexOf("/");
  if (slashIndex === -1) return "anthropic";
  return m.slice(0, slashIndex);
}

export function getApiKeyEnvVar(provider: string): string {
  return `${provider.toUpperCase()}_API_KEY`;
}

export function validateApiKey(model?: string): string {
  const provider = getProviderFromModel(model);
  const envVar = getApiKeyEnvVar(provider);
  if (!process.env[envVar]) {
    throw new Error(`${envVar} environment variable is required`);
  }
  return envVar;
}
