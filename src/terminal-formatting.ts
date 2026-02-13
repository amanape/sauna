// Terminal formatting primitives — colors, symbols, indentation, and formatters.
// Composes ansis (colors), figures (symbols), and nanospinner (spinners).
// The activity reporter uses these to build formatted output lines.

import ansis from "ansis";
import figures from "figures";
import { createSpinner, type Spinner } from "nanospinner";

// ── Colors ──────────────────────────────────────────────────────────────────

export const colors = {
  /** Tool calls in progress */
  cyan: (text: string) => ansis.cyan(text),
  /** Successful tool results */
  green: (text: string) => ansis.green(text),
  /** Failed tool results */
  red: (text: string) => ansis.red(text),
  /** Sub-agent activity */
  yellow: (text: string) => ansis.yellow(text),
  /** Metadata (tokens, timing, verbose details) */
  dim: (text: string) => ansis.dim(text),
  /** Errors — must stand out */
  error: (text: string) => ansis.bold.red(text),
};

// ── Symbols ─────────────────────────────────────────────────────────────────

const tick = figures.tick;
const cross = figures.cross;

export const symbols = {
  tick,
  cross,
  pointer: figures.pointer,
  info: figures.info,
  bullet: figures.bullet,
  /** Green tick for success */
  success: ansis.green(tick),
  /** Red cross for failure */
  failure: ansis.red(cross),
};

// ── Indentation ─────────────────────────────────────────────────────────────

const TOOL_INDENT = "  ";       // 2 spaces
const VERBOSE_INDENT = "    ";  // 4 spaces

/** Indent text at tool-activity level (2 spaces). Handles multi-line. */
export function indent(text: string): string {
  return text.split("\n").map((line) => TOOL_INDENT + line).join("\n");
}

/** Indent text at verbose-detail level (4 spaces). Handles multi-line. */
export function indentVerbose(text: string): string {
  return text.split("\n").map((line) => VERBOSE_INDENT + line).join("\n");
}

// ── Duration formatting ─────────────────────────────────────────────────────

/** Format a duration in milliseconds to human-readable: ms, s, or m. */
export function formatDuration(ms: number): string {
  const rounded = Math.round(ms);
  if (rounded < 1000) return `${rounded}ms`;
  if (rounded < 60_000) return `${(rounded / 1000).toFixed(1)}s`;
  return `${(rounded / 60_000).toFixed(1)}m`;
}

// ── Number formatting ───────────────────────────────────────────────────────

/** Format a number with comma separators (e.g. 1247 → "1,247"). */
export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

// ── ANSI stripping ──────────────────────────────────────────────────────────

// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

/** Remove ANSI escape codes from a string. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, "");
}

// ── Spinner ─────────────────────────────────────────────────────────────────

export interface ActivitySpinner {
  /** Start the spinner with the given text (e.g. "Agent thinking..."). */
  start(text: string): void;
  /** Update the displayed text while the spinner keeps running. */
  update(text: string): void;
  /** Stop the spinner with a success symbol and optional text. */
  success(text?: string): void;
  /** Stop the spinner with a failure symbol and optional text. */
  error(text?: string): void;
  /** Stop the spinner silently (no final symbol). */
  stop(): void;
  /** Whether the spinner is currently animating. */
  isSpinning(): boolean;
  /**
   * Pause the spinner, run `fn`, then restart.
   * If the spinner is not running, just runs `fn` directly.
   * This prevents corrupted terminal lines when writing output
   * while the spinner is active.
   */
  withPause(fn: () => void): void;
}

/**
 * Create an activity spinner backed by nanospinner.
 * The spinner writes to the provided stream (defaults to process.stderr).
 */
export function createActivitySpinner(
  stream?: NodeJS.WritableStream,
): ActivitySpinner {
  const opts = stream ? { stream: stream as NodeJS.WriteStream } : {};
  const spinner: Spinner = createSpinner("", opts);
  let lastText = "";

  return {
    start(text: string) {
      lastText = text;
      spinner.start({ text });
    },

    update(text: string) {
      lastText = text;
      spinner.update({ text });
    },

    success(text?: string) {
      spinner.success(text ? { text } : undefined);
    },

    error(text?: string) {
      spinner.error(text ? { text } : undefined);
    },

    stop() {
      if (spinner.isSpinning()) {
        spinner.stop();
      }
    },

    isSpinning() {
      return spinner.isSpinning();
    },

    withPause(fn: () => void) {
      if (!spinner.isSpinning()) {
        fn();
        return;
      }
      spinner.stop();
      fn();
      spinner.start({ text: lastText });
    },
  };
}
