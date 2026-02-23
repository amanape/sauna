# Pull Request Template

Create a PR template so contributors provide consistent information when opening pull requests.

## Depends On

None (no prerequisites).

## File

Create `.github/pull_request_template.md`.

## Template Content

```markdown
## What

<!-- Brief description of the change -->

## Why

<!-- Motivation, context, or issue reference (e.g., Fixes #123) -->

## Testing

<!-- How was this tested? -->

## Checklist

- [ ] Tests pass (`bun test`)
- [ ] Lint passes (`bun run lint`)
- [ ] Format passes (`bun run format:check`)
```

## Acceptance Criteria

- [ ] `.github/pull_request_template.md` exists
- [ ] Contains `## What` section with placeholder comment
- [ ] Contains `## Why` section with placeholder comment
- [ ] Contains `## Testing` section with placeholder comment
- [ ] Contains `## Checklist` with test, lint, and format checkbox items
