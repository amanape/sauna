import { test, expect, describe } from "bun:test";

import {
  colors,
  symbols,
  indent,
  indentVerbose,
  formatDuration,
  formatNumber,
  stripAnsi,
} from "./terminal-formatting";

describe("colors", () => {
  test("cyan wraps text with ANSI codes", () => {
    const result = colors.cyan("hello");
    expect(stripAnsi(result)).toBe("hello");
    // Should contain ANSI escape sequences (or not, if no color support)
    // Either way, stripped text must equal the input
  });

  test("green wraps text", () => {
    expect(stripAnsi(colors.green("ok"))).toBe("ok");
  });

  test("red wraps text", () => {
    expect(stripAnsi(colors.red("fail"))).toBe("fail");
  });

  test("yellow wraps text", () => {
    expect(stripAnsi(colors.yellow("warn"))).toBe("warn");
  });

  test("dim wraps text", () => {
    expect(stripAnsi(colors.dim("meta"))).toBe("meta");
  });

  test("error applies red and bold", () => {
    const result = colors.error("fatal");
    expect(stripAnsi(result)).toBe("fatal");
  });

  test("each color function returns a string", () => {
    const fns = [colors.cyan, colors.green, colors.red, colors.yellow, colors.dim, colors.error];
    for (const fn of fns) {
      expect(typeof fn("x")).toBe("string");
    }
  });
});

describe("symbols", () => {
  test("tick is a non-empty string", () => {
    expect(typeof symbols.tick).toBe("string");
    expect(symbols.tick.length).toBeGreaterThan(0);
  });

  test("cross is a non-empty string", () => {
    expect(typeof symbols.cross).toBe("string");
    expect(symbols.cross.length).toBeGreaterThan(0);
  });

  test("pointer is a non-empty string", () => {
    expect(typeof symbols.pointer).toBe("string");
    expect(symbols.pointer.length).toBeGreaterThan(0);
  });

  test("info is a non-empty string", () => {
    expect(typeof symbols.info).toBe("string");
    expect(symbols.info.length).toBeGreaterThan(0);
  });

  test("bullet is a non-empty string", () => {
    expect(typeof symbols.bullet).toBe("string");
    expect(symbols.bullet.length).toBeGreaterThan(0);
  });

  test("success symbol is colored green tick", () => {
    expect(stripAnsi(symbols.success)).toBe(stripAnsi(symbols.tick));
  });

  test("failure symbol is colored red cross", () => {
    expect(stripAnsi(symbols.failure)).toBe(stripAnsi(symbols.cross));
  });
});

describe("indent", () => {
  test("indents text by 2 spaces for tool-level", () => {
    expect(indent("hello")).toBe("  hello");
  });

  test("handles multi-line text", () => {
    expect(indent("a\nb")).toBe("  a\n  b");
  });

  test("handles empty string", () => {
    expect(indent("")).toBe("  ");
  });
});

describe("indentVerbose", () => {
  test("indents text by 4 spaces for verbose-level", () => {
    expect(indentVerbose("hello")).toBe("    hello");
  });

  test("handles multi-line text", () => {
    expect(indentVerbose("a\nb")).toBe("    a\n    b");
  });
});

describe("formatDuration", () => {
  test("formats sub-second durations in milliseconds", () => {
    expect(formatDuration(42)).toBe("42ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  test("formats durations between 1s and 60s in seconds with one decimal", () => {
    expect(formatDuration(1000)).toBe("1.0s");
    expect(formatDuration(1500)).toBe("1.5s");
    expect(formatDuration(59999)).toBe("60.0s");
  });

  test("formats durations >= 60s in minutes with one decimal", () => {
    expect(formatDuration(60000)).toBe("1.0m");
    expect(formatDuration(90000)).toBe("1.5m");
    expect(formatDuration(150000)).toBe("2.5m");
  });

  test("rounds milliseconds to whole numbers", () => {
    expect(formatDuration(42.7)).toBe("43ms");
    expect(formatDuration(0.3)).toBe("0ms");
  });
});

describe("formatNumber", () => {
  test("formats small numbers without commas", () => {
    expect(formatNumber(42)).toBe("42");
    expect(formatNumber(999)).toBe("999");
  });

  test("formats thousands with commas", () => {
    expect(formatNumber(1000)).toBe("1,000");
    expect(formatNumber(1247)).toBe("1,247");
  });

  test("formats large numbers with commas", () => {
    expect(formatNumber(1000000)).toBe("1,000,000");
    expect(formatNumber(123456789)).toBe("123,456,789");
  });
});

describe("stripAnsi", () => {
  test("removes ANSI escape codes", () => {
    expect(stripAnsi("\x1b[31mred\x1b[0m")).toBe("red");
  });

  test("returns plain text unchanged", () => {
    expect(stripAnsi("plain")).toBe("plain");
  });

  test("handles empty string", () => {
    expect(stripAnsi("")).toBe("");
  });
});
