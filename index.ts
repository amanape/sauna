import { cli } from "cleye";
import { resolveProvider } from "./src/cli";
import { findClaude } from "./src/claude";
import { runSession } from "./src/session";
import { runLoop } from "./src/loop";
import { runInteractive } from "./src/interactive";
import { runCodexSession } from "./src/codex-session";
import { runCodexInteractive } from "./src/codex-interactive";
import pkg from "./package.json";

const argv = cli(
  {
    name: "sauna",
    version: pkg.version,
    parameters: ["[prompt]"],
    flags: {
      model: {
        type: String,
        alias: "m",
        description: "Model to use (sonnet, opus, haiku, gpt-4o, o1, or openai:<model>)",
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
  },
  undefined,
  undefined
);

const prompt = argv._.prompt;
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

// Resolve provider and model — must happen before SAUNA_DRY_RUN check
const { provider, model: resolvedModel } = resolveProvider(
  argv.flags.model,
  (s) => process.stderr.write(s),
);

// In dry-run mode, print parsed config as JSON and exit
if (process.env.SAUNA_DRY_RUN === "1") {
  console.log(
    JSON.stringify({
      prompt,
      model: argv.flags.model,
      provider,
      resolvedModel,
      forever,
      count,
      interactive,
      context,
    })
  );
  process.exit(0);
}

try {
  const write = (s: string) => process.stdout.write(s);
  const errWrite = (s: string) => process.stderr.write(s);

  if (interactive) {
    if (provider === "openai") {
      await runCodexInteractive(
        { prompt, model: resolvedModel, context },
        write,
        undefined,
        errWrite,
      );
    } else {
      const claudePath = findClaude();
      await runInteractive(
        { prompt, model: resolvedModel, context, claudePath },
        write,
        undefined,
        errWrite,
      );
    }
  } else {
    // Wire SIGINT/SIGTERM to an AbortController so loop modes can stop between iterations
    const abort = new AbortController();
    const onSignal = () => abort.abort();
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);

    try {
      let ok: boolean;
      if (provider === "openai") {
        ok = await runLoop(
          { forever, count },
          () => runCodexSession({ prompt: prompt!, model: resolvedModel, context }),
          write,
          abort.signal,
          errWrite,
        );
      } else {
        const claudePath = findClaude();
        ok = await runLoop(
          { forever, count },
          () => runSession({ prompt: prompt!, model: resolvedModel, context, claudePath }),
          write,
          abort.signal,
          errWrite,
        );
      }
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
