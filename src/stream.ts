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

import type { SummaryInfo, ProviderEvent } from "./provider";
export type { SummaryInfo } from "./provider";

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
export function formatLoopHeader(
  iteration: number,
  total?: number,
  columns?: number,
): string {
  const label =
    total !== undefined ? `loop ${iteration} / ${total}` : `loop ${iteration}`;
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
  let result = command.replace(/\b([A-Z_][A-Z0-9_]*)=(\S+)/g, "$1=***");
  // Redact: Authorization: Bearer <token>
  result = result.replace(
    /Authorization:\s*Bearer\s+[^\s"]+/gi,
    "Authorization: Bearer ***",
  );
  return result;
}

/**
 * Extracts the first line from a value, for use in tool detail display.
 * Returns undefined if the value is not a string, is empty, or starts with \n.
 */
export function extractFirstLine(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const firstLine = value.split("\n")[0] ?? "";
  return firstLine.length > 0 ? firstLine : undefined;
}

type WriteFn = (s: string) => void;

/**
 * Mutable state for tracking output formatting across a stream of provider events.
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
 * Renders a single ProviderEvent to the terminal with ANSI formatting.
 *
 * This is the unified rendering layer for all providers. Provider-specific
 * adapters (Claude, Codex) convert SDK messages into ProviderEvent objects;
 * this function handles display only.
 *
 * errWrite receives error output (result failure, error events).
 * Falls back to write if not provided.
 */
export function processProviderEvent(
  event: ProviderEvent,
  write: WriteFn,
  state: StreamState,
  errWrite?: WriteFn,
): void {
  if (event.type === "text_delta") {
    let text = event.text;
    if (state.isFirstTextOutput) {
      text = text.replace(/^\n+/, "");
      if (text.length > 0) {
        state.isFirstTextOutput = false;
      }
    }
    if (text.length > 0) {
      write(AGENT_COLOR + text + RESET);
      state.lastCharWasNewline = text.endsWith("\n");
    }
    return;
  }

  if (event.type === "tool_start") {
    // No immediate output — tool name is already embedded in tool_end detail
    return;
  }

  if (event.type === "tool_end") {
    const tag = event.detail
      ? `${DIM}[${event.name}] ${event.detail}${DIM_OFF}`
      : `${DIM}[${event.name}]${DIM_OFF}`;
    const prefix = state.lastCharWasNewline ? "" : "\n";
    write(prefix + tag + "\n");
    state.lastCharWasNewline = true;
    return;
  }

  if (event.type === "result") {
    const sep = state.lastCharWasNewline ? "" : "\n";
    if (event.success) {
      write(sep + formatSummary(event.summary) + "\n");
    } else {
      const target = errWrite ?? write;
      const errors = event.errors ?? [];
      const msg =
        errors.length > 0
          ? errors.map((e) => `${RED}${e}${RESET}`).join("\n")
          : `${RED}error${RESET}`;
      target(sep + msg + "\n");
    }
    state.lastCharWasNewline = true;
    return;
  }

  if (event.type === "error") {
    const target = errWrite ?? write;
    target(`${RED}${event.message}${RESET}\n`);
    state.lastCharWasNewline = true;
    return;
  }
}
