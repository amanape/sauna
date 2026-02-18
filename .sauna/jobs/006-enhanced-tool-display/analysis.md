# Architecture Analysis: Job 006 - Enhanced Tool Display

## Critical Disconnect: Spec Claims vs. Reality

### What the Spec Claims (specs/enhanced-tool-tags.md)

**Lines 51-54 - "Constraints":**

> - Maintain existing newline handling (tool tags always on their own line)
> - Keep dim ANSI formatting for entire tool display
> - **No breaking changes to `processMessage()` function signature**

**Interpretation in notes.md:**

> "No Breaking Changes... `processMessage()` signature unchanged (per spec requirement)"

### What the Spec Actually Requires

**New behavior not in current implementation:**

1. Extract `event.content_block.input` object (currently unused)
2. Map tool names to parameter keys (new business logic)
3. Display potentially sensitive data (security implications)
4. Handle multiline values (new edge cases)

**These are NOT non-breaking changes just because `processMessage()` signature stays the same.**

### The "No Breaking Changes" Illusion

**Function signature ≠ Behavioral contract**

The spec conflates two different kinds of "breaking":

1. ✅ **API breaking**: Would caller code need changes? → No, signature is same
2. ❌ **Behavioral breaking**: Does output change in security-relevant ways? → YES

**Examples of "non-breaking signature, breaking behavior":**

```ts
// Before: displays [Bash]
// After: displays [Bash] export SECRET_KEY=sk-xxxxx
// Same signature, catastrophically different security profile
```

This is the architectural equivalent of saying "we didn't break the API, we just changed what it does."

### Why This Matters

**From findings.md's critique of over-testing:**

> "the code is structured around making tests easy rather than around the problem domain"

**Job 006 continues this pattern:**

- Prioritizes "no signature changes" (easy to test)
- Ignores "exposes secrets in output" (hard to test, easy to miss)
- Claims implementation is "ready" based on test coverage alone

The spec was written to satisfy existing test harness constraints, not to solve the user's problem safely.

---

## Proposed Changes (from Job 006)

### Surface-Level Scope

- Add `getToolDetails(name, input)` helper to extract relevant parameters from `event.content_block.input`
- Modify `formatToolTag(name, details?)` to accept optional details string
- Update `processMessage()` to pass extracted details to `formatToolTag()`
- Extend dim ANSI formatting to cover entire line including details

### Claimed Boundaries

- "Changes confined to `src/stream.ts` and `tests/stream.test.ts`"
- "No changes needed in `src/loop.ts`, `src/interactive.ts`, or other files"
- "`processMessage()` signature remains unchanged"

---

## Architectural Concerns

### 1. **Violation of Single Responsibility Principle**

**Issue**: `stream.ts` is currently a **pure formatting module**. Its documented purpose (line 1-6) is:

> "Pure formatting functions produce ANSI-colored strings. The message handler (processMessage) writes to stdout in real-time."

Adding `getToolDetails()` introduces **data extraction and tool-specific parameter mapping logic** into a formatting module. This violates the existing separation between:

- **Data extraction** (what parameters exist, how to interpret SDK payloads)
- **Formatting** (how to render extracted data for terminal output)

**Evidence from codebase**:

- Current `stream.ts` has zero knowledge of tool schemas or parameter names
- `formatToolTag()` is a pure function that takes a string and returns ANSI-wrapped output
- All domain knowledge lives in the caller (`processMessage()` knows about `content_block.type`, but not about individual tool schemas)

**Consequence**: As the number of tools grows, `getToolDetails()` becomes a maintenance bottleneck. Every new tool or parameter change requires modifying the formatting layer.

---

### 2. **Tight Coupling to Unstable SDK Wire Format**

**Issue**: The job depends on `event.content_block.input` containing structured parameter objects (e.g., `{ file_path: "...", command: "..." }`). This is an **untyped, undocumented dependency** on SDK internals.

**Evidence from existing code**:

- `src/stream.ts:81` - `msg: any` — The SDK message type is not imported or modeled
- `findings.md:84-86` - "Deep property chains like `msg.event.delta.type` are untyped. If the SDK changes its wire format, the compiler won't catch it."

**Existing risk acknowledgment**: The current code already makes an "untyped bet" on SDK stability (per findings.md). Job 006 **doubles down on this bet** by adding:

- 7 new tool-specific parameter name dependencies (`file_path`, `command`, `description`, `pattern`)
- Logic that assumes parameter shapes won't change
- No validation or error handling for missing/unexpected parameters

**Consequence**: SDK wire format changes (parameter renames, nested structure changes, new tool types) will silently break formatting or cause runtime errors. The compiler won't catch these. Tests mock the SDK, so they won't catch these either.

---

### 3. **Testing Fragility from Mocking Away Risk**

**Issue**: The job proposes extensive unit testing for `getToolDetails()` and updated `formatToolTag()` tests. But:

**From existing codebase patterns**:

- `interactive.test.ts` mocks the entire SDK via `createQuery` override (508 lines of test setup)
- `loop.test.ts` uses a factory pattern that returns controlled async generators
- **The real integration point (SDK → processMessage) is never tested with real SDK payloads**

**Job 006 test plan**:

> "Add unit tests for `getToolDetails()` covering each tool mapping (Read, Write, Edit, Bash, Task, Glob, Grep) plus unknown tool names"

This is **input-output contract testing**, not integration testing. It validates:

- ✅ "If we pass `{ file_path: "/foo" }`, we get `/foo`"
- ❌ "The SDK actually sends `{ file_path: "/foo" }` for Read tool calls"

**Consequence**: High test coverage on the wrong layer. False confidence. Real breakage happens when SDK changes format, and tests stay green.

---

### 4. **Premature Abstraction of Display Concerns**

**Issue**: The job creates `getToolDetails()` as a mapping function with hardcoded tool-to-parameter rules:

```ts
// Implied implementation from job spec
function getToolDetails(name: string, input: any): string | undefined {
  switch (name) {
    case 'Read':
    case 'Write':
    case 'Edit':
      return input.file_path;
    case 'Bash':
      return input.command;
    case 'Task':
      return input.description;
    case 'Glob':
    case 'Grep':
      return input.pattern;
    default:
      return undefined;
  }
}
```

**Why this is premature**:

1. **No extension point for custom tools** — If users can add tools (via MCP or future plugin systems), this function becomes a bottleneck
2. **Display logic hardcoded at extraction time** — What if different tools need different formatting? (e.g., Bash should show first 80 chars, file paths should be relative, etc.)
3. **No configuration layer** — Users can't control what details are shown (privacy concerns for paths containing usernames, secret values in commands)

**Evidence of future risk**:

- `findings.md:152` - "The current structure has no obvious extension points (no plugin system, no middleware, no config layer)"
- Job 006 adds another hardcoded lookup table without addressing this

**Consequence**: When customization is needed (and it will be — think `[Bash] export SECRET_KEY=...` in public demos), the fix will be invasive. The function signature won't support per-tool formatting rules without a refactor.

---

### 5. **Inconsistency with "No Overengineering" Principle**

**Issue**: The codebase has a documented aversion to abstraction for abstraction's sake:

**From findings.md**:

> "What's correctly _not_ abstracted: Duplicated query options in `session.ts` and `interactive.ts` — Both construct the same SDK options object independently. Extracting a shared builder would be premature."

Yet Job 006 introduces:

- A new abstraction (`getToolDetails`) to avoid repeating parameter lookups inline
- 7 unit tests for tool-specific mapping logic
- Modified function signatures to thread optional details through

**Why the inconsistency?**

- The duplicated query options serve **different code paths** (single-run vs REPL)
- The tool details extraction serves **one call site** (`processMessage`)

If duplication across two files is "correctly not abstracted," why is extraction within one function worth a dedicated helper?

**Consequence**: Architectural drift. The codebase loses its identity as "radically simple CLI wrapper" and starts accumulating "best practice" layers that serve testing more than users.

---

## Missing Considerations

### What the Job Doesn't Address

1. **Error handling for malformed SDK payloads**
   - What if `input` is undefined? Empty object? String instead of object?
   - Current spec: "Tools without meaningful details display just `[ToolName]`" — but no validation logic proposed

2. **Privacy and security**
   - Commands can contain secrets (`export API_KEY=...`)
   - File paths can contain usernames (`/Users/alice/.ssh/id_rsa`)
   - No redaction, no configuration, no user consent

3. **Long value truncation**
   - Spec says "Very long commands: Display in full (no truncation)"
   - What about a 10KB Base64 blob passed to Bash? Terminal wrapping will destroy readability
   - Spec says "Multiline tool arguments: Only show first line" but provides no implementation guidance

4. **Relative vs absolute paths**
   - Most tools show relative paths in user-facing output
   - Job proposes showing `file_path` parameter as-is, which is often absolute (e.g., `/Users/stephanpsaras/Desktop/Projects/sauna-cli.SAU-62/src/stream.ts`)

5. **Interaction with existing `--quiet` or verbosity flags**
   - Does `sauna` have verbosity controls? (Not visible in current codebase)
   - Should tool details respect a quiet mode?

---

## Recommended Architectural Principles (Currently Violated)

### 1. **Preserve Module Boundaries**

`stream.ts` should remain a formatting-only module. Data extraction should live closer to the SDK boundary.

**Alternative**: Extract details in `processMessage()` inline, pass directly to `formatToolTag()`. No new abstraction needed for one call site.

### 2. **Type the SDK Contract**

Before depending on `input` object structure, either:

- Import SDK types (if available)
- Define local interfaces that document the expected shape
- Add runtime validation with fallback

**Alternative**: Use TypeScript's type narrowing to make assumptions explicit:

```ts
if (
  event.content_block?.input &&
  typeof event.content_block.input === 'object'
) {
  const input = event.content_block.input as Record<string, any>;
  // ... extract with fallback
}
```

### 3. **Fail Visibly, Not Silently**

If `input` is missing or malformed, don't just fall back to `[ToolName]`. Log a warning (to stderr) or show `[ToolName] <error>`.

**Rationale**: Silent failures hide SDK contract changes. Visible failures get reported and fixed.

### 4. **Configuration Over Convention**

Don't hardcode "which parameter to show for which tool." Either:

- Make it configurable (environment variable, flags)
- Or keep it so simple that configuration isn't needed (e.g., always show first parameter, regardless of tool)

---

## Specific Code Smells Introduced by Job 006

### Smell 1: Optional Parameter with No-Op Default

```ts
export function formatToolTag(name: string, details?: string): string {
  return details
    ? `${DIM}[${name}] ${details}${DIM_OFF}`
    : `${DIM}[${name}]${DIM_OFF}`;
}
```

**Issue**: Adds conditional logic to a pure function for a single call site. Caller must know to pass `undefined` to get old behavior.

**Alternative**: Two functions or a required parameter with `""` as sentinel value.

---

### Smell 2: Switch Statement Over Tool Names

```ts
function getToolDetails(name: string, input: any): string | undefined {
  switch (name) {
    case 'Read':
      return input.file_path;
    // ... 6 more cases
  }
}
```

**Issue**: Open-Closed Principle violation. Every new tool type requires editing this function.

**Alternative (if abstraction is needed at all)**:

```ts
const TOOL_DETAIL_KEYS: Record<string, string> = {
  Read: 'file_path',
  Write: 'file_path',
  Edit: 'file_path',
  Bash: 'command',
  Task: 'description',
  Glob: 'pattern',
  Grep: 'pattern',
};

function getToolDetails(name: string, input: any): string | undefined {
  const key = TOOL_DETAIL_KEYS[name];
  return key ? input[key] : undefined;
}
```

At least this makes the mapping data-driven.

---

## Impact Assessment

### If Job 006 is Implemented As Specified

**Short-term (next 3 months)**:

- ✅ Improved UX — Users see more context in tool output
- ⚠️ Maintenance burden — Tool parameter mapping must be kept in sync with SDK
- ❌ No immediate breakage — SDK is currently stable

**Medium-term (6-12 months)**:

- ⚠️ SDK wire format change causes silent failures
- ⚠️ Users request privacy controls for displayed details
- ⚠️ `getToolDetails()` grows to 20+ cases as tool set expands

**Long-term (12+ months)**:

- ❌ Extensibility crisis if custom tools or MCP integration is added
- ❌ `stream.ts` becomes a "kitchen sink" module (formatting + extraction + mapping)
- ❌ Testing becomes more complex without providing more safety

---

## Alternative Implementations (Lower Risk)

### Option A: Inline Extraction (Simplest)

No new abstraction. Extract details in `processMessage()` where the SDK payload is already handled:

```ts
if (
  event.type === 'content_block_start' &&
  event.content_block?.type === 'tool_use'
) {
  const name = event.content_block.name;
  const input = event.content_block.input || {};

  // Extract first useful parameter based on known patterns
  const detail =
    input.file_path || input.command || input.description || input.pattern;

  const tag = detail
    ? `${DIM}[${name}] ${detail}${DIM_OFF}`
    : `${DIM}[${name}]${DIM_OFF}`;
  write((state && !state.lastCharWasNewline ? '\n' : '') + tag + '\n');
  if (state) state.lastCharWasNewline = true;
}
```

**Trade-offs**:

- ✅ Zero abstractions
- ✅ Single responsibility preserved (formatting stays in one place)
- ✅ Obvious what's happening (no function indirection)
- ❌ Parameter precedence order is arbitrary
- ❌ Doesn't handle per-tool formatting rules

---

### Option B: Configuration-Driven

Add a config file (`.sauna/display.json`) that defines what to show:

```json
{
  "toolDetails": {
    "Read": "file_path",
    "Bash": "command",
    "Task": "description"
  }
}
```

Load this in `cli.ts` or `session.ts`, pass to `processMessage()` as part of config.

**Trade-offs**:

- ✅ Extensible without code changes
- ✅ Users can opt out or customize
- ❌ Adds configuration layer (violates current "flags only" simplicity)
- ❌ More complex implementation

---

### Option C: SDK-Aware Type Definitions

Define TypeScript interfaces for known tool schemas:

```ts
type ToolInput =
  | { tool: 'Read'; file_path: string }
  | { tool: 'Bash'; command: string }
  | { tool: 'Task'; description: string };
// ...

function getToolDetails(name: string, input: unknown): string | undefined {
  // Type-safe extraction with validation
}
```

**Trade-offs**:

- ✅ Type safety at extraction point
- ✅ Compiler catches SDK changes (if types are updated)
- ❌ Requires maintaining type definitions in sync with SDK
- ❌ Still doesn't solve extensibility for custom tools

---

## Critical Oversight: SDK Contract Validation Missing

### The Unverified Assumption

The entire Job 006 implementation depends on `event.content_block.input` containing a structured object with tool-specific parameters. However:

**Current Evidence**:

1. The SDK is bundled/minified (`node_modules/@anthropic-ai/claude-agent-sdk/cli.js`) — no readable TypeScript definitions found
2. `src/stream.ts:81` already notes: `msg: any` — "The SDK's streaming message type is not imported or modeled"
3. `findings.md:84-86` explicitly calls this out as "a calculated bet that the SDK is stable"

**What Job 006 Adds**:

- 7 new untyped dependencies on `input` object properties
- Zero validation that `input` exists or is an object
- Zero fallback handling if properties are missing
- No documentation of the SDK wire format assumptions

### Real-World Risk Scenario

```ts
// Job 006 proposes (simplified):
function getToolDetails(name: string, input: any): string | undefined {
  if (name === 'Read') return input.file_path; // What if input is undefined?
  if (name === 'Bash') return input.command; // What if command is renamed?
}
```

**What breaks silently**:

1. SDK changes `file_path` to `path` → empty tool tags, no error
2. SDK passes `input` as string for some tools → `undefined[property]` → no error, just missing details
3. SDK adds namespace: `input.params.file_path` → silently fails

**None of this is caught by**:

- Compiler (everything is `any`)
- Unit tests (mock objects with correct shape)
- Runtime validation (none exists)

## Critical Concern: Privacy & Security Not Addressed

### Exposed Sensitive Information

The spec explicitly states:

- **Bash commands**: "Display in full (no truncation)"
- **File paths**: Display as-is

**Real examples that will be displayed**:

```
[Bash] export OPENAI_API_KEY=sk-1234567890abcdef
[Bash] curl -H "Authorization: Bearer ${SECRET_TOKEN}" api.example.com
[Read] /Users/alice/.ssh/id_rsa
[Write] /home/bob/company-secrets/database-passwords.txt
```

**Where this appears**:

- Terminal output (scrollback, screen sharing, recordings)
- CI/CD logs if sauna runs in pipelines
- Any context where tool execution is visible

**No mitigation proposed**:

- No redaction
- No configuration to disable details
- No user consent flow
- No documentation of the privacy implications

### This is NOT an Edge Case

Per CLAUDE.md (project instructions), this project uses:

- `.env` files (though Bun auto-loads them, they may still be referenced in commands)
- Environment variables (`Bun.env`)
- API calls (`Bun.serve()`, `Bun.redis`, `Bun.sql`)

Any Bash command that exports these, or any script that references credentials, will display them in dim gray in the terminal.

## Oversight: No Architecture.md Existed Before

### Implication for the Project

The absence of `architecture.md` before this analysis suggests:

1. **No documented architectural principles** — Decisions like "why functions take `write` callback" or "why test-driven abstractions are acceptable" are implicit
2. **No change control for architectural drift** — Job 006 could have been implemented without anyone asking "does this violate module boundaries?"
3. **No decision log** — Future maintainers won't know why `InteractiveOverrides` exists or why `findClaude()` error handling was deferred
4. **No security review process** — Job 006 would display secrets in terminal output without anyone flagging it

**Recommendation**: Treat this document as the **first architectural decision record (ADR)**. Future jobs should be reviewed against documented principles before implementation.

---

## Verdict on Job 006

### Valid Concerns

1. **Module boundary violation** — Formatting layer should not contain data extraction logic
2. **SDK coupling risk** — Untyped dependency on `input` object structure with no validation
3. **Testing theater** — Proposed tests mock away the real integration risk
4. **Premature abstraction** — `getToolDetails()` serves one call site but adds maintenance burden
5. **Missing requirements** — Privacy, truncation, error handling not addressed

### Architectural Debt Introduced

- **1 new abstraction** with unclear extension point
- **7 hardcoded tool mappings** that must be kept in sync with SDK
- **1 modified function signature** (`formatToolTag`) with optional parameter
- **0 new configuration options** (hardcoded behavior)

### Risk Level: **MEDIUM**

Not immediately breaking, but sets a precedent for:

- Mixing concerns in previously pure modules
- Trusting undocumented SDK internals
- Solving UX problems without considering privacy/security

---

## Additional Architectural Concern: Multiline Handling Ambiguity

### The Spec Says

From `specs/enhanced-tool-tags.md:48`:

> "Multiline tool arguments: Only show first line or simplified representation"

### The Problem

**No implementation guidance provided**:

1. How to detect multiline values? (`\n` in string? Array?)
2. What is "simplified representation"? (Ellipsis? Line count? First N chars?)
3. Which tools might have multiline arguments? (Bash with heredocs? Edit with old_string?)

**Example scenarios not addressed**:

```bash
# Heredoc in Bash
cat <<EOF
line 1
line 2
EOF

# Edit tool with multiline old_string
old_string: "function foo() {\n  return bar;\n}"

# Write tool with multiline content (not shown, but adjacent concern)
```

**Current code (stream.ts:141-151)**:

- No multiline handling exists
- Text deltas just call `write(text)` — what does `formatToolTag()` receive?

**Risk**:

- Multiline commands break terminal formatting
- Tool tags become unreadable (e.g., `[Bash] cat <<EOF\nline1\nline2`)
- No test coverage proposed for this edge case

### This Compounds the SDK Coupling Risk

Not only is the `input` object structure untyped, but the _shape_ of values is unknown:

- Are commands strings or arrays?
- Are file paths absolute or relative?
- Do parameters contain escape sequences?

## Recommendation

**STOP: Job 006 should not proceed without addressing blockers**

### Blocking Issues (Must Fix Before Implementation)

1. **Security/Privacy**: Add explicit redaction or user opt-in for sensitive data display
   - Minimum: Redact environment variable assignments (`export FOO=***`, `FOO=***`)
   - Better: Configuration option to disable tool details entirely
   - Best: Per-tool privacy controls (e.g., show file basenames only, not full paths)

2. **SDK Contract Validation**: Add runtime guards to fail visibly on SDK format changes

   ```ts
   const input = event.content_block?.input;
   if (!input || typeof input !== 'object') {
     write(`${DIM}[${name}] <invalid input>${DIM_OFF}\n`);
     return;
   }
   ```

3. **Multiline Handling**: Define and implement the "first line only" extraction
   ```ts
   function extractFirstLine(value: unknown): string | undefined {
     if (typeof value !== 'string') return undefined;
     const firstLine = value.split('\n')[0];
     return firstLine.length > 0 ? firstLine : undefined;
   }
   ```

### Non-Blocking Improvements (Should Address During Implementation)

4. **Document SDK Assumptions**: Add comment in code listing expected `input` shapes
5. **Make extraction data-driven**: Use lookup table instead of switch statement
6. **Keep stream.ts pure**: Do extraction inline in `processMessage()`, not in helper

### Alternative: Minimal Viable Implementation

If security/privacy concerns cannot be resolved, implement a safer subset:

- **Only show details for Read/Write/Edit** (file operations with low secret risk)
- **Never show Bash commands** (too high risk of credential exposure)
- **Make it opt-in via flag**: `--show-tool-details` (default off)

This reduces UX value but eliminates the most dangerous failure modes.

---

## Final Verdict: Job 006 is NOT READY

### Show-Stopper Issues

1. ❌ **Security**: Will expose secrets in terminal output without user awareness
2. ❌ **Reliability**: Depends on undocumented SDK wire format with no validation
3. ❌ **Completeness**: Multiline handling spec is vague and unimplemented

### Architectural Debt Introduced

- Module boundary violation (formatting layer gains extraction responsibility)
- Tight coupling to unstable SDK internals (7 new untyped dependencies)
- Testing fragility (mocks won't catch SDK format changes)
- Premature abstraction (helper function for single call site)

### Risk Level: **HIGH** (upgraded from MEDIUM)

The privacy/security implications were initially underestimated. Exposing credentials in terminal output is a **user-facing security vulnerability**, not just an architectural concern.

### Path Forward

1. **Immediate**: Document these concerns in `.sauna/jobs/006-enhanced-tool-display/BLOCKED.md`
2. **Short-term**: Research SDK documentation for `input` object guarantees
3. **Medium-term**: Add configuration layer to sauna for feature flags
4. **Long-term**: Only implement after security review and opt-in mechanism

The UX improvement is real, but it's not worth shipping a feature that could leak credentials.

---

## Summary: What This Analysis Reveals About Sauna's Architecture

### Positive Patterns (From findings.md, Still Valid)

1. **Appropriately simple for scope** — 571 LOC doing one thing well
2. **Clean state management** — `StreamState` solves real formatting problems
3. **Pragmatic testing** — Dependency injection works at this scale
4. **Correct non-abstractions** — Avoids premature optimization

### Emerging Anti-Patterns (Revealed by Job 006)

1. **Test-driven architecture** — Structure dictated by test harness, not domain
2. **"No breaking changes" used as safety theater** — Hides behavioral breaking changes
3. **Untyped SDK coupling** — "Calculated bet" on stability now has 8+ dependencies
4. **No security review process** — Job 006 reached "ready for implementation" without security analysis

### The Real Architectural Question

**Can sauna scale beyond "thin CLI wrapper" without adopting:**

- Configuration layer (for privacy controls, feature flags)
- Type safety for SDK contracts (or runtime validation)
- Security review checkpoints (before jobs marked "ready")
- Clear module boundaries (extraction vs. formatting)

**findings.md predicted this:**

> "The real test of these instincts comes when the next 5 features land."

**Job 006 is feature #1 after the initial implementation.** It already stresses all the boundaries.

### Concrete Recommendations for Project Maintainers

#### Immediate (Before Any Implementation)

1. **Create BLOCKED.md** in job directory documenting security concerns
2. **Add security checklist** to job planning template:
   - [ ] Does this display user data? (paths, commands, etc.)
   - [ ] Could this expose credentials or secrets?
   - [ ] Is there user control/configuration?
   - [ ] What's the failure mode if SDK format changes?

3. **Document SDK contract assumptions** in `src/stream.ts`:
   ```ts
   /**
    * UNTYPED SDK DEPENDENCY:
    * We assume event.content_block.input has shape { [key: string]: any }
    * Known properties: file_path, command, description, pattern
    * No validation - fails silently if SDK changes format
    */
   ```

#### Short-term (This Quarter)

4. **Research SDK documentation** — Are types available? Is `input` format stable?
5. **Add opt-in flag architecture** — `--show-tool-details` or config file
6. **Fix `findClaude()` error handling** — This has been deferred too long (findings.md issue #1)

#### Medium-term (Next Quarter)

7. **Type the SDK boundary** — Even if manually maintained, document expected shapes
8. **Extract security concerns to a layer** — Redaction, sanitization before display
9. **Create architecture decision log** — This file is the first ADR; make it a pattern

#### Long-term (Roadmap)

10. **Configuration system** — For features that need user control (privacy, verbosity, etc.)
11. **Plugin/extension model** — If custom tools are coming, design for it now
12. **Integration tests with real SDK** — Not just mocked units

### Success Criteria for Job 006 Revival

Job 006 can be reconsidered when:

- ✅ Security review completed with documented mitigation (redaction or opt-in)
- ✅ SDK contract documented or validated with runtime checks
- ✅ Multiline handling specified and implemented
- ✅ Privacy controls available (flag, config, or per-tool settings)
- ✅ Architectural principles documented (this file counts)

**Until then: Job 006 is BLOCKED on security review.**

---

## Appendix: How This Analysis Should Have Happened Earlier

### The Planning Process That Failed

1. ✅ Research done (notes.md) — Good technical investigation
2. ✅ Tasks broken down (tasks.md) — Clear implementation steps
3. ✅ Tests planned — Coverage considered
4. ❌ **Security review skipped** — No one asked "what sensitive data might this display?"
5. ❌ **Architecture review skipped** — No one checked module boundaries
6. ❌ **SDK contract validation skipped** — No one verified `input` shape is stable

**Conclusion in notes.md:**

> "Ready for Implementation"

**Should have been:**

> "Ready for Security Review"

### Root Cause

**No documented review gates.** The project went from "appropriately simple" to "adding features" without establishing:

- What reviews are required before implementation?
- Who validates security implications?
- What architectural principles constrain changes?

This `architecture.md` file now provides those principles. **Future jobs must reference this document during planning.**

---

**Document Status**: Initial architectural assessment
**Created**: In response to Job 006 review request
**Next Review**: After Job 006 is either revised or a new feature job is proposed
**Maintainer Note**: This document should be updated as architectural decisions are made, not just when problems are found.
