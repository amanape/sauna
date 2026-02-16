/**
 * Loop orchestration for sauna CLI.
 *
 * Handles single-run vs loop mode, iteration counting, header printing,
 * and error isolation between iterations. Accepts a session factory and
 * write callback for testability — no direct SDK or stdout dependency.
 */
import { formatLoopHeader, processMessage, createStreamState } from "./stream";

export type LoopConfig = {
  forever: boolean;
  count: number | undefined;
};

type SessionFactory = () => AsyncGenerator<any>;
type WriteFn = (s: string) => void;

/**
 * Runs the prompt in single-run, fixed-count, or infinite mode.
 *
 * - Single-run (forever=false, count=undefined): executes one session, no header.
 * - Fixed count (count=N): runs N iterations with `loop i / N` headers.
 * - Infinite (forever=true): runs until signal is aborted, with `loop N` headers.
 *
 * Errors in one iteration are caught and displayed without halting subsequent ones.
 */
export async function runLoop(
  config: LoopConfig,
  createSession: SessionFactory,
  write: WriteFn,
  signal?: AbortSignal
): Promise<void> {
  // Infinite mode: --forever
  if (config.forever) {
    for (let i = 1; ; i++) {
      if (signal?.aborted) break;
      write(formatLoopHeader(i) + "\n");
      const state = createStreamState();
      try {
        const session = createSession();
        for await (const msg of session) {
          processMessage(msg, write, state);
        }
      } catch (err: any) {
        write(`\x1b[31merror: ${err.message}\x1b[0m\n`);
      }
      if (signal?.aborted) break;
    }
    return;
  }

  // Fixed count mode: --count N
  if (config.count !== undefined) {
    if (config.count === 0) return;
    for (let i = 1; i <= config.count; i++) {
      write(formatLoopHeader(i, config.count) + "\n");
      const state = createStreamState();
      try {
        const session = createSession();
        for await (const msg of session) {
          processMessage(msg, write, state);
        }
      } catch (err: any) {
        write(`\x1b[31merror: ${err.message}\x1b[0m\n`);
      }
    }
    return;
  }

  // Single-run mode: no flags, run once with no header
  const state = createStreamState();
  const session = createSession();
  for await (const msg of session) {
    processMessage(msg, write, state);
  }
}
