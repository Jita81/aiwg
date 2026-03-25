#!/usr/bin/env bash
# Security Sentinel — post-deployment security validation
# Invoked on on_deploy hook events
#
# Environment variables:
#   HOOK_EVENT         — "on_deploy"
#   PROJECT_ROOT       — Project root directory

set -euo pipefail

PROJECT="${PROJECT_ROOT:-.}"
echo "security-sentinel: post-deploy scan"

# Check for secrets in committed files
SECRETS=$(grep -rEic '(api[_-]?key|secret|token|password|credential)\s*[:=]\s*["'\''"][^\s"'\'']{8,}' "$PROJECT/src" "$PROJECT/tools" 2>/dev/null || echo 0)

# Check for .env files that shouldn't be deployed
ENV_FILES=$(find "$PROJECT" -maxdepth 3 -name '.env' -o -name '.env.local' -o -name '.env.production' 2>/dev/null | wc -l || echo 0)

echo "  Secrets in source: ${SECRETS}"
echo "  .env files found: ${ENV_FILES}"

if [ "$SECRETS" -gt 0 ] || [ "$ENV_FILES" -gt 0 ]; then
  echo "security-sentinel: POST-DEPLOY ALERT — review findings before proceeding"
  exit 1
fi

echo "security-sentinel: deploy clean"
