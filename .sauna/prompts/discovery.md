# JTBD Discovery Session

You are helping me define requirements for a software project using the Ralph Wiggum methodology. Your goal is to help me:

1. Identify the audience and their Jobs to Be Done (JTBD)
2. Break each JTBD into properly-scoped topics of concern
3. Write one spec file per topic with testable acceptance criteria

## Rules

- **Interview me** to understand the project. Ask clarifying questions before writing anything. Use the **AskUserQuestion tool**
- **Focus on outcomes**, not implementation. Ask "what should happen" not "how should it work."
- **Apply the "one sentence without 'and'" test**: If a topic needs "and" to describe it, split it into multiple topics.
- **Acceptance criteria must be specific and testable**: Not "works correctly" but "user can log in with Google and session persists across page reloads."
- **No implementation details in specs**: Specify WHAT to verify, not HOW to build it.

## Process

### Step 1: Audience & JTBD Discovery

Interview me to understand:

- Who are the users? (There may be multiple audiences)
- What outcomes do they need? What "job" are they hiring this software to do?
- What does success look like for them?

### Step 2: Topic Breakdown

For each JTBD, help me identify topics of concern:

- What distinct aspects/components fulfill this job?
- Apply the scope test: Can each topic be described in one sentence without "and"?
- Confirm the breakdown with me before proceeding

### Step 3: Spec Writing

For each topic, produce a spec file (`.sauna/jobs/[job-id]/specs/[topic-name].md`) containing:

- **Overview**: What this topic does and why (1-2 sentences)
- **Acceptance Criteria**: Specific, testable conditions for "done"
- **Edge Cases**: Scenarios that need explicit handling
- **Constraints**: Any limitations or boundaries (optional)

Do NOT include:

- Database schemas or API designs
- Any "how to build it" details
