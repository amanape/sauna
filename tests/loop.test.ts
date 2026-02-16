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
    // Should be dim (ANSI dim code)
    expect(header).toContain('\x1b[2m');
    expect(header).not.toContain('/');
  });

  test('fixed count mode shows iteration and total', () => {
    const header = formatLoopHeader(2, 5);
    expect(header).toContain('loop 2 / 5');
    expect(header).toContain('\x1b[2m');
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
  test('single-run mode (no --loop): runs once, no header', async () => {
    const output: string[] = [];
    const factory = mockSessionFactory();

    await runLoop({ loop: false, count: undefined }, factory.run, (s) =>
      output.push(s),
    );

    expect(factory.calls).toEqual([1]);
    // No loop header should appear
    const joined = output.join('');
    expect(joined).not.toContain('loop');
  });

  test('--loop --count 3: runs exactly 3 iterations with headers', async () => {
    const output: string[] = [];
    const factory = mockSessionFactory();

    await runLoop({ loop: true, count: 3 }, factory.run, (s) => output.push(s));

    expect(factory.calls).toEqual([1, 2, 3]);
    const joined = output.join('');
    expect(joined).toContain('loop 1 / 3');
    expect(joined).toContain('loop 2 / 3');
    expect(joined).toContain('loop 3 / 3');
  });

  test('--loop --count 0: runs zero iterations', async () => {
    const output: string[] = [];
    const factory = mockSessionFactory();

    await runLoop({ loop: true, count: 0 }, factory.run, (s) => output.push(s));

    expect(factory.calls).toEqual([]);
  });

  test('--loop --count 1: runs once with header', async () => {
    const output: string[] = [];
    const factory = mockSessionFactory();

    await runLoop({ loop: true, count: 1 }, factory.run, (s) => output.push(s));

    expect(factory.calls).toEqual([1]);
    const joined = output.join('');
    expect(joined).toContain('loop 1 / 1');
  });

  test('error in one iteration does not halt subsequent iterations', async () => {
    const output: string[] = [];
    const factory = mockSessionFactory({ failOnIteration: 2 });

    await runLoop({ loop: true, count: 3 }, factory.run, (s) => output.push(s));

    // All 3 iterations should have been attempted
    expect(factory.calls).toEqual([1, 2, 3]);
    // Error should be displayed
    const joined = output.join('');
    expect(joined).toContain('iteration 2 failed');
  });

  test('--loop without --count: runs indefinitely until aborted', async () => {
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
      { loop: true, count: undefined },
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
});
