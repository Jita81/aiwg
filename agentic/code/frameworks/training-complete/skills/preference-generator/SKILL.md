---
name: preference-generator
description: Generate preference pairs (chosen/rejected) for DPO/KTO/ORPO/SimPO training
namespace: training-complete
category: synthesis
platforms: [claude, copilot, cursor, factory, windsurf, warp, codex, opencode, openclaw, hermes]
commandHint:
  argumentHint: "<candidate-glob> [--mode <llm-judge|rule-based|human>] [--count <n>] [--min-confidence <0-1>]"
---

# preference-generator

Generate preference pairs — `(chosen, rejected)` tuples — from a pool of training example candidates. Output feeds DPO (REF-376), KTO (REF-391), ORPO (REF-392), and SimPO (REF-393) alignment stages. Preferences are stored as graph edges (ADR-022 D5) so the same pair set can be re-exported to any preference format without regeneration.

## When to Use

- **After SFT examples exist** — you have an ingested pool that has passed `example-quality-assess`
- **Before preference-based alignment** — DPO/KTO/ORPO/SimPO training needs `(prompt, chosen, rejected)` triples
- **When upgrading a dataset** — regenerate preferences after new examples land or quality grades shift

## Parameters

### `<candidate-glob>` (required)
Example IDs or a glob pointing to candidate examples (e.g., `examples/raw/*`, `ex-550e*`, `domain=python/*`).

### `--mode <llm-judge|rule-based|human>` (optional)
Preference elicitation strategy. Default: `llm-judge`.

### `--count <n>` (optional)
Target number of preference pairs to generate. Default: `100`.

### `--min-confidence <0-1>` (optional)
Discard pairs rated below this confidence. Default: `0.7`.

### `--target-format <dpo|kto|orpo|simpo>` (optional)
Export format. Default: `dpo`.

## Generation Modes

| Mode | Mechanism | When to Use |
|---|---|---|
| **llm-judge** | Rank model (Opus for ambiguous cases, Sonnet as default) reads both candidates, elicits preference + rationale. Follows RLAIF pattern (REF-396) and UltraFeedback rubric (REF-438). | Default. Scales to thousands of pairs; rationale is auditable. |
| **rule-based** | Deterministic heuristics: (1) shorter wins when both correct, (2) cites source wins, (3) reasoning-trace present wins over absent, (4) no-hallucination wins over hallucination, (5) HIGH quality-grade wins over LOW. | Fast, reproducible, no API spend. Use when rubric is stable. |
| **human** | Interactive via `AskUserQuestion` — presents two candidates side-by-side, user picks chosen and supplies optional rationale. | Gold-standard pairs for calibrating judges or fine-tuning validation sets. |

## Graph Storage (ADR-022 D5)

Preferences persist as graph edges, not flat files:

- **Backend priority**: Fortemi (`memory-fortemi`) preferred; `aiwg index` fallback per #848.
- **Node per example** — each candidate becomes/remains a node keyed by example ID.
- **Two edges per pair** — an `chosen→rejected` edge and the inverse `rejected→chosen` edge with opposite metadata so either direction is queryable.

Edge shape:

```json
{
  "type": "preference",
  "chosen_id": "ex-abc",
  "rejected_id": "ex-def",
  "confidence": 0.84,
  "rationale_note_id": "note-rat-001",
  "task_context": "python-codegen-leetcode"
}
```

## Export Formats

| Format | JSONL Record |
|---|---|
| **DPO** | `{prompt, chosen, rejected}` |
| **KTO** | `{prompt, completion, label}` where `label` is boolean (chosen=true, rejected=false) — emits two records per pair |
| **ORPO** | `{prompt, chosen, rejected, odds_ratio_metadata}` — DPO plus length/logit-ratio hints |
| **SimPO** | DPO-compatible (no reference-model alignment needed; SimPO reads same triples) |

IPO (REF-395) also consumes DPO-format triples; select `--target-format dpo` for IPO training.

## Operation

1. **Resolve candidates** — expand glob via `memory-ingest` consumer interface; load example records.
2. **Choose mode** — per `--mode`; for `llm-judge`, select ranker (Opus if any candidate has LOW or ambiguous grade, Sonnet otherwise).
3. **Elicit preferences** — pair candidates (round-robin or quality-banded), run mode, collect `(chosen, rejected, confidence, rationale)`.
4. **Write edges** — create `preference` edges in graph store (Fortemi primary, `aiwg index` fallback).
5. **Filter by confidence** — drop pairs with `confidence < --min-confidence`.
6. **Export** — serialize surviving pairs to JSONL per `--target-format`, write to `.aiwg/training/preferences/<format>-<timestamp>.jsonl`.
7. **Log** — `memory-log-append` with op `preference-generate` including mode, pair count, accepted/rejected counts, median confidence.

## Rationale Notes

When `mode=llm-judge`, the judge's rationale is captured as a separate analysis-type example note via the `memory-query-capture` pattern and linked from each edge via `rationale_note_id`. This preserves the "why" for auditing and for downstream IPO-style regularization (REF-395).

## Integration

- **example-quality-assess (#840)** — HIGH-graded examples enter as `chosen` candidates; LOW-graded enter as `rejected` candidates. This is the primary signal for rule-based mode.
- **memory-log-append** — every run emits a `preference-generate` event for provenance.
- **dataset-version (#844)** — preference edge count and format snapshot are captured in the dataset manifest.

## Error Handling

- **Judge disagreement across retries** — if the judge flips its choice on the same pair across ≥2 retries, pair is marked low-confidence and discarded post-filter.
- **Missing candidate** — unresolved glob entries logged as warnings; run continues with resolved subset.
- **Backend unavailable** — Fortemi offline falls through to `aiwg index`; both offline aborts with exit code, never silently drops edges.
- **Export format mismatch** — pair with non-string `prompt` or `completion` logged and skipped during export.

## Examples

```bash
# Default: llm-judge over all raw examples, 100 DPO pairs
preference-generator "examples/raw/*"

# Rule-based, 500 KTO-format pairs, strict confidence
preference-generator "domain=python/*" --mode rule-based --count 500 --target-format kto --min-confidence 0.85

# Human mode for a gold validation set
preference-generator "examples/gold/*" --mode human --count 50
```

## Delegation

- `memory-ingest` — load candidate records by glob
- `memory-log-append` — emit `preference-generate` events
- `memory-query-capture` — persist llm-judge rationale as analysis notes

## References

- REF-376 DPO (Direct Preference Optimization)
- REF-391 KTO (Kahneman-Tversky Optimization)
- REF-392 ORPO (Odds Ratio Preference Optimization)
- REF-393 SimPO (Simple Preference Optimization)
- REF-395 IPO (Identity Preference Optimization)
- REF-396 RLAIF (RL from AI Feedback)
- REF-438 UltraFeedback — judge rubric basis
- ADR-022 D5 — preferences as graph edges, not flat records
