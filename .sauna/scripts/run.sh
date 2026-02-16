#!/usr/bin/env bash
set -euo pipefail
trap 'kill 0' SIGINT

PROMPT="${1:-}"
if [ -z "$PROMPT" ]; then
  echo "Error: No prompt specified"
  echo "Usage: JOB_ID=my-job .sauna/scripts/run.sh <plan|build>"
  exit 1
fi

if [ -z "${JOB_ID:-}" ]; then
  echo "Error: JOB_ID is not set"
  echo "Usage: JOB_ID=my-job .sauna/scripts/run.sh <plan|build>"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROMPT_FILE="$SCRIPT_DIR/../prompts/${PROMPT}.md"

if [ ! -f "$PROMPT_FILE" ]; then
  echo "Error: Prompt file not found: $PROMPT_FILE"
  exit 1
fi

claude --dangerously-skip-permissions -p "$(envsubst < "$PROMPT_FILE")"
