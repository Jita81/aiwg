#!/usr/bin/env bash
# Build Monitor — post-build validation
#
# Environment variables:
#   HOOK_EVENT         — "on_tool_complete"
#   HOOK_TOOL          — Tool that completed (build, tsc)
#   PROJECT_ROOT       — Project root directory

set -euo pipefail

TOOL="${HOOK_TOOL:-build}"
PROJECT="${PROJECT_ROOT:-.}"

echo "build-monitor: post-${TOOL} check"

# Check TypeScript compilation
if [ "$TOOL" = "tsc" ] || [ "$TOOL" = "build" ]; then
  if command -v npx >/dev/null 2>&1 && [ -f "$PROJECT/tsconfig.json" ]; then
    ERRORS=$(cd "$PROJECT" && npx tsc --noEmit 2>&1 | grep -c 'error TS' 2>/dev/null || echo 0)
    echo "  TypeScript errors: ${ERRORS}"
    [ "$ERRORS" -gt 0 ] && exit 1
  fi
fi

echo "build-monitor: post-${TOOL} check passed"
