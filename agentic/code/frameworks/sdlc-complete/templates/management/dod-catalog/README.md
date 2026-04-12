# DoD Catalog

Pre-built, opinionated Definitions of Done organized by scope, domain, and operational category. Each file is ready to use as-is or tailored to your project.

## Relationship to the Base Template

The parent template at `../definition-of-done-template.md` is a meta-template for teams to build their own DoD from scratch. This catalog contains pre-built DoDs for common cases — use the catalog entries directly, combine them, or use the base template when your situation does not fit any catalog entry.

## Catalog Structure

```
dod-catalog/
├── README.md                    # This file
├── _catalog-schema.yaml         # Schema for all DoD entries
├── scope/                       # Tied to delivery units (how much work is done)
│   ├── dod-story.md             # Story/task level
│   ├── dod-feature.md           # Feature level (group of stories)
│   ├── dod-iteration.md         # Iteration/sprint level
│   ├── dod-release.md           # Release level (production-ready)
│   └── dod-milestone.md         # Milestone/phase gate level
├── domain/                      # Tied to engineering disciplines (how well it is done)
│   ├── dod-security.md          # Security validation
│   ├── dod-performance.md       # Performance and SLO validation
│   ├── dod-accessibility.md     # WCAG 2.1 AA accessibility
│   ├── dod-testing.md           # Test coverage and quality
│   ├── dod-documentation.md     # Docs kept current with code
│   ├── dod-code-review.md       # Code review completeness
│   ├── dod-api-design.md        # API contract and versioning
│   └── dod-data-migration.md    # Schema and data migration safety
└── operational/                 # Tied to operational readiness (how safely it can run)
    ├── dod-deployment.md        # Deployment readiness
    ├── dod-monitoring.md        # Observability and alerting
    ├── dod-incident-response.md # Incident response readiness
    ├── dod-runbook.md           # Runbook completeness and testability
    └── dod-sla-compliance.md    # SLO/SLI instrumentation and error budgets
```

## How to Use

### 1. Pick the right scope DoD

Start with the scope DoD that matches your delivery unit. Every team should have at least `dod-story` active. Teams shipping to production should also activate `dod-release`.

| Delivery unit | DoD to use |
|---------------|-----------|
| Single story, task, or bug fix | `scope/dod-story.md` |
| A coherent group of stories (feature) | `scope/dod-feature.md` |
| End of a sprint or iteration | `scope/dod-iteration.md` |
| A production release or version tag | `scope/dod-release.md` |
| End of an SDLC phase (Inception, Elaboration, etc.) | `scope/dod-milestone.md` |

### 2. Add domain DoDs for your engineering context

Domain DoDs apply to any change touching that discipline, regardless of scope. Copy the relevant criteria into your project DoD or reference the file directly in your team agreement.

| Concern | DoD to apply |
|---------|-------------|
| Any change touching auth, data, or external interfaces | `domain/dod-security.md` |
| Changes on a latency-sensitive or high-traffic path | `domain/dod-performance.md` |
| User-facing UI changes | `domain/dod-accessibility.md` |
| Any code change (baseline) | `domain/dod-testing.md` |
| Code, APIs, or features with user-facing behavior | `domain/dod-documentation.md` |
| Every PR (baseline) | `domain/dod-code-review.md` |
| New or changed API endpoints | `domain/dod-api-design.md` |
| Schema or data changes | `domain/dod-data-migration.md` |

### 3. Add operational DoDs before going live

Operational DoDs apply at release or go-live time. Apply them once per service launch and revisit whenever the operational posture changes significantly.

| Readiness concern | DoD to apply |
|-------------------|-------------|
| Deploying to production | `operational/dod-deployment.md` |
| New service or significant new endpoint | `operational/dod-monitoring.md` |
| Service with on-call coverage | `operational/dod-incident-response.md` |
| Any new operational procedure | `operational/dod-runbook.md` |
| Service with an SLA commitment | `operational/dod-sla-compliance.md` |

### 4. Tailor before adopting

Each file has a **Tailoring Guide** section. Read it and decide which criteria to add or remove for your project context before committing to the DoD as a team agreement.

### 5. Agree as a team

A DoD is a team agreement, not a unilateral declaration. Review the chosen criteria with the full team, adjust as needed, and ensure every team member understands each criterion before starting work.

## Combining DoDs

DoDs compose. A typical story-level policy for a public web application might be:

- `dod-story` (base) +
- `dod-security` (required criteria only) +
- `dod-testing` (required criteria only) +
- `dod-accessibility` (required criteria only) +
- `dod-code-review` (full)

A release gate might be:

- `dod-release` (full) +
- `dod-security` (full, including recommended) +
- `dod-performance` (required criteria) +
- `dod-deployment` (full) +
- `dod-monitoring` (required criteria)

## How Extensions Contribute DoDs

### Adding a new DoD to the catalog

1. Create a file following the schema in `_catalog-schema.yaml`
2. Place it in the appropriate directory (`scope/`, `domain/`, or `operational/`)
3. Use `dod_id` in kebab-case prefixed with `dod-`
4. Set `extensible: true` and define at least two extension points
5. Add the file to this README's structure table

### Adding criteria to an existing DoD

Each catalog DoD declares named extension points (e.g., `ext-security-compliance`, `ext-story-platform`). To contribute additional criteria without modifying the base file:

1. Create `<your-addon>/dod-extensions/<dod-id>.yaml`
2. Specify:
   ```yaml
   extends: dod-security         # target DoD id
   extension_point: ext-security-compliance
   criteria:
     required:
       - id: hipaa-phi-encrypted
         text: "All PHI fields encrypted at rest with AES-256"
         automated: true
         tool: "data-classification-scanner"
   ```
3. The AIWG catalog loader merges extension criteria at the declared extension point during project initialization

### Project-level overlays

Projects can add criteria to any DoD without modifying the catalog by placing an overlay file in `.aiwg/dod-overlays/<dod-id>.yaml` with the same format. Overlays are merged at runtime and take precedence over catalog defaults.

## Schema Reference

See `_catalog-schema.yaml` for the full schema. Key fields:

| Field | Required | Description |
|-------|----------|-------------|
| `dod_id` | Yes | Unique kebab-case identifier (`dod-story`, `dod-security`, etc.) |
| `name` | Yes | Human-readable display name |
| `scope` | Yes | `scope`, `domain`, or `operational` |
| `category` | Yes | Sub-category (story, security, deployment, etc.) |
| `version` | Yes | Semantic version (`1.0.0`); increment when criteria change |
| `extensible` | Yes | `true` for all catalog entries |

## Related Resources

- Base DoD template: `../definition-of-done-template.md` — for building a custom DoD from scratch
- Quality Assurance Plan: `../quality-assurance-plan-template.md` — metrics and gate structure
- Phase gate flows: `.claude/commands/flow-gate-check.md` — automated gate validation
- Security gate criteria: `../../security/security-gate-criteria-card.md` — security-specific gate card
