# Training Complete — Corpus-to-Dataset Pipeline

AIWG framework for AI training data curation. Point at any corpus; get a training-ready dataset out — with provenance, quality scores, deduplication, format flexibility, and decontamination built in.

## What It Does

**Input**: Filesystem, URLs, git repos, existing AIWG research corpus, or any structured source.

**Output**: Training-ready datasets in Alpaca, ShareGPT, ChatML, JSONL, or Parquet — with:

- W3C PROV provenance chain per example
- GRADE quality assessment per source and per example
- SPDX license compliance with inheritance
- SHA-256 fixity manifests for reproducibility
- Benchmark decontamination reports
- Datasheet + Model Card auto-population
- Dataset versioning with deterministic reproduction

## Installation

```bash
aiwg use training
```

Deploys to all supported providers. Declares memory topology for the semantic memory kernel.

## Pipeline Stages

```
acquire-training-source
  ↓
example-quality-assess (GRADE per source + per example)
  ↓
license-check (SPDX validation + inheritance)
  ↓
example-synthesizer (SFT generation — optional)
  ↓
synthetic-data-generator (with Model Collapse guard — optional)
  ↓
preference-generator (DPO/KTO pairs — optional)
  ↓
format adapters (Alpaca | ShareGPT | ChatML | JSONL | Parquet)
  ↓
decontamination-check (MMLU, GSM8K, HumanEval, HELM, MT-Bench + user targets)
  ↓
decontamination-gate (publication blocker)
  ↓
dataset-version (manifest + fixity + provenance + archive snapshot)
```

End-to-end orchestration via `flow-dataset-build`. Individual skills are independently invocable.

## Storage Model

Three tiers (ADR-022 D3):

| Tier | Purpose |
|------|---------|
| Filesystem (`.aiwg/training/raw/`) | Raw sources before ingestion |
| Fortemi (preferred) | Durable, relationship-rich, cross-session |
| `aiwg index` (fallback) | Graph backend when Fortemi unavailable |

## Design Principles

1. **Provenance-first** — every example traces to its source via W3C PROV
2. **Format pluralism** — canonical JSONL + adapters, not a single format
3. **Decontamination as gate** — publication fails if overlap exceeds threshold
4. **Synthetic segregation** — synthesized examples live separately; max 1 recursion (Model Collapse guard)
5. **Reproducibility by default** — every dataset version comes with seed, sources, decontamination report, fixity manifest

## Architecture

See [ADR-022](../../../../.aiwg/architecture/decisions/ADR-022-training-framework.md) for architectural decisions.

## Evaluation

This framework detects **contamination** (training-eval overlap). Actual **evaluation execution** is delegated to the [`matric-eval`](https://git.integrolabs.net/roctinam/matric-eval) project. See [`docs/matric-eval-integration.md`](docs/matric-eval-integration.md) once it exists (#849).

## Research Foundation

Grounded in 485 REFs covering: DPO/KTO/ORPO/SimPO/GRPO/IPO/RLAIF, Self-Instruct/Evol-Instruct/Orca/Phi/STaR/V-STaR/PersonaHub/ReST/LIMA, Benchmark Contamination/Model Collapse/Sleeper Agents, Datasheets/Model Cards/Data Statements/ML Repro Checklist, HF Datasets/Arrow+Parquet/Dataset Versioning.

See research-papers `INDEX.md` Training & Alignment / Dataset Infrastructure / PEFT / Safety & Robustness / Evaluation Frameworks / Documentation & Governance sections.

## Dependencies

- **Required**: `semantic-memory` kernel (provides `memory-ingest`, `memory-lint`, `memory-query-capture`, `memory-log-append`, `memory-log-render`)
- **Optional**: `research-complete` (source acquisition patterns), `media-curator` (quality filtering, integrity verification), `rlm` (large-corpus decomposition)

## Status

**Foundation phase.** Manifest and directory scaffold only. Implementation tickets #832–#849 track ongoing work.
