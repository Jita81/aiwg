#!/usr/bin/env bash
# Test Watcher — main entry point
# Invoked when the behavior is triggered via NLP
#
# Environment variables:
#   INPUT_PATTERN      — Test file pattern
#   INPUT_RUNNER       — Test runner (npm, vitest, jest, pytest)
#   PROJECT_ROOT       — Project root directory

set -euo pipefail

RUNNER="${INPUT_RUNNER:-npm}"
PROJECT="${PROJECT_ROOT:-.}"

echo "test-watcher: running full test suite with ${RUNNER}"

case "$RUNNER" in
  npm)     cd "$PROJECT" && npm test 2>&1 ;;
  vitest)  cd "$PROJECT" && npx vitest run 2>&1 ;;
  jest)    cd "$PROJECT" && npx jest 2>&1 ;;
  pytest)  cd "$PROJECT" && python -m pytest 2>&1 ;;
  *)       echo "Unknown runner: ${RUNNER}"; exit 1 ;;
esac
