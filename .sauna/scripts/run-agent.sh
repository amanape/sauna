#!/bin/bash
# run-agent.sh — Run claude once with a prompt file.
# Usage: .sauna/scripts/run-agent.sh <prompt-file> [goal]
set -euo pipefail

export JOB_ID="${JOB_ID:-discovery-agent}"

PROMPT_FILE="${1:?Usage: run-agent.sh <prompt-file> [goal]}"
PROMPT="$(envsubst < "$PROMPT_FILE")"

if [ -n "${2:-}" ]; then
  PROMPT="$PROMPT

ULTIMATE GOAL: $2"
fi

claude --dangerously-skip-permissions -p "$PROMPT"
