---
name: decontamination-check
description: Detect training-eval overlap against benchmark sets before dataset publication
namespace: training-complete
category: quality
platforms: [claude, copilot, cursor, factory, windsurf, warp, codex, opencode, openclaw, hermes]
commandHint:
  argumentHint: "<dataset-version> [--targets <file>] [--mode <exact-ngram|fuzzy|semantic>] [--threshold <n>]"
---

# decontamination-check

Detect overlap between training examples and benchmark evaluation sets (MMLU, GSM8K, HumanEval, HELM, MT-Bench, AlpacaEval) before a dataset version is published. Produces a per-target overlap report and feeds the decontamination-gate lint rule.

Per ADR-022 D8, decontamination is a **first-class pipeline stage** — not an optional post-hoc check. Eval execution (running benchmarks against trained models) is out of scope for this skill; that work is delegated to the separate `matric-eval` project (see #849 and `docs/matric-eval-integration.md`).

## When to Use

- As a **publication gate** before `dataset-version` seals a new dataset release
- **On-demand** against an already-published dataset when a new benchmark is added to the target set
- After any ingest operation that pulled from a source suspected to overlap with public eval sets (web scrapes, synthetic pipelines seeded on public prompts)
- When migrating an old dataset into the pipeline to verify cleanliness

## Parameters

### `<dataset-version>` (required)
Either a dataset version ID (e.g., `v2026.4`) or a filesystem path to a directory of example records.

### `--targets <file>` (optional)
Path to a `decontamination-targets.yaml` file. Default: `training-complete/schemas/decontamination-targets.yaml` — ships with the 6 default targets below. User-declared targets are **unioned** with defaults (not replaced) unless the config explicitly sets `override_defaults: true`.

### `--mode <exact-ngram|fuzzy|semantic>` (optional)
Detection strategy. Default: `exact-ngram`.

- **`exact-ngram`** — hash-based n-gram overlap with configurable N. Fast and deterministic. Recommended default.
- **`fuzzy`** — edit-distance-based overlap (Levenshtein ratio). Catches near-duplicates with minor paraphrasing, whitespace drift, or typo variants.
- **`semantic`** — embedding cosine similarity threshold (default ≥ 0.95). Catches deeper paraphrases and translation variants. Requires an embedding model; slowest mode.

### `--threshold <n>` (optional)
Maximum acceptable overlap count per target. Default: `0` (zero tolerance). Override per-target in the targets config.

### `--ngram-size <n>` (optional)
N-gram size for `exact-ngram` mode. Default: `13` per REF-442 convention.

### `--report <path>` (optional)
Output report path. Default: `.aiwg/training/reports/decontamination-<version>.md`.

## Operation

1. **Load targets** — parse the targets config, union user-declared entries with shipped defaults (or replace if `override_defaults: true`).
2. **Index candidate examples** — load all examples at `<dataset-version>` via the `memory-ingest` consumer interface; normalize whitespace, casing per target config.
3. **Run detection per target** — for each target entry, execute the requested mode(s) against the target's eval set (resolved from `eval_set_path`).
4. **Collect overlap counts** — record matched example IDs, matched target items, and a representative excerpt for each match.
5. **Compare against thresholds** — per-target threshold takes precedence; falls back to `--threshold`.
6. **Emit report** — render `templates/decontamination-report.md` with per-target pass/fail and top-10 overlap samples.
7. **Log event** — append a `decontamination-check` event to `.aiwg/activity.log` via `memory-log-append`. The lint rule (#843) consumes this event.

## Default Target Set

Ships in `schemas/decontamination-targets.yaml`:

| ID | Name | Source |
|---|---|---|
| MMLU | Massive Multitask Language Understanding | Hendrycks et al. 2021 |
| GSM8K | Grade School Math 8K | Cobbe et al. 2021 |
| HumanEval | Code synthesis benchmark | Chen et al. 2021 |
| HELM | Holistic Evaluation of Language Models | Liang et al. 2022 |
| MT-Bench | Multi-turn chat benchmark | Zheng et al. 2023 |
| AlpacaEval | Instruction-following leaderboard | REF-450 |

User-declared targets are unioned into this set. Eval set data itself is NOT shipped — each target's `eval_set_path` points at a HuggingFace dataset identifier or local path that the operator must provision.

## Eval Execution — Delegated

This skill **detects contamination only**. Running benchmark evaluations against a trained model is delegated to the separate `matric-eval` project (#849). See `docs/matric-eval-integration.md` for the integration contract. The two projects share the same target config schema to keep "what we checked for leakage" and "what we evaluate against" in lockstep.

## Output

`.aiwg/training/reports/decontamination-<version>.md` rendered from `templates/decontamination-report.md`, containing:

- Summary table (target × overlap count × threshold × passed/failed)
- Per-target detail with top-10 overlap samples
- Recommendation section
- Reproducibility block (mode, ngram-size, embedding model, random seed)

## Acceptance Criteria

- Detects all 10 intentionally-leaked examples in the test fixture (`test/fixtures/decontamination/seeded-overlap.jsonl`)
- Completes a 10K-example scan in under 5 minutes on default hardware (`exact-ngram` mode, 13-gram)
- Report overlap counts match fixture ground truth exactly

## Integration

- **decontamination-gate (#843)** — lint rule reads the `decontamination-check` log event and blocks `dataset-version` publication on failure
- **dataset-version (#844)** — records decontamination report hash in the dataset manifest for provenance
- **matric-eval (#849)** — shares target config schema; eval execution is out of scope here

## Examples

```bash
# Default: check v2026.4 against shipped target set
decontamination-check v2026.4

# Fuzzy mode with custom threshold
decontamination-check v2026.4 --mode fuzzy --threshold 2

# Semantic mode with user-extended targets
decontamination-check v2026.4 --mode semantic --targets config/my-targets.yaml

# On-demand check of a directory of examples
decontamination-check examples/candidate-batch/ --ngram-size 13
```

## Schema Reference

- `@agentic/code/frameworks/training-complete/schemas/decontamination-targets.yaml` — target set schema and defaults
- `@agentic/code/frameworks/training-complete/schemas/example-record.yaml` — candidate example record format
- `@agentic/code/frameworks/training-complete/templates/decontamination-report.md` — output report template

## Delegation

- Eval execution: `matric-eval` project (#849)
- Kernel lint wiring: `@agentic/code/addons/semantic-memory/skills/memory-lint/SKILL.md`
- Log event append: `@agentic/code/addons/semantic-memory/skills/memory-log-append/SKILL.md`
- Authorization on remediation: `@agentic/code/addons/aiwg-utils/rules/human-authorization.md`

## References

- REF-442 Benchmark Contamination — n-gram methodology, 13-gram default
- REF-449 LM Evaluation Harness — target set conventions
- REF-450 AlpacaEval — instruction-following leaderboard
- ADR-022 D8 — decontamination as first-class pipeline stage
- Issue #842 — this skill
- Issue #843 — decontamination-gate lint rule
- Issue #849 — matric-eval integration
