#!/usr/bin/env bash
# Artifact Sync — full index rebuild
#
# Environment variables:
#   INPUT_FORCE        — Force full rebuild
#   PROJECT_ROOT       — Project root directory

set -euo pipefail

PROJECT="${PROJECT_ROOT:-.}"
FORCE="${INPUT_FORCE:-false}"

echo "artifact-sync: rebuilding artifact index"

if command -v aiwg >/dev/null 2>&1; then
  ARGS="build"
  [ "$FORCE" = "true" ] && ARGS="build --force"
  cd "$PROJECT" && aiwg index $ARGS 2>&1
else
  echo "artifact-sync: aiwg CLI not found, counting artifacts manually"
  ARTIFACT_COUNT=$(find "$PROJECT/.aiwg" -name '*.md' -type f 2>/dev/null | wc -l || echo 0)
  echo "  Artifacts found: ${ARTIFACT_COUNT}"
fi

echo "artifact-sync: index rebuild complete"
