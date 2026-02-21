# sauna

A lightweight CLI that wraps multiple AI coding agents (Claude Code, OpenAI Codex) behind a single interface. Run prompts once, in loops, or as interactive multi-turn sessions — and define reusable aliases for common workflows.

## Features

- **Multiple providers** — Switch between Claude Code and OpenAI Codex with a flag
- **Loop modes** — Run a prompt N times (`--count`) or indefinitely (`--forever`)
- **Interactive REPL** — Multi-turn conversations with session persistence (`--interactive`)
- **Prompt aliases** — Define reusable shortcuts in `.sauna/aliases.toml`
- **Context injection** — Pass file/directory paths as context references (`--context`)
- **Model shortcuts** — Use `sonnet`, `opus`, `haiku`, `codex`, `codex-mini` instead of full model IDs
- **Cross-platform binaries** — Compiles to standalone executables for macOS, Linux, and Windows

## Install

### From GitHub Releases

Download the binary for your platform from the [latest release](https://github.com/amanape/sauna/releases/latest), then:

```bash
chmod +x sauna
mv sauna /usr/local/bin/sauna
```

### Build from source

Requires [Bun](https://bun.sh).

```bash
git clone https://github.com/amanape/sauna.git
cd sauna
bun install
bun run build
```

The compiled binary is output to `./sauna`.

## Prerequisites

At least one provider must be configured:

- **Claude Code** — Install [Claude Code](https://docs.anthropic.com/en/docs/claude-code) so that `claude` is available in your PATH
- **OpenAI Codex** — Install [Codex CLI](https://github.com/openai/codex) and run `codex login`, or set `OPENAI_API_KEY` / `CODEX_API_KEY` in your environment

## Usage

```bash
# Run a single prompt (defaults to Claude)
sauna "fix the failing tests"

# Choose a model
sauna -m opus "review this code for security issues"
sauna -m codex-mini "add input validation"

# Choose a provider explicitly
sauna -p codex "refactor the auth module"

# Include file/directory context
sauna -c src/ -c tests/ "find and fix the bug"

# Run a prompt 5 times
sauna -n 5 "generate a unit test for utils.ts"

# Run indefinitely until Ctrl+C
sauna --forever "monitor and fix lint errors"

# Start an interactive session
sauna -i "help me debug the API"
```

## Workflows

### Building Skills from Documentation

Use sauna's context injection to turn any library's documentation into a Claude Code skill — no manual research needed.

```bash
# Feed docs as context, let the agent create the skill
sauna -m opus -c node_modules/zod/README.md \
  "Create a Claude Code skill that helps users scaffold Zod schemas. \
   Cover common patterns: objects, arrays, enums, refinements, transforms, and error handling."
```

Define a reusable alias for building skills from any source material:

```toml
[build-skill]
prompt = "Read the provided context. If the skill doesn't exist yet, create a well-structured Claude Code skill from it following plugin skill best practices. If the skill already exists, review it against the source material — identify gaps, missing patterns, incorrect examples, or stale information — and improve it."
model = "opus"
```

Then swap in whatever documentation you need:

```bash
sauna build-skill -c node_modules/zod/README.md -n 3
sauna build-skill -c "Official Prisma docs" -n 5
sauna build-skill -c https://reactrouter.com/home -n 7
```

Use `--count` to iteratively refine. Each pass reviews the skill's current state against the source material, finds what's missing or weak, and improves it.

### Ralph Wiggum

The [Ralph Wiggum technique](https://ghuntley.com/ralph/) (created by Geoffrey Huntley) is an autonomous, loop-driven development methodology. Named after the persistently oblivious Simpsons character, the core idea is simple: feed an AI agent the same prompt file in a loop, letting it read its own prior work via git history and iteratively improve — one task per iteration, fresh context each time.

Sauna's `--forever` and `--count` flags map directly to this pattern.

#### Phase 1 — Define Requirements (human-driven, LLM-assisted)

Use an interactive session to break your project into specifications. The goal is to produce a set of spec files that describe what needs to be built.

```bash
# Start an interactive session to define specs
sauna -i -m opus "Help me break down this project into specs. \
  For each Job to Be Done, identify discrete topics of concern. \
  Each topic should be describable in one sentence without using 'and'. \
  Write each topic as a spec file under specs/"
```

This produces a `specs/` directory:

```
specs/
  auth.md
  api-routes.md
  database-schema.md
  ...
```

#### Phase 2 — Planning (autonomous loop)

Run sauna in a loop to generate an implementation plan from the specs. The agent studies all spec files, compares them against the current source code, and produces a prioritized task list — without implementing anything.

```bash
sauna -n 5 -m opus -c specs/ -c src/ \
  "Study all spec files in specs/ using parallel subagents. \
   Study the existing IMPLEMENTATION_PLAN.md if it exists. \
   Compare specs against current source code. \
   Create or update IMPLEMENTATION_PLAN.md as a prioritized task list. \
   Search for TODOs, minimal implementations, and placeholders. \
   Do NOT implement anything — planning only. \
   When the plan is complete and accounts for all specs, exit."
```

Or run indefinitely:

```bash
sauna --forever -m opus -c specs/ -c src/ "..."
```

#### Phase 3 — Building (autonomous loop)

Run sauna in a loop to execute the plan. Each iteration picks the most important remaining task, implements it, runs tests, and commits — then exits so the next iteration starts with a fresh context window.

```bash
sauna -n 30 -m sonnet -c specs/ -c IMPLEMENTATION_PLAN.md \
  "Read the specs and IMPLEMENTATION_PLAN.md. \
   Pick the most important remaining task. \
   Search the codebase first — don't assume something is not implemented. \
   Implement exactly one task. \
   Run tests, build, and lint. \
   If everything passes, update IMPLEMENTATION_PLAN.md, commit, and exit. \
   If tests fail, fix them before committing."
```

Or run indefinitely until done:

```bash
sauna --forever -m sonnet -c specs/ -c IMPLEMENTATION_PLAN.md "..."
```

#### Aliases for Ralph Wiggum

Define reusable aliases in `.sauna/aliases.toml` so you can kick off each phase with a single command:

```toml
[ralph-plan]
prompt = "Study all spec files in specs/. Study IMPLEMENTATION_PLAN.md if it exists. Compare specs against current source. Create or update IMPLEMENTATION_PLAN.md as a prioritized task list. Do NOT implement anything."
model = "opus"
context = ["specs/", "src/"]
count = 5

[ralph-build]
prompt = "Read specs and IMPLEMENTATION_PLAN.md. Pick the most important remaining task. Search the codebase first. Implement exactly one task. Run tests, build, and lint. If passing, update the plan, commit, and exit."
model = "sonnet"
context = ["specs/", "IMPLEMENTATION_PLAN.md"]
count = 30

[ralph-build-infinite]
prompt = "Read specs and IMPLEMENTATION_PLAN.md. Pick the most important remaining task. Search the codebase first. Implement exactly one task. Run tests, build, and lint. If passing, update the plan, commit, and exit."
model = "sonnet"
context = ["specs/", "IMPLEMENTATION_PLAN.md"]
forever = true
```

Then run:

```bash
sauna ralph-plan            # Phase 2: generate the plan
sauna ralph-build           # Phase 3: build with a 30-iteration cap
sauna ralph-build-infinite  # Phase 3: build until done
```

#### Key principles

- **One task per iteration** — prevents context window overflow and quality degradation
- **Fresh context each loop** — `IMPLEMENTATION_PLAN.md` on disk serves as persistent memory between iterations
- **Backpressure** — tests, builds, and lints act as validation gates; the agent must pass them before committing
- **Start human-in-the-loop, go AFK later** — begin interactively to refine your prompts, then let it run autonomously once confident

---

## Models

| Alias        | Provider | Full Model ID              |
| ------------ | -------- | -------------------------- |
| `sonnet`     | Claude   | `claude-sonnet-4-20250514` |
| `opus`       | Claude   | `claude-opus-4-20250514`   |
| `haiku`      | Claude   | `claude-haiku-4-20250414`  |
| `codex`      | Codex    | `gpt-5.2-codex`            |
| `codex-mini` | Codex    | `codex-mini-latest`        |

You can also pass full model IDs directly with `-m`. The provider is inferred automatically from the model name — or you can override it with `-p`.

## Aliases

Define reusable prompt shortcuts in `.sauna/aliases.toml`:

```toml
[review]
prompt = "Review the code for bugs and suggest fixes"
model = "opus"
context = ["src/", "tests/"]

[iterate]
prompt = "Run the tests, fix any failures, repeat"
model = "sonnet"
count = 3

[chat]
prompt = "Help me work on this codebase"
interactive = true
```

Then run them by name:

```bash
sauna review                  # Use alias defaults
sauna review -m haiku         # Override the model
sauna review -c docs/         # Add extra context
sauna alias-list              # List all defined aliases
```

### Alias fields

| Field         | Type     | Required | Description                              |
| ------------- | -------- | -------- | ---------------------------------------- |
| `prompt`      | string   | yes      | The prompt text or path to a prompt file |
| `model`       | string   | no       | Model alias or full ID                   |
| `context`     | string[] | no       | File/directory paths to include          |
| `count`       | integer  | no       | Number of loop iterations                |
| `forever`     | boolean  | no       | Run indefinitely                         |
| `interactive` | boolean  | no       | Start interactive session                |

## Permissions

When using the Claude provider, sauna runs with **all permission prompts bypassed** (`permissionMode: "bypassPermissions"`). This means Claude Code will execute file writes, shell commands, and other tool calls without asking for confirmation.

This is intentional — sauna is designed for automated and batch workflows where interactive prompts would block execution. If you need permission prompts, use `claude` directly.

> **Note:** The Codex provider uses its own `full-auto` execution policy by default, which similarly skips confirmation prompts.

## CLI Reference

```
sauna [prompt] [options]

Options:
  -m, --model <model>       Model to use (alias or full ID)
  -p, --provider <provider>  Provider: claude or codex
  -n, --count <n>           Run the prompt n times
      --forever             Run indefinitely until Ctrl+C
  -i, --interactive         Start a multi-turn session
  -c, --context <path>      Include file/directory as context (repeatable)
      --version             Show version
      --help                Show help

Subcommands:
  alias-list                List all defined aliases
```

## Contributing

Contributions are welcome! Please read the [contributing guide](CONTRIBUTING.md) to get started.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## License

[MIT](LICENSE)
