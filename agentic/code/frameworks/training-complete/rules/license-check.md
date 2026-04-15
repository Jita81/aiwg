# License Check Rule

**Enforcement Level**: HIGH
**Scope**: training-complete framework — all sources, examples, and dataset versions
**Framework**: training-complete

## Overview

Every training source must declare an SPDX license. Every derived training example inherits the most-restrictive license from its sources. Dataset versions declare an effective license computed from all contributing sources. Publication is blocked when license inheritance is ambiguous, conflicting, or absent.

## Problem Statement

Training datasets routinely aggregate from sources with varying licenses: permissive (MIT, Apache-2.0), copyleft (GPL-2.0-only, AGPL-3.0), share-alike (CC-BY-SA-4.0), non-commercial (CC-BY-NC), and proprietary. Without enforcement:

- Datasets get published with licenses that misrepresent their actual obligations
- Downstream model training inherits legal exposure users cannot see
- Commercial products get built on training data that forbids commercial use
- Share-alike obligations get dropped silently across derivations

## When to Apply

Run this rule:
- At source acquisition time (`acquire-training-source` validates SPDX upfront)
- At each pipeline stage that writes examples (derived examples must inherit)
- At dataset versioning (`dataset-version` computes effective license)
- As part of `memory-lint --consumer training-complete` (declared in `lintRules`)
- As a **blocking gate** before `dataset-version` can publish

## Checks

### C1: Every source declares a license

Every entry in `.aiwg/training/raw/<source-id>/source.yaml` must have a `license` field with a valid SPDX identifier (or explicitly declared `unknown` via `--allow-unlicensed`).

**Failure modes**:

| Condition | Result | Action |
|---|---|---|
| Missing `license` field | **ERROR** — fail ingestion | Require user to declare with `--license` |
| Invalid SPDX identifier | **ERROR** — fail ingestion | Point to https://spdx.org/licenses/ |
| License = `unknown` (from `--allow-unlicensed`) | **WARNING** — allow but flag | Examples derived from this source will be blocked at publication |

### C2: Every example inherits a license

Every example record has `metadata.license` set. Value must be computable from `metadata.source_refs[].license` using the **most-restrictive-wins** rule (see resolution table below).

**Failure modes**:

| Condition | Result |
|---|---|
| Example with no `metadata.license` | **ERROR** |
| Example license not derivable from sources | **ERROR** |
| Example license weaker than its most restrictive source | **ERROR** (license laundering detection) |

### C3: Dataset effective license is computable and documented

Every `dataset-manifest.yaml` has a `license` field computed from the union of `sources[].license` values. The computation follows the **most-restrictive-wins** rule.

**Failure modes**:

| Condition | Result |
|---|---|
| `dataset-manifest.license` absent | **ERROR** |
| Declared license weaker than computed minimum | **ERROR** |
| Any source has `license: unknown` and dataset is not explicitly marked experimental | **ERROR** |

### C4: Commercial-compatibility warnings

When a dataset is declared for commercial use (`intended_use` contains "commercial" or explicit flag), flag any source with:

- Non-commercial license (CC-BY-NC, CC-BY-NC-SA, CC-BY-NC-ND)
- Copyleft license without compatible outbound declaration (GPL family into non-GPL dataset)
- Unknown license

**Result**: **WARNING** unless explicitly overridden with `--acknowledge-license-risk`.

### C5: Share-alike propagation

When any source is share-alike (CC-BY-SA, GPL), the dataset's effective license must also be share-alike or stronger. Dataset manifests must include a share-alike declaration in `ethical_considerations`.

**Failure modes**:

| Condition | Result |
|---|---|
| Source has SA clause but dataset license does not propagate SA | **ERROR** |
| `ethical_considerations` omits share-alike notice | **WARNING** |

## License Inheritance — Most-Restrictive-Wins Resolution

When combining licenses, apply this precedence (most restrictive first):

```
Proprietary / All Rights Reserved
  > Non-commercial (CC-BY-NC family, AGPL in many contexts)
  > Copyleft strong (AGPL-3.0-only, GPL-3.0-only)
  > Copyleft (GPL-2.0-only, LGPL-3.0-only)
  > Share-alike (CC-BY-SA-4.0, MPL-2.0)
  > Attribution (CC-BY-4.0, Apache-2.0, MIT, BSD-*)
  > Public domain / CC0
```

**Implementation**:

1. Map each source's SPDX identifier to a precedence level
2. Pick the highest-precedence (most restrictive) level from all sources
3. Within that level, pick the most specific identifier (e.g., GPL-3.0-only over GPL-3.0-or-later)
4. If two sources at the same level have incompatible clauses (e.g., GPL-2.0-only + GPL-3.0-only), flag as **ERROR** — no valid combination exists

## Rule Implementation Notes

- Integrates with `memory-lint` as a declared lint rule (`lintRules: ["license-check"]` in framework manifest)
- Called as a gate inside `dataset-version` skill — publication blocks on any ERROR
- `--fix` mode: auto-computes inherited licenses where unambiguous; flags ambiguous cases for human review (per `human-authorization` rule — does NOT auto-choose between incompatible licenses)

## Configuration

Rule behavior can be tuned via `.aiwg/training/lint-config.yaml`:

```yaml
license_check:
  # Fail closed on unlicensed sources (default)
  require_license: true
  # Allow --allow-unlicensed override (default false; opt in)
  allow_override: false
  # Treat commercial-incompatible licenses as error not warning
  strict_commercial: false
  # Require explicit share-alike ack in ethical_considerations
  require_sa_ack: true
```

## Skipping

This rule cannot be disabled silently. The only ways to skip are:
- `--allow-unlicensed` flag at source acquisition (individual source)
- `--acknowledge-license-risk` flag at dataset-version (explicit override with audit entry)

Both paths write a record to the activity log and dataset manifest's `ethical_considerations`.

## References

- `@agentic/code/frameworks/sdlc-complete/schemas/research/license-metadata.yaml` — SPDX tracking schema
- `@agentic/code/addons/aiwg-utils/rules/human-authorization.md` — authorization for license overrides
- `@.aiwg/architecture/decisions/ADR-022-training-framework.md` D9 — provenance model + license inheritance decision
- SPDX License List: https://spdx.org/licenses/
- SPDX License Expressions: https://spdx.github.io/spdx-spec/v2.3/SPDX-license-expressions/
