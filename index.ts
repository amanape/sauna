import { cli } from "cleye";
import { resolveModel } from "./src/cli";
import { runSession } from "./src/session";
import { runLoop } from "./src/loop";
import { runInteractive } from "./src/interactive";

const pkg = await Bun.file("package.json").json();

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
  },
  undefined,
  undefined
);

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

const write = (s: string) => process.stdout.write(s);

if (interactive) {
  await runInteractive({ prompt, model, context }, write);
} else {
  // Run session(s) — single-run, fixed-count, or infinite mode
  await runLoop(
    { forever, count },
    () => runSession({ prompt: prompt!, model, context }),
    write
  );
}
