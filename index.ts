import { cli } from "cleye";
import { resolveModel } from "./cli";
import { runSession } from "./session";
import { runLoop } from "./loop";

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
      loop: {
        type: Boolean,
        alias: "l",
        description: "Run the prompt in a loop",
      },
      count: {
        type: Number,
        alias: "n",
        description: "Number of loop iterations (requires --loop)",
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
const loop = argv.flags.loop ?? false;
const count = argv.flags.count;
const context = argv.flags.context ?? [];

// In dry-run mode, print parsed config as JSON and exit
if (process.env.SAUNA_DRY_RUN === "1") {
  console.log(
    JSON.stringify({ prompt, model, loop, count, context })
  );
  process.exit(0);
}

// Run session(s) — single-run or loop mode with real-time streaming output
const write = (s: string) => process.stdout.write(s);
await runLoop(
  { loop, count },
  () => runSession({ prompt, model, context }),
  write
);
