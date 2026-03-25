#!/usr/bin/env bash
# Test Watcher — full test suite (scheduled)
#
# Environment variables:
#   PROJECT_ROOT       — Project root directory

set -euo pipefail

PROJECT="${PROJECT_ROOT:-.}"
REPORT_DIR="${PROJECT}/.aiwg/reports/testing"
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)

mkdir -p "$REPORT_DIR"

echo "test-watcher: full suite run"
cd "$PROJECT" && npm test 2>&1 | tee "${REPORT_DIR}/suite-${TIMESTAMP}.log"
echo "test-watcher: report at ${REPORT_DIR}/suite-${TIMESTAMP}.log"
