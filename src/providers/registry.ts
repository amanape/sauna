import type { Provider } from "../provider";
import { ClaudeProvider } from "./claude";
import { CodexProvider } from "./codex";

const CLAUDE_ALIASES = new Set(["sonnet", "opus", "haiku"]);
const CODEX_ALIASES = new Set(["codex", "codex-mini"]);

/**
 * Selects the correct Provider from an explicit `--provider` flag or by
 * inferring the provider from the model name.
 *
 * This function only selects — it does not call `isAvailable()`. That is the
 * CLI's responsibility after selection.
 */
export function resolveProvider(providerFlag?: string, modelFlag?: string): Provider {
  if (providerFlag !== undefined) {
    if (providerFlag === "claude") return ClaudeProvider;
    if (providerFlag === "codex") return CodexProvider;
    throw new Error(
      `Unknown provider "${providerFlag}". Valid providers: claude, codex`
    );
  }

  if (modelFlag) {
    if (modelFlag.startsWith("claude-") || CLAUDE_ALIASES.has(modelFlag)) {
      return ClaudeProvider;
    }
    if (
      modelFlag.startsWith("gpt-") ||
      modelFlag === "o4-mini" ||
      CODEX_ALIASES.has(modelFlag)
    ) {
      return CodexProvider;
    }
  }

  // Default: Claude (backward compatibility)
  return ClaudeProvider;
}
