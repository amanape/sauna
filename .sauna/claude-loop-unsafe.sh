#!/bin/bash
export JOB_ID="discovery-agent"

PROMPT="$(envsubst < "$1")"

if [ -n "$2" ]; then
  PROMPT="$PROMPT

ULTIMATE GOAL: $2
"
fi

while true; do
  clear
  claude --dangerously-skip-permissions "$PROMPT"
  echo "--- Run complete. Starting again... (Ctrl+C to stop) ---"
done
