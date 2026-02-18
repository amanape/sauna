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
const BOLD = "\x1b[1m";
const BOLD_OFF = "\x1b[22m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";
const AGENT_COLOR = "\x1b[38;5;250m";

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

/** Formats a bold full-width loop header divider with centered label.
 *  Uses box-drawing horizontal character (─) to fill the line.
 *  Falls back to bold label only when terminal is too narrow. */
export function formatLoopHeader(iteration: number, total?: number, columns?: number): string {
  const label = total !== undefined ? `loop ${iteration} / ${total}` : `loop ${iteration}`;
  const cols = columns ?? process.stdout.columns ?? 40;
  // label + 2 spaces + at least 1 bar on each side = label.length + 4
  if (cols < label.length + 4) {
    return `${BOLD}${label}${BOLD_OFF}`;
  }
  const remaining = cols - label.length - 2; // 2 for the spaces around the label
  const left = Math.floor(remaining / 2);
  const right = remaining - left;
  return `${BOLD}${"─".repeat(left)} ${label} ${"─".repeat(right)}${BOLD_OFF}`;
}

/** Formats a red error message with subtype and error details */
export function formatError(subtype: string, errors: string[]): string {
  const parts = [`${RED}error: ${subtype}${RESET}`];
  for (const err of errors) {
    parts.push(`${RED}  ${err}${RESET}`);
  }
  return parts.join("\n");
}

/**
 * Redacts potential secrets from a command string before display.
 * Handles: export VAR=val, VAR=val, Authorization: Bearer tokens.
 */
export function redactSecrets(command: string): string {
  // Redact: export VAR=value or VAR=value (env var assignments)
  let result = command.replace(
    /\b([A-Z_][A-Z0-9_]*)=(\S+)/g,
    '$1=***'
  );
  // Redact: Authorization: Bearer <token>
  result = result.replace(
    /Authorization:\s*Bearer\s+[^\s"]+/gi,
    'Authorization: Bearer ***'
  );
  return result;
}

/**
 * Extracts the first line from a value, for use in tool detail display.
 * Returns undefined if the value is not a string, is empty, or starts with \n.
 */
export function extractFirstLine(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const firstLine = value.split('\n')[0] ?? '';
  return firstLine.length > 0 ? firstLine : undefined;
}

type WriteFn = (s: string) => void;

/**
 * Mutable state for tracking output formatting across a stream of messages.
 *
 * - lastCharWasNewline: whether the most recent written character was '\n'.
 *   Used to decide if a newline must be inserted before tool tags.
 * - isFirstTextOutput: whether any text_delta has been written yet.
 *   Used to strip leading blank lines from the first text output.
 * - pendingToolName: tool name from content_block_start, waiting for input.
 * - pendingToolJson: accumulated input_json_delta fragments for the pending tool.
 */
export type StreamState = {
  lastCharWasNewline: boolean;
  isFirstTextOutput: boolean;
  pendingToolName: string | undefined;
  pendingToolJson: string;
};

/** Creates a fresh StreamState — call once per session or loop iteration. */
export function createStreamState(): StreamState {
  return { lastCharWasNewline: true, isFirstTextOutput: true, pendingToolName: undefined, pendingToolJson: '' };
}

/**
 * Processes a single SDK message and writes formatted output.
 *
 * When called with a StreamState, tracks newline position and strips
 * leading whitespace from the first text output. When called without
 * state (backwards-compatible), behaves statelessly as before.
 *
 * errWrite is an optional callback for error output (non-success results).
 * When provided, error formatting goes to errWrite (intended for stderr)
 * instead of write (intended for stdout). Falls back to write if not provided.
 */
export function processMessage(msg: any, write: WriteFn, state?: StreamState, errWrite?: WriteFn): void {
  if (msg.type === "result") {
    if (msg.subtype === "success") {
      // Fallback: if no streaming text was written, display result text
      if (state?.isFirstTextOutput && msg.result) {
        let text = msg.result.replace(/^\n+/, "");
        if (text.length > 0) {
          write(AGENT_COLOR + text + RESET);
          if (!text.endsWith("\n")) write("\n");
          state.isFirstTextOutput = false;
          state.lastCharWasNewline = true;
        }
      }
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
      const target = errWrite ?? write;
      target(sep + formatError(msg.subtype, msg.errors ?? []) + "\n");
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
        write(AGENT_COLOR + text + RESET);
        if (state) {
          state.lastCharWasNewline = text.endsWith("\n");
        }
      }
    } else if (
      event.type === "content_block_start" &&
      event.content_block?.type === "tool_use"
    ) {
      // Defer tag display until content_block_stop when input is fully accumulated.
      // The Anthropic streaming API sends input: {} at content_block_start;
      // actual input arrives via input_json_delta in content_block_delta events.
      if (state) {
        state.pendingToolName = event.content_block.name;
        state.pendingToolJson = '';
      } else {
        // Stateless fallback: no accumulation possible, show bare tag
        const prefix = "";
        write(`${DIM}[${event.content_block.name}]${DIM_OFF}\n`);
      }
    } else if (
      event.type === "content_block_delta" &&
      event.delta?.type === "input_json_delta" &&
      state?.pendingToolName
    ) {
      // Accumulate streamed JSON fragments for the pending tool's input
      state.pendingToolJson += event.delta.partial_json;
    } else if (
      event.type === "content_block_stop" &&
      state?.pendingToolName
    ) {
      const name = state.pendingToolName;

      // Parse accumulated input and extract tool detail using fallback chain.
      // Known properties: file_path, command, description, pattern, query
      let detail: string | undefined;
      if (state.pendingToolJson.length > 0) {
        try {
          const input = JSON.parse(state.pendingToolJson);
          if (input && typeof input === 'object') {
            const raw = input.file_path || input.command || input.description || input.pattern || input.query;
            detail = extractFirstLine(raw);
            if (detail && input.command !== undefined) {
              detail = redactSecrets(detail);
            }
          }
        } catch {
          // Malformed JSON — show bare tag
        }
      }

      const tag = detail
        ? `${DIM}[${name}] ${detail}${DIM_OFF}`
        : `${DIM}[${name}]${DIM_OFF}`;

      // Insert newline before tool tag if previous output didn't end with one
      const prefix = state.lastCharWasNewline ? "" : "\n";
      write(prefix + tag + "\n");
      state.lastCharWasNewline = true;
      state.pendingToolName = undefined;
      state.pendingToolJson = '';
    }
  }
}
