# Output Writer

## Overview

A tool the LLM calls to write JTBD and spec files to disk. It enforces the directory convention so downstream agents always find a consistent structure.

## Requirements

- Implement as a tool (same `Tool` interface as others) so the LLM decides when to write and what content to produce
- Two tool variants:
  - **write_jtbd**: Creates a JTBD file. Accepts a job slug and the markdown content. Writes to `jobs/<slug>/jtbd.md`.
  - **write_spec**: Creates a spec file within a JTBD. Accepts a job slug, spec slug, and the markdown content. Writes to `jobs/<slug>/specs/<spec-slug>.md`.
- Both tools create directories as needed
- Output base path is configurable (defaults to `./jobs/` relative to where the CLI is run)
- Files are written immediately when the tool is called — no batching or confirmation step
- Overwrite if the file already exists (the human may ask the agent to revise)

## Directory Convention

```
jtbd/
  <job-slug>/
    jtbd.md
    specs/
      <spec-slug>.md
      <spec-slug>.md
  <job-slug>/
    jtbd.md
    specs/
      <spec-slug>.md
```

## Notes

- The LLM generates the slugs. They should be short, lowercase, hyphenated (e.g., `discovery-agent`, `auth-flow`). The tool should validate this — reject slugs with spaces, uppercase, or special characters.
- The tool returns a confirmation string like `"Wrote jobs/discovery-agent/specs/llm-provider.md"` so the LLM knows it succeeded.
- The human's feedback loop ("change the acceptance criteria on job A") works naturally — the agent calls write_jtbd again with updated content, overwriting the file.
