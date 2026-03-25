#!/usr/bin/env bash
# Quality Gate Watcher — PR-level gate check
#
# Environment variables:
#   HOOK_EVENT         — "on_pr_open"
#   PROJECT_ROOT       — Project root directory

set -euo pipefail

PROJECT="${PROJECT_ROOT:-.}"

echo "quality-gate-watcher: PR gate check"

ISSUES=0

# Check test coverage
if [ -f "$PROJECT/coverage/coverage-summary.json" ]; then
  echo "  [PASS] Test coverage report exists"
else
  echo "  [WARN] No coverage report found"
  ISSUES=$((ISSUES + 1))
fi

# Check for required SDLC artifacts
for artifact in requirements architecture; do
  if ls "$PROJECT/.aiwg/${artifact}/"*.md 1>/dev/null 2>&1; then
    echo "  [PASS] ${artifact} artifacts present"
  else
    echo "  [WARN] Missing ${artifact} artifacts"
    ISSUES=$((ISSUES + 1))
  fi
done

echo ""
echo "quality-gate-watcher: PR check complete (${ISSUES} issues)"
