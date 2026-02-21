/**
 * Provider contract — shared type definitions for the multi-provider system.
 *
 * Every provider (Claude, Codex, etc.) implements the Provider interface.
 * Event adapters convert SDK-specific messages into ProviderEvent objects.
 * The stream renderer consumes ProviderEvent without knowing which provider
 * produced it.
 *
 * This file has zero runtime dependencies — types only.
 */

/** Token usage and timing summary for a completed session. */
export type SummaryInfo = {
  inputTokens: number;
  outputTokens: number;
  numTurns: number;
  durationMs: number;
};

/** Configuration passed to Provider.createSession(). */
export type ProviderSessionConfig = {
  prompt: string;
  model?: string;
  context: string[];
};

/**
 * Discriminated union of events emitted by a provider session.
 * The `type` field is the discriminant for narrowing.
 */
export type ProviderEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_start"; name: string }
  | { type: "tool_end"; name: string; detail?: string }
  | { type: "result"; success: true; summary: SummaryInfo }
  | { type: "result"; success: false; errors?: string[] }
  | { type: "error"; message: string };

/** Configuration for a multi-turn interactive session. No prompt field — the first user message is passed via send(). */
export type InteractiveSessionConfig = {
  model?: string;
  context: string[];
};

/**
 * A stateful multi-turn session returned by Provider.createInteractiveSession().
 *
 * The REPL drives the turn loop:
 *   await session.send(userInput);
 *   for await (const event of session.stream()) { ... }
 *
 * stream() yields ProviderEvent objects for one turn and ends after the result event.
 * close() releases any held resources.
 */
export type InteractiveSession = {
  /** Queues a user message for the next turn. */
  send(message: string): Promise<void>;
  /** Yields ProviderEvent objects for the current turn; ends after a result event. */
  stream(): AsyncGenerator<ProviderEvent>;
  /** Releases resources held by the session. */
  close(): void;
};

/** Contract that every AI provider must implement. */
export type Provider = {
  /** Human-readable identifier (e.g., "claude", "codex"). */
  name: string;
  /** Returns whether the provider can run. Never throws. */
  isAvailable(): boolean;
  /** Maps short alias names to full model IDs. Returns undefined for unknown/empty. */
  resolveModel(alias?: string): string | undefined;
  /** Returns the full alias map for help text display. */
  knownAliases(): Record<string, string>;
  /** Runs a single-turn session, yielding ProviderEvent objects. */
  createSession(config: ProviderSessionConfig): AsyncGenerator<ProviderEvent>;
  /** Creates a stateful multi-turn interactive session. */
  createInteractiveSession(
    config: InteractiveSessionConfig,
  ): InteractiveSession;
};
