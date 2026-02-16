#!/usr/bin/env bash
set -euo pipefail

if [ -z "${JOB_ID:-}" ]; then
  echo "Error: JOB_ID is not set"
  echo "Usage: JOB_ID=my-job .sauna/scripts/auto.sh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TASKS_FILE="$SCRIPT_DIR/../jobs/${JOB_ID}/tasks.md"

JOB_DIR="$SCRIPT_DIR/../jobs/${JOB_ID}"
if [ ! -d "$JOB_DIR" ]; then
  echo "Error: Job directory not found: $JOB_DIR"
  exit 1
fi

run_plan() {
  "$SCRIPT_DIR/run.sh" plan
}

run_build() {
  "$SCRIPT_DIR/run.sh" build
}

all_tasks_done() {
  # Returns 0 (true) if no unchecked items remain
  ! grep -q '^\s*- \[ \]' "$TASKS_FILE"
}

# Phase 2: Build until all tasks are done
echo "=== Phase 2: Building until all tasks done ==="
iteration=0
while ! all_tasks_done; do
  iteration=$((iteration + 1))
  echo "--- Build iteration $iteration ---"
  run_build
done
echo "=== All tasks done after $iteration iteration(s) ==="

# Phase 3: Plan 2 times (verify completeness)
echo "=== Phase 3: Verification planning (2x) ==="
for i in 1 2; do
  echo "--- Plan $i/2 ---"
  run_plan
done

# Phase 4: Final build
echo "=== Phase 4: Final build ==="
run_build

echo "=== Done ==="
