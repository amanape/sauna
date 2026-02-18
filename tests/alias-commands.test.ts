import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { resolve, join } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

import { aliasList } from "../src/alias-commands";
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
