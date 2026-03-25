#!/usr/bin/env bash
# Artifact Sync — incremental update on file change
#
# Environment variables:
#   HOOK_EVENT         — "on_file_write"
#   HOOK_FILE_PATH     — Path to the changed artifact
#   PROJECT_ROOT       — Project root directory

set -euo pipefail

FILE="${HOOK_FILE_PATH:-}"
PROJECT="${PROJECT_ROOT:-.}"

if [ -z "$FILE" ]; then
  echo "artifact-sync: no file path provided"
  exit 0
fi

echo "artifact-sync: artifact changed: ${FILE}"

# Validate @-mentions in the changed file
if command -v grep >/dev/null 2>&1; then
  MENTIONS=$(grep -oE '@[a-zA-Z0-9_./-]+' "$FILE" 2>/dev/null | sort -u)
  if [ -n "$MENTIONS" ]; then
    BROKEN=0
    while IFS= read -r mention; do
      REF_PATH="${mention#@}"
      if [ ! -f "$PROJECT/$REF_PATH" ] && [ ! -d "$PROJECT/$REF_PATH" ]; then
        echo "  [WARN] Unresolved mention: ${mention}"
        BROKEN=$((BROKEN + 1))
      fi
    done <<< "$MENTIONS"
    [ "$BROKEN" -gt 0 ] && echo "  ${BROKEN} unresolved mention(s)"
  fi
fi

echo "artifact-sync: incremental sync complete"
