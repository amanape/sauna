import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { resolve, join } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

// Will import from the module under test once created
import {
  loadAliases,
  expandAlias,
  type AliasDefinition,
} from "../src/aliases";

const TMP = resolve(import.meta.dir, ".tmp-aliases-test");

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

describe("P1: aliases — TOML parsing", () => {
  beforeEach(setupTmp);
  afterEach(teardownTmp);

  test("parses a valid alias file", () => {
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
    expect(Object.keys(aliases)).toEqual(["build", "review", "chat"]);
    expect(aliases["build"]!.prompt).toBe(".sauna/prompts/build.md");
    expect(aliases["build"]!.context).toEqual([".sauna/specs", ".sauna/tasks.md"]);
    expect(aliases["build"]!.count).toBe(5);
    expect(aliases["review"]!.model).toBe("opus");
    expect(aliases["chat"]!.interactive).toBe(true);
  });

  test("returns empty object when file is missing (no error)", () => {
    const aliases = loadAliases(TMP);
    expect(aliases).toEqual({});
  });

  test("throws on malformed TOML with a clear error message", () => {
    writeAliasFile(`
[build
prompt = missing closing bracket
`);
    expect(() => loadAliases(TMP)).toThrow();
  });
});

describe("P1: aliases — schema validation", () => {
  beforeEach(setupTmp);
  afterEach(teardownTmp);

  test("rejects alias missing required 'prompt' field", () => {
    writeAliasFile(`
[build]
model = "sonnet"
`);
    expect(() => loadAliases(TMP)).toThrow(/prompt/i);
  });

  test("rejects non-string prompt", () => {
    writeAliasFile(`
[build]
prompt = 42
`);
    expect(() => loadAliases(TMP)).toThrow(/prompt/i);
  });

  test("rejects invalid count (non-integer)", () => {
    writeAliasFile(`
[build]
prompt = "test"
count = 1.5
`);
    expect(() => loadAliases(TMP)).toThrow(/count/i);
  });

  test("rejects invalid count (zero)", () => {
    writeAliasFile(`
[build]
prompt = "test"
count = 0
`);
    expect(() => loadAliases(TMP)).toThrow(/count/i);
  });

  test("rejects invalid count (negative)", () => {
    writeAliasFile(`
[build]
prompt = "test"
count = -1
`);
    expect(() => loadAliases(TMP)).toThrow(/count/i);
  });

  test("rejects unknown fields", () => {
    writeAliasFile(`
[build]
prompt = "test"
unknown_field = "should not be here"
`);
    expect(() => loadAliases(TMP)).toThrow(/unknown/i);
  });

  test("rejects forever + count (mutually exclusive)", () => {
    writeAliasFile(`
[build]
prompt = "test"
forever = true
count = 5
`);
    expect(() => loadAliases(TMP)).toThrow(/mutually exclusive/i);
  });

  test("rejects interactive + forever (mutually exclusive)", () => {
    writeAliasFile(`
[build]
prompt = "test"
interactive = true
forever = true
`);
    expect(() => loadAliases(TMP)).toThrow(/mutually exclusive/i);
  });

  test("rejects interactive + count (mutually exclusive)", () => {
    writeAliasFile(`
[build]
prompt = "test"
interactive = true
count = 5
`);
    expect(() => loadAliases(TMP)).toThrow(/mutually exclusive/i);
  });
});

describe("P1: aliases — name validation", () => {
  beforeEach(setupTmp);
  afterEach(teardownTmp);

  test("accepts valid alias names (alphanumeric, hyphens, underscores)", () => {
    writeAliasFile(`
[my-build_01]
prompt = "test"
`);
    const aliases = loadAliases(TMP);
    expect(aliases["my-build_01"]).toBeDefined();
  });

  test("rejects alias names with invalid characters", () => {
    writeAliasFile(`
["my build"]
prompt = "test"
`);
    expect(() => loadAliases(TMP)).toThrow(/name/i);
  });

  test("rejects empty alias name", () => {
    writeAliasFile(`
[""]
prompt = "test"
`);
    expect(() => loadAliases(TMP)).toThrow(/name/i);
  });

  test("rejects reserved name 'alias-list'", () => {
    writeAliasFile(`
[alias-list]
prompt = "test"
`);
    expect(() => loadAliases(TMP)).toThrow(/reserved/i);
  });

  test("rejects reserved name 'help'", () => {
    writeAliasFile(`
[help]
prompt = "test"
`);
    expect(() => loadAliases(TMP)).toThrow(/reserved/i);
  });

  test("rejects reserved name 'version'", () => {
    writeAliasFile(`
[version]
prompt = "test"
`);
    expect(() => loadAliases(TMP)).toThrow(/reserved/i);
  });

  test("rejects reserved short-form name 'm'", () => {
    writeAliasFile(`
[m]
prompt = "test"
`);
    expect(() => loadAliases(TMP)).toThrow(/reserved/i);
  });

  test("rejects reserved short-form name 'n'", () => {
    writeAliasFile(`
[n]
prompt = "test"
`);
    expect(() => loadAliases(TMP)).toThrow(/reserved/i);
  });

  test("rejects reserved short-form name 'i'", () => {
    writeAliasFile(`
[i]
prompt = "test"
`);
    expect(() => loadAliases(TMP)).toThrow(/reserved/i);
  });

  test("rejects reserved short-form name 'c'", () => {
    writeAliasFile(`
[c]
prompt = "test"
`);
    expect(() => loadAliases(TMP)).toThrow(/reserved/i);
  });

  test("rejects reserved name 'model'", () => {
    writeAliasFile(`
[model]
prompt = "test"
`);
    expect(() => loadAliases(TMP)).toThrow(/reserved/i);
  });

  test("rejects reserved name 'forever'", () => {
    writeAliasFile(`
[forever]
prompt = "test"
`);
    expect(() => loadAliases(TMP)).toThrow(/reserved/i);
  });

  test("rejects reserved name 'count'", () => {
    writeAliasFile(`
[count]
prompt = "test"
`);
    expect(() => loadAliases(TMP)).toThrow(/reserved/i);
  });

  test("rejects reserved name 'interactive'", () => {
    writeAliasFile(`
[interactive]
prompt = "test"
`);
    expect(() => loadAliases(TMP)).toThrow(/reserved/i);
  });

  test("rejects reserved name 'context'", () => {
    writeAliasFile(`
[context]
prompt = "test"
`);
    expect(() => loadAliases(TMP)).toThrow(/reserved/i);
  });
});

describe("P1: aliases — expandAlias", () => {
  test("basic expansion: prompt and flags from alias definition", () => {
    const alias: AliasDefinition = {
      prompt: ".sauna/prompts/build.md",
      context: [".sauna/specs", ".sauna/tasks.md"],
      count: 5,
    };
    const result = expandAlias(alias, []);
    expect(result).toEqual([
      ".sauna/prompts/build.md",
      "-c",
      ".sauna/specs",
      "-c",
      ".sauna/tasks.md",
      "-n",
      "5",
    ]);
  });

  test("expansion with model flag", () => {
    const alias: AliasDefinition = {
      prompt: "review code",
      model: "opus",
    };
    const result = expandAlias(alias, []);
    expect(result).toEqual(["review code", "-m", "opus"]);
  });

  test("expansion with forever flag", () => {
    const alias: AliasDefinition = {
      prompt: "monitor",
      forever: true,
    };
    const result = expandAlias(alias, []);
    expect(result).toEqual(["monitor", "--forever"]);
  });

  test("expansion with interactive flag", () => {
    const alias: AliasDefinition = {
      prompt: "chat",
      interactive: true,
    };
    const result = expandAlias(alias, []);
    expect(result).toEqual(["chat", "--interactive"]);
  });

  test("user CLI args are appended after alias defaults (last wins for scalars)", () => {
    const alias: AliasDefinition = {
      prompt: ".sauna/prompts/build.md",
      count: 5,
    };
    const result = expandAlias(alias, ["-n", "2"]);
    expect(result).toEqual([".sauna/prompts/build.md", "-n", "5", "-n", "2"]);
  });

  test("context accumulates: alias contexts first, user contexts appended", () => {
    const alias: AliasDefinition = {
      prompt: "build",
      context: [".sauna/specs"],
    };
    const result = expandAlias(alias, ["-c", "/extra"]);
    expect(result).toEqual([
      "build",
      "-c",
      ".sauna/specs",
      "-c",
      "/extra",
    ]);
  });

  test("rejects positional arguments after alias expansion", () => {
    const alias: AliasDefinition = {
      prompt: "build",
    };
    // "extra prompt" is a positional arg — should be rejected
    expect(() => expandAlias(alias, ["extra prompt"])).toThrow(
      /positional/i
    );
  });

  test("allows flags that start with -", () => {
    const alias: AliasDefinition = {
      prompt: "build",
    };
    const result = expandAlias(alias, ["-m", "sonnet"]);
    expect(result).toEqual(["build", "-m", "sonnet"]);
  });

  test("expansion with all flags combined", () => {
    const alias: AliasDefinition = {
      prompt: "test",
      model: "haiku",
      context: ["src/", "tests/"],
      count: 3,
    };
    const result = expandAlias(alias, []);
    expect(result).toEqual([
      "test",
      "-m",
      "haiku",
      "-c",
      "src/",
      "-c",
      "tests/",
      "-n",
      "3",
    ]);
  });
});
