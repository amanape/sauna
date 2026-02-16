import { test, expect, describe } from 'bun:test';
import { resolve } from 'node:path';
import { resolveModel } from '../src/cli';

const ROOT = resolve(import.meta.dir, '..');

describe('P1: CLI parsing', () => {
  describe('model resolution', () => {
    test("resolves 'sonnet' to full model ID", () => {
      expect(resolveModel('sonnet')).toBe('claude-sonnet-4-20250514');
    });

    test("resolves 'opus' to full model ID", () => {
      expect(resolveModel('opus')).toBe('claude-opus-4-20250514');
    });

    test("resolves 'haiku' to full model ID", () => {
      expect(resolveModel('haiku')).toBe('claude-haiku-4-20250414');
    });

    test('passes through unrecognized model name as-is', () => {
      expect(resolveModel('claude-sonnet-4-20250514')).toBe(
        'claude-sonnet-4-20250514',
      );
      expect(resolveModel('my-custom-model')).toBe('my-custom-model');
    });

    test('returns undefined when no model provided', () => {
      expect(resolveModel(undefined)).toBeUndefined();
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

  describe('--count without --loop', () => {
    test('--count without --loop is silently ignored', async () => {
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
      // Should succeed (exit 0) and not loop
      expect(exitCode).toBe(0);
      // The parsed config should show loop: false
      expect(stdout).toContain('"loop":false');
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
