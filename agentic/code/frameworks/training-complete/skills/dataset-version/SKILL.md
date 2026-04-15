---
name: dataset-version
description: Create a versioned training dataset with manifest, fixity, provenance, and archive snapshot
namespace: training-complete
category: publication
platforms: [claude, copilot, cursor, factory, windsurf, warp, codex, opencode, openclaw, hermes]
commandHint:
  argumentHint: "<version> [--seed <n>] [--acknowledge-contamination] [--acknowledge-license-risk]"
---

# dataset-version

Create a versioned, reproducible training dataset: validate gates, compute splits and license, generate fixity, record provenance, and snapshot to immutable storage. This is the **final pipeline step** — a successful run yields a named, fixity-verified dataset version that downstream training, evaluation, or publication can consume deterministically.

Per ADR-022 D6, the YAML manifest is the source of truth; the sibling JSON is a regenerated export. Per ADR-022 D9, effective license is computed most-restrictive-wins across all contributing sources. Per ADR-022 D3, immutable storage is either a Fortemi archive snapshot or an `aiwg index` snapshot.

## When to Use

- **Final pipeline step**: after acquisition, synthesis, preference generation, filtering, and decontamination are complete — seal the dataset as a named version
- **Republishing**: when a prior version needs to be re-emitted with updated metadata (new decontamination report, new format exports) — always produces a new version, never mutates an existing one
- **Pre-release gate**: before shipping a dataset externally, to produce the fixity manifest and provenance record that receivers will verify

## Parameters

### `<version>` (required)
Dataset version identifier. MUST be valid CalVer (`YYYY.M.PATCH`, no leading zeros — e.g., `2026.4.0`) or SemVer (`MAJOR.MINOR.PATCH`). The manifest is written to `datasets/<version>.yaml`; collision with an existing file is a hard failure (versions are immutable).

### `--seed <n>` (optional)
Integer random seed that governs deterministic splits, shuffles, and any sampling. Default: `42`. Recorded in the manifest's `seed` field and in `reproduction_recipe` — the `dataset-reproduce` skill requires an exact match.

### `--split-ratios <train/val/test>` (optional)
Split ratios expressed as a comma-separated triple summing to `1.0`. Default: `0.8,0.1,0.1`. Computed split counts are written to `split_counts`. Test-set human-only enforcement (`synthetic_ratio.test == 0.0`) still applies unless explicitly overridden in the synthesis config.

### `--acknowledge-contamination` (optional)
Override the decontamination-gate lint rule (#843) when `decontamination-check` reports overlap above threshold. Requires an operator reason (prompted interactively if not provided via `--reason`). Appends an audit block to `manifest.ethical_considerations`, `.aiwg/activity.log`, and the decontamination report.

### `--acknowledge-license-risk` (optional)
Override the license-check lint rule (#837) when the computed effective license would block publication (incompatible SPDX combinations, copyleft conflicts, missing attribution chains). Same audit pattern as `--acknowledge-contamination`.

### `--storage <fortemi|aiwg-index>` (optional)
Immutable storage backend. Default: `fortemi` if a Fortemi archive is configured, else `aiwg-index`. Recorded in `storage_ref` per ADR-022 D3.

## Operation

1. **Validate gates** — run `memory-lint` with `license-check` and `decontamination-gate` rules against the candidate example set. On `ERROR`, block publication unless the matching `--acknowledge-*` flag is present with a recorded reason. On `WARN`, proceed but surface in the manifest's `ethical_considerations`.
2. **Compute splits** — resolve `split_counts` by applying `--split-ratios` to the candidate count with the declared `--seed` (same seed MUST produce same split given same inputs). Enforce `synthetic_ratio.test == 0.0` unless explicitly overridden.
3. **Compute effective license** — walk `sources[].license`, apply most-restrictive-wins resolution (per #837 and ADR-022 D9), and write to the top-level `license` field. If resolution is ambiguous (e.g., `GPL-2.0-only` vs `Apache-2.0`), escalate per `@agentic/code/addons/aiwg-utils/rules/human-authorization.md`.
4. **Compute synthetic ratio per split** — per-split human:synthetic mix written to `synthetic_ratio`. Test split is human-only by default (ADR-022 D10); validation typically human-only. Train ratio reflects actual synthesized fraction.
5. **Generate fixity manifest** — delegate to `integrity-verification` (media-curator) to emit `datasets/<version>-CHECKSUMS.sha256` covering every example record, config file, and report referenced by the manifest. Path is recorded in `fixity_manifest`.
6. **Record provenance** — delegate to `provenance-create` (sdlc-complete) to emit a W3C PROV-O record with the dataset version as `prov:Entity` and every source (`sources[].ref_id`), generator config, and upstream skill invocation in the derivation chain. Store at `provenance/dataset-<version>.jsonld`; record UUID in `provenance_record_id`.
7. **Snapshot to immutable storage** — either Fortemi (`mcp__memory-fortemi__manage_archives`) or `aiwg index snapshot` per ADR-022 D3. Record the resulting snapshot ID in `storage_ref` (exactly one of `fortemi_archive_id` or `aiwg_index_snapshot_id`).
8. **Write manifest** — render `datasets/<version>.yaml` per the schema at `@agentic/code/frameworks/training-complete/schemas/dataset-manifest.yaml`. Auto-export the sibling `datasets/<version>.json` immediately after. The YAML is source of truth; hand-edits to the JSON are forbidden.
9. **Log event** — append a `dataset-version` event to `.aiwg/activity.log` via `memory-log-append`, including version, snapshot ID, fixity manifest path, and any acknowledgement overrides.

## Overrides

Both `--acknowledge-contamination` and `--acknowledge-license-risk` follow the same audit pattern:

- **Manifest** — append a block to `ethical_considerations` naming the rule overridden, the operator, the timestamp, and the recorded reason
- **Activity log** — `memory-log-append` records a `dataset-version-override` event referencing the version and rule
- **Report annotation** — the upstream report (decontamination or license-check) is amended with a trailing "Acknowledged" section

Overrides do NOT suppress the underlying finding — they record an informed exception. Downstream consumers (model cards, datasheets) can surface these annotations.

## Output Files

| Path | Purpose |
|---|---|
| `datasets/<version>.yaml` | Dataset manifest (source of truth) |
| `datasets/<version>.json` | Auto-exported JSON mirror (regenerated, do not edit) |
| `datasets/<version>-CHECKSUMS.sha256` | SHA-256 fixity manifest covering every referenced artifact |
| `provenance/dataset-<version>.jsonld` | W3C PROV-O provenance record |

## Error Handling

Publication is atomic: if manifest write fails after snapshot is taken, the snapshot is rolled back (Fortemi archive delete or `aiwg index snapshot drop`) and no files remain in `datasets/`. Partial writes never leave a half-published version on disk. Any failure is logged as `dataset-version-failed` via `memory-log-append`.

On re-run after a failure, a fresh `<version>` is required — the same version number cannot be retried because the snapshot ID may differ.

## Delegation

- Fixity generation: `@agentic/code/frameworks/media-curator/skills/integrity-verification/SKILL.md`
- Provenance record: `@agentic/code/frameworks/sdlc-complete/skills/provenance-create/SKILL.md`
- Activity log: `@agentic/code/addons/semantic-memory/skills/memory-log-append/SKILL.md`
- Gate lint: `@agentic/code/addons/semantic-memory/skills/memory-lint/SKILL.md`
- Authorization for overrides: `@agentic/code/addons/aiwg-utils/rules/human-authorization.md`

## Examples

```bash
# Standard publication of a cleanly-gated dataset
dataset-version 2026.4.0

# Seed-deterministic publication with custom split
dataset-version 2026.4.0 --seed 1337 --split-ratios 0.85,0.075,0.075

# Publication with acknowledged contamination override
dataset-version 2026.4.0 --acknowledge-contamination \
  --reason "HumanEval overlap limited to 3 docstring comments in 10K corpus; test isolated"
```

## References

- REF-474 Dataset Versioning and Reproducibility
- REF-475 ML Reproducibility Checklist
- ADR-022 D6 — YAML primary + JSON auto-export
- ADR-022 D9 — Most-restrictive-wins license resolution
- ADR-022 D3 — Immutable storage (Fortemi archive OR aiwg index snapshot)
- Issue #844 — this skill
- Issue #837 — license-check lint rule
- Issue #843 — decontamination-gate lint rule
- `@agentic/code/frameworks/training-complete/schemas/dataset-manifest.yaml` — manifest schema
