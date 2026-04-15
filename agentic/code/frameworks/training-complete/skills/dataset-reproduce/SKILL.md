---
name: dataset-reproduce
description: Deterministically rebuild a dataset from its manifest and verify fixity equivalence
namespace: training-complete
category: publication
platforms: [claude, copilot, cursor, factory, windsurf, warp, codex, opencode, openclaw, hermes]
commandHint:
  argumentHint: "<manifest-path> [--compare-fixity] [--workdir <path>]"
---

# dataset-reproduce

Deterministically rebuild a training dataset from a published manifest and verify that the rebuild matches the original via SHA-256 fixity comparison. Used to validate that a dataset published by `dataset-version` is genuinely reproducible, and to let third parties reconstruct a dataset from its manifest without access to the original artifacts.

Per the ML Reproducibility Checklist (REF-475), a dataset is "reproducible" only if an independent rebuild from the manifest produces byte-identical fixity hashes. This skill is the verifier.

## When to Use

- **Self-verification**: immediately after `dataset-version` publishes, rebuild and compare to catch non-determinism before the dataset is used for training
- **Third-party reproduction**: an external consumer has the manifest and wants to rebuild the dataset from primary sources
- **Regression check**: when a pipeline config changes, rebuild an older dataset to confirm the change did not break determinism for prior versions
- **Drift detection**: a published dataset is suspected of drift — rebuild and identify which component (source, config, seed) diverged

## Parameters

### `<manifest-path>` (required)
Path to a `datasets/<version>.yaml` manifest published by `dataset-version`. The YAML is authoritative — sibling `.json` exports are ignored by this skill.

### `--compare-fixity` (optional)
Compare rebuilt SHA-256 against the original `fixity_manifest`. Default: `true`. Disable only for partial rebuilds where comparison is not meaningful.

### `--workdir <path>` (optional)
Scratch directory for the rebuild. Default: `.aiwg/training/reproduce/<version>-<timestamp>/`. Must be empty; the skill refuses to overwrite.

## Operation

1. **Load manifest** — parse `<manifest-path>` as YAML; validate against the schema at `@agentic/code/frameworks/training-complete/schemas/dataset-manifest.yaml`. Resolve `sources[]`, `reproduction_recipe`, `seed`, and `split_counts`.
2. **Version compatibility check** — compare manifest's `reproduction_recipe.aiwg_version` and `training_complete_version` against the current runtime. On mismatch, emit a `WARN` — reproducibility across versions is not guaranteed. Proceeding is allowed but flagged in the report.
3. **Acquire sources** — for each entry in `sources[]`, invoke `acquire-training-source` using the declared `ref_id`, `license`, and format. Fixity of each acquired source is checked against any upstream checksum; mismatch is a hard failure (the source has drifted).
4. **Apply pipeline** — replay the `reproduction_recipe` step-for-step: `generator_configs` via `synthetic-data-generator` and `example-synthesizer`; `preference_config` via `preference-generator`; `filter_thresholds` via quality filters; `decontamination_thresholds` via `decontamination-check`. Format exports via the declared `format_exports` adapters.
5. **Seed determinism** — every stochastic step (split assignment, shuffle, sampling, synthetic prompt sampling) uses the manifest's `seed`. No new entropy is introduced. The same seed + same inputs + same configs MUST produce the same outputs.
6. **Generate fixity** — delegate to `integrity-verification` to emit a fresh SHA-256 manifest over the rebuilt dataset.
7. **Compare and report** — diff the rebuilt fixity manifest against the original `fixity_manifest`. Emit per-file match/mismatch with a summary verdict (`MATCH`, `PARTIAL`, `MISMATCH`). Write the report.

## Non-Determinism Sources

A mismatch does not always mean a bug. Known non-determinism sources to document in the report:

- **Model API drift** — synthesis or preference generation that called an external LLM may produce different tokens if the model was updated or quantization changed; pin to the exact model version declared in `reproduction_recipe.generator_configs`.
- **External source drift** — a web-scraped or HuggingFace source may have changed since the original publication; fixity of the acquired source catches this at step 3.
- **Floating-point non-determinism** — embedding generation on GPU is not bit-exact across hardware; quality filters that use embeddings may yield different accept/reject decisions on different GPUs.
- **Filesystem ordering** — implicit reliance on OS-specific directory iteration order; all pipeline steps MUST sort inputs before processing.
- **Timestamp embedding** — any field that records `created_at` in a per-example record will always differ; these are excluded from fixity scope.

The report's "Mismatch Analysis" section classifies each divergence against this list.

## Output

`reports/reproduce-<version>-<timestamp>.md` containing:

- Summary verdict (`MATCH` / `PARTIAL` / `MISMATCH`) with example counts
- Version compatibility block (manifest vs current runtime)
- Per-source acquisition fixity comparison
- Per-split rebuilt vs original fixity
- Mismatch analysis (classified against known non-determinism sources)
- Reproducibility block (seed used, configs loaded, adapter versions)

## Delegation

- Source acquisition: `acquire-training-source` (training-complete)
- Synthesis replay: `example-synthesizer`, `synthetic-data-generator` (training-complete)
- Preference replay: `preference-generator` (training-complete)
- Format exports: `format-adapter-alpaca`, `format-adapter-sharegpt`, `format-adapter-chatml`, `format-adapter-jsonl`, `format-adapter-parquet`
- Decontamination check: `decontamination-check` (training-complete)
- Fixity generation: `@agentic/code/frameworks/media-curator/skills/integrity-verification/SKILL.md`

## Examples

```bash
# Self-verify a freshly-published dataset
dataset-reproduce datasets/2026.4.0.yaml

# Reproduce with explicit workdir and no fixity comparison (partial rebuild)
dataset-reproduce datasets/2026.4.0.yaml \
  --workdir /tmp/repro-2026.4.0 \
  --compare-fixity false
```

## References

- REF-475 ML Reproducibility Checklist — authoritative reproducibility criteria
- REF-474 Dataset Versioning and Reproducibility
- ADR-022 — training-complete pipeline architecture
- Issue #844 — dataset-version skill (this skill's counterpart)
- `@agentic/code/frameworks/training-complete/schemas/dataset-manifest.yaml` — manifest schema and validation rules
