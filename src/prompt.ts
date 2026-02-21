/**
 * Prompt construction — provider-agnostic.
 *
 * Lives here rather than in session.ts so both ClaudeProvider and
 * CodexProvider can build prompts without importing each other's modules.
 */

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
