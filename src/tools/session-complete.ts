// Session Complete — no-op tool to signal session end
// Traces to: specs/conversation-engine.md

// Inline type — src/types.ts removed during SDK migration
interface Tool {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
  execute(args: Record<string, unknown>): Promise<string>;
}

export function createSessionCompleteTool(): Tool {
  return {
    name: "session_complete",
    description:
      "Signal that the discovery session is complete. Call this when you have gathered enough information and written all necessary JTBD and spec files.",
    parameters: {},
    async execute(): Promise<string> {
      return "Session complete.";
    },
  };
}
