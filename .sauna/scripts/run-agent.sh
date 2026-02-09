#!/bin/bash
# run-agent.sh — Run claude once with a prompt file.
# Usage: .sauna/scripts/run-agent.sh <prompt-file>
set -euo pipefail
trap 'exit 130' INT TERM

export JOB_ID="${JOB_ID:-discovery-agent}"

PROMPT_FILE="${1:?Usage: run-agent.sh <prompt-file>}"
PROMPT="$(envsubst < "$PROMPT_FILE")"

claude --dangerously-skip-permissions -p "$PROMPT"
