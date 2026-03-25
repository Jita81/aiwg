#!/usr/bin/env bash
# Security Sentinel — periodic audit
# Invoked on on_schedule hook events (every 6 hours)
#
# Environment variables:
#   HOOK_EVENT         — "on_schedule"
#   PROJECT_ROOT       — Project root directory

set -euo pipefail

PROJECT="${PROJECT_ROOT:-.}"
REPORT_DIR="${PROJECT}/.aiwg/reports/security"
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
REPORT_FILE="${REPORT_DIR}/audit-${TIMESTAMP}.json"

mkdir -p "$REPORT_DIR"

echo "security-sentinel: periodic audit"

# Full source scan
SECRETS=$(grep -rEic '(api[_-]?key|secret|token|password|credential)\s*[:=]\s*["'\''"][^\s"'\'']{8,}' "$PROJECT/src" "$PROJECT/tools" 2>/dev/null || echo 0)
VULNS=$(grep -rEc '(eval\(|innerHTML\s*=|exec\(|dangerouslySetInnerHTML)' "$PROJECT/src" "$PROJECT/tools" 2>/dev/null || echo 0)

# Dependency audit (if npm available)
DEP_VULNS=0
if command -v npm >/dev/null 2>&1 && [ -f "$PROJECT/package.json" ]; then
  DEP_VULNS=$(npm audit --json 2>/dev/null | grep -c '"severity"' 2>/dev/null || echo 0)
fi

cat > "$REPORT_FILE" <<EOF
{
  "behavior": "security-sentinel",
  "type": "periodic-audit",
  "timestamp": "${TIMESTAMP}",
  "findings": {
    "potential_secrets": ${SECRETS},
    "vulnerable_patterns": ${VULNS},
    "dependency_vulnerabilities": ${DEP_VULNS}
  },
  "status": "complete"
}
EOF

echo "Audit report: ${REPORT_FILE}"
