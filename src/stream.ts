/**
 * Streaming output formatting for sauna CLI.
 *
 * Pure formatting functions produce ANSI-colored strings.
 * The message handler (processMessage) writes to stdout in real-time.
 * Colors use raw ANSI codes for terminal-aware output.
 */

// ANSI escape codes
const DIM = "\x1b[2m";
const DIM_OFF = "\x1b[22m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

/** Formats a tool name as a dim bracketed tag, e.g. `[Read]` */
export function formatToolTag(name: string): string {
  return `${DIM}[${name}]${DIM_OFF}`;
}

export type SummaryInfo = {
  inputTokens: number;
  outputTokens: number;
  numTurns: number;
  durationMs: number;
};

/** Formats a dim success summary line with tokens, turns, and duration */
export function formatSummary(info: SummaryInfo): string {
  const totalTokens = info.inputTokens + info.outputTokens;
  const turnWord = info.numTurns === 1 ? "turn" : "turns";
  const seconds = (info.durationMs / 1000).toFixed(1);
  return `${DIM}${totalTokens} tokens · ${info.numTurns} ${turnWord} · ${seconds}s${DIM_OFF}`;
}

/** Formats a dim loop header: `loop N` (infinite) or `loop N / X` (fixed count) */
export function formatLoopHeader(iteration: number, total?: number): string {
  const label = total !== undefined ? `loop ${iteration} / ${total}` : `loop ${iteration}`;
  return `${DIM}${label}${DIM_OFF}`;
}

/** Formats a red error message with subtype and error details */
export function formatError(subtype: string, errors: string[]): string {
  const parts = [`${RED}error: ${subtype}${RESET}`];
  for (const err of errors) {
    parts.push(`${RED}  ${err}${RESET}`);
  }
  return parts.join("\n");
}

type WriteFn = (s: string) => void;

/**
 * Mutable state for tracking output formatting across a stream of messages.
 *
 * - lastCharWasNewline: whether the most recent written character was '\n'.
 *   Used to decide if a newline must be inserted before tool tags.
 * - isFirstTextOutput: whether any text_delta has been written yet.
 *   Used to strip leading blank lines from the first text output.
 */
export type StreamState = {
  lastCharWasNewline: boolean;
  isFirstTextOutput: boolean;
};

/** Creates a fresh StreamState — call once per session or loop iteration. */
export function createStreamState(): StreamState {
  return { lastCharWasNewline: true, isFirstTextOutput: true };
}

/**
 * Processes a single SDK message and writes formatted output.
 *
 * When called with a StreamState, tracks newline position and strips
 * leading whitespace from the first text output. When called without
 * state (backwards-compatible), behaves statelessly as before.
 */
export function processMessage(msg: any, write: WriteFn, state?: StreamState): void {
  if (msg.type === "result") {
    if (msg.subtype === "success") {
      // Summary: ensure exactly one \n separator from preceding content
      const sep = state
        ? (state.lastCharWasNewline ? "" : "\n")
        : "\n";
      write(
        sep +
          formatSummary({
            inputTokens: msg.usage.input_tokens,
            outputTokens: msg.usage.output_tokens,
            numTurns: msg.num_turns,
            durationMs: msg.duration_ms,
          }) +
          "\n"
      );
    } else {
      const sep = state
        ? (state.lastCharWasNewline ? "" : "\n")
        : "\n";
      write(sep + formatError(msg.subtype, msg.errors ?? []) + "\n");
    }
    if (state) {
      state.lastCharWasNewline = true;
    }
    return;
  }

  if (msg.type === "stream_event") {
    const event = msg.event;
    if (
      event.type === "content_block_delta" &&
      event.delta?.type === "text_delta"
    ) {
      let text = event.delta.text;
      // Strip leading blank lines from the very first text output
      if (state && state.isFirstTextOutput) {
        text = text.replace(/^\n+/, "");
        if (text.length > 0) {
          state.isFirstTextOutput = false;
        }
      }
      if (text.length > 0) {
        write(text);
        if (state) {
          state.lastCharWasNewline = text.endsWith("\n");
        }
      }
    } else if (
      event.type === "content_block_start" &&
      event.content_block?.type === "tool_use"
    ) {
      // Insert newline before tool tag if previous output didn't end with one
      const prefix = state && !state.lastCharWasNewline ? "\n" : "";
      write(prefix + formatToolTag(event.content_block.name) + "\n");
      if (state) {
        state.lastCharWasNewline = true;
      }
    }
  }
}
