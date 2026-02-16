import { query } from "@anthropic-ai/claude-agent-sdk";
import { findClaude } from "./claude";

/**
 * Prepends context path references to the prompt so the agent knows
 * which files/directories to navigate to. Paths are listed as references,
 * not inlined file contents — the agent reads them itself.
 */
export function buildPrompt(prompt: string, contextPaths: string[]): string {
  if (contextPaths.length === 0) return prompt;
  const refs = contextPaths.map((p) => `Context: ${p}`).join("\n");
  return `${refs}\n\n${prompt}`;
}

export type SessionConfig = {
  prompt: string;
  model?: string;
  context: string[];
};

/**
 * Runs a single autonomous agent session using the Claude Agent SDK.
 * Each call is an independent session — no state is carried between runs.
 */
export function runSession(config: SessionConfig) {
  const fullPrompt = buildPrompt(config.prompt, config.context);

  return query({
    prompt: fullPrompt,
    options: {
      pathToClaudeCodeExecutable: findClaude(),
      systemPrompt: { type: "preset", preset: "claude_code" },
      settingSources: ["user", "project"],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      includePartialMessages: true,
      ...(config.model ? { model: config.model } : {}),
    },
  });
}
