#!/bin/bash
export JOB_ID="discovery-agent"

TASKS_FILE=".sauna/jobs/$JOB_ID/tasks.md"
has_pending_tasks() { grep -q '^\- \[ \]' "$TASKS_FILE"; }
PROMPT="$(envsubst < "$1")"

if [ -n "$2" ]; then
  PROMPT="$PROMPT

ULTIMATE GOAL: $2
"
fi

while has_pending_tasks; do
  clear
  claude --dangerously-skip-permissions "$PROMPT"
  echo "--- Run complete. Checking tasks... ---"
done

echo "All tasks in $TASKS_FILE complete!"
