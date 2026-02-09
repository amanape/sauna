#!/bin/bash
# run-until-done.sh — Run a prompt repeatedly until tasks.md has no pending tasks.
# Usage: .sauna/scripts/run-until-done.sh <prompt-file>
set -euo pipefail

export JOB_ID="${JOB_ID:-discovery-agent}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

TASKS_FILE="$REPO_ROOT/.sauna/jobs/$JOB_ID/tasks.md"
has_pending_tasks() { grep -q '^\- \[ \]' "$TASKS_FILE"; }

PROMPT_FILE="${1:?Usage: run-until-done.sh <prompt-file>}"
BUFFER="${BUFFER:-5}"
INITIAL_TASKS=$(grep -c '^\- \[ \]' "$TASKS_FILE" || true)
MAX_RUNS=$((INITIAL_TASKS + BUFFER))
RUN=0

echo "--- $INITIAL_TASKS pending tasks, max $MAX_RUNS runs (tasks + $BUFFER buffer) ---"

while has_pending_tasks; do
  RUN=$((RUN + 1))
  if [ "$RUN" -gt "$MAX_RUNS" ]; then
    echo "Safety limit reached ($MAX_RUNS runs). Stopping."
    exit 1
  fi
  REMAINING=$(grep -c '^\- \[ \]' "$TASKS_FILE" || true)
  echo "--- $REMAINING tasks remaining (run $RUN/$MAX_RUNS) ---"
  "$SCRIPT_DIR/run-agent.sh" "$PROMPT_FILE"
  echo "--- Run complete. Checking tasks... ---"
done

echo "All tasks in $TASKS_FILE complete!"
