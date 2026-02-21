import { cli, command } from "cleye";
import { runLoop } from "./src/loop";
import { runInteractive } from "./src/interactive";
import { loadAliases, expandAlias } from "./src/aliases";
import { aliasList } from "./src/alias-commands";
import { resolveProvider } from "./src/providers/registry";
import pkg from "./package.json";

// --- Alias resolution: expand alias names before cleye parses argv ---
// Must run before cli() so the expanded argv reaches cleye.
// Skip if the first arg is a subcommand name (e.g. "alias-list").
let customArgv: string[] | undefined;
const firstArg = process.argv[2];

if (firstArg && firstArg !== "alias-list" && !firstArg.startsWith("-")) {
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
    help: {
      description: "A lightweight CLI wrapper for AI coding agents",
    },
    flags: {
      model: {
        type: String,
        alias: "m",
        description:
          "Model to use (e.g. sonnet, opus, haiku for Claude; codex, codex-mini for Codex; or full model ID)",
      },
      provider: {
        type: String,
        alias: "p",
        description: "Provider to use (claude, codex)",
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
        name: "alias-list",
        help: {
          description: "List all prompt aliases defined in .sauna/aliases.toml",
        },
      }),
    ],
  },
  undefined,
  customArgv,
);

// Handle `sauna alias-list` subcommand
if (argv.command === "alias-list") {
  try {
    const aliases = loadAliases();
    aliasList(aliases, (s: string) => process.stdout.write(s));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`error: ${message}\n`);
    process.exit(1);
  }
  process.exit(0);
}

const prompt = argv._.prompt;
const forever = argv.flags.forever ?? false;
const interactive = argv.flags.interactive ?? false;

if (!prompt && !interactive) {
  argv.showHelp();
  process.exit(1);
}
const count = argv.flags.count;
const context = argv.flags.context;

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
      "error: --count must be a positive integer (at least 1)\n",
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
  process.stderr.write(
    `error: --interactive and ${conflict} are mutually exclusive\n`,
  );
  process.exit(1);
}

// Resolve provider — may throw for invalid --provider value
let provider;
try {
  provider = resolveProvider(argv.flags.provider, argv.flags.model);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
}

// Resolve model alias via the selected provider
const model = provider.resolveModel(argv.flags.model);

// In dry-run mode, print parsed config as JSON and exit
if (process.env.SAUNA_DRY_RUN === "1") {
  console.log(
    JSON.stringify({
      prompt,
      model,
      forever,
      count,
      interactive,
      context,
      provider: provider.name,
    }),
  );
  process.exit(0);
}

// Check provider availability before starting any session
if (!provider.isAvailable()) {
  const msg =
    provider.name === "claude"
      ? "Claude Code is not available — install Claude Code and ensure `claude` is in your PATH"
      : "Codex is not available — set OPENAI_API_KEY or CODEX_API_KEY, or run `codex login` to authenticate";
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

try {
  const write = (s: string) => process.stdout.write(s);
  const errWrite = (s: string) => process.stderr.write(s);

  if (interactive) {
    await runInteractive(
      { prompt, model, context, provider },
      write,
      undefined,
      errWrite,
    );
  } else {
    // Wire SIGINT/SIGTERM to an AbortController so loop modes can stop between iterations
    const abort = new AbortController();
    const onSignal = () => {
      abort.abort();
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);

    try {
      const ok = await runLoop(
        { forever, count },
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- TODO: TypeScript doesn't narrow prompt to string through the &&-exit guard above
        () => provider.createSession({ prompt: prompt!, model, context }),
        write,
        abort.signal,
        errWrite,
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
