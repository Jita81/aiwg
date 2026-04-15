# matric-eval Integration

## Overview

training-complete produces versioned training datasets with provenance, datasheets, and decontamination reports. The matric-eval project runs benchmark evaluations (MMLU, GSM8K, HumanEval, HELM, MT-Bench, etc.) against models trained on those datasets and records scores back to the originating dataset version. This document defines the handoff contract between the two systems so that the provenance chain from source to benchmark score remains unbroken.

## Scope Boundary

**training-complete is responsible for**:
- Creating the training dataset
- Detecting contamination (training-eval overlap)
- Generating datasheet + model card
- Publishing with provenance + fixity

**matric-eval is responsible for**:
- Loading the dataset (or a model trained on it)
- Running benchmark evaluations (MMLU, GSM8K, HumanEval, HELM, MT-Bench, etc.)
- Producing eval reports with per-benchmark scores
- Tracking eval results back to dataset versions

If changes are needed on the matric-eval side, file issues at `roctinam/matric-eval` — not here.

## Handoff Artifacts

training-complete outputs that matric-eval consumes:

| Artifact | Format | Path | Purpose |
|---|---|---|---|
| Dataset manifest | YAML + JSON | `.aiwg/training/datasets/<version>.yaml` | Identifies dataset version, splits, sources, license |
| Exported records | JSONL / Parquet | `.aiwg/training/exports/<format>/<version>.*` | The actual training data (post-format-convert) |
| Decontamination report | Markdown | `.aiwg/training/reports/decontamination-<version>.md` | Proof of non-contamination against benchmarks |
| Fixity manifest | SHA-256 text | `datasets/<version>-CHECKSUMS.sha256` | Integrity verification |
| Provenance bundle | JSON-LD | `.aiwg/training/provenance/dataset-<version>.jsonld` | W3C PROV chain |

## Handoff Protocol

### Step 1 — training-complete completes publication

User runs `flow-dataset-build` → `dataset-version` produces all 5 artifacts above.

### Step 2 — matric-eval imports dataset

```bash
matric-eval import-dataset .aiwg/training/datasets/<version>.yaml
```

matric-eval reads the YAML manifest, locates the exports, validates fixity against the CHECKSUMS file, and loads records.

### Step 3 — matric-eval runs evaluation

matric-eval trains or loads a model with the dataset, then runs benchmark evals.

### Step 4 — Eval results link back

matric-eval writes its eval manifest at `.aiwg/eval/<run-id>/eval-manifest.yaml` with:
- `trained_on_dataset_version: <version>`
- `training_complete_provenance: <provenance_bundle_id>`
- `decontamination_verified: <report_id>`

This closes the provenance chain from **source → dataset → trained model → eval results**.

## Preventing Double-Evaluation

Since training-complete already runs decontamination-check against the same benchmark set matric-eval will evaluate, matric-eval should READ the decontamination report and:
- Skip redundant decontamination (trust the report if fresh)
- Record decontamination report ID in eval manifest
- Flag if any benchmark in scope lacks coverage in the decontamination report

## Provenance Chain

End-to-end example:

```
[Source: github.com/rust-lang/rust] (Apache-2.0 OR MIT)
  → training-complete acquire-training-source
  → training-complete example-synthesizer (pattern: squad)
  → training-complete example-quality-assess (HIGH)
  → training-complete preference-generator (DPO pairs)
  → training-complete format-adapter-alpaca
  → training-complete decontamination-check (HumanEval 0 overlap)
  → training-complete dataset-version (v2026.4.0)
  → matric-eval import-dataset
  → [model trained by external tool, e.g., Axolotl]
  → matric-eval run-benchmarks (HumanEval: 67.2%)
  → result manifest links back to dataset v2026.4.0
```

All via W3C PROV chain.

## Example Workflow

```bash
# 1. Build dataset with training-complete
aiwg use training
flow-dataset-build config/my-pipeline.yaml --version 2026.4.0

# 2. Hand off to matric-eval
matric-eval import-dataset .aiwg/training/datasets/2026.4.0.yaml

# 3. Run benchmarks (delegated to matric-eval)
matric-eval run-benchmarks --dataset 2026.4.0 --benchmarks humaneval,gsm8k

# 4. Link eval results back
matric-eval link-results --dataset 2026.4.0 --eval-manifest .aiwg/eval/run-001/eval-manifest.yaml
```

## Schema Coordination

training-complete and matric-eval share these vocabularies:
- Dataset version identifiers (CalVer/SemVer)
- Benchmark names (MMLU, GSM8K, HumanEval, HELM, MT-Bench, AlpacaEval)
- Provenance record IDs (W3C PROV UUIDs)
- Fixity manifest format (SHA-256)

Changes to these vocabularies require coordination via cross-repo issues.

## References

- `@.aiwg/architecture/decisions/ADR-022-training-framework.md` D8 — eval delegation
- `@agentic/code/frameworks/training-complete/skills/decontamination-check/SKILL.md`
- `@agentic/code/frameworks/training-complete/skills/dataset-version/SKILL.md`
- External: `matric-eval` project at https://git.integrolabs.net/roctinam/matric-eval

## Filing Issues

**For training-complete side** (data, decontamination, manifest shape): file at `roctinam/aiwg` with label `training-complete`

**For matric-eval side** (eval execution, benchmarks, model loading): file at `roctinam/matric-eval`
