---
platforms: [all]
description: Enforce minimum security criteria before iteration close or release
commandHint:
  argumentHint: <docs/sdlc/artifacts/project> [--interactive] [--guidance "text"]
  allowedTools: Read, Write, Glob, Grep
  model: sonnet
  category: security-quality
---

# Security Gate (SDLC)

## Criteria

- Approved threat model with mitigations or accepted risks
- Zero open critical vulnerabilities; highs triaged with owners/dates
- SBOM generated and reviewed (if applicable)
- Secrets policy verified; no hardcoded secrets

## Output

- `security-gate-report.md` with pass/fail and remediation tasks
