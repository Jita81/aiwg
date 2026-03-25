#!/usr/bin/env bash
# Quality Gate Watcher — commit-level gate check
#
# Environment variables:
#   HOOK_EVENT         — "on_commit"
#   PROJECT_ROOT       — Project root directory

set -euo pipefail

PROJECT="${PROJECT_ROOT:-.}"

echo "quality-gate-watcher: commit gate check"

# Check conventional commit format on latest commit
LAST_MSG=$(cd "$PROJECT" && git log -1 --pretty=%s 2>/dev/null || echo "")
if [ -n "$LAST_MSG" ]; then
  if echo "$LAST_MSG" | grep -qE '^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?(!)?:'; then
    echo "  [PASS] Conventional commit format"
  else
    echo "  [WARN] Non-conventional commit: ${LAST_MSG}"
  fi
fi

echo "quality-gate-watcher: commit check complete"
