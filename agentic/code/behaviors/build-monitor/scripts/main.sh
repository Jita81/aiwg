#!/usr/bin/env bash
# Build Monitor — main entry point
#
# Environment variables:
#   INPUT_COMMAND      — Build command to run
#   PROJECT_ROOT       — Project root directory

set -euo pipefail

BUILD_CMD="${INPUT_COMMAND:-npm run build}"
PROJECT="${PROJECT_ROOT:-.}"
REPORT_DIR="${PROJECT}/.aiwg/reports/build"
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)

mkdir -p "$REPORT_DIR"

echo "build-monitor: running '${BUILD_CMD}'"
START=$(date +%s)

cd "$PROJECT" && eval "$BUILD_CMD" > "${REPORT_DIR}/build-${TIMESTAMP}.log" 2>&1
EXIT_CODE=$?

END=$(date +%s)
DURATION=$((END - START))

WARNINGS=$(grep -cEi '(warn|warning)' "${REPORT_DIR}/build-${TIMESTAMP}.log" 2>/dev/null || echo 0)
ERRORS=$(grep -cEi '(error|ERR!)' "${REPORT_DIR}/build-${TIMESTAMP}.log" 2>/dev/null || echo 0)

cat > "${REPORT_DIR}/build-${TIMESTAMP}.json" <<EOF
{
  "behavior": "build-monitor",
  "timestamp": "${TIMESTAMP}",
  "command": "${BUILD_CMD}",
  "exit_code": ${EXIT_CODE},
  "duration_seconds": ${DURATION},
  "warnings": ${WARNINGS},
  "errors": ${ERRORS},
  "status": "$([ $EXIT_CODE -eq 0 ] && echo 'pass' || echo 'fail')"
}
EOF

echo "build-monitor: $([ $EXIT_CODE -eq 0 ] && echo 'PASS' || echo 'FAIL') in ${DURATION}s (${WARNINGS} warnings, ${ERRORS} errors)"
