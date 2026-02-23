# Dependabot Configuration

Configure Dependabot to automatically create PRs for outdated npm dependencies on a weekly schedule.

## Depends On

None (no prerequisites).

## File

Create `.github/dependabot.yml`.

## Configuration

- **Package ecosystem**: `npm`
- **Directory**: `"/"`
- **Schedule**: `weekly`

## Grouping

Group dependency updates to reduce PR noise:

| Group | Pattern | Purpose |
|---|---|---|
| `production` | `dependency-type: production` | Runtime deps in one PR |
| `dev` | `dependency-type: development` | Dev deps in one PR |

## Acceptance Criteria

- [ ] `.github/dependabot.yml` exists
- [ ] Configured for `npm` ecosystem
- [ ] Schedule is `weekly`
- [ ] Production dependencies are grouped into one PR
- [ ] Development dependencies are grouped into a separate PR
- [ ] YAML is valid
