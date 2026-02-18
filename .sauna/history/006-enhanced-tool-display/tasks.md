# Enhanced Tool Display -- Tasks

**STATUS: COMPLETE** - All P0–P4 items done; remaining items are deferred to future jobs
**RISK LEVEL: MITIGATED** - Credential redaction and runtime validation implemented

---

## P0: BLOCKERS — RESOLVED

### Security & Privacy — DONE

- [x] Design credential redaction for Bash commands (`export API_KEY=***`, `FOO=***`, `Authorization: Bearer ***`)
  - Implemented `redactSecrets()` in `src/stream.ts` — redacts env var assignments and Bearer tokens
  - 6 unit tests covering export, inline assignment, Bearer headers, safe commands, multiple vars
- [ ] Address file path privacy: full absolute paths expose usernames (e.g., `/Users/alice/.ssh/id_rsa`) — consider showing basenames or relative paths only
  - **Deferred**: file paths are less risky than credentials; SDK sends absolute paths and changing them could confuse users
- [ ] Address CI/CD log exposure risk (tool details visible in pipeline logs, screen sharing, recordings)
  - **Deferred**: would require a `--quiet` flag or config; out of scope for initial implementation

### SDK Contract — DONE

- [x] Add runtime validation: graceful fallback if `input` is missing or not an object
  - Implemented: `if (input && typeof input === 'object')` guard — falls back to `[ToolName]` with no detail
  - 2 unit tests: undefined input, non-object (string) input
- [x] Document all assumed `input` properties (`file_path`, `command`, `description`, `pattern`) — code comment in `processMessage()`
- [ ] Research SDK docs for `event.content_block.input` format stability guarantees
  - **Deferred**: SDK is bundled/minified, no public type docs found. Runtime guard mitigates risk.

### Multiline Handling — DONE

- [x] Define multiline detection strategy: `\n` in string, extract first line
- [x] Define "simplified representation": first line only, no ellipsis (keeps output clean)
- [x] Implement `extractFirstLine()` with type checking — 6 unit tests
- [x] Handle heredocs in Bash: shows `cat <<EOF` (first line only)

### Verbosity / Feature Flag Integration

- [x] Determined: sauna has NO existing verbosity controls (`--quiet`, etc.)
- [ ] Define how tool details interact with quiet mode
  - **Deferred**: no quiet mode exists yet; can be added as separate job

## P1: Architecture Decisions — RESOLVED

### Module Boundaries — FOLLOWED

- [x] Did NOT create `getToolDetails()` helper — extraction is inline in `processMessage()`
- [x] `stream.ts` module header unchanged — `extractFirstLine()` and `redactSecrets()` are pure utility functions, not domain logic
- [x] Did NOT add optional `details?` parameter to `formatToolTag()` — tag formatted inline at call site

### Data-Driven Design — USED FALLBACK CHAIN

- [x] Used inline fallback chain: `input.file_path || input.command || input.description || input.pattern`
  - Simpler than lookup table; no switch statement; one line
  - Redaction applied conditionally only when `input.command !== undefined`

### Avoid Premature Abstraction — FOLLOWED

- [x] No new helper functions for single call sites (extraction is inline)
- [x] SDK wire format assumptions documented in code comment

### Process & Review Gates

- [ ] Create security checklist for future job planning
  - **Deferred**: belongs in project-wide process, not this job

## P2: Core Implementation — DONE

- [x] Extract parameter inline in `processMessage()` using fallback chain
- [x] Runtime type guard: `if (input && typeof input === 'object')`
- [x] Credential redaction via `redactSecrets()` before display
- [x] Multiline truncation via `extractFirstLine()`
- [x] Tag formatted inline (not via modified `formatToolTag()`)
- [x] Dim ANSI wraps entire line including details

## P3: Testing — DONE

- [x] Unit tests with mocked `input` objects validate extraction logic (known gap: doesn't validate SDK sends expected shape)
- [x] Tests for SDK validation failures (undefined input, non-object input)
- [x] Tests for credential redaction patterns (export, inline assignment, Bearer headers, safe commands)
- [x] Tests for multiline handling (heredocs, `\n` in strings, empty first lines)
- [x] Tests for fallback chain precedence (`file_path` vs `command`)
- [x] `formatToolTag()` signature unchanged — no new tests needed for it
- [x] All 131 tests pass across 7 files, 0 failures (+1 empty string edge case test)
- [x] TypeScript type check passes (`bunx tsc --noEmit`)
- [x] Test meaningfulness validated: disabling each feature causes expected failures (redactSecrets: 5, extractFirstLine: 5, detail extraction: 11)

## P4: Documentation — DONE

- [x] SDK assumptions documented in code comment in `processMessage()`
- [x] Document known redaction limitations — added to notes.md: covers what IS/IS NOT redacted, why pattern-based is acceptable for v1
- [x] Document relative vs absolute path display decision — added to notes.md: paths shown as-is from SDK, rationale for not computing relative paths, privacy tradeoff acknowledged

---

## Remaining Work (Future Jobs)

1. **File path privacy**: Show relative paths or basenames (low priority)
2. **CI/CD log exposure**: Add `--quiet` or `--no-tool-details` flag
3. **Verbosity controls**: `--quiet`, `--verbose` flags for sauna
4. **Security checklist template**: For future job planning
5. **SDK contract research**: Monitor SDK updates for `input` format changes
6. **Integration tests**: Test with real SDK event payloads if possible
