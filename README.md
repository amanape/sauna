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

## Architecture

The codebase is intentionally small (~600 lines of TypeScript):

```
index.ts              CLI entry point and arg parsing
src/
  provider.ts         Provider interface and event types
  providers/
    registry.ts       Provider selection logic
    claude.ts         Claude Code implementation
    codex.ts          OpenAI Codex implementation
  loop.ts             Loop orchestration (single, count, forever)
  interactive.ts      Multi-turn REPL
  stream.ts           Event formatting and terminal output
  prompt.ts           Prompt building with context injection
  aliases.ts          TOML alias parsing and expansion
  alias-commands.ts   alias-list subcommand
```

All providers implement a unified `Provider` interface and emit `ProviderEvent` objects, keeping the loop/rendering layer fully provider-agnostic.

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

```bash
# Run tests
bun test

# Build for current platform
bun run build

# Build for all platforms
bun run build:all
```

## License

[MIT](LICENSE)
