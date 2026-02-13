// Activity reporter — translates Mastra agent execution callbacks into
// human-readable terminal output. Accepts an injected Writable stream and
// verbosity flag so it stays testable and decoupled from the CLI layer.

import type { Writable } from "node:stream";
import type { LLMStepResult } from "@mastra/core/agent";

import type { ExecutionMetrics, TokenUsage } from "./execution-metrics";
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
    return `${icon} ${name} ${colors.red(msg)}`;
  }

  return `${icon} ${name}`;
}

// ── Reporter factory ────────────────────────────────────────────────────────

export interface ActivityReporterConfig {
  output: Writable;
  verbose: boolean;
  metrics?: ExecutionMetrics;
}

export interface ActivityReporter {
  onStepFinish: (step: LLMStepResult) => void;
}

export function createActivityReporter(
  config: ActivityReporterConfig,
): ActivityReporter {
  const { output, verbose, metrics } = config;

  function write(line: string): void {
    try {
      output.write(line + "\n");
    } catch {
      // Never throw — the agent's work is more important than display.
    }
  }

  function onStepFinish(step: LLMStepResult): void {
    try {
      // Reasoning text (verbose only)
      if (verbose && step.reasoningText) {
        write(indent(colors.dim(`Reasoning: ${step.reasoningText}`)));
      }

      // Process tool calls paired with results
      const calls = step.toolCalls ?? [];
      const results = step.toolResults ?? [];

      for (let i = 0; i < calls.length; i++) {
        const call = calls[i];
        const toolName = call?.payload?.toolName;
        if (!toolName) continue;

        const args = call.payload.args as Record<string, unknown> | undefined;

        // Tool call line
        const summary = summarizeToolCall(toolName, args);
        write(indent(`${colors.cyan(symbols.pointer)} ${summary}`));

        // Verbose: full args
        if (verbose && args) {
          write(indentVerbose(colors.dim(truncateJson(args))));
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
          write(indent(resultSummary));

          // Verbose: full result
          if (verbose && result.payload.result !== undefined) {
            write(indentVerbose(colors.dim(truncateJson(result.payload.result))));
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

          write(indent(colors.dim(tokenLine)));
        }
      }

      // Verbose: finish reason
      if (verbose && step.finishReason) {
        write(indent(colors.dim(`finish: ${step.finishReason}`)));
      }
    } catch {
      // Never throw — swallow display errors silently.
    }
  }

  return { onStepFinish };
}
