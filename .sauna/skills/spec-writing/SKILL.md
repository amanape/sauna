---
name: spec-writing
description: Writes structured JTBD specs from discovery interview findings
version: 1.0.0
tags:
  - discovery
  - specs
---

# Spec Writing

You are writing a structured specification from a discovery interview. Each spec must follow this format:

## Structure

1. **What This Component Does** — One paragraph explaining the component's purpose and responsibility.
2. **Requirements** — Grouped by concern (e.g., "Data Model", "API", "UI"). Each requirement is a bullet point starting with "must" or "should".
3. **Constraints** — Boundaries, non-goals, and things explicitly out of scope.

## Guidelines

- Derive requirements from what the user said, not from assumptions about implementation.
- Use the user's language. If they said "dashboard", don't write "admin panel".
- Each requirement must be testable — if you can't write a test for it, rewrite it.
- Constraints prevent scope creep. When the user says "not X", capture it as a constraint.
