import { test, expect, describe } from 'bun:test';
import {
  formatToolTag,
  formatSummary,
  formatLoopHeader,
  formatError,
  processProviderEvent,
  createStreamState,
  extractFirstLine,
  redactSecrets,
  type StreamState,
} from '../src/stream';
import type { ProviderEvent } from '../src/provider';

/**
 * P3: Streaming Output
 *
 * These tests verify the formatting functions that produce terminal output
 * for tool invocations, success summaries, and error messages.
 * Pure functions are tested directly — no stdout mocking needed.
 */

describe('P3: Streaming Output', () => {
  describe('formatToolTag', () => {
    test('wraps tool name in dim brackets', () => {
      const result = formatToolTag('Read');
      // Should contain the tool name in brackets
      expect(result).toContain('[Read]');
      // Should have ANSI dim escape codes wrapping it
      expect(result).toMatch(/\x1b\[2m\[Read\]\x1b\[22m/);
    });
  });

  describe('formatSummary', () => {
    test('includes token count, turns, and duration', () => {
      const result = formatSummary({
        inputTokens: 1000,
        outputTokens: 500,
        numTurns: 3,
        durationMs: 12345,
      });
      // Should contain total tokens (input + output)
      expect(result).toContain('1500 tokens');
      expect(result).toContain('3 turns');
      expect(result).toContain('12.3s');
      // Should be dim
      expect(result).toMatch(/\x1b\[2m/);
    });

    test('formats duration under 1 second', () => {
      const result = formatSummary({
        inputTokens: 100,
        outputTokens: 50,
        numTurns: 1,
        durationMs: 450,
      });
      expect(result).toContain('0.5s');
    });

    test('singular turn', () => {
      const result = formatSummary({
        inputTokens: 100,
        outputTokens: 50,
        numTurns: 1,
        durationMs: 1000,
      });
      expect(result).toContain('1 turn');
      // Should NOT say "1 turns"
      expect(result).not.toContain('1 turns');
    });
  });

  describe('formatLoopHeader', () => {
    const BOLD = '\x1b[1m';
    const BOLD_OFF = '\x1b[22m';
    const BAR = '─';

    test('fixed count at 40 columns: bold divider with centered label', () => {
      const result = formatLoopHeader(2, 5, 40);
      // Label "loop 2 / 5" is 10 chars, plus 2 spaces = 12
      // Remaining: 40 - 12 = 28, left = 14, right = 14
      expect(result).toBe(BOLD + BAR.repeat(14) + ' loop 2 / 5 ' + BAR.repeat(14) + BOLD_OFF);
      // Total visual width should be 40
      const stripped = result.replace(/\x1b\[[0-9;]*m/g, '');
      expect(stripped.length).toBe(40);
    });

    test('infinite mode at 40 columns: bold divider with centered label', () => {
      const result = formatLoopHeader(1, undefined, 40);
      // Label "loop 1" is 6 chars, plus 2 spaces = 8
      // Remaining: 40 - 8 = 32, left = 16, right = 16
      expect(result).toBe(BOLD + BAR.repeat(16) + ' loop 1 ' + BAR.repeat(16) + BOLD_OFF);
      const stripped = result.replace(/\x1b\[[0-9;]*m/g, '');
      expect(stripped.length).toBe(40);
    });

    test('odd remaining width gives extra character to right side', () => {
      // At 41 columns with "loop 2 / 5" (10 chars + 2 spaces = 12)
      // Remaining: 41 - 12 = 29, left = 14, right = 15
      const result = formatLoopHeader(2, 5, 41);
      const stripped = result.replace(/\x1b\[[0-9;]*m/g, '');
      expect(stripped.length).toBe(41);
      // Check left bars = 14, right bars = 15
      expect(result).toBe(BOLD + BAR.repeat(14) + ' loop 2 / 5 ' + BAR.repeat(15) + BOLD_OFF);
    });

    test('narrow width falls back to bold label only (no bars)', () => {
      // Label "loop 2 / 5" = 10 chars + 2 spaces + min 2 bars = 14
      // At width 13, can't fit min bars, so fallback to just bold label
      const result = formatLoopHeader(2, 5, 13);
      expect(result).toBe(BOLD + 'loop 2 / 5' + BOLD_OFF);
    });

    test('defaults to 40 columns when no columns argument given', () => {
      const result = formatLoopHeader(3, 10);
      // "loop 3 / 10" = 11 chars + 2 spaces = 13
      // Remaining: 40 - 13 = 27, left = 13, right = 14
      const stripped = result.replace(/\x1b\[[0-9;]*m/g, '');
      expect(stripped.length).toBe(40);
    });
  });

  describe('formatError', () => {
    test('includes subtype and error messages', () => {
      const result = formatError('error_during_execution', [
        'Something went wrong',
      ]);
      expect(result).toContain('error_during_execution');
      expect(result).toContain('Something went wrong');
      // Should have red ANSI escape code
      expect(result).toMatch(/\x1b\[31m/);
    });

    test('handles multiple errors', () => {
      const result = formatError('error_max_turns', [
        'Turn limit reached',
        'Session aborted',
      ]);
      expect(result).toContain('Turn limit reached');
      expect(result).toContain('Session aborted');
    });

    test('handles empty errors array', () => {
      const result = formatError('error_during_execution', []);
      expect(result).toContain('error_during_execution');
    });
  });


  describe('extractFirstLine', () => {
    test('returns single-line string unchanged', () => {
      expect(extractFirstLine('hello')).toBe('hello');
    });

    test('returns first line of multiline string', () => {
      expect(extractFirstLine('line one\nline two\nline three')).toBe('line one');
    });

    test('returns undefined for non-string input', () => {
      expect(extractFirstLine(42)).toBeUndefined();
      expect(extractFirstLine(null)).toBeUndefined();
      expect(extractFirstLine(undefined)).toBeUndefined();
      expect(extractFirstLine({})).toBeUndefined();
      expect(extractFirstLine(['array'])).toBeUndefined();
    });

    test('returns undefined for empty string', () => {
      expect(extractFirstLine('')).toBeUndefined();
    });

    test('returns undefined when first line is empty (starts with newline)', () => {
      expect(extractFirstLine('\nactual content')).toBeUndefined();
    });

    test('handles heredoc-style multiline content', () => {
      const heredoc = 'cat <<EOF\nline 1\nline 2\nEOF';
      expect(extractFirstLine(heredoc)).toBe('cat <<EOF');
    });
  });


  describe('redactSecrets', () => {
    test('redacts export VAR=value assignments', () => {
      expect(redactSecrets('export API_KEY=sk-1234567890')).toBe('export API_KEY=***');
    });

    test('redacts inline VAR=value assignments at start of command', () => {
      expect(redactSecrets('SECRET=mysecret ./run.sh')).toBe('SECRET=*** ./run.sh');
    });

    test('redacts Authorization Bearer headers', () => {
      expect(redactSecrets('curl -H "Authorization: Bearer tok_abc123" api.example.com'))
        .toBe('curl -H "Authorization: Bearer ***" api.example.com');
    });

    test('leaves commands without secrets unchanged', () => {
      expect(redactSecrets('npm install')).toBe('npm install');
      expect(redactSecrets('git status')).toBe('git status');
      expect(redactSecrets('ls -la /home/user')).toBe('ls -la /home/user');
    });

    test('redacts multiple environment variable assignments', () => {
      expect(redactSecrets('FOO=bar BAZ=qux ./run.sh')).toBe('FOO=*** BAZ=*** ./run.sh');
    });

    test('handles export with spaces around equals', () => {
      // export typically doesn't use spaces, but handle the pattern
      expect(redactSecrets('export DB_PASS=hunter2')).toBe('export DB_PASS=***');
    });
  });

});

/**
 * processProviderEvent() — renders ProviderEvent objects to terminal.
 *
 * These tests verify that each ProviderEvent variant produces the correct
 * ANSI-formatted output. Provider-specific adapters convert SDK messages
 * into ProviderEvents; this function is the single rendering layer.
 */
describe('processProviderEvent', () => {
  const AGENT_COLOR = '\x1b[38;5;250m';
  const RESET = '\x1b[0m';
  const DIM = '\x1b[2m';
  const RED = '\x1b[31m';

  function makeWrite() {
    const output: string[] = [];
    return { output, write: (s: string) => output.push(s) };
  }

  describe('text_delta', () => {
    test('writes text in AGENT_COLOR', () => {
      const { output, write } = makeWrite();
      const state = createStreamState();
      const event: ProviderEvent = { type: 'text_delta', text: 'hello world' };

      processProviderEvent(event, write, state);

      const joined = output.join('');
      expect(joined).toContain('hello world');
      expect(joined).toContain(AGENT_COLOR);
      expect(joined).toContain(RESET);
    });

    test('strips leading blank lines from first text output', () => {
      const { output, write } = makeWrite();
      const state = createStreamState();
      const event: ProviderEvent = { type: 'text_delta', text: '\n\nhello' };

      processProviderEvent(event, write, state);

      const joined = output.join('');
      expect(joined).not.toMatch(/^\x1b\[38;5;250m\n/);
      expect(joined).toContain('hello');
    });

    test('tracks newline position: lastCharWasNewline=true after trailing newline', () => {
      const { write } = makeWrite();
      const state = createStreamState();

      processProviderEvent({ type: 'text_delta', text: 'line\n' }, write, state);

      expect(state.lastCharWasNewline).toBe(true);
    });

    test('tracks newline position: lastCharWasNewline=false after non-newline', () => {
      const { write } = makeWrite();
      const state = createStreamState();

      processProviderEvent({ type: 'text_delta', text: 'no newline' }, write, state);

      expect(state.lastCharWasNewline).toBe(false);
    });

    test('skips empty text after leading-newline strip', () => {
      const { output, write } = makeWrite();
      const state = createStreamState();

      processProviderEvent({ type: 'text_delta', text: '\n\n' }, write, state);

      expect(output.join('')).toBe('');
    });
  });

  describe('tool_start', () => {
    test('produces no output', () => {
      const { output, write } = makeWrite();
      const state = createStreamState();

      processProviderEvent({ type: 'tool_start', name: 'Bash' }, write, state);

      expect(output).toHaveLength(0);
    });
  });

  describe('tool_end', () => {
    test('writes dim bracketed tag on its own line', () => {
      const { output, write } = makeWrite();
      const state = createStreamState();

      processProviderEvent({ type: 'tool_end', name: 'Read' }, write, state);

      const joined = output.join('');
      expect(joined).toContain('[Read]');
      expect(joined).toContain(DIM);
      expect(joined).toMatch(/\n$/);
    });

    test('includes detail when provided', () => {
      const { output, write } = makeWrite();
      const state = createStreamState();

      processProviderEvent({ type: 'tool_end', name: 'Bash', detail: 'ls -la' }, write, state);

      const joined = output.join('');
      expect(joined).toContain('[Bash] ls -la');
    });

    test('inserts newline before tag when previous output did not end with newline', () => {
      const { output, write } = makeWrite();
      const state = createStreamState();
      state.lastCharWasNewline = false;

      processProviderEvent({ type: 'tool_end', name: 'Edit' }, write, state);

      expect(output[0]).toMatch(/^\n/);
    });

    test('does not insert extra newline when previous output ended with newline', () => {
      const { output, write } = makeWrite();
      const state = createStreamState(); // lastCharWasNewline=true by default

      processProviderEvent({ type: 'tool_end', name: 'Edit' }, write, state);

      const joined = output.join('');
      expect(joined).not.toMatch(/^\n/);
    });

    test('no crash when called without preceding tool_start', () => {
      const { output, write } = makeWrite();
      const state = createStreamState();

      expect(() => processProviderEvent({ type: 'tool_end', name: 'Bash' }, write, state)).not.toThrow();
      expect(output.join('')).toContain('[Bash]');
    });
  });

  describe('result success', () => {
    test('writes dim summary line', () => {
      const { output, write } = makeWrite();
      const state = createStreamState();
      const event: ProviderEvent = {
        type: 'result',
        success: true,
        summary: { inputTokens: 1000, outputTokens: 500, numTurns: 3, durationMs: 2100 },
      };

      processProviderEvent(event, write, state);

      const joined = output.join('');
      expect(joined).toContain('1500 tokens');
      expect(joined).toContain('3 turns');
      expect(joined).toContain('2.1s');
      expect(joined).toContain(DIM);
    });

    test('inserts newline separator when previous output did not end with newline', () => {
      const { output, write } = makeWrite();
      const state = createStreamState();
      state.lastCharWasNewline = false;
      const event: ProviderEvent = {
        type: 'result',
        success: true,
        summary: { inputTokens: 100, outputTokens: 50, numTurns: 1, durationMs: 1000 },
      };

      processProviderEvent(event, write, state);

      expect(output[0]).toMatch(/^\n/);
    });

    test('no extra newline separator when previous output ended with newline', () => {
      const { output, write } = makeWrite();
      const state = createStreamState(); // lastCharWasNewline=true

      const event: ProviderEvent = {
        type: 'result',
        success: true,
        summary: { inputTokens: 100, outputTokens: 50, numTurns: 1, durationMs: 1000 },
      };

      processProviderEvent(event, write, state);

      const joined = output.join('');
      expect(joined).not.toMatch(/^\n/);
    });
  });

  describe('result failure', () => {
    test('writes red error to errWrite when provided', () => {
      const { output: out, write } = makeWrite();
      const { output: errOut, write: errWrite } = makeWrite();
      const state = createStreamState();
      const event: ProviderEvent = {
        type: 'result',
        success: false,
        errors: ['something went wrong'],
      };

      processProviderEvent(event, write, state, errWrite);

      expect(errOut.join('')).toContain('something went wrong');
      expect(errOut.join('')).toContain(RED);
      expect(out).toHaveLength(0);
    });

    test('writes to write when errWrite not provided', () => {
      const { output, write } = makeWrite();
      const state = createStreamState();
      const event: ProviderEvent = {
        type: 'result',
        success: false,
        errors: ['agent failed'],
      };

      processProviderEvent(event, write, state);

      expect(output.join('')).toContain('agent failed');
    });
  });

  describe('error event', () => {
    test('writes red message to errWrite when provided', () => {
      const { output: out, write } = makeWrite();
      const { output: errOut, write: errWrite } = makeWrite();
      const state = createStreamState();
      const event: ProviderEvent = { type: 'error', message: 'connection refused' };

      processProviderEvent(event, write, state, errWrite);

      expect(errOut.join('')).toContain('connection refused');
      expect(errOut.join('')).toContain(RED);
      expect(out).toHaveLength(0);
    });

    test('writes to write when errWrite not provided', () => {
      const { output, write } = makeWrite();
      const state = createStreamState();
      const event: ProviderEvent = { type: 'error', message: 'timeout' };

      processProviderEvent(event, write, state);

      expect(output.join('')).toContain('timeout');
    });
  });
});
