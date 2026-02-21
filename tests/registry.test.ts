import { describe, test, expect } from "bun:test";
import { resolveProvider } from "../src/providers/registry";
import { ClaudeProvider } from "../src/providers/claude";
import { CodexProvider } from "../src/providers/codex";

describe("resolveProvider", () => {
  describe("explicit --provider flag", () => {
    test("returns ClaudeProvider when flag is 'claude'", () => {
      expect(resolveProvider("claude")).toBe(ClaudeProvider);
    });

    test("returns CodexProvider when flag is 'codex'", () => {
      expect(resolveProvider("codex")).toBe(CodexProvider);
    });

    test("throws on unknown provider name", () => {
      expect(() => resolveProvider("unknown")).toThrow();
    });

    test("error message lists valid providers", () => {
      expect(() => resolveProvider("unknown")).toThrow(/claude.*codex|codex.*claude/i);
    });

    test("explicit codex flag with claude model still returns Codex", () => {
      expect(resolveProvider("codex", "sonnet")).toBe(CodexProvider);
    });
  });

  describe("model inference (no --provider flag)", () => {
    test("claude- prefix → Claude", () => {
      expect(resolveProvider(undefined, "claude-sonnet-4-20250514")).toBe(ClaudeProvider);
    });

    test("sonnet alias → Claude", () => {
      expect(resolveProvider(undefined, "sonnet")).toBe(ClaudeProvider);
    });

    test("opus alias → Claude", () => {
      expect(resolveProvider(undefined, "opus")).toBe(ClaudeProvider);
    });

    test("haiku alias → Claude", () => {
      expect(resolveProvider(undefined, "haiku")).toBe(ClaudeProvider);
    });

    test("gpt- prefix → Codex", () => {
      expect(resolveProvider(undefined, "gpt-5.2-codex")).toBe(CodexProvider);
    });

    test("o4-mini → Codex", () => {
      expect(resolveProvider(undefined, "o4-mini")).toBe(CodexProvider);
    });

    test("codex alias → Codex", () => {
      expect(resolveProvider(undefined, "codex")).toBe(CodexProvider);
    });

    test("codex-mini alias → Codex", () => {
      expect(resolveProvider(undefined, "codex-mini")).toBe(CodexProvider);
    });
  });

  describe("default (no flag, no model)", () => {
    test("no args → Claude (backward compat)", () => {
      expect(resolveProvider()).toBe(ClaudeProvider);
    });

    test("undefined provider, undefined model → Claude", () => {
      expect(resolveProvider(undefined, undefined)).toBe(ClaudeProvider);
    });

    test("unrecognized model → Claude (backward compat)", () => {
      expect(resolveProvider(undefined, "some-custom-model")).toBe(ClaudeProvider);
    });
  });

  describe("singleton instances", () => {
    test("same ClaudeProvider instance on repeated calls", () => {
      expect(resolveProvider("claude")).toBe(resolveProvider("claude"));
    });

    test("same CodexProvider instance on repeated calls", () => {
      expect(resolveProvider("codex")).toBe(resolveProvider("codex"));
    });
  });
});
