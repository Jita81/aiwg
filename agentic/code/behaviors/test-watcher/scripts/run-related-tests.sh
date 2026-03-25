#!/usr/bin/env bash
# Test Watcher — run tests related to a changed source file
#
# Environment variables:
#   HOOK_FILE_PATH     — Path to the changed source file
#   PROJECT_ROOT       — Project root directory

set -euo pipefail

FILE="${HOOK_FILE_PATH:-}"
PROJECT="${PROJECT_ROOT:-.}"

if [ -z "$FILE" ]; then
  echo "test-watcher: no file path provided"
  exit 0
fi

# Derive test file path from source file
BASENAME=$(basename "$FILE" | sed 's/\.\(ts\|js\|mjs\)$/.test.\1/')
TEST_FILE=$(find "$PROJECT/test" -name "$BASENAME" -type f 2>/dev/null | head -1)

if [ -n "$TEST_FILE" ]; then
  echo "test-watcher: running ${TEST_FILE} (related to ${FILE})"
  cd "$PROJECT" && npx vitest run "$TEST_FILE" 2>&1 || npm test -- --testPathPattern="$BASENAME" 2>&1
else
  echo "test-watcher: no test found for ${FILE}, skipping"
fi
