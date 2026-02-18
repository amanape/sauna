import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { resolve, join } from "node:path";
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";

import { aliasList, aliasShow, aliasSet, aliasRm } from "../src/alias-commands";
import { loadAliases } from "../src/aliases";

const TMP = resolve(import.meta.dir, ".tmp-alias-commands-test");

function setupTmp() {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(join(TMP, ".sauna"), { recursive: true });
}

function teardownTmp() {
  rmSync(TMP, { recursive: true, force: true });
}

function writeAliasFile(content: string) {
  writeFileSync(join(TMP, ".sauna", "aliases.toml"), content);
}

function readAliasFile(): string {
  return readFileSync(join(TMP, ".sauna", "aliases.toml"), "utf-8");
}

/** Capture all output written via the injected write callback */
function captureWrite(): { lines: string[]; output: () => string; write: (s: string) => void } {
  const lines: string[] = [];
  return {
    lines,
    output: () => lines.join(""),
    write: (s: string) => { lines.push(s); },
  };
}

describe("alias list", () => {
  beforeEach(setupTmp);
  afterEach(teardownTmp);

  test("prints all aliases in a compact table", () => {
    writeAliasFile(`
[build]
prompt = ".sauna/prompts/build.md"
context = [".sauna/specs", ".sauna/tasks.md"]
count = 5

[review]
prompt = ".sauna/prompts/review.md"
model = "opus"
context = ["src/"]

[chat]
prompt = "You are a helpful assistant"
interactive = true
`);
    const aliases = loadAliases(TMP);
    const cap = captureWrite();
    aliasList(aliases, cap.write);
    // Should contain all alias names
    expect(cap.output()).toContain("build");
    expect(cap.output()).toContain("review");
    expect(cap.output()).toContain("chat");
    // Should contain flag indicators
    expect(cap.output()).toContain("-n 5");
    expect(cap.output()).toContain("-m opus");
    expect(cap.output()).toContain("-i");
  });

  test("prints helpful message when no aliases defined", () => {
    const cap = captureWrite();
    aliasList({}, cap.write);
    expect(cap.output()).toContain("No aliases defined");
    expect(cap.output()).toContain(".sauna/aliases.toml");
  });
});

describe("alias show", () => {
  beforeEach(setupTmp);
  afterEach(teardownTmp);

  test("prints full TOML definition for a known alias", () => {
    writeAliasFile(`
[build]
prompt = ".sauna/prompts/build.md"
context = [".sauna/specs", ".sauna/tasks.md"]
count = 5
`);
    const aliases = loadAliases(TMP);
    const cap = captureWrite();
    aliasShow(aliases, "build", cap.write);
    expect(cap.output()).toContain("[build]");
    expect(cap.output()).toContain('prompt = ".sauna/prompts/build.md"');
    expect(cap.output()).toContain("count = 5");
  });

  test("throws error for unknown alias name", () => {
    const aliases = loadAliases(TMP);
    const cap = captureWrite();
    expect(() => aliasShow(aliases, "nonexistent", cap.write)).toThrow(
      /not found/i
    );
  });
});

describe("alias set", () => {
  beforeEach(setupTmp);
  afterEach(teardownTmp);

  test("creates alias file and appends stub entry", () => {
    // Remove .sauna dir so the file doesn't exist
    rmSync(join(TMP, ".sauna"), { recursive: true, force: true });
    const cap = captureWrite();
    aliasSet("deploy", TMP, cap.write);
    expect(existsSync(join(TMP, ".sauna", "aliases.toml"))).toBe(true);
    const content = readAliasFile();
    expect(content).toContain("[deploy]");
    expect(content).toContain('prompt = ""');
    expect(cap.output()).toContain('Created alias "deploy"');
  });

  test("appends to existing alias file", () => {
    writeAliasFile(`
[build]
prompt = "build it"
`);
    const cap = captureWrite();
    aliasSet("deploy", TMP, cap.write);
    const content = readAliasFile();
    // Original content preserved
    expect(content).toContain("[build]");
    // New entry appended
    expect(content).toContain("[deploy]");
    expect(content).toContain('prompt = ""');
  });

  test("rejects reserved names", () => {
    const cap = captureWrite();
    expect(() => aliasSet("help", TMP, cap.write)).toThrow(/reserved/i);
  });

  test("rejects duplicate alias names", () => {
    writeAliasFile(`
[build]
prompt = "build it"
`);
    const cap = captureWrite();
    expect(() => aliasSet("build", TMP, cap.write)).toThrow(/already exists/i);
  });
});

describe("alias rm", () => {
  beforeEach(setupTmp);
  afterEach(teardownTmp);

  test("removes an alias from the file", () => {
    writeAliasFile(`
[build]
prompt = ".sauna/prompts/build.md"
context = [".sauna/specs", ".sauna/tasks.md"]
count = 5

[review]
prompt = ".sauna/prompts/review.md"
model = "opus"
`);
    const cap = captureWrite();
    aliasRm("build", TMP, cap.write);
    const content = readAliasFile();
    expect(content).not.toContain("[build]");
    // Other alias should still be present
    expect(content).toContain("[review]");
    expect(cap.output()).toContain('Removed alias "build"');
  });

  test("throws error for unknown alias name", () => {
    writeAliasFile(`
[build]
prompt = "build it"
`);
    const cap = captureWrite();
    expect(() => aliasRm("nonexistent", TMP, cap.write)).toThrow(
      /not found/i
    );
  });
});
