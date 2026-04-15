# aiwg-training

Runtime implementation of the AIWG `training-complete` framework — corpus-to-dataset pipeline with provenance, quality assessment, format flexibility, and decontamination.

**Installation**:

```bash
# Core only (mechanical skills)
pip install -e .

# With Parquet support
pip install -e .[parquet]

# With semantic decontamination (sentence-transformers)
pip install -e .[semantic]

# With agentic skills (Anthropic API)
pip install -e .[agentic]

# Everything
pip install -e .[all]
```

**CLI**:

```bash
aiwg-training --help
aiwg-training format convert --input ... --target alpaca
aiwg-training decontamination check --dataset ...
aiwg-training dataset version --version 2026.4.0
aiwg-training flow build --config pipeline.yaml
```

**Python API**:

```python
from aiwg_training.formats import AlpacaAdapter, CanonicalRecord
from aiwg_training.decontamination import NGramChecker
from aiwg_training.publication import DatasetVersioner

# Format conversion
records = [CanonicalRecord.from_jsonl_line(line) for line in open("examples.jsonl")]
alpaca = AlpacaAdapter()
alpaca.write(records, "exports/alpaca.jsonl")

# Decontamination
checker = NGramChecker(ngram_size=13)
overlaps = checker.check(dataset_records, eval_records)
```

See `ADR-022` and individual SKILL.md files for full documentation.

## Architecture

| Module | Purpose |
|---|---|
| `schemas/` | Pydantic models mirroring example-record.yaml, dataset-manifest.yaml, log-event schemas |
| `core/` | Topology loader, provenance helpers, fixity manifests, log writer |
| `formats/` | 5 adapters: alpaca, sharegpt, chatml, jsonl (canonical), parquet |
| `decontamination/` | N-gram (exact), fuzzy (edit distance), semantic (embeddings) + report generator |
| `quality/` | License inheritance, example quality assessment helpers |
| `synthesis/` | LLM-orchestrated example/preference/synthetic generation |
| `ingest/` | Source acquisition with license validation |
| `publication/` | Dataset versioning, reproduction, documentation auto-population |
| `cli.py` | Click-based CLI entry point |

## Relationship to SKILL.md

Each skill in `../skills/<name>/SKILL.md` is the agent-executable specification. When a skill needs deterministic work (format conversion, fixity hashing, n-gram counting), it invokes this Python library via `Bash` tool calls to `aiwg-training` CLI subcommands.

Agentic skills (synthesis, preference generation, quality judgment) call Claude API directly from Python, with prompt construction in each module.
