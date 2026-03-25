#!/usr/bin/env bash
# Test Watcher — run a changed test file directly
#
# Environment variables:
#   HOOK_FILE_PATH     — Path to the changed test file
#   PROJECT_ROOT       — Project root directory

set -euo pipefail

FILE="${HOOK_FILE_PATH:-}"
PROJECT="${PROJECT_ROOT:-.}"

if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "test-watcher: no test file to run"
  exit 0
fi

echo "test-watcher: running ${FILE}"
cd "$PROJECT" && npx vitest run "$FILE" 2>&1 || npm test -- --testPathPattern="$(basename "$FILE")" 2>&1
