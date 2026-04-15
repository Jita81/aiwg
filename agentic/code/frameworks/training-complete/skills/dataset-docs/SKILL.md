---
name: dataset-docs
description: Generate Datasheet, Model Card, and Data Statement from a dataset manifest
namespace: training-complete
category: publication
platforms: [claude, copilot, cursor, factory, windsurf, warp, codex, opencode, openclaw, hermes]
commandHint:
  argumentHint: "<manifest-path> [--type <datasheet|model-card|data-statement|all>] [--interactive]"
---

# dataset-docs

Generate standards-compliant dataset documentation — Datasheet (Gebru et al. 2021), Model Card (Mitchell et al. 2019), and Data Statement (Bender & Friedman 2018) — by auto-populating templates from a dataset manifest and related AIWG training artifacts.

## When to Use

Invoke this skill **after** `dataset-version` has produced a finalized manifest and the downstream artifacts (quality report, license ledger, decontamination report, provenance record) exist in `.aiwg/training/`. The skill produces the compliance documentation bundle required by ADR-022 D9 before a dataset is released or used to train a published model.

Typical trigger points:

- Preparing a dataset for public release (HuggingFace Hub, Zenodo, internal catalog).
- Publishing a model trained on the dataset — Model Card needs its Training Data section.
- Responding to an audit or compliance request (DPIA, fairness review, SOC2 evidence).

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `manifest-path` | yes | — | Path to the dataset manifest YAML (e.g., `.aiwg/training/datasets/v1.2.0-manifest.yaml`). |
| `--type` | no | `all` | One of `datasheet`, `model-card`, `data-statement`, or `all`. |
| `--interactive` | no | `false` | If set, prompt the operator to fill `<!-- HUMAN FILL -->` fields inline; otherwise leave markers for later review. |

## Operation

1. **Load manifest.** Parse the YAML at `manifest-path`. Validate required top-level fields (`dataset_name`, `version`, `modality`, `instance_count`, `license_id`). Fail fast with a clear error if the manifest is malformed.
2. **Load related artifacts.** From `.aiwg/training/` gather the quality report, license ledger, decontamination report, and W3C PROV provenance record keyed by `{{version}}`. Record missing artifacts as warnings — do not hard-fail, but flag the affected template fields as unknown.
3. **Select template(s).** Based on `--type`, load one or more of:
   - `templates/datasheet-for-datasets.md`
   - `templates/model-card.md`
   - `templates/data-statement.md`
4. **Auto-populate `{{field_name}}` placeholders.** Substitute values from the manifest and related artifacts. Target ≥60% of fields auto-filled on a typical well-instrumented dataset (per REF-451 feasibility study). Unresolved placeholders are replaced with `UNKNOWN — see manifest` rather than left literal.
5. **Handle human-fill sections.** If `--interactive` is set, prompt the operator once per `<!-- HUMAN FILL -->` marker using the platform-native UX tool (see `native-ux-tools` rule); otherwise leave the markers in place for downstream editorial review.
6. **Write outputs.** Emit to `.aiwg/training/datasets/<version>-{datasheet,model-card,data-statement}.md`. Update `manifest.yaml` with `documentation:` block pointing at the generated files. Append an entry to `.aiwg/activity.log` per the `activity-log` rule.

## Auto-population Coverage

The skill aims for the ≥60% auto-fill rate documented in REF-451 as the threshold at which datasheets become practical to maintain. Fields mapped from the manifest include dataset identity, composition counts, splits, source URLs, license, collection window, preprocessing pipeline references, IRB identifiers, retention policy, and provenance links. Fields requiring human judgment (bias analysis, intended users, ethical considerations, out-of-scope uses) remain explicit `<!-- HUMAN FILL -->` markers.

## Validation

Generated datasheets validate against the HuggingFace dataset card schema (YAML frontmatter fields: `license`, `language`, `task_categories`, `size_categories`, `pretty_name`). The skill emits a post-write validation report listing any HuggingFace fields that could not be derived from the manifest so the operator can decide whether to source them manually before upload.

## Outputs

- `.aiwg/training/datasets/<version>-datasheet.md`
- `.aiwg/training/datasets/<version>-model-card.md`
- `.aiwg/training/datasets/<version>-data-statement.md`
- Update to `.aiwg/training/datasets/<version>-manifest.yaml` documentation block
- Entry in `.aiwg/activity.log`

## References

- **REF-451**: Gebru, T. et al. (2021). *Datasheets for Datasets*. CACM 64(12).
- **REF-452**: Mitchell, M. et al. (2019). *Model Cards for Model Reporting*. FAT* 2019.
- **REF-453**: Bender, E. M. & Friedman, B. (2018). *Data Statements for Natural Language Processing*. TACL 6.
- **ADR-022 D9**: Dataset Documentation Decision (training-complete framework).
- **Related skills**: `dataset-version` (produces manifest), `provenance-create` (produces PROV record), `grade-on-ingest` (produces quality report).
