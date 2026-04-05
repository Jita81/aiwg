---
description: Verify bidirectional traceability across all six refinement layers (UC → BS → IC → PC → code → tests)
category: documentation-tracking
argument-hint: [--layer all|3|4|5] [--scope <path>] [--fix] [--guidance "text"]
allowed-tools: Read, Write, Glob, Grep
model: sonnet
---

# Check Traceability (SDLC)

## Purpose

Enforce bidirectional traceability across all six refinement layers so that every code artifact traces back to a specification and every specification traces forward to code.

## Artifact ID Conventions

Each artifact at every refinement layer uses a typed ID prefix:

| Layer | Prefix | Example | Location |
|-------|--------|---------|----------|
| 0 — Intake | `INTAKE-` | `INTAKE-001` | `.aiwg/intake/` |
| 1 — Requirements | `UC-` | `UC-003` | `.aiwg/requirements/use-case-*.md` |
| 1 — Requirements | `REQ-` | `REQ-NFR-001` | `.aiwg/requirements/supplemental-specification.md` |
| 2 — Architecture | `SAD-` | `SAD-001` | `.aiwg/architecture/software-architecture-doc.md` |
| 2 — Architecture | `ADR-` | `ADR-003` | `.aiwg/architecture/adr/ADR-*.md` |
| 3 — Behavioral Spec | `BS-` | `BS-003` | `.aiwg/requirements/realizations/BS-*.md` |
| 3 — State Machine | `SM-` | `SM-Order` | `.aiwg/requirements/state-machines/SM-*.md` |
| 3 — Decision Table | `DT-` | `DT-003-discount` | `.aiwg/requirements/decision-tables/DT-*.md` |
| 3 — Interface Contract | `IC-` | `IC-003-processOrder` | `.aiwg/requirements/contracts/IC-*.md` |
| 3 — Activity Diagram | `ACT-` | `ACT-003-fulfillment` | `.aiwg/requirements/activities/ACT-*.md` |
| 3 — Data Flow Spec | `DFS-` | `DFS-003-registration` | `.aiwg/requirements/data-flows/DFS-*.md` |
| 4 — Pseudo-Code | `PC-` | `PC-003-processOrder` | `.aiwg/requirements/pseudocode/PC-*.md` |
| 5 — Source Code | `CODE-` | `CODE-order-service` | `src/` |
| 5 — Tests | `TEST-` | `TEST-UC-003` | `test/` |

## Traceability Chain

The complete traceability chain validates these relationships:

```
UC-{NNN} (use case)
  ↔ BS-{NNN} (behavioral spec / realization)
    ↔ IC-{NNN}-{method} (interface contract)
      ↔ PC-{NNN}-{method} (pseudo-code spec)
        ↔ src/{path} (source code)
          ↔ test/{path} (test derived from spec)
```

Each `↔` represents a bidirectional link that must be present in both directions.

## Task

Analyze the project artifacts and validate traceability across all refinement layers.

### Validation Rules

**Forward traceability** (requirements → code):
- Every `UC-{NNN}` must link to at least one `BS-{NNN}` realization
- Every `BS-{NNN}` must link to at least one `IC-{NNN}-{method}` contract
- Every `IC-{NNN}-{method}` must link to a `PC-{NNN}-{method}` pseudo-code spec
- Every `PC-{NNN}-{method}` should link to a source file (`@implements PC-{NNN}`)
- Every source file with `@implements` should have corresponding test files

**Backward traceability** (code → requirements):
- Every source file in scope must trace back to a `PC-{NNN}` spec
- Every `PC-{NNN}` must trace back to an `IC-{NNN}`
- Every `IC-{NNN}` must trace back to a `BS-{NNN}`
- Every `BS-{NNN}` must trace back to a `UC-{NNN}`

**Orphan detection**:
- Specs at any layer that don't trace forward → orphaned spec (warning)
- Code files that don't trace back → unspecified code (warning)
- Tests that don't trace to any specification → orphaned test (warning)
- Specs that don't trace backward → rootless spec (error)

### Scope Control

| `--layer` | What is validated |
|-----------|-------------------|
| `all` (default) | Full 6-layer chain |
| `3` | UC ↔ BS ↔ IC only (behavioral specs) |
| `4` | BS ↔ IC ↔ PC only (pseudo-code specs) |
| `5` | PC ↔ code ↔ tests only (implementation) |

| `--scope` | What files are included |
|-----------|------------------------|
| (default) | All `.aiwg/requirements/`, `src/`, `test/` |
| `<path>` | Only files under the specified path |

### Detection Method

1. **Scan artifact files** — read `Related:` and `Traceability:` metadata sections
2. **Extract cross-references** — find all `UC-`, `BS-`, `IC-`, `PC-`, `CODE-`, `TEST-` references
3. **Build dependency graph** — directed edges from each artifact to referenced artifacts
4. **Validate bidirectional links** — for each forward reference, check backward reference exists
5. **Detect orphans** — artifacts with no inbound or no outbound edges
6. **Calculate coverage metrics** — percentage of artifacts with complete chains

### Auto-Fix Mode (`--fix`)

When `--fix` is specified:
- Add missing backward references to artifact metadata sections
- Create stub entries in traceability matrix for orphaned artifacts
- Report what was fixed vs what requires manual intervention

## Output

Generate `traceability-gap-report.md` in `.aiwg/reports/`:

```markdown
# Traceability Gap Report

**Date**: {YYYY-MM-DD}
**Scope**: {layer and path}
**Status**: PASS | FAIL | WARNING

## Coverage Metrics

| Layer | Forward Coverage | Backward Coverage | Orphans |
|-------|-----------------|-------------------|---------|
| UC → BS | {N}/{M} ({%}) | {N}/{M} ({%}) | {count} |
| BS → IC | {N}/{M} ({%}) | {N}/{M} ({%}) | {count} |
| IC → PC | {N}/{M} ({%}) | {N}/{M} ({%}) | {count} |
| PC → code | {N}/{M} ({%}) | {N}/{M} ({%}) | {count} |
| code → test | {N}/{M} ({%}) | {N}/{M} ({%}) | {count} |

**Overall traceability**: {%}

## Gaps (Prioritized)

### Blocking (gate failures)
- {artifact}: missing {direction} link to {target layer}

### Warnings (orphans)
- {artifact}: no forward link (orphaned specification)

### Info
- {artifact}: partial coverage (N/M methods traced)

## Traceability Matrix

| Use Case | Behavioral Spec | Contracts | Pseudo-Code | Source | Tests | Status |
|----------|----------------|-----------|-------------|--------|-------|--------|
| UC-001 | BS-001 | IC-001-1..4 | PC-001-1..4 | src/... | test/... | ✓ Complete |
| UC-003 | BS-003 | IC-003-1..6 | — | — | — | ⚠️ Missing L4-L5 |

## Remediation Actions

1. {Specific action} — Owner: {role} — Priority: {blocking|warning}
2. {Specific action} — Owner: {role} — Priority: {blocking|warning}
```

## Integration Points

- `aiwg index build` should index traceability links as typed edges in the artifact graph
- `flow-gate-check` invokes this at each phase gate
- `sdlc-accelerate` progress reporting includes traceability coverage percentage
- `flow-use-case-realization` generates the initial traceability matrix

## References

- #746 — Spec-to-code traceability enforcement
- #740 — Parent: corpus completeness gap
- REF-011 (Gotel & Finkelstein): pre-RS and post-RS traceability framework
- REF-010 (Stage-Gate): mandatory deliverables with gate enforcement
