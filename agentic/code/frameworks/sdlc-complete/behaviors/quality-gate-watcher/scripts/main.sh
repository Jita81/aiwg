#!/usr/bin/env bash
# Quality Gate Watcher — main gate evaluation
#
# Environment variables:
#   INPUT_PHASE        — SDLC phase to check
#   INPUT_STRICT       — Whether to fail on unmet criteria
#   PROJECT_ROOT       — Project root directory

set -euo pipefail

PROJECT="${PROJECT_ROOT:-.}"
PHASE="${INPUT_PHASE:-}"
STRICT="${INPUT_STRICT:-false}"
REPORT_DIR="${PROJECT}/.aiwg/reports/quality"
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)

mkdir -p "$REPORT_DIR"

echo "quality-gate-watcher: evaluating gates"

# Auto-detect phase from .aiwg/ if not specified
if [ -z "$PHASE" ]; then
  if [ -f "$PROJECT/.aiwg/planning/phase-status.json" ]; then
    PHASE=$(grep -o '"current_phase":\s*"[^"]*"' "$PROJECT/.aiwg/planning/phase-status.json" 2>/dev/null | cut -d'"' -f4 || echo "construction")
  else
    PHASE="construction"
  fi
fi

echo "  Phase: ${PHASE}"

# Check for required artifacts
ARTIFACTS_PRESENT=0
ARTIFACTS_REQUIRED=0

check_artifact() {
  local desc="$1"
  local pattern="$2"
  ARTIFACTS_REQUIRED=$((ARTIFACTS_REQUIRED + 1))
  if ls $PROJECT/.aiwg/$pattern 1>/dev/null 2>&1; then
    ARTIFACTS_PRESENT=$((ARTIFACTS_PRESENT + 1))
    echo "  [PASS] ${desc}"
  else
    echo "  [MISS] ${desc}"
  fi
}

check_artifact "Requirements" "requirements/*.md"
check_artifact "Architecture" "architecture/*.md"

if [ "$PHASE" != "inception" ]; then
  check_artifact "Test Strategy" "testing/*.md"
fi

if [ "$PHASE" = "construction" ] || [ "$PHASE" = "transition" ]; then
  check_artifact "Security" "security/*.md"
fi

echo ""
echo "  Gate: ${ARTIFACTS_PRESENT}/${ARTIFACTS_REQUIRED} criteria met"

cat > "${REPORT_DIR}/gate-${TIMESTAMP}.json" <<EOF
{
  "behavior": "quality-gate-watcher",
  "phase": "${PHASE}",
  "timestamp": "${TIMESTAMP}",
  "criteria_met": ${ARTIFACTS_PRESENT},
  "criteria_total": ${ARTIFACTS_REQUIRED},
  "status": "$([ $ARTIFACTS_PRESENT -eq $ARTIFACTS_REQUIRED ] && echo 'pass' || echo 'fail')"
}
EOF

if [ "$STRICT" = "true" ] && [ $ARTIFACTS_PRESENT -lt $ARTIFACTS_REQUIRED ]; then
  exit 1
fi
