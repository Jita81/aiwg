---
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
