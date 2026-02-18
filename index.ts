import { cli, command } from "cleye";
import { resolveModel } from "./src/cli";
import { findClaude } from "./src/claude";
import { runSession } from "./src/session";
import { runLoop } from "./src/loop";
import { runInteractive } from "./src/interactive";
import { loadAliases, expandAlias } from "./src/aliases";
import { aliasList, aliasShow, aliasSet, aliasRm } from "./src/alias-commands";
import pkg from "./package.json";

// --- Alias resolution: expand alias names before cleye parses argv ---
// Must run before cli() so the expanded argv reaches cleye.
// Skip if the first arg is a subcommand name (e.g. "alias").
let customArgv: string[] | undefined;
const firstArg = process.argv[2];

if (firstArg && firstArg !== "alias" && !firstArg.startsWith("-")) {
  try {
    const aliases = loadAliases();
    const alias = aliases[firstArg];
    if (alias) {
      const extraArgs = process.argv.slice(3);
      customArgv = expandAlias(alias, extraArgs);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`error: ${message}\n`);
    process.exit(1);
  }
}

const argv = cli(
  {
    name: "sauna",
    version: pkg.version,
    parameters: ["[prompt]"],
    flags: {
      model: {
        type: String,
        alias: "m",
        description: "Model to use (sonnet, opus, haiku, or full model ID)",
      },
      forever: {
        type: Boolean,
        description: "Run the prompt indefinitely until Ctrl+C",
      },
      count: {
        type: Number,
        alias: "n",
        description: "Number of loop iterations",
      },
      interactive: {
        type: Boolean,
        alias: "i",
        description: "Start an interactive multi-turn session",
      },
      context: {
        type: [String],
        alias: "c",
        description: "File/directory paths to include as context",
      },
    },
    commands: [
      command({
        name: "alias",
        parameters: ["<action>", "[name]"],
      }),
    ],
  },
  undefined,
  customArgv
);

// Handle `sauna alias <action> [name]` subcommand
if (argv.command === "alias") {
  const action = argv._.action;
  const name = argv._.name;
  const write = (s: string) => process.stdout.write(s);

  try {
    switch (action) {
      case "list": {
        const aliases = loadAliases();
        aliasList(aliases, write);
        break;
      }
      case "show": {
        if (!name) {
          process.stderr.write("error: alias show requires a name\n");
          process.exit(1);
        }
        const aliases = loadAliases();
        aliasShow(aliases, name, write);
        break;
      }
      case "set": {
        if (!name) {
          process.stderr.write("error: alias set requires a name\n");
          process.exit(1);
        }
        aliasSet(name, undefined, write);
        break;
      }
      case "rm": {
        if (!name) {
          process.stderr.write("error: alias rm requires a name\n");
          process.exit(1);
        }
        aliasRm(name, undefined, write);
        break;
      }
      default:
        process.stderr.write(
          `error: unknown alias action "${action}". Use: list, show, set, rm\n`
        );
        process.exit(1);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`error: ${message}\n`);
    process.exit(1);
  }
  process.exit(0);
}

const prompt = argv._.prompt;
const model = resolveModel(argv.flags.model);
const forever = argv.flags.forever ?? false;
const interactive = argv.flags.interactive ?? false;

if (!prompt && !interactive) {
  argv.showHelp();
  process.exit(1);
}
const count = argv.flags.count;
const context = argv.flags.context ?? [];

// Validate --count value before checking flag combinations
if (count !== undefined) {
  if (Number.isNaN(count)) {
    process.stderr.write("error: --count must be a valid number\n");
    process.exit(1);
  }
  if (!Number.isInteger(count)) {
    process.stderr.write("error: --count must be a whole number\n");
    process.exit(1);
  }
  if (count <= 0) {
    process.stderr.write(
      "error: --count must be a positive integer (at least 1)\n"
    );
    process.exit(1);
  }
}

// Mutual exclusivity: --forever and --count cannot be combined
if (forever && count !== undefined) {
  process.stderr.write("error: --forever and --count are mutually exclusive\n");
  process.exit(1);
}

// Mutual exclusivity: --interactive cannot be combined with --count or --forever
if (interactive && (count !== undefined || forever)) {
  const conflict = count !== undefined ? "--count" : "--forever";
  process.stderr.write(`error: --interactive and ${conflict} are mutually exclusive\n`);
  process.exit(1);
}

// In dry-run mode, print parsed config as JSON and exit
if (process.env.SAUNA_DRY_RUN === "1") {
  console.log(
    JSON.stringify({ prompt, model, forever, count, interactive, context })
  );
  process.exit(0);
}

try {
  // Resolve Claude Code executable once at startup — before any session or REPL
  const claudePath = findClaude();

  const write = (s: string) => process.stdout.write(s);
  const errWrite = (s: string) => process.stderr.write(s);

  if (interactive) {
    await runInteractive({ prompt, model, context, claudePath }, write, undefined, errWrite);
  } else {
    // Wire SIGINT/SIGTERM to an AbortController so loop modes can stop between iterations
    const abort = new AbortController();
    const onSignal = () => abort.abort();
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);

    try {
      const ok = await runLoop(
        { forever, count },
        () => runSession({ prompt: prompt!, model, context, claudePath }),
        write,
        abort.signal,
        errWrite
      );
      if (!ok) process.exit(1);
    } finally {
      process.removeListener("SIGINT", onSignal);
      process.removeListener("SIGTERM", onSignal);
    }
  }
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
}
