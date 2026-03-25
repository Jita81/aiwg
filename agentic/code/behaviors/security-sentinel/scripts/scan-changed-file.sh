#!/usr/bin/env bash
# Security Sentinel — scan a single changed file
# Invoked on on_file_write hook events
#
# Environment variables:
#   HOOK_EVENT         — "on_file_write"
#   HOOK_FILE_PATH     — Path to the file that was written
#   PROJECT_ROOT       — Project root directory

set -euo pipefail

FILE="${HOOK_FILE_PATH:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "security-sentinel: no file to scan"
  exit 0
fi

echo "security-sentinel: scanning ${FILE}"

# Quick secret scan
SECRETS=$(grep -Eic '(api[_-]?key|secret|token|password|credential)\s*[:=]\s*["'\''"][^\s"'\'']{8,}' "$FILE" 2>/dev/null || echo 0)

# Quick vulnerability scan
VULNS=$(grep -Ec '(eval\(|innerHTML\s*=|exec\(|dangerouslySetInnerHTML)' "$FILE" 2>/dev/null || echo 0)

if [ "$SECRETS" -gt 0 ] || [ "$VULNS" -gt 0 ]; then
  echo "security-sentinel: ALERT in ${FILE}"
  [ "$SECRETS" -gt 0 ] && echo "  Potential secrets: ${SECRETS}"
  [ "$VULNS" -gt 0 ] && echo "  Vulnerable patterns: ${VULNS}"
  exit 1
fi

echo "security-sentinel: ${FILE} clean"
