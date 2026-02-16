# Automated Releases

## Overview

Pushing a version tag to GitHub triggers a CI pipeline that builds all platform binaries, runs tests, and publishes them as a GitHub Release.

## Acceptance Criteria

- Pushing a tag matching `v*` (e.g., `v0.2.0`) triggers the release workflow
- The workflow runs tests before building; a test failure prevents the release
- All six cross-compiled binaries are attached to the GitHub Release as downloadable assets
- The GitHub Release title matches the tag name
- The workflow does not trigger on regular branch pushes or pull requests

## Edge Cases

- Re-pushing the same tag does not create duplicate releases
- The workflow fails cleanly if `bun build --compile` fails for any target
