---
namespace: aiwg
platforms: [all]
description: Verify links from use cases and requirements to design, code, tests, and releases
commandHint:
  argumentHint: <path-to-traceability-csv> [--interactive] [--guidance "text"]
  allowedTools: Read, Write, Glob, Grep
  model: sonnet
  category: documentation-tracking
---

# Check Traceability (SDLC)

## Task

Analyze the traceability matrix and report gaps:

- Missing tests for critical use cases
- Requirements without design/code links
- Closed defects not linked back to a requirement/use case

## Output

- `traceability-gap-report.md` with prioritized fixes and owners

## References

- @$AIWG_ROOT/agentic/code/addons/aiwg-utils/rules/research-before-decision.md — Read the traceability matrix and all linked artifacts before reporting gaps
- @$AIWG_ROOT/agentic/code/addons/aiwg-utils/rules/human-authorization.md — Report gaps and await owner assignment; do not autonomously close or resolve traceability issues
- @$AIWG_ROOT/agentic/code/frameworks/sdlc-complete/rules/provenance-tracking.md — Traceability requirements and provenance standards this skill enforces
- @$AIWG_ROOT/agentic/code/frameworks/sdlc-complete/skills/security-gate/SKILL.md — Security gate references traceability as a prerequisite criterion
