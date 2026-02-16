import { cli } from "cleye";
import { resolveModel } from "./src/cli";
import { runSession } from "./src/session";
import { runLoop } from "./src/loop";

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

if (!prompt) {
  argv.showHelp();
  process.exit(1);
}

const model = resolveModel(argv.flags.model);
const forever = argv.flags.forever ?? false;
const count = argv.flags.count;
const context = argv.flags.context ?? [];

// Mutual exclusivity: --forever and --count cannot be combined
if (forever && count !== undefined) {
  process.stderr.write("error: --forever and --count are mutually exclusive\n");
  process.exit(1);
}

// In dry-run mode, print parsed config as JSON and exit
if (process.env.SAUNA_DRY_RUN === "1") {
  console.log(
    JSON.stringify({ prompt, model, forever, count, context })
  );
  process.exit(0);
}

// Run session(s) — single-run, fixed-count, or infinite mode
const write = (s: string) => process.stdout.write(s);
await runLoop(
  { forever, count },
  () => runSession({ prompt, model, context }),
  write
);
