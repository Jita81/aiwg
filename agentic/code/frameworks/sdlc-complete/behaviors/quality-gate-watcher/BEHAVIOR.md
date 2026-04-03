---
name: quality-gate-watcher
version: 1.0.0
description: Enforce SDLC quality gate criteria on commits and pull requests.
# platforms restricted to daemon-capable systems (Tier 1) — behaviors require a
# persistent background process for trigger management and lifecycle hooks.
# Tier 3 platforms (cursor, windsurf, copilot, factory) require a display server
# or IDE host and cannot support daemon; see capability-matrix.yaml daemon_tier.
platforms: [claude-code, opencode, warp, openclaw, codex]

triggers:
  - "watch quality gates"
  - "check gate criteria"
  - "enforce quality"

inputs:
  - name: phase
    type: enum
    values: [inception, elaboration, construction, transition]
    required: false
    description: SDLC phase to validate gates for (auto-detected if omitted)
  - name: strict
    type: boolean
    required: false
    default: false
    description: Fail on any unmet gate criterion (vs warn)

hooks:
  on_commit:
    - action: run_script
      script: scripts/check-commit-gates.sh
  on_pr_open:
    - action: run_script
      script: scripts/check-pr-gates.sh

scripts:
  main: scripts/main.sh
  check-commit-gates: scripts/check-commit-gates.sh
  check-pr-gates: scripts/check-pr-gates.sh

manifest:
  category: quality
  requires:
    bins: [node]
  outputs:
    - type: report
      path: .aiwg/reports/quality/
  composable_with: [security-sentinel, test-watcher]
---

# Quality Gate Watcher

Enforce SDLC quality gate criteria automatically on commits and pull requests.

## When Triggered via NLP

Run a full gate evaluation for the current or specified SDLC phase. Report which criteria are met, which are unmet, and what actions are needed to pass the gate.

## When Triggered via Hooks

### on_commit

Lightweight gate check on each commit:
- Verify conventional commit format
- Check that modified files have associated tests
- Validate no `.aiwg/` artifacts are stale relative to code changes

### on_pr_open

Comprehensive gate evaluation when a PR is opened:
- Run full phase gate criteria check
- Verify all required artifacts exist and are current
- Check test coverage thresholds
- Validate security review status
- Post gate status as PR comment
