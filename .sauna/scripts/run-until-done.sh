#!/usr/bin/env bash
set -euo pipefail

TASKS_FILE="${1:-}"
if [ -z "$TASKS_FILE" ]; then
  echo "Usage: .sauna/scripts/run-until-done.sh <tasks-file>"
  echo "Example: .sauna/scripts/run-until-done.sh .sauna/jobs/002-cli-improvements/tasks.md"
  exit 1
fi

if [ ! -f "$TASKS_FILE" ]; then
  echo "Error: Tasks file not found: $TASKS_FILE"
  exit 1
fi

remaining() {
  grep -c '^\s*- \[ \]' "$TASKS_FILE" || echo 0
}

iteration=0
while grep -q '^\s*- \[ \]' "$TASKS_FILE"; do
  iteration=$((iteration + 1))
  echo "=== Iteration $iteration ($(remaining) tasks remaining) ==="

  sauna .sauna/prompts/build.md -c "$TASKS_FILE"
done

echo "=== All tasks done after $iteration iteration(s) ==="