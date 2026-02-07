#!/bin/bash
export JOB_ID="discovery-agent"

while true; do
  clear
  claude --dangerously-skip-permissions "$(envsubst < "$1")"
  echo "--- Run complete. Starting again... (Ctrl+C to stop) ---"
done
