// Execution metrics — token tracking and wall-clock timing for agent turns and tool calls.
// Accepts an injectable clock function for testability.
// The activity reporter consumes these values to produce formatted output.

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
}

type ClockFn = () => number;

export class ExecutionMetrics {
  private clock: ClockFn;

  // Token tracking
  private turnUsages: TokenUsage[] = [];
  private cumulative: Required<TokenUsage> = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    reasoningTokens: 0,
    cachedInputTokens: 0,
  };

  // Turn timing
  private turnStartTime: number | undefined;
  private lastTurnDuration = 0;

  // Tool call timing (concurrent tool calls keyed by id)
  private toolCallStarts = new Map<string, number>();

  constructor(clock: ClockFn = performance.now.bind(performance)) {
    this.clock = clock;
  }

  // ── Token tracking ──────────────────────────────────────────────────────

  recordTurnUsage(usage: TokenUsage | undefined): void {
    if (!usage) return;

    this.turnUsages.push(usage);
    this.cumulative.inputTokens += usage.inputTokens;
    this.cumulative.outputTokens += usage.outputTokens;
    this.cumulative.totalTokens += usage.totalTokens;
    this.cumulative.reasoningTokens += usage.reasoningTokens ?? 0;
    this.cumulative.cachedInputTokens += usage.cachedInputTokens ?? 0;
  }

  getLastTurnUsage(): TokenUsage | undefined {
    return this.turnUsages.length > 0
      ? this.turnUsages[this.turnUsages.length - 1]
      : undefined;
  }

  getCumulativeUsage(): Required<TokenUsage> {
    return { ...this.cumulative };
  }

  // ── Turn timing ─────────────────────────────────────────────────────────

  startTurn(): void {
    this.turnStartTime = this.clock();
  }

  endTurn(): number {
    if (this.turnStartTime === undefined) return 0;
    this.lastTurnDuration = this.clock() - this.turnStartTime;
    this.turnStartTime = undefined;
    return this.lastTurnDuration;
  }

  getLastTurnDuration(): number {
    return this.lastTurnDuration;
  }

  // ── Tool call timing ────────────────────────────────────────────────────

  startToolCall(id: string): void {
    this.toolCallStarts.set(id, this.clock());
  }

  endToolCall(id: string): number {
    const start = this.toolCallStarts.get(id);
    if (start === undefined) return 0;
    this.toolCallStarts.delete(id);
    return this.clock() - start;
  }

  // ── Reset ───────────────────────────────────────────────────────────────

  reset(): void {
    this.turnUsages = [];
    this.cumulative = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      reasoningTokens: 0,
      cachedInputTokens: 0,
    };
    this.turnStartTime = undefined;
    this.lastTurnDuration = 0;
    this.toolCallStarts.clear();
  }
}
