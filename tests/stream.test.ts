import { test, expect, describe } from 'bun:test';
import {
  formatToolTag,
  formatSummary,
  formatError,
  processMessage,
  createStreamState,
  extractFirstLine,
  redactSecrets,
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
      expect(chunks).toEqual(['Hello']);
    });

    test('writes dim tool tag on content_block_start for tool_use (stateless)', () => {
      const { chunks, write } = collect();
      // Without state, content_block_start emits the tag immediately (bare)
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

    test('writes dim tool tag on content_block_stop with state', () => {
      const { chunks, write } = collect();
      const state = createStreamState();
      // With state, tag is deferred to content_block_stop
      processMessage(
        {
          type: 'stream_event',
          event: {
            type: 'content_block_start',
            content_block: { type: 'tool_use', name: 'Bash', input: {} },
          },
        },
        write,
        state,
      );
      // Nothing written yet at content_block_start
      expect(chunks).toEqual([]);

      processMessage(
        {
          type: 'stream_event',
          event: { type: 'content_block_stop', index: 1 },
        },
        write,
        state,
      );
      expect(chunks.length).toBe(1);
      expect(chunks[0]).toContain('[Bash]');
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

    // Helper: make a tool_use sequence (start + stop) with no input
    function toolEvents(name: string) {
      return [
        {
          type: 'stream_event',
          event: {
            type: 'content_block_start',
            content_block: { type: 'tool_use', name },
          },
        },
        {
          type: 'stream_event',
          event: { type: 'content_block_stop', index: 0 },
        },
      ];
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
        ...toolEvents('Read'),
      ]);
      // "hello world" doesn't end with \n, so \n should be inserted before [Read]
      expect(output).toBe('hello world\n\x1b[2m[Read]\x1b[22m\n');
    });

    test('tool tag after text ending with newline gets no extra newline', () => {
      const output = collectStateful([
        textDelta('hello world\n'),
        ...toolEvents('Read'),
      ]);
      // Already ends with \n — no extra \n before [Read]
      expect(output).toBe('hello world\n\x1b[2m[Read]\x1b[22m\n');
    });

    test('first text output with leading blank lines has them stripped', () => {
      const output = collectStateful([textDelta('\n\n\nhello')]);
      expect(output).toBe('hello');
    });

    test('leading whitespace stripping only applies to first text output', () => {
      const output = collectStateful([
        textDelta('first'),
        textDelta('\n\nsecond'),
      ]);
      // Only first text gets stripped; subsequent preserves leading whitespace
      expect(output).toBe('first\n\nsecond');
    });

    test('consecutive tool calls each start on their own line', () => {
      const output = collectStateful([
        ...toolEvents('Read'),
        ...toolEvents('Write'),
        ...toolEvents('Bash'),
      ]);
      expect(output).toBe(
        '\x1b[2m[Read]\x1b[22m\n' +
          '\x1b[2m[Write]\x1b[22m\n' +
          '\x1b[2m[Bash]\x1b[22m\n',
      );
    });

    test('session with only tool calls and summary formats correctly', () => {
      const output = collectStateful([...toolEvents('Read'), ...toolEvents('Write'), result()]);
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
      // "done" + \n + summary — single newline separator
      expect(output).toMatch(/done\n\x1b\[2m150 tokens/);
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

  describe('P5: enhanced tool detail display', () => {
    /**
     * Tool tags should display contextual details extracted from the tool input.
     * The Anthropic streaming API sends input incrementally via input_json_delta
     * events, so details are displayed at content_block_stop after accumulation.
     * Format: [ToolName] details
     * Details are redacted for security and truncated to first line.
     *
     * UNTYPED SDK DEPENDENCY:
     * We assume the accumulated input has shape { [key: string]: any }
     * Known properties: file_path, command, description, pattern, query
     * These are untyped dependencies on SDK internals.
     */

    // Helper: simulate full tool streaming sequence (start → input_json_delta → stop)
    function toolStreamSequence(name: string, input: Record<string, any>) {
      return [
        {
          type: 'stream_event',
          event: {
            type: 'content_block_start',
            content_block: { type: 'tool_use', name, input: {} },
          },
        },
        {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) },
          },
        },
        {
          type: 'stream_event',
          event: { type: 'content_block_stop', index: 0 },
        },
      ];
    }

    function collectToolTag(name: string, input: Record<string, any>): string {
      const chunks: string[] = [];
      const write = (s: string) => chunks.push(s);
      const state = createStreamState();
      for (const msg of toolStreamSequence(name, input)) {
        processMessage(msg, write, state);
      }
      return chunks.join('');
    }

    test('Read tool shows file_path', () => {
      const output = collectToolTag('Read', { file_path: '/src/stream.ts' });
      expect(output).toContain('[Read] /src/stream.ts');
    });

    test('Write tool shows file_path', () => {
      const output = collectToolTag('Write', { file_path: '/src/cli.ts' });
      expect(output).toContain('[Write] /src/cli.ts');
    });

    test('Edit tool shows file_path', () => {
      const output = collectToolTag('Edit', { file_path: '/src/loop.ts' });
      expect(output).toContain('[Edit] /src/loop.ts');
    });

    test('Bash tool shows command', () => {
      const output = collectToolTag('Bash', { command: 'npm install' });
      expect(output).toContain('[Bash] npm install');
    });

    test('Task tool shows description', () => {
      const output = collectToolTag('Task', { description: 'Explore codebase' });
      expect(output).toContain('[Task] Explore codebase');
    });

    test('Glob tool shows pattern', () => {
      const output = collectToolTag('Glob', { pattern: '**/*.ts' });
      expect(output).toContain('[Glob] **/*.ts');
    });

    test('Grep tool shows pattern', () => {
      const output = collectToolTag('Grep', { pattern: 'function' });
      expect(output).toContain('[Grep] function');
    });

    test('WebSearch tool shows query', () => {
      const output = collectToolTag('WebSearch', { query: 'latest AI developments' });
      expect(output).toContain('[WebSearch] latest AI developments');
    });

    test('unknown tool with no recognized params shows just tag', () => {
      const output = collectToolTag('CustomTool', { foo: 'bar' });
      expect(output).toContain('[CustomTool]');
      expect(output).not.toContain('bar');
    });

    test('tool with empty input shows just tag', () => {
      // Simulate tool with no input_json_delta (just start → stop)
      const chunks: string[] = [];
      const write = (s: string) => chunks.push(s);
      const state = createStreamState();
      processMessage(
        {
          type: 'stream_event',
          event: {
            type: 'content_block_start',
            content_block: { type: 'tool_use', name: 'Read', input: {} },
          },
        },
        write,
        state,
      );
      processMessage(
        {
          type: 'stream_event',
          event: { type: 'content_block_stop', index: 0 },
        },
        write,
        state,
      );
      const output = chunks.join('');
      expect(output).toContain('[Read]');
      // No trailing space when no detail
      expect(output).toMatch(/\[Read\]\x1b/);
    });

    test('tool with empty string detail shows just tag', () => {
      // Spec edge case: "Tool with empty string details: Display just [ToolName]"
      const output = collectToolTag('Read', { file_path: '' });
      expect(output).toContain('[Read]');
      expect(output).toMatch(/\[Read\]\x1b/);
      expect(output).not.toMatch(/\[Read\] /);
    });

    test('entire line is dim formatted', () => {
      const output = collectToolTag('Read', { file_path: '/foo.ts' });
      // Should start with DIM and end with DIM_OFF before newline
      expect(output).toMatch(/\x1b\[2m\[Read\] \/foo\.ts\x1b\[22m\n/);
    });

    test('Bash command with secrets is redacted', () => {
      const output = collectToolTag('Bash', { command: 'export API_KEY=sk-12345' });
      expect(output).toContain('[Bash] export API_KEY=***');
      expect(output).not.toContain('sk-12345');
    });

    test('multiline command shows only first line', () => {
      const output = collectToolTag('Bash', { command: 'cat <<EOF\nline1\nline2\nEOF' });
      expect(output).toContain('[Bash] cat <<EOF');
      expect(output).not.toContain('line1');
    });

    test('tool with no input_json_delta shows just tag', () => {
      // content_block_start → content_block_stop, no delta in between
      const chunks: string[] = [];
      const write = (s: string) => chunks.push(s);
      const state = createStreamState();
      processMessage(
        {
          type: 'stream_event',
          event: {
            type: 'content_block_start',
            content_block: { type: 'tool_use', name: 'Read', input: {} },
          },
        },
        write,
        state,
      );
      processMessage(
        {
          type: 'stream_event',
          event: { type: 'content_block_stop', index: 0 },
        },
        write,
        state,
      );
      const output = chunks.join('');
      expect(output).toContain('[Read]');
    });

    test('malformed JSON in accumulated input shows just tag', () => {
      const chunks: string[] = [];
      const write = (s: string) => chunks.push(s);
      const state = createStreamState();
      processMessage(
        {
          type: 'stream_event',
          event: {
            type: 'content_block_start',
            content_block: { type: 'tool_use', name: 'Read', input: {} },
          },
        },
        write,
        state,
      );
      // Send malformed JSON
      processMessage(
        {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            delta: { type: 'input_json_delta', partial_json: '{broken' },
          },
        },
        write,
        state,
      );
      processMessage(
        {
          type: 'stream_event',
          event: { type: 'content_block_stop', index: 0 },
        },
        write,
        state,
      );
      const output = chunks.join('');
      expect(output).toContain('[Read]');
      expect(output).not.toContain('broken');
    });

    test('fallback chain: file_path takes precedence over command', () => {
      // Edge case: if both exist, file_path wins (it's first in chain)
      const output = collectToolTag('Edit', { file_path: '/foo.ts', command: 'edit' });
      expect(output).toContain('[Edit] /foo.ts');
    });

    test('incremental JSON fragments are accumulated correctly', () => {
      // Simulate the SDK sending JSON in multiple fragments
      const chunks: string[] = [];
      const write = (s: string) => chunks.push(s);
      const state = createStreamState();
      processMessage(
        {
          type: 'stream_event',
          event: {
            type: 'content_block_start',
            content_block: { type: 'tool_use', name: 'Read', input: {} },
          },
        },
        write,
        state,
      );
      // Send JSON in fragments
      processMessage(
        {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            delta: { type: 'input_json_delta', partial_json: '{"file_' },
          },
        },
        write,
        state,
      );
      processMessage(
        {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            delta: { type: 'input_json_delta', partial_json: 'path": "/src/stream.ts"}' },
          },
        },
        write,
        state,
      );
      processMessage(
        {
          type: 'stream_event',
          event: { type: 'content_block_stop', index: 0 },
        },
        write,
        state,
      );
      const output = chunks.join('');
      expect(output).toContain('[Read] /src/stream.ts');
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
