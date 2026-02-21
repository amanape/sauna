/**
 * Loop orchestration for sauna CLI.
 *
 * Handles single-run vs loop mode, iteration counting, header printing,
 * and error isolation between iterations. Accepts a session factory and
 * write callback for testability — no direct SDK or stdout dependency.
 */
import { formatLoopHeader, processProviderEvent, createStreamState } from "./stream";
import type { ProviderEvent } from "./provider";

export type LoopConfig = {
  forever: boolean;
  count: number | undefined;
};

type SessionFactory = () => AsyncGenerator<ProviderEvent>;
type WriteFn = (s: string) => void;

/**
 * Runs the prompt in single-run, fixed-count, or infinite mode.
 *
 * - Single-run (forever=false, count=undefined): executes one session, no header.
 *   Returns false if the session throws or the SDK yields a non-success result.
 * - Fixed count (count=N): runs N iterations with `loop i / N` headers.
 * - Infinite (forever=true): runs until signal is aborted, with `loop N` headers.
 *
 * Returns true on success, false on failure. Loop modes always return true
 * because errors are caught per-iteration and don't represent overall failure.
 *
 * errWrite receives error output (caught exceptions, non-success SDK results).
 * Falls back to write if not provided for backwards compatibility.
 */
export async function runLoop(
  config: LoopConfig,
  createSession: SessionFactory,
  write: WriteFn,
  signal?: AbortSignal,
  errWrite?: WriteFn
): Promise<boolean> {
  // Infinite mode: --forever
  if (config.forever) {
    for (let i = 1; ; i++) {
      if (signal?.aborted) break;
      write(formatLoopHeader(i) + "\n");
      const state = createStreamState();
      const errTarget = errWrite ?? write;
      try {
        const session = createSession();
        for await (const event of session) {
          processProviderEvent(event, write, state, errWrite);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errTarget(`\x1b[31merror: ${message}\x1b[0m\n`);
      }
      if (signal?.aborted) break;
    }
    return true;
  }

  // Fixed count mode: --count N (count validated as >= 1 in index.ts)
  if (config.count !== undefined) {
    for (let i = 1; i <= config.count; i++) {
      if (signal?.aborted) break;
      write(formatLoopHeader(i, config.count) + "\n");
      const state = createStreamState();
      const errTarget = errWrite ?? write;
      try {
        const session = createSession();
        for await (const event of session) {
          processProviderEvent(event, write, state, errWrite);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errTarget(`\x1b[31merror: ${message}\x1b[0m\n`);
      }
      if (signal?.aborted) break;
    }
    return true;
  }

  // Single-run mode: no flags, run once with no header.
  // Unlike loop modes, single-run propagates failure to the caller
  // so index.ts can exit non-zero when the agent fails.
  let failed = false;
  const state = createStreamState();
  const errTarget = errWrite ?? write;
  try {
    const session = createSession();
    for await (const event of session) {
      processProviderEvent(event, write, state, errWrite);
      if (event.type === "result" && !event.success) {
        failed = true;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errTarget(`\x1b[31merror: ${message}\x1b[0m\n`);
    failed = true;
  }
  return !failed;
}
