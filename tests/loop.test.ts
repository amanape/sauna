/**
 * Loop Mode Tests (P4)
 *
 * Tests the loop orchestration logic and header formatting.
 * Loop mode repeats the same prompt across multiple fresh agent sessions.
 * Each iteration is independent — errors in one don't halt subsequent ones.
 */
import { test, expect, describe } from 'bun:test';
import { formatLoopHeader } from '../src/stream';
import { runLoop, type LoopConfig } from '../src/loop';

describe('formatLoopHeader', () => {
  test('infinite mode shows iteration number only', () => {
    const header = formatLoopHeader(3);
    expect(header).toContain('loop 3');
    // Should be bold (ANSI bold code)
    expect(header).toContain('\x1b[1m');
    expect(header).not.toContain('/');
  });

  test('fixed count mode shows iteration and total', () => {
    const header = formatLoopHeader(2, 5);
    expect(header).toContain('loop 2 / 5');
    expect(header).toContain('\x1b[1m');
  });
});

// Helpers for loop orchestration tests
function makeSuccessResult() {
  return {
    type: 'result',
    subtype: 'success',
    usage: { input_tokens: 100, output_tokens: 50 },
    num_turns: 1,
    duration_ms: 1000,
  };
}

function makeErrorResult(subtype = 'error', errors: string[] = ['something went wrong']) {
  return {
    type: 'result',
    subtype,
    errors,
  };
}

/** Creates a mock session factory that yields a success result per iteration */
function mockSessionFactory(opts?: { failOnIteration?: number }) {
  const calls: number[] = [];
  let callCount = 0;

  async function* fakeSession(): AsyncGenerator<any> {
    const n = ++callCount;
    calls.push(n);
    if (opts?.failOnIteration === n) {
      throw new Error(`iteration ${n} failed`);
    }
    yield makeSuccessResult();
  }

  return { run: () => fakeSession(), calls };
}

describe('runLoop', () => {
  test('no flags: runs once, no header', async () => {
    const output: string[] = [];
    const factory = mockSessionFactory();

    await runLoop({ forever: false, count: undefined }, factory.run, (s) =>
      output.push(s),
    );

    expect(factory.calls).toEqual([1]);
    // No loop header should appear
    const joined = output.join('');
    expect(joined).not.toContain('loop');
  });

  test('--count 3: runs exactly 3 iterations with headers', async () => {
    const output: string[] = [];
    const factory = mockSessionFactory();

    await runLoop({ forever: false, count: 3 }, factory.run, (s) => output.push(s));

    expect(factory.calls).toEqual([1, 2, 3]);
    const joined = output.join('');
    expect(joined).toContain('loop 1 / 3');
    expect(joined).toContain('loop 2 / 3');
    expect(joined).toContain('loop 3 / 3');
  });

  test('--count 1: runs once with header', async () => {
    const output: string[] = [];
    const factory = mockSessionFactory();

    await runLoop({ forever: false, count: 1 }, factory.run, (s) => output.push(s));

    expect(factory.calls).toEqual([1]);
    const joined = output.join('');
    expect(joined).toContain('loop 1 / 1');
  });

  test('error in one iteration does not halt subsequent iterations', async () => {
    const output: string[] = [];
    const factory = mockSessionFactory({ failOnIteration: 2 });

    await runLoop({ forever: false, count: 3 }, factory.run, (s) => output.push(s));

    // All 3 iterations should have been attempted
    expect(factory.calls).toEqual([1, 2, 3]);
    // Error should be displayed
    const joined = output.join('');
    expect(joined).toContain('iteration 2 failed');
  });

  test('formatting state resets between loop iterations', async () => {
    // Verify StreamState does not leak between iterations.
    // Iteration 1: text without trailing newline → tool tag should get \n prefix.
    // Iteration 2: tool tag as first output → should NOT get \n prefix (fresh state).
    // If state leaked from iteration 1, iteration 2's tool tag would wrongly
    // inherit lastCharWasNewline=true from the result at end of iteration 1,
    // which happens to be correct. So instead we test with:
    // Iteration 1: text without trailing newline (no result) — state has lastCharWasNewline=false
    // Iteration 2: leading blank lines in text — should be stripped (isFirstTextOutput=true)
    //
    // If isFirstTextOutput leaked as false, the leading \n wouldn't be stripped.
    let callCount = 0;
    const output: string[] = [];

    async function* fakeSession(): AsyncGenerator<any> {
      callCount++;
      if (callCount === 1) {
        // Iteration 1: text without trailing newline, then result
        yield {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'iter1' },
          },
        };
        yield makeSuccessResult();
      } else {
        // Iteration 2: text with leading blank lines — should be stripped if state is fresh
        yield {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: '\n\niter2' },
          },
        };
        yield makeSuccessResult();
      }
    }

    await runLoop(
      { forever: false, count: 2 },
      () => fakeSession(),
      (s) => output.push(s),
    );

    const joined = output.join('');
    // Iteration 2's leading blank lines should be stripped (fresh isFirstTextOutput=true)
    // If state leaked, "\n\niter2" would appear verbatim
    expect(joined).toContain('iter2');
    expect(joined).not.toMatch(/loop 2 \/ 2.*\n\n\niter2/s);
    // Verify the text appears right after the header+newline+summary structure
    // The key assertion: no double newline before iter2's text
    const iter2Start = joined.indexOf('iter2');
    // 'iter2' should appear and should not be preceded by \n\n (stripped)
    const beforeIter2 = joined.substring(Math.max(0, iter2Start - 3), iter2Start);
    expect(beforeIter2).not.toContain('\n\n');
  });

  test('--forever: runs indefinitely until aborted', async () => {
    // Test infinite mode by aborting after 3 iterations via AbortController
    const output: string[] = [];
    let callCount = 0;
    const abort = new AbortController();

    async function* fakeSession(): AsyncGenerator<any> {
      callCount++;
      if (callCount >= 3) abort.abort();
      yield makeSuccessResult();
    }

    await runLoop(
      { forever: true, count: undefined },
      () => fakeSession(),
      (s) => output.push(s),
      abort.signal,
    );

    expect(callCount).toBe(3);
    const joined = output.join('');
    // Infinite mode headers show just the number, no total
    expect(joined).toContain('loop 1');
    expect(joined).toContain('loop 2');
    expect(joined).toContain('loop 3');
    expect(joined).not.toContain('/');
  });

  test('non-Error thrown value does not print undefined', async () => {
    const output: string[] = [];
    let callCount = 0;

    async function* fakeSession(): AsyncGenerator<any> {
      callCount++;
      if (callCount === 1) {
        throw "string error"; // non-Error value
      }
      yield makeSuccessResult();
    }

    await runLoop({ forever: false, count: 2 }, () => fakeSession(), (s) => output.push(s));

    const joined = output.join('');
    // Should contain the string error, not "undefined"
    expect(joined).toContain('string error');
    expect(joined).not.toContain('undefined');
    // Second iteration should still run
    expect(callCount).toBe(2);
  });

  // P2: single-run mode should signal failure so index.ts can exit 1
  test('single-run: returns false when SDK yields a non-success result', async () => {
    // When the SDK returns an error result (subtype !== "success"),
    // runLoop should return false so the caller can exit non-zero.
    const output: string[] = [];

    async function* fakeSession(): AsyncGenerator<any> {
      yield makeErrorResult('error', ['agent failed']);
    }

    const ok = await runLoop(
      { forever: false, count: undefined },
      () => fakeSession(),
      (s) => output.push(s),
    );

    expect(ok).toBe(false);
    // The error should still be rendered
    const joined = output.join('');
    expect(joined).toContain('agent failed');
  });

  test('single-run: returns true on success', async () => {
    const output: string[] = [];
    const factory = mockSessionFactory();

    const ok = await runLoop(
      { forever: false, count: undefined },
      factory.run,
      (s) => output.push(s),
    );

    expect(ok).toBe(true);
  });

  test('single-run: returns false when session throws', async () => {
    // If the session generator throws (e.g. SDK crash), runLoop should
    // catch it, display the error, and return false instead of propagating.
    const output: string[] = [];

    async function* fakeSession(): AsyncGenerator<any> {
      throw new Error('session crashed');
    }

    const ok = await runLoop(
      { forever: false, count: undefined },
      () => fakeSession(),
      (s) => output.push(s),
    );

    expect(ok).toBe(false);
    const joined = output.join('');
    expect(joined).toContain('session crashed');
  });

  // P6: fixed-count mode should respect signal.aborted between iterations
  test('--count N: stops early when signal is aborted between iterations', async () => {
    const output: string[] = [];
    let callCount = 0;
    const abort = new AbortController();

    async function* fakeSession(): AsyncGenerator<any> {
      callCount++;
      // Abort after iteration 2 completes
      if (callCount >= 2) abort.abort();
      yield makeSuccessResult();
    }

    await runLoop(
      { forever: false, count: 5 },
      () => fakeSession(),
      (s) => output.push(s),
      abort.signal,
    );

    // Should have stopped after 2 iterations, not run all 5
    expect(callCount).toBe(2);
    const joined = output.join('');
    expect(joined).toContain('loop 1 / 5');
    expect(joined).toContain('loop 2 / 5');
    expect(joined).not.toContain('loop 3 / 5');
  });

  // P4: errors should go to errWrite (stderr), not write (stdout)
  test('caught errors in loop mode go to errWrite, not write', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const factory = mockSessionFactory({ failOnIteration: 1 });

    await runLoop(
      { forever: false, count: 2 },
      factory.run,
      (s) => stdout.push(s),
      undefined,
      (s) => stderr.push(s),
    );

    const stdoutJoined = stdout.join('');
    const stderrJoined = stderr.join('');
    // Error message should be in stderr, not stdout
    expect(stderrJoined).toContain('iteration 1 failed');
    expect(stdoutJoined).not.toContain('iteration 1 failed');
  });

  test('caught errors in single-run mode go to errWrite, not write', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    async function* fakeSession(): AsyncGenerator<any> {
      throw new Error('single-run crashed');
    }

    await runLoop(
      { forever: false, count: undefined },
      () => fakeSession(),
      (s) => stdout.push(s),
      undefined,
      (s) => stderr.push(s),
    );

    const stderrJoined = stderr.join('');
    const stdoutJoined = stdout.join('');
    expect(stderrJoined).toContain('single-run crashed');
    expect(stdoutJoined).not.toContain('single-run crashed');
  });

  test('non-success SDK result goes to errWrite, not write', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    async function* fakeSession(): AsyncGenerator<any> {
      yield makeErrorResult('error', ['agent failed']);
    }

    await runLoop(
      { forever: false, count: undefined },
      () => fakeSession(),
      (s) => stdout.push(s),
      undefined,
      (s) => stderr.push(s),
    );

    const stderrJoined = stderr.join('');
    const stdoutJoined = stdout.join('');
    // The formatted error from processMessage should be in stderr
    expect(stderrJoined).toContain('agent failed');
    expect(stdoutJoined).not.toContain('agent failed');
  });
});
