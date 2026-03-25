#!/usr/bin/env bash
# Build Monitor — scheduled clean build
#
# Environment variables:
#   PROJECT_ROOT       — Project root directory

set -euo pipefail

PROJECT="${PROJECT_ROOT:-.}"
REPORT_DIR="${PROJECT}/.aiwg/reports/build"
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)

mkdir -p "$REPORT_DIR"

echo "build-monitor: scheduled clean build"
START=$(date +%s)

cd "$PROJECT" && npm run build > "${REPORT_DIR}/scheduled-${TIMESTAMP}.log" 2>&1
EXIT_CODE=$?

END=$(date +%s)
DURATION=$((END - START))

echo "build-monitor: scheduled build $([ $EXIT_CODE -eq 0 ] && echo 'PASS' || echo 'FAIL') in ${DURATION}s"
