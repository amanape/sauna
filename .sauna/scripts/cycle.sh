#!/bin/bash
# cycle.sh — Orchestrate plan/build cycles.
#
# Each cycle:
#   1. Run the plan agent PLAN_ITERATIONS times
#   2. Run the build agent until tasks.md is complete
#
# Usage: .sauna/scripts/cycle.sh <cycles> [goal]
#   cycles          — number of plan/build cycles to run (required)
#   goal            — optional goal string appended to all prompts
#
# Environment:
#   JOB_ID          — job directory name (default: discovery-agent)
#   PLAN_ITERATIONS — how many times to run plan per cycle (default: 2)
#
# Example:
#   .sauna/scripts/cycle.sh 5 "Build the discovery agent"
#   PLAN_ITERATIONS=3 .sauna/scripts/cycle.sh 2 "Ship it"
set -euo pipefail

CYCLES="${1:?Usage: cycle.sh <cycles> [goal]}"
GOAL="${2:-}"
PLAN_ITERATIONS="${PLAN_ITERATIONS:-2}"

export JOB_ID="${JOB_ID:-discovery-agent}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

SAUNA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PLAN_PROMPT="$SAUNA_DIR/prompts/plan.md"
BUILD_PROMPT="$SAUNA_DIR/prompts/build.md"

for ((c = 1; c <= CYCLES; c++)); do
  echo "=== Cycle $c/$CYCLES ==="

  # Phase 1: Plan
  for ((p = 1; p <= PLAN_ITERATIONS; p++)); do
    echo "--- Plan iteration $p/$PLAN_ITERATIONS ---"
    "$SCRIPT_DIR/run-agent.sh" "$PLAN_PROMPT" "$GOAL"
  done

  # Phase 2: Build until done
  echo "--- Build phase ---"
  "$SCRIPT_DIR/run-until-done.sh" "$BUILD_PROMPT" "$GOAL"

  echo "=== Cycle $c/$CYCLES complete ==="
done

echo "All $CYCLES cycles finished."
