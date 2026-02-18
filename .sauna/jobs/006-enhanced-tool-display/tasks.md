# Enhanced Tool Display -- Tasks

**STATUS: BLOCKED** - Security vulnerability identified (credential exposure in terminal output)

## P0: BLOCKERS (Must Resolve Before Implementation)

- [ ] Design credential redaction for Bash commands (`export API_KEY=***`, `FOO=***`, `Authorization: Bearer ***`)
- [ ] Add opt-in mechanism (flag `--show-tool-details` or config file)
- [ ] Research SDK docs for `event.content_block.input` format stability guarantees
- [ ] Define multiline handling spec (first line extraction, heredocs, escape sequences)
- [ ] Add runtime validation: fail visibly if `input` is not an object
- [ ] Document privacy implications in user-facing docs

## P1: Architecture Decisions

- [ ] Keep extraction inline in `processMessage()` (avoid new `getToolDetails()` helper)
- [ ] Use lookup table for tool-to-parameter mapping (not switch statement)
- [ ] Document SDK wire format assumptions in code comments
- [ ] Create security checklist for future features

## P2: Core Implementation (After Blockers Resolved)

- [ ] Extract parameter inline: `input.file_path || input.command || input.description || input.pattern`
- [ ] Implement credential redaction before display
- [ ] Implement multiline truncation (first line only)
- [ ] Update `formatToolTag()` call with sanitized details
- [ ] Ensure dim ANSI wraps entire line

## P3: Testing

- [ ] Test SDK validation failures (undefined input, non-object input, missing properties)
- [ ] Test credential redaction patterns (export, assignment, auth headers)
- [ ] Test multiline handling (heredocs, `\n` in strings)
- [ ] Update `formatToolTag` tests for new behavior
- [ ] Add integration test with varied SDK event shapes

## P4: Documentation

- [ ] Add `--show-tool-details` flag to README (if opt-in used)
- [ ] Document SDK assumptions and validation strategy in comments
- [ ] Document known redaction limitations

---

## Alternative: Minimal Safe Implementation

If full security review fails:
- [ ] Implement ONLY for Read/Write/Edit (low secret risk)
- [ ] NEVER display Bash commands (high credential exposure)
- [ ] Default OFF, require explicit opt-in
- [ ] Show warning on first use about privacy

---

## Notes

**Risk**: HIGH - will expose credentials in terminal (API keys, tokens, secrets in Bash commands)
**See**: analysis.md lines 469-504 (security), 433-468 (SDK coupling), 545-588 (multiline)
**Next**: Create BLOCKED.md, research SDK docs, design opt-in strategy
