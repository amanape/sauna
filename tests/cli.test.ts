import { test, expect, describe } from 'bun:test';
import { resolve } from 'node:path';
import { resolveProvider } from '../src/cli';

const ROOT = resolve(import.meta.dir, '..');

describe('P1: CLI parsing', () => {
  describe('model resolution', () => {
    test("resolves 'sonnet' to anthropic full model ID", () => {
      expect(resolveProvider('sonnet')).toEqual({
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
      });
    });

    test("resolves 'opus' to anthropic full model ID", () => {
      expect(resolveProvider('opus')).toEqual({
        provider: 'anthropic',
        model: 'claude-opus-4-20250514',
      });
    });

    test("resolves 'haiku' to anthropic full model ID", () => {
      expect(resolveProvider('haiku')).toEqual({
        provider: 'anthropic',
        model: 'claude-haiku-4-20250414',
      });
    });

    test("resolves 'gpt-4o' to openai provider", () => {
      expect(resolveProvider('gpt-4o')).toEqual({
        provider: 'openai',
        model: 'gpt-4o',
      });
    });

    test("resolves 'o1' to openai provider", () => {
      expect(resolveProvider('o1')).toEqual({
        provider: 'openai',
        model: 'o1',
      });
    });

    test('passes through unrecognized bare string as anthropic (backward compat)', () => {
      expect(resolveProvider('my-custom-model')).toEqual({
        provider: 'anthropic',
        model: 'my-custom-model',
      });
    });

    test('returns anthropic with undefined model when no model provided', () => {
      expect(resolveProvider(undefined)).toEqual({
        provider: 'anthropic',
        model: undefined,
      });
    });
  });

  describe('missing prompt', () => {
    test('exits non-zero when no prompt is provided', async () => {
      const proc = Bun.spawn(['bun', 'index.ts'], {
        cwd: ROOT,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const exitCode = await proc.exited;
      expect(exitCode).not.toBe(0);
    });
  });

  describe('prompt parsing', () => {
    test('special characters in prompt are preserved', async () => {
      const input = 'hello "world" & <foo> $bar';
      const proc = Bun.spawn(['bun', 'index.ts', input], {
        cwd: ROOT,
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, SAUNA_DRY_RUN: '1' },
      });
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;
      const parsed = JSON.parse(stdout);
      expect(parsed.prompt).toBe(input);
    });
  });

  describe('--count alone enables looping', () => {
    test('--count without --forever passes count through for fixed-count mode', async () => {
      const proc = Bun.spawn(
        ['bun', 'index.ts', '--count', '5', 'test prompt'],
        {
          cwd: ROOT,
          stdout: 'pipe',
          stderr: 'pipe',
          env: { ...process.env, SAUNA_DRY_RUN: '1' },
        },
      );
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.forever).toBe(false);
      expect(parsed.count).toBe(5);
    });
  });

  describe('--count validation', () => {
    test('--count 0 prints error and exits non-zero', async () => {
      const proc = Bun.spawn(
        ['bun', 'index.ts', '--count', '0', 'test prompt'],
        {
          cwd: ROOT,
          stdout: 'pipe',
          stderr: 'pipe',
          env: { ...process.env, SAUNA_DRY_RUN: '1' },
        },
      );
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('--count');
      expect(stderr).toContain('at least 1');
    });

    test('--count -1 prints error and exits non-zero', async () => {
      // cleye parses --count -1 as NaN (treats -1 as a flag), so this
      // triggers the NaN validation rather than the positive-integer check
      const proc = Bun.spawn(
        ['bun', 'index.ts', '--count', '-1', 'test prompt'],
        {
          cwd: ROOT,
          stdout: 'pipe',
          stderr: 'pipe',
          env: { ...process.env, SAUNA_DRY_RUN: '1' },
        },
      );
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('--count');
    });

    test('--count 1.5 prints error and exits non-zero', async () => {
      const proc = Bun.spawn(
        ['bun', 'index.ts', '--count', '1.5', 'test prompt'],
        {
          cwd: ROOT,
          stdout: 'pipe',
          stderr: 'pipe',
          env: { ...process.env, SAUNA_DRY_RUN: '1' },
        },
      );
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('--count');
      expect(stderr).toContain('whole number');
    });

    test('--count abc prints error and exits non-zero', async () => {
      const proc = Bun.spawn(
        ['bun', 'index.ts', '--count', 'abc', 'test prompt'],
        {
          cwd: ROOT,
          stdout: 'pipe',
          stderr: 'pipe',
          env: { ...process.env, SAUNA_DRY_RUN: '1' },
        },
      );
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('--count');
    });
  });

  describe('--forever and --count mutual exclusivity', () => {
    test('--forever --count N prints error and exits non-zero', async () => {
      const proc = Bun.spawn(
        ['bun', 'index.ts', '--forever', '--count', '3', 'test prompt'],
        {
          cwd: ROOT,
          stdout: 'pipe',
          stderr: 'pipe',
          env: { ...process.env, SAUNA_DRY_RUN: '1' },
        },
      );
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('--forever');
      expect(stderr).toContain('--count');
    });
  });

  describe('--interactive and --count mutual exclusivity', () => {
    test('--interactive --forever prints error and exits non-zero', async () => {
      const proc = Bun.spawn(
        ['bun', 'index.ts', '--interactive', '--forever', 'test prompt'],
        {
          cwd: ROOT,
          stdout: 'pipe',
          stderr: 'pipe',
          env: { ...process.env, SAUNA_DRY_RUN: '1' },
        },
      );
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('--interactive');
      expect(stderr).toContain('--forever');
    });

    test('--interactive --count N prints error and exits non-zero', async () => {
      const proc = Bun.spawn(
        ['bun', 'index.ts', '--interactive', '--count', '3', 'test prompt'],
        {
          cwd: ROOT,
          stdout: 'pipe',
          stderr: 'pipe',
          env: { ...process.env, SAUNA_DRY_RUN: '1' },
        },
      );
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('--interactive');
      expect(stderr).toContain('--count');
    });
  });

  describe('--interactive without prompt', () => {
    test('--interactive without prompt does not exit with help (dry-run prints config)', async () => {
      const proc = Bun.spawn(
        ['bun', 'index.ts', '--interactive'],
        {
          cwd: ROOT,
          stdout: 'pipe',
          stderr: 'pipe',
          env: { ...process.env, SAUNA_DRY_RUN: '1' },
        },
      );
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.interactive).toBe(true);
    });
  });

  describe('startup error handling', () => {
    test('missing claude binary prints error to stderr and exits 1 — no stack trace', async () => {
      const proc = Bun.spawn(
        ['bun', 'index.ts', 'test prompt'],
        {
          cwd: ROOT,
          stdout: 'pipe',
          stderr: 'pipe',
          // PATH has bun but no claude
          env: { PATH: `${process.execPath.replace(/\/bun$/, '')}:/usr/bin:/bin` },
        },
      );
      const stderr = await new Response(proc.stderr).text();
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      expect(exitCode).toBe(1);
      // Error should be on stderr
      expect(stderr.toLowerCase()).toContain('claude');
      // No stack traces on stdout or stderr
      expect(stdout).not.toContain('at ');
      expect(stderr).not.toContain('at findClaude');
      expect(stderr).not.toContain('at execSync');
    });
  });

  describe('--context paths', () => {
    test('multiple --context paths are collected into an array', async () => {
      const proc = Bun.spawn(
        ['bun', 'index.ts', '-c', 'foo.md', '-c', 'bar/', 'test prompt'],
        {
          cwd: ROOT,
          stdout: 'pipe',
          stderr: 'pipe',
          env: { ...process.env, SAUNA_DRY_RUN: '1' },
        },
      );
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;
      expect(stdout).toContain('foo.md');
      expect(stdout).toContain('bar/');
    });
  });
});
