// Activity reporter — translates Mastra agent execution callbacks into
// human-readable terminal output. Accepts an injected Writable stream and
// verbosity flag so it stays testable and decoupled from the CLI layer.

import type { Writable } from "node:stream";
import type { LLMStepResult } from "@mastra/core/agent";

import type { ExecutionMetrics, TokenUsage } from "./execution-metrics";
import type { ActivitySpinner } from "./terminal-formatting";
import {
  colors,
  symbols,
  indent,
  indentVerbose,
  formatDuration,
  formatNumber,
} from "./terminal-formatting";

// ── Tool name cleaning ──────────────────────────────────────────────────────

const TOOL_PREFIXES = ["mastra_workspace_", "tavily_", "context7_"];

/** Strip known MCP prefixes from tool names for readability. */
export function cleanToolName(name: string): string {
  for (const prefix of TOOL_PREFIXES) {
    if (name.startsWith(prefix)) {
      return name.slice(prefix.length);
    }
  }
  return name;
}

/** Returns true when the tool name refers to an agent-as-tool (sub-agent). */
export function isSubAgentTool(rawName: string): boolean {
  return rawName === "researcher";
}

// ── Tool-type summaries ─────────────────────────────────────────────────────

const MAX_JSON_LENGTH = 500;

/** Truncate a JSON string to ~500 chars with an ellipsis. */
function truncateJson(value: unknown): string {
  const json = JSON.stringify(value, null, 2);
  if (json.length <= MAX_JSON_LENGTH) return json;
  return json.slice(0, MAX_JSON_LENGTH) + "…";
}

/** Produce a one-line summary for a tool call based on its name and args. */
function summarizeToolCall(
  rawName: string,
  args: Record<string, unknown> | undefined,
): string {
  const name = cleanToolName(rawName);

  // File read / write / listing — show the path
  if (args?.path && typeof args.path === "string") {
    return `${name} ${colors.dim(args.path as string)}`;
  }

  // Web search — show the query
  if (args?.query && typeof args.query === "string") {
    return `${name} ${colors.dim(`"${args.query}"`)}`;
  }

  // Sub-agent / researcher — show delegation message
  if (args?.message && typeof args.message === "string") {
    const brief =
      (args.message as string).length > 60
        ? (args.message as string).slice(0, 60) + "…"
        : args.message;
    return `${name} ${colors.dim(brief as string)}`;
  }

  // Generic fallback — just the cleaned name
  return name;
}

/** Produce a one-line summary for a tool result. */
function summarizeToolResult(
  rawName: string,
  result: unknown,
  isError: boolean,
): string {
  const icon = isError ? symbols.failure : symbols.success;
  const name = cleanToolName(rawName);

  if (isError) {
    const msg =
      result && typeof result === "object" && "error" in result
        ? String((result as Record<string, unknown>).error)
        : "error";
    return `${icon} ${name} ${colors.error(msg)}`;
  }

  return `${icon} ${name}`;
}

// ── Reporter factory ────────────────────────────────────────────────────────

export interface ActivityReporterConfig {
  output: Writable;
  verbose: boolean;
  metrics?: ExecutionMetrics;
  spinner?: ActivitySpinner;
}

export interface StreamingChunk {
  type: string;
  payload: Record<string, unknown>;
}

/** The subset of the Mastra onFinish event we inspect for display. */
export interface FinishEvent {
  error?: Error | string | { message: string; stack: string };
  [key: string]: unknown;
}

export interface ActivityReporter {
  onStepFinish: (step: LLMStepResult) => void;
  onChunk: (chunk: StreamingChunk) => void;
  onFinish: (event: FinishEvent) => void;
}

export function createActivityReporter(
  config: ActivityReporterConfig,
): ActivityReporter {
  const { output, verbose, metrics, spinner } = config;

  function writeLine(line: string): void {
    try {
      output.write(line + "\n");
    } catch {
      // Never throw — the agent's work is more important than display.
    }
  }

  /** Collect lines, then flush inside a single spinner pause. */
  function flushLines(lines: string[]): void {
    if (lines.length === 0) return;

    const doWrite = () => {
      for (const line of lines) {
        writeLine(line);
      }
    };

    if (spinner) {
      spinner.withPause(doWrite);
    } else {
      doWrite();
    }
  }

  function onStepFinish(step: LLMStepResult): void {
    try {
      const lines: string[] = [];

      // Reasoning text (verbose only)
      if (verbose && step.reasoningText) {
        lines.push(indent(colors.dim(`Reasoning: ${step.reasoningText}`)));
      }

      // Process tool calls paired with results
      const calls = step.toolCalls ?? [];
      const results = step.toolResults ?? [];

      for (let i = 0; i < calls.length; i++) {
        const call = calls[i];
        const toolName = call?.payload?.toolName;
        if (!toolName) continue;

        const args = call.payload.args as Record<string, unknown> | undefined;

        // Tool call line — sub-agent calls use yellow, regular tools use cyan
        const summary = summarizeToolCall(toolName, args);
        const pointerColor = isSubAgentTool(toolName) ? colors.yellow : colors.cyan;
        lines.push(indent(`${pointerColor(symbols.pointer)} ${summary}`));

        // Verbose: full args
        if (verbose && args) {
          lines.push(indentVerbose(colors.dim(truncateJson(args))));
        }

        // Matching result (by index — Mastra pairs them positionally)
        const result = results[i];
        if (result?.payload) {
          const isError = result.payload.isError === true;
          const resultSummary = summarizeToolResult(
            toolName,
            result.payload.result,
            isError,
          );
          lines.push(indent(resultSummary));

          // Verbose: full result
          if (verbose && result.payload.result !== undefined) {
            lines.push(indentVerbose(colors.dim(truncateJson(result.payload.result))));
          }
        }
      }

      // Token usage and turn duration
      if (metrics) {
        const usage = step.usage as TokenUsage | undefined;
        metrics.recordTurnUsage(usage);

        if (usage) {
          // Per-turn tokens: "tokens: 1,247 in / 523 out / 1,770 total"
          let tokenLine = `tokens: ${formatNumber(usage.inputTokens)} in / ${formatNumber(usage.outputTokens)} out / ${formatNumber(usage.totalTokens)} total`;

          if (usage.reasoningTokens) {
            tokenLine += ` (reasoning: ${formatNumber(usage.reasoningTokens)})`;
          }
          if (usage.cachedInputTokens) {
            tokenLine += ` (cached: ${formatNumber(usage.cachedInputTokens)})`;
          }

          // Cumulative total
          const cumulative = metrics.getCumulativeUsage();
          tokenLine += ` | cumulative: ${formatNumber(cumulative.totalTokens)}`;

          // Turn duration (if a turn was timed)
          const turnDuration = metrics.getLastTurnDuration();
          if (turnDuration > 0) {
            tokenLine += ` | ${formatDuration(turnDuration)}`;
          }

          lines.push(indent(colors.dim(tokenLine)));
        }
      }

      // Verbose: finish reason
      if (verbose && step.finishReason) {
        lines.push(indent(colors.dim(`finish: ${step.finishReason}`)));
      }

      flushLines(lines);
    } catch {
      // Never throw — swallow display errors silently.
    }
  }

  function onChunk(chunk: StreamingChunk): void {
    try {
      const { type, payload } = chunk;
      const toolName = payload?.toolName as string | undefined;

      if (type === "tool-call") {
        if (!toolName) return;
        const args = payload.args as Record<string, unknown> | undefined;
        const lines: string[] = [];

        const summary = summarizeToolCall(toolName, args);
        const pointerColor = isSubAgentTool(toolName) ? colors.yellow : colors.cyan;
        lines.push(indent(`${pointerColor(symbols.pointer)} ${summary}`));

        if (verbose && args) {
          lines.push(indentVerbose(colors.dim(truncateJson(args))));
        }

        // Update spinner text so the user sees which tool is being called
        if (spinner) {
          const spinnerText = isSubAgentTool(toolName)
            ? "Researcher investigating…"
            : `Calling ${cleanToolName(toolName)}…`;
          spinner.update(spinnerText);
        }

        // Start timing this tool call
        const toolCallId = payload.toolCallId as string | undefined;
        if (metrics && toolCallId) {
          metrics.startToolCall(toolCallId);
        }

        flushLines(lines);
      } else if (type === "tool-result") {
        if (!toolName) return;
        const isError = payload.isError === true;
        const result = payload.result;
        const lines: string[] = [];

        const resultSummary = summarizeToolResult(toolName, result, isError);

        // End timing and append duration
        const toolCallId = payload.toolCallId as string | undefined;
        let durationSuffix = "";
        if (metrics && toolCallId) {
          const duration = metrics.endToolCall(toolCallId);
          if (duration > 0) {
            durationSuffix = ` ${colors.dim(formatDuration(duration))}`;
          }
        }

        lines.push(indent(resultSummary + durationSuffix));

        if (verbose && result !== undefined) {
          lines.push(indentVerbose(colors.dim(truncateJson(result))));
        }

        flushLines(lines);
      } else if (type === "tool-error") {
        if (!toolName) return;
        const errorMsg = payload.error != null ? String(payload.error) : "error";
        const lines: string[] = [];

        lines.push(indent(`${symbols.failure} ${cleanToolName(toolName)} ${colors.error(errorMsg)}`));

        // End timing if tracked
        const toolCallId = payload.toolCallId as string | undefined;
        if (metrics && toolCallId) {
          metrics.endToolCall(toolCallId);
        }

        flushLines(lines);
      }
      // Unrecognized chunk types are silently ignored.
    } catch {
      // Never throw — swallow display errors silently.
    }
  }

  function onFinish(event: FinishEvent): void {
    try {
      if (!event?.error) return;

      const errorMsg =
        event.error instanceof Error
          ? event.error.message
          : typeof event.error === "string"
            ? event.error
            : event.error.message;

      const lines = [
        indent(`${symbols.failure} ${colors.error(errorMsg)}`),
      ];
      flushLines(lines);
    } catch {
      // Never throw — swallow display errors silently.
    }
  }

  return { onStepFinish, onChunk, onFinish };
}
