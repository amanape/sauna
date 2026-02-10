# Skills Infrastructure

## What This Component Does

Skills are reusable, document-defined agent capabilities that can be discovered and loaded at runtime. This spec covers the infrastructure for defining, storing, and discovering skills — not the content of any specific skill.

## Requirements

### Skill Definition

- Skills must be defined as markdown files (SKILL.md) in designated directories on the filesystem.
- Each skill must have metadata (at minimum: name, description) and instruction content that gets injected into the agent's context when the skill is activated.
- Skills should be self-contained — a skill directory may include reference files and scripts alongside the SKILL.md.

### Skill Discovery

- Agents must be able to discover relevant skills automatically based on the task at hand.
- The skill discovery mechanism must work from a configured set of skill directories.
- Skills must be loaded at agent configuration time or dynamically during execution.

### Skill Directories

- The project must have a designated location for skills (e.g., a skills directory within the project structure).
- The workspace configuration must specify which directories contain skills.
- Different agents may have access to different skill sets depending on their configuration.

### Extensibility

- Adding a new skill must require only creating a new SKILL.md file in the skills directory — no code changes, no registration, no rebuilds.
- Skills must be addable without modifying existing agent definitions.

## Constraints

- This spec covers the infrastructure only. Authoring specific skills (e.g., "code review skill", "testing skill") is out of scope.
- The skill format should follow the Mastra/Agent Skills specification for compatibility with the broader ecosystem.
