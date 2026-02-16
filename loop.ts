/**
 * Loop orchestration for sauna CLI.
 *
 * Handles single-run vs loop mode, iteration counting, header printing,
 * and error isolation between iterations. Accepts a session factory and
 * write callback for testability — no direct SDK or stdout dependency.
 */
import { formatLoopHeader } from "./stream";
import { processMessage } from "./stream";

export type LoopConfig = {
  loop: boolean;
  count: number | undefined;
};

type SessionFactory = () => AsyncGenerator<any>;
type WriteFn = (s: string) => void;

/**
 * Runs the prompt in single-run or loop mode.
 *
 * - Single-run (loop=false): executes one session, no header.
 * - Fixed count (loop=true, count=N): runs N iterations with `loop i / N` headers.
 * - Infinite (loop=true, count=undefined): runs until signal is aborted.
 *
 * Errors in one iteration are caught and displayed without halting subsequent ones.
 */
export async function runLoop(
  config: LoopConfig,
  createSession: SessionFactory,
  write: WriteFn,
  signal?: AbortSignal
): Promise<void> {
  // Single-run mode: no loop, just run once
  if (!config.loop) {
    const session = createSession();
    for await (const msg of session) {
      processMessage(msg, write);
    }
    return;
  }

  // --count 0: exit immediately
  if (config.count === 0) return;

  if (config.count !== undefined) {
    // Fixed count mode
    for (let i = 1; i <= config.count; i++) {
      write(formatLoopHeader(i, config.count) + "\n");
      try {
        const session = createSession();
        for await (const msg of session) {
          processMessage(msg, write);
        }
      } catch (err: any) {
        write(`\x1b[31merror: ${err.message}\x1b[0m\n`);
      }
    }
  } else {
    // Infinite mode — runs until signal is aborted
    for (let i = 1; ; i++) {
      if (signal?.aborted) break;
      write(formatLoopHeader(i) + "\n");
      try {
        const session = createSession();
        for await (const msg of session) {
          processMessage(msg, write);
        }
      } catch (err: any) {
        write(`\x1b[31merror: ${err.message}\x1b[0m\n`);
      }
      if (signal?.aborted) break;
    }
  }
}
