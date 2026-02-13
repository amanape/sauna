# Terminal Formatting

## Purpose

Establish the visual language for agent activity output in the terminal. This spec covers the formatting infrastructure — colors, symbols, spinners — that the activity reporter and streaming output use to present information.

## Dependencies

Three packages provide the formatting primitives:

- **ansis** — Terminal colors. Chosen for Bun compatibility (explicitly tested), chalk-compatible chained API, small size (5.7 kB), and automatic color-depth detection with graceful fallback.
- **nanospinner** — Async operation spinners. Chosen for minimal footprint (single dependency on picocolors, which can coexist with ansis), dual CJS/ESM, and sufficient API (start, stop, success, error, update text).
- **figures** — Unicode status symbols with automatic fallback for terminals without Unicode support. Provides tick, cross, pointer, bullet, ellipsis, warning, info, etc.

## Visual Language

### Event Type Colors

Each event type has a distinct color for scannability:

- **Tool calls** (starting): cyan — indicates an action in progress
- **Tool results** (success): green — indicates completion
- **Tool results** (failure): red — indicates error
- **Agent text**: default terminal color (no override) — the primary content should be unadorned
- **Sub-agent activity**: yellow — distinguishable from direct tool calls
- **Metadata** (tokens, timing, verbose details): dim/gray — present but not distracting
- **Errors**: red + bold — must stand out

### Status Symbols

- Success: green tick (figures.tick)
- Failure: red cross (figures.cross)
- In-progress: spinner animation (nanospinner)
- Tool call arrow: right-pointing indicator (figures.pointer or "->")
- Information: dim bullet or info symbol

### Spinner Behavior

- A spinner must be active whenever the agent is processing and no text is streaming
- The spinner text updates to reflect current activity (e.g., "Agent thinking...", "Calling web_search...")
- The spinner resolves to a success/failure symbol when the operation completes
- In discover streaming mode, the spinner is active between user input and the first text chunk
- In batch modes (plan/build/run), the spinner is active for the entire `generate()` call, with text updates from `onChunk`/`onStepFinish` callbacks

### Indentation and Structure

- Agent text output has no indentation (top-level content)
- Tool activity lines are indented (2 spaces) to visually nest under the agent turn
- Verbose details (full args, full results) are further indented (4 spaces)
- Execution metrics (tokens, timing) are indented and dim

## Constraints

- All formatting must degrade gracefully when ANSI codes are not supported (piped output, CI environments). The underlying libraries handle this via environment detection, but the module must not assume colors are always available.
- Spinner must be stopped/cleared before writing other output to avoid corrupted lines. The activity reporter must coordinate spinner lifecycle with output writes.
- The formatting module must export reusable primitives (colored text functions, symbol constants) — not own the output stream or write directly. The activity reporter composes these primitives into complete output lines.
- No emojis in default output — use Unicode symbols from figures instead (which fall back to ASCII on limited terminals).
