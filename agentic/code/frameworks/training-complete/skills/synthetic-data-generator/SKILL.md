---
name: synthetic-data-generator
description: Large-scale synthetic training data generation with Model Collapse recursion guard
namespace: training-complete
category: synthesis
platforms: [claude, copilot, cursor, factory, windsurf, warp, codex, opencode, openclaw, hermes]
commandHint:
  argumentHint: "<config-file> [--seed-examples <glob>] [--count <n>] [--allow-recursive-synthetic]"
---

# synthetic-data-generator

Large-scale, pipeline-driven synthesis of training examples using published patterns (Orca, Phi, PersonaHub, STaR, ReST). Enforces the Model Collapse recursion guard from REF-446 and ADR-022 D10: synthetic generation from synthetic seeds is rejected unless explicitly authorized.

## When to Use

- When `example-synthesizer` is insufficient — that skill is small-batch (tens of examples, per-pattern invocation). Use `synthetic-data-generator` when you need **1K+ examples** via a declarative config.
- When scaling a bootstrap dataset (e.g., Orca-style distillation from a teacher model, PersonaHub-style instruction diversity, STaR-style CoT self-training).
- When the generation job must be reproducible (config file committed, seed provenance tracked).

## Parameters

### `<config-file>` (required)
Path to a `synthetic-generator-config.yaml` file that declares the pattern, model, count, and validation rules. Schema: `@agentic/code/frameworks/training-complete/schemas/synthetic-generator-config.yaml`.

### `--seed-examples <glob>` (optional)
Overrides `seed_source` in config. Required for patterns that start from human seeds (STaR, ReST). Ignored by pattern `phi` (pure generative curriculum).

### `--count <n>` (optional)
Overrides `count` in config. Useful for smoke-testing a run (`--count 20`) before full generation.

### `--allow-recursive-synthetic` (optional, **guarded override**)
Permits generation when input seeds have `metadata.synthetic_depth >= 1`. Default behavior: **REJECT**. Use only when recursion is intentional (e.g., ReST outer-loop iteration on a synthesized seed set). Emits a WARNING in the event log with `override_flag: true`.

## Distinction vs `example-synthesizer`

| Dimension | example-synthesizer | synthetic-data-generator |
|---|---|---|
| Scale | 10s of examples | 1K+ examples |
| Invocation | Per-pattern, per-call | Pipeline-driven via config file |
| Reproducibility | Ad-hoc prompts | Config committed to repo |
| Seed handling | Inline arguments | `seed_source` glob + provenance tracking |
| Batch quality gate | Per-example | Batch-level median threshold |

## Supported Generation Patterns

All patterns emit to `derivedPages.synthesizedExamples` with `metadata.synthetic: true`.

- **Orca / Orca-2** (REF-470, REF-435) — Distillation from a larger teacher model, system-message-driven explanation traces. Config: requires `model.teacher`, `model.student` (optional for filtering).
- **Phi-style** (REF-436, REF-437) — Textbook-quality curriculum generation. No seed examples required; the generator composes synthetic "lessons" per topic outline.
- **PersonaHub** (REF-448) — Persona-driven instruction diversity. Config: `diversity_settings.persona_count`, persona pool either declared inline or loaded from a persona file.
- **STaR** (REF-445) — Self-Taught Reasoner. Takes a human seed set, generates CoT traces, filters by answer correctness reward. Requires `seed_source` with ground-truth outputs.
- **ReST** (REF-456) — Reinforced Self-Training (grow + improve offline RL loop). Outer loop over STaR-style generation with scored filtering. This pattern is the canonical case where `--allow-recursive-synthetic` is legitimate (iteration N feeds iteration N+1).

## Segregation Rules (MUST Enforce)

These are non-negotiable invariants on the dataset topology:

1. Synthetic examples live **only** in `derivedPages.synthesizedExamples`. Never write to `rawExamples`.
2. Every synthetic example has `metadata.synthetic: true`.
3. Every synthetic example has `metadata.synthetic_depth` (integer, 1 for first-generation synthetic; higher for recursive).
4. **Recursion guard**: If any resolved seed has `metadata.synthetic_depth >= 1`, generation is **REJECTED** unless `--allow-recursive-synthetic` is set. This is the Model Collapse mitigation (REF-446 / ADR-022 D10).
5. Override path: when `--allow-recursive-synthetic` is present, the `synthetic-generate` log event must include `override_flag: true` and the seed's observed depth.

## Mixing Policy

This skill **writes** synthetic examples. It does **not** enforce the synthetic/human ratio — that responsibility belongs to `dataset-version` (#844), which reads the per-split `synthetic_ratio` declaration from the dataset manifest at compile time.

## Operation

1. **Load config** — Parse `<config-file>` against `synthetic-generator-config.yaml` schema. Reject on validation failure.
2. **Resolve seeds** — Expand `seed_source` glob (or `--seed-examples` override). For `phi` pattern with no seed requirement, skip.
3. **Check synthetic_depth on seeds** — For each resolved seed, read `metadata.synthetic_depth`. If any seed has `>= 1` and `--allow-recursive-synthetic` is NOT set: **ERROR** and halt with message referencing REF-446 and ADR-022 D10.
4. **Dispatch pattern-specific generator** — Route to the generator implementation named by `generator` enum (orca, orca-2, phi, personahub, star, rest). Unknown pattern: **ERROR**.
5. **Generate batch** — Execute model calls in batches of `batch_size`. Collect raw outputs.
6. **Quality-assess each** — Delegate every batch to `example-quality-assess` with `--min-grade` from config's `quality_threshold`. Batch-level median below threshold emits a WARNING (not hard-fail; human reviews aggregate report).
7. **Tag with synthetic metadata** — Set `metadata.synthetic: true`, `metadata.synthetic_depth` = (max seed depth + 1) or 1 if no seeds, `metadata.generation_pattern` = config's `generator`, `metadata.source_refs` = resolved seed IDs.
8. **Write to `derivedPages.synthesizedExamples`** — Via `memory-ingest` with topology contract enforcement. Reject any write that would land in `rawExamples`.
9. **Log `synthetic-generate` event** — Via `memory-log-append`. Include: `pattern`, `count_generated`, `count_accepted`, `median_quality`, `seed_count`, `max_seed_depth`, and `override_flag` if `--allow-recursive-synthetic` was used.

## Error Handling

| Condition | Handling |
|---|---|
| Seed has `synthetic_depth >= 1` without override | **ERROR** — halt, reference REF-446 + ADR-022 D10 |
| Unknown `generator` value | **ERROR** — halt, list supported patterns |
| Config schema validation failure | **ERROR** — halt, emit field-level error |
| Batch-level median quality below `quality_threshold` | **WARNING** — continue, flag in aggregate report |
| Individual example quality below threshold | Filter from batch per `example-quality-assess` output |
| Teacher model API failure | Retry with backoff (max 3); on persistent failure, halt and persist partial batch |

## Examples

```bash
# Orca-style distillation from a 10K seed set, first-generation synthetic
synthetic-data-generator configs/orca-bootstrap.yaml --count 10000

# PersonaHub-style diversity generation, no seeds required (personas in config)
synthetic-data-generator configs/personahub-instructions.yaml

# ReST iteration 2 — explicitly allowing recursion over iteration-1 synthetic seeds
synthetic-data-generator configs/rest-iter2.yaml \
  --seed-examples "examples/synthesized/rest-iter1-*" \
  --allow-recursive-synthetic
```

## Delegation

- `example-quality-assess` — every generated batch is quality-assessed; batch-level median gates WARNING
- `memory-ingest` — topology-contract-enforced write to `derivedPages.synthesizedExamples`
- `memory-log-append` — emits the `synthetic-generate` structured event

## References

- REF-435 Orca-2 — system-message-driven distillation
- REF-436 / REF-437 Phi — textbook-quality curriculum generation
- REF-445 STaR — Self-Taught Reasoner, CoT with reward filtering
- REF-446 Model Collapse — the guard rationale; recursive synthesis degrades distribution
- REF-448 PersonaHub — persona-driven instruction diversity
- REF-456 ReST — Reinforced Self-Training, grow/improve offline RL loop
- REF-470 Orca — system-message trace distillation
- ADR-022 D10 — recursion depth policy and override flag requirement
