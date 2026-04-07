# ADR-{NNN}: {Decision Title}

## Status

{Proposed | Accepted | Deprecated | Superseded by ADR-{NNN}}

## Date

{YYYY-MM-DD}

## Context

{Describe the situation, problem, or requirement that necessitates a decision. Include relevant constraints, forces, and background. Be specific about what triggered this decision — an incident, a new requirement, a scaling concern, a dependency change.}

### Constraints

- {Constraint 1 — e.g., must support zero-downtime deploys}
- {Constraint 2 — e.g., budget limited to existing infrastructure}
- {Constraint 3 — e.g., must be compatible with Ubuntu 24.04}

### Assumptions

- {Assumption 1 — e.g., traffic will grow 3x in next 12 months}
- {Assumption 2 — e.g., team has experience with Go but not Rust}

## Options Considered

### Option A: {Name}

{Description of this option.}

| Pros | Cons |
|------|------|
| {pro 1} | {con 1} |
| {pro 2} | {con 2} |

**Effort**: {Low / Medium / High}
**Risk**: {Low / Medium / High}

### Option B: {Name}

{Description of this option.}

| Pros | Cons |
|------|------|
| {pro 1} | {con 1} |
| {pro 2} | {con 2} |

**Effort**: {Low / Medium / High}
**Risk**: {Low / Medium / High}

### Option C: {Name}

{Description of this option.}

| Pros | Cons |
|------|------|
| {pro 1} | {con 1} |
| {pro 2} | {con 2} |

**Effort**: {Low / Medium / High}
**Risk**: {Low / Medium / High}

## Decision

**Chosen option: {Option X — Name}**

{Explain why this option was selected. Reference specific pros/cons that were decisive. If this was a close call, say so and explain the tiebreaker.}

## Consequences

### Positive

- {Positive consequence 1}
- {Positive consequence 2}

### Negative

- {Negative consequence 1 — trade-off accepted because...}
- {Negative consequence 2 — mitigated by...}

### Neutral

- {Neutral consequence — e.g., requires team training on X}

## Implementation Notes

{Practical guidance for implementing this decision. Include specific commands, file paths, configuration changes, or migration steps if applicable.}

```bash
# Example implementation command
{command}
```

## Follow-Up Actions

- [ ] {Action 1} — @{owner} — {target date}
- [ ] {Action 2} — @{owner} — {target date}
- [ ] Update related documentation: {doc references}
- [ ] Communicate decision to: {stakeholders}

## Related

- Related ADRs: {ADR-NNN, ADR-NNN}
- Related issues: {repo#NNN}
- Related runbooks: {link}
- Supersedes: {ADR-NNN or "N/A"}

## Audit Trail

| Field | Value |
|-------|-------|
| Author | {author} |
| Reviewers | {reviewer list} |
| Approved | {date} |
| Last reviewed | {date} |
