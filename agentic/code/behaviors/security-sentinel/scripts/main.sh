#!/usr/bin/env bash
# Security Sentinel — main scan script
# Invoked when the behavior is triggered via NLP
#
# Environment variables (set by the platform):
#   BEHAVIOR_NAME      — "security-sentinel"
#   BEHAVIOR_TRIGGER   — The trigger phrase that activated this behavior
#   INPUT_TARGET       — Target file or directory to scan
#   INPUT_SEVERITY     — Minimum severity threshold
#   PROJECT_ROOT       — Project root directory

set -euo pipefail

TARGET="${INPUT_TARGET:-.}"
SEVERITY="${INPUT_SEVERITY:-medium}"
REPORT_DIR="${PROJECT_ROOT:-.}/.aiwg/reports/security"
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
REPORT_FILE="${REPORT_DIR}/scan-${TIMESTAMP}.json"

mkdir -p "$REPORT_DIR"

echo "Security Sentinel: scanning ${TARGET} (severity >= ${SEVERITY})"

# Scan for hardcoded secrets
SECRETS_FOUND=0
if command -v grep >/dev/null 2>&1; then
  PATTERNS='(api[_-]?key|secret|token|password|credential)\s*[:=]\s*["\x27][^\s"'\'']{8,}'
  SECRETS_FOUND=$(grep -rEic "$PATTERNS" "$TARGET" --include='*.ts' --include='*.js' --include='*.mjs' --include='*.py' 2>/dev/null || echo 0)
fi

# Check for vulnerable patterns
VULN_PATTERNS=0
if command -v grep >/dev/null 2>&1; then
  VULN_PATTERNS=$(grep -rEc '(eval\(|innerHTML\s*=|exec\(|dangerouslySetInnerHTML)' "$TARGET" --include='*.ts' --include='*.js' --include='*.mjs' 2>/dev/null || echo 0)
fi

# Generate JSON report
cat > "$REPORT_FILE" <<EOF
{
  "behavior": "security-sentinel",
  "timestamp": "${TIMESTAMP}",
  "target": "${TARGET}",
  "severity_threshold": "${SEVERITY}",
  "findings": {
    "potential_secrets": ${SECRETS_FOUND},
    "vulnerable_patterns": ${VULN_PATTERNS}
  },
  "status": "complete"
}
EOF

echo "Report written to ${REPORT_FILE}"
echo "  Potential secrets: ${SECRETS_FOUND}"
echo "  Vulnerable patterns: ${VULN_PATTERNS}"
