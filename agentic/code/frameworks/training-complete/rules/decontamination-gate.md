# Decontamination Gate Rule

**Enforcement Level**: HIGH (blocking gate)
**Scope**: training-complete framework — dataset publication
**Framework**: training-complete

## Overview

Decontamination is mandatory for any published dataset. This rule blocks `dataset-version` from writing a manifest unless a fresh decontamination report exists and all targets pass threshold. Publication halts on any ERROR; only an explicit, audited override path is permitted.

## Problem Statement

Without enforcement, users can publish datasets that accidentally include benchmark eval items, producing inflated model scores and invalidating benchmark results downstream. Contamination rarely reveals itself to the dataset author — the eval items leak in via scraped web dumps, mirrored corpora, or upstream datasets that never disclosed their sources. Once a contaminated dataset is published, every downstream model trained on it produces misleading benchmark numbers, and the contamination is effectively impossible to unwind.

## When to Apply

Run this rule:
- On any `dataset-version` invocation (blocking gate before manifest write)
- As part of `memory-lint --consumer training-complete` (declared in framework manifest `lintRules`)
- Before `flow-dataset-build` completes

## Checks

### C1: Report exists

A `decontamination-report-<version>.md` exists for the dataset version being published, located in `.aiwg/training/decontamination/`.

**Failure mode**: **ERROR** — "Run decontamination-check before publishing. Expected: `.aiwg/training/decontamination/decontamination-report-<version>.md`"

### C2: Report is fresh

The report's `generated_at` timestamp is newer than the modification time of any example in the dataset. If examples have been added, edited, or re-derived since the last report, the report is stale.

**Failure mode**: **ERROR** — "Decontamination report is stale (generated_at=<T1>, latest example modified=<T2>). Re-run decontamination-check."

Configurable tolerance via `freshness_tolerance_hours` — allows slight staleness when examples are modified in rapid bursts during a single publishing session.

### C3: All targets pass threshold

Every target in the report has `passed: true`. Any target with overlap above its configured threshold blocks publication.

**Failure mode**: **ERROR** — Lists failing targets with overlap counts. "Failing targets: <list>. Remove offending examples or declare contamination in dataset manifest `ethical_considerations` via `--acknowledge-contamination`."

### C4: Mode consistency

If the dataset manifest declares `decontamination_mode` (strict / standard / lenient), the report must have been generated using that mode. A strict dataset cannot be published with a lenient report.

**Failure mode**: **WARNING** if mismatch — suggests re-run. Elevates to **ERROR** when `require_mode_match: true` in config.

### C5: User targets covered

If the user has declared additional targets in `.aiwg/training/decontamination-targets.yaml`, the report must cover every listed target. Partial coverage is not sufficient.

**Failure mode**: **ERROR** — "Missing decontamination coverage for declared targets: <list>. Re-run decontamination-check with updated targets file."

## Override Mechanism

Per the `human-authorization` rule, there is exactly ONE override path: the `--acknowledge-contamination` flag on `dataset-version`. This path:

- Requires explicit justification written to `dataset-manifest.ethical_considerations`
- Writes an audit entry to the activity log with the override flag and justification
- Appends a permanent record to `decontamination-report-<version>.md` documenting the acknowledged contamination
- Should be used only for legitimate research scenarios (ablation studies, intentional leak tests, red-team contamination probes)

The override path cannot be exercised silently — every invocation produces three auditable artifacts (manifest field, activity log entry, report appendix).

## Skipping

This rule cannot be disabled silently. No `--skip-lint` option is honored for this rule. The only override is the `--acknowledge-contamination` path above, which produces a full audit trail.

## Rule Implementation Notes

- Integrates with `memory-lint` as a declared lint rule (`lintRules: ["decontamination-gate"]` in framework manifest)
- Called as a **blocking gate** inside `dataset-version` skill — publication stops on any ERROR
- `--fix` mode: **no-op**. Contamination is a human decision; the rule cannot auto-remove examples or auto-acknowledge. Points users to decontamination-check or the acknowledge path.

## Configuration

Rule behavior can be tuned via `.aiwg/training/lint-config.yaml`:

```yaml
decontamination_gate:
  # Allow slight staleness if examples were modified within this window
  freshness_tolerance_hours: 24
  # Fail C4 as ERROR instead of WARNING when report mode != declared mode
  require_mode_match: true
  # Whether --acknowledge-contamination is permitted at all
  # Set false for regulated environments that forbid any contamination
  allow_override: true
```

## References

- REF-442 Benchmark Contamination — motivation for this gate
- `@agentic/code/frameworks/training-complete/skills/decontamination-check/SKILL.md` — the check this gate enforces
- `@agentic/code/addons/aiwg-utils/rules/human-authorization.md` — authorization model for override path
- `@.aiwg/architecture/decisions/ADR-022-training-framework.md` D8 — decontamination policy decision
