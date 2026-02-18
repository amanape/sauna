import { test, expect, describe } from 'bun:test';
import {
  formatToolTag,
  formatSummary,
  formatLoopHeader,
  formatError,
  processMessage,
  createStreamState,
  type StreamState,
} from '../src/stream';

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

  describe('processMessage', () => {
    /**
     * processMessage receives SDK messages and writes formatted output.
     * It accepts a `write` callback to decouple from stdout, making tests
     * deterministic — we capture output in an array instead of mocking process.stdout.
     */
    function collect() {
      const chunks: string[] = [];
      const write = (s: string) => {
        chunks.push(s);
      };
      return { chunks, write };
    }

    test('writes text_delta content to output', () => {
      const { chunks, write } = collect();
      processMessage(
        {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'Hello' },
          },
          parent_tool_use_id: null,
          uuid: 'test-uuid' as any,
          session_id: 'test-session',
        },
        write,
      );
      expect(chunks).toEqual(['\x1b[38;5;250mHello\x1b[0m']);
    });

    test('writes dim tool tag on content_block_start for tool_use', () => {
      const { chunks, write } = collect();
      processMessage(
        {
          type: 'stream_event',
          event: {
            type: 'content_block_start',
            index: 1,
            content_block: {
              type: 'tool_use',
              id: 'toolu_123',
              name: 'Bash',
              input: {},
            },
          },
          parent_tool_use_id: null,
          uuid: 'test-uuid' as any,
          session_id: 'test-session',
        },
        write,
      );
      expect(chunks.length).toBe(1);
      expect(chunks[0]).toContain('[Bash]');
      // Should be dim
      expect(chunks[0]).toMatch(/\x1b\[2m/);
    });

    test('writes summary on success result', () => {
      const { chunks, write } = collect();
      processMessage(
        {
          type: 'result',
          subtype: 'success',
          duration_ms: 5000,
          duration_api_ms: 4000,
          is_error: false,
          num_turns: 2,
          result: 'done',
          stop_reason: 'end_turn',
          total_cost_usd: 0.01,
          usage: {
            input_tokens: 800,
            output_tokens: 200,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
          modelUsage: {},
          permission_denials: [],
          uuid: 'test-uuid' as any,
          session_id: 'test-session',
        },
        write,
      );
      expect(chunks.length).toBe(1);
      expect(chunks[0]).toContain('1000 tokens');
      expect(chunks[0]).toContain('2 turns');
      expect(chunks[0]).toContain('5.0s');
    });

    test('writes red error on error result', () => {
      const { chunks, write } = collect();
      processMessage(
        {
          type: 'result',
          subtype: 'error_during_execution',
          duration_ms: 3000,
          duration_api_ms: 2000,
          is_error: true,
          num_turns: 1,
          stop_reason: null,
          total_cost_usd: 0.005,
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
          modelUsage: {},
          permission_denials: [],
          errors: ['Connection timeout'],
          uuid: 'test-uuid' as any,
          session_id: 'test-session',
        },
        write,
      );
      expect(chunks.length).toBe(1);
      expect(chunks[0]).toContain('error_during_execution');
      expect(chunks[0]).toContain('Connection timeout');
      expect(chunks[0]).toMatch(/\x1b\[31m/);
    });

    test('ignores unrelated message types', () => {
      const { chunks, write } = collect();
      processMessage(
        {
          type: 'system',
          subtype: 'init',
        } as any,
        write,
      );
      expect(chunks).toEqual([]);
    });
  });

  describe('P1: output formatting state tracking', () => {
    /**
     * processMessage is stateful — it tracks whether the last character
     * written was a newline and whether any text has been output yet.
     * This state is passed in via a StreamState object and mutated
     * by each call, enabling correct newline insertion and leading
     * whitespace stripping across a sequence of messages.
     */

    // Helper: make a text_delta stream event
    function textDelta(text: string) {
      return {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text },
        },
      };
    }

    // Helper: make a tool_use content_block_start
    function toolStart(name: string) {
      return {
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          content_block: { type: 'tool_use', name },
        },
      };
    }

    // Helper: make a success result
    function result() {
      return {
        type: 'result',
        subtype: 'success',
        usage: { input_tokens: 100, output_tokens: 50 },
        num_turns: 1,
        duration_ms: 1000,
      };
    }

    // Helper: collect output from a sequence of messages with shared state
    function collectStateful(messages: any[]): string {
      const chunks: string[] = [];
      const write = (s: string) => chunks.push(s);
      const state = createStreamState();
      for (const msg of messages) {
        processMessage(msg, write, state);
      }
      return chunks.join('');
    }

    test('tool tag after text lacking trailing newline gets newline inserted', () => {
      const output = collectStateful([
        textDelta('hello world'),
        toolStart('Read'),
      ]);
      // "hello world" doesn't end with \n, so \n should be inserted before [Read]
      expect(output).toBe('\x1b[38;5;250mhello world\x1b[0m\n\x1b[2m[Read]\x1b[22m\n');
    });

    test('tool tag after text ending with newline gets no extra newline', () => {
      const output = collectStateful([
        textDelta('hello world\n'),
        toolStart('Read'),
      ]);
      // Already ends with \n — no extra \n before [Read]
      expect(output).toBe('\x1b[38;5;250mhello world\n\x1b[0m\x1b[2m[Read]\x1b[22m\n');
    });

    test('first text output with leading blank lines has them stripped', () => {
      const output = collectStateful([textDelta('\n\n\nhello')]);
      expect(output).toBe('\x1b[38;5;250mhello\x1b[0m');
    });

    test('leading whitespace stripping only applies to first text output', () => {
      const output = collectStateful([
        textDelta('first'),
        textDelta('\n\nsecond'),
      ]);
      // Only first text gets stripped; subsequent preserves leading whitespace
      expect(output).toBe('\x1b[38;5;250mfirst\x1b[0m\x1b[38;5;250m\n\nsecond\x1b[0m');
    });

    test('consecutive tool calls each start on their own line', () => {
      const output = collectStateful([
        toolStart('Read'),
        toolStart('Write'),
        toolStart('Bash'),
      ]);
      expect(output).toBe(
        '\x1b[2m[Read]\x1b[22m\n' +
          '\x1b[2m[Write]\x1b[22m\n' +
          '\x1b[2m[Bash]\x1b[22m\n',
      );
    });

    test('session with only tool calls and summary formats correctly', () => {
      const output = collectStateful([toolStart('Read'), toolStart('Write'), result()]);
      // Tool tags each on own line, no leading blank line
      expect(output).toContain('\x1b[2m[Read]\x1b[22m\n');
      expect(output).toContain('\x1b[2m[Write]\x1b[22m\n');
      // Summary follows
      expect(output).toContain('150 tokens');
      // No double blank line between last tool tag and summary
      expect(output).not.toMatch(/\n\n\n/);
    });

    test('summary has exactly one newline separator from preceding text', () => {
      const output = collectStateful([textDelta('done'), result()]);
      // "done" + RESET + \n + summary — single newline separator
      expect(output).toMatch(/done\x1b\[0m\n\x1b\[2m150 tokens/);
    });

    test('session with only a result message (no text, no tools) renders summary correctly', () => {
      // When the agent produces no text and no tool calls, only a result message,
      // the summary should render without spurious leading newlines.
      const output = collectStateful([result()]);
      // Summary should start immediately (lastCharWasNewline defaults to true,
      // so no separator is prepended)
      expect(output).toMatch(/^\x1b\[2m150 tokens/);
      // Should end with newline
      expect(output).toMatch(/\n$/);
      // No double newlines
      expect(output).not.toContain('\n\n');
    });
  });

  describe('agent message color', () => {
    /**
     * Agent text output should be wrapped in ANSI 245 (mid-gray) so it's
     * visually distinct from user input. The color is applied to text_delta
     * content and result fallback text, but NOT to tool tags, summaries,
     * or error messages.
     */

    const AGENT_COLOR = '\x1b[38;5;250m';
    const RESET = '\x1b[0m';

    // Helper: make a text_delta stream event
    function textDelta(text: string) {
      return {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text },
        },
      };
    }

    // Helper: make a tool_use content_block_start
    function toolStart(name: string) {
      return {
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          content_block: { type: 'tool_use', name },
        },
      };
    }

    // Helper: collect output from a sequence of messages with shared state
    function collectStateful(messages: any[]): string {
      const chunks: string[] = [];
      const write = (s: string) => chunks.push(s);
      const state = createStreamState();
      for (const msg of messages) {
        processMessage(msg, write, state);
      }
      return chunks.join('');
    }

    test('text_delta content is wrapped in ANSI 245 color', () => {
      const output = collectStateful([textDelta('Hello')]);
      expect(output).toBe(AGENT_COLOR + 'Hello' + RESET);
    });

    test('leading newlines stripped before coloring', () => {
      const output = collectStateful([textDelta('\n\n\nhello')]);
      // Leading newlines removed first, then remaining text colored
      expect(output).toBe(AGENT_COLOR + 'hello' + RESET);
    });

    test('color reset at end of each chunk so tool tags are unaffected', () => {
      const output = collectStateful([
        textDelta('thinking...'),
        toolStart('Read'),
      ]);
      // Text colored, then reset before tool tag
      expect(output).toContain(AGENT_COLOR + 'thinking...' + RESET);
      // Tool tag uses dim, not agent color
      expect(output).toContain('\x1b[2m[Read]\x1b[22m');
    });

    test('lastCharWasNewline tracks correctly through colored output', () => {
      const output = collectStateful([
        textDelta('hello\n'),
        toolStart('Read'),
      ]);
      // Text ends with \n (inside color), so no extra \n before tool tag
      expect(output).toBe(
        AGENT_COLOR + 'hello\n' + RESET +
        '\x1b[2m[Read]\x1b[22m\n'
      );
    });

    test('result fallback text is also colored with AGENT_COLOR', () => {
      const output = collectStateful([
        {
          type: 'result',
          subtype: 'success',
          result: 'fallback answer',
          usage: { input_tokens: 100, output_tokens: 50 },
          num_turns: 1,
          duration_ms: 1000,
        },
      ]);
      // Fallback text should be colored
      expect(output).toContain(AGENT_COLOR + 'fallback answer' + RESET);
    });

    test('tool tags and summaries are NOT colored with AGENT_COLOR', () => {
      const output = collectStateful([
        toolStart('Bash'),
        {
          type: 'result',
          subtype: 'success',
          usage: { input_tokens: 100, output_tokens: 50 },
          num_turns: 1,
          duration_ms: 1000,
        },
      ]);
      // Tool tag should use dim, not agent color
      expect(output).not.toMatch(new RegExp(AGENT_COLOR.replace(/[[\]]/g, '\\$&') + '\\[Bash\\]'));
      // Summary should use dim, not agent color
      expect(output).toContain('\x1b[2m');
    });
  });

  describe('P4: error output routing', () => {
    test('non-success result writes to errWrite, not write', () => {
      const stdout: string[] = [];
      const stderr: string[] = [];
      const write = (s: string) => stdout.push(s);
      const errWrite = (s: string) => stderr.push(s);
      const state = createStreamState();

      processMessage(
        {
          type: 'result',
          subtype: 'error_during_execution',
          errors: ['something broke'],
          usage: { input_tokens: 100, output_tokens: 50 },
          num_turns: 1,
          duration_ms: 1000,
        },
        write,
        state,
        errWrite,
      );

      const stdoutJoined = stdout.join('');
      const stderrJoined = stderr.join('');
      expect(stderrJoined).toContain('something broke');
      expect(stderrJoined).toContain('error_during_execution');
      expect(stdoutJoined).not.toContain('something broke');
      expect(stdoutJoined).not.toContain('error_during_execution');
    });

    test('success result still writes to write (stdout)', () => {
      const stdout: string[] = [];
      const stderr: string[] = [];
      const write = (s: string) => stdout.push(s);
      const errWrite = (s: string) => stderr.push(s);
      const state = createStreamState();

      processMessage(
        {
          type: 'result',
          subtype: 'success',
          result: 'done',
          usage: { input_tokens: 100, output_tokens: 50 },
          num_turns: 1,
          duration_ms: 1000,
        },
        write,
        state,
        errWrite,
      );

      const stdoutJoined = stdout.join('');
      const stderrJoined = stderr.join('');
      // Success summary goes to stdout
      expect(stdoutJoined).toContain('150 tokens');
      // Nothing in stderr
      expect(stderrJoined).toBe('');
    });

    test('without errWrite, non-success result falls back to write (backwards-compat)', () => {
      const output: string[] = [];
      const write = (s: string) => output.push(s);
      const state = createStreamState();

      processMessage(
        {
          type: 'result',
          subtype: 'error_during_execution',
          errors: ['fallback test'],
          usage: { input_tokens: 10, output_tokens: 5 },
          num_turns: 1,
          duration_ms: 100,
        },
        write,
        state,
      );

      const joined = output.join('');
      expect(joined).toContain('fallback test');
    });
  });
});
