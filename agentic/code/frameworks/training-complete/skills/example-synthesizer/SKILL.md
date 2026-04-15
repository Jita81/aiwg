---
name: example-synthesizer
description: Generate SFT training examples from raw sources using Self-Instruct / Evol-Instruct / SQuAD / STaR patterns
namespace: training-complete
category: synthesis
platforms: [claude, copilot, cursor, factory, windsurf, warp, codex, opencode, openclaw, hermes]
commandHint:
  argumentHint: "<source-glob> [--pattern <name>] [--count <n>] [--temperature <t>] [--model <haiku|sonnet|opus>]"
---

# example-synthesizer

Generate supervised fine-tuning (SFT) examples from raw ingested sources by delegating to the semantic-memory kernel and applying a chosen synthesis pattern. Produces fully-provenanced example records ready for preference generation, decontamination, and dataset versioning.

## When to Use

- Bootstrapping a new SFT dataset from a small seed corpus
- Expanding domain coverage by evolving existing examples (depth/breadth)
- Extracting Q&A pairs from long-form documents (papers, manuals, specs)
- Augmenting examples with CoT rationales to enable STaR-style reasoning training
- Any scenario where hand-authoring SFT examples is too expensive and you have a higher-quality seed set or source corpus to derive from

## Parameters

### `<source-glob>` (required)
A glob matching ingested source records or a seed example set (e.g., `sources/*`, `examples/seed/*`).

### `--pattern <self-instruct|evol-instruct|squad|star>` (optional)
Synthesis pattern to apply. Default: `self-instruct`.

### `--count <n>` (optional)
Target number of examples to generate per source. Default: `10`.

### `--temperature <t>` (optional)
Generation temperature. Default: `0.7` (balance of diversity and coherence).

### `--model <haiku|sonnet|opus>` (optional)
Generator model. Default: `sonnet` per RLM cost guidance (sonnet is the recommended tier for synthesis — haiku loses coherence on complex patterns; opus is cost-prohibitive at scale).

### `--seed <int>` (optional)
Random seed for reproducibility. Default: system time.

## Supported Patterns

| Pattern | Reference | Mechanism |
|---|---|---|
| Self-Instruct | REF-375 | Bootstrap new instruction/response pairs from a small pool of seed examples by prompting the generator to produce novel-but-similar tasks |
| Evol-Instruct | — | Apply depth evolution (add constraints, deepen reasoning) and breadth evolution (change topic, rephrase) to existing examples |
| SQuAD-style | REF-454 | Extract span-grounded question/answer pairs from document sources; each answer cites a specific passage |
| STaR | REF-445 | Augment existing examples with chain-of-thought reasoning traces; rationales are filtered by whether they yield the correct answer |

## Operation

1. **Resolve sources** — glob expansion via kernel `memory-ingest` consumer interface; load records into generator context.
2. **Select pattern** — validate `--pattern` against source type (SQuAD requires document sources; STaR requires existing I/O pairs).
3. **Generate candidates** — prompt generator model with pattern-specific template, producing `count × len(sources)` candidates.
4. **Score candidates** — pipe each candidate through `example-quality-assess` for GRADE rating.
5. **Tag provenance** — stamp `synthetic: true`, `synthetic_depth: 1` (or source depth + 1 for evolved examples), and per-example metadata (see below).
6. **Write accepted examples** — append to `derivedPages.synthesizedExamples` collection in the training-complete memory consumer.
7. **Log event** — `memory-log-append` with op `synthetic-generate`, including pattern, count, model, temperature, seed, acceptance rate.
8. **Emit report** — summary to `reports/synthesis-<timestamp>.md` with pattern, input/output counts, quality distribution, and quarantine pointers.

## Provenance

Every synthesized example carries:

```yaml
metadata:
  synthetic: true
  synthetic_depth: 1             # incremented if derived from another synthetic example
  seeds_used: [ex-abc, ex-def]   # IDs of source/seed records
  generator_agent: example-synthesizer
  model: sonnet
  temperature: 0.7
  pattern: self-instruct
  seed: 42
```

This lineage feeds `grade-on-ingest`, `decontamination-check`, and dataset versioning downstream.

## Quality Gate

Generated candidates are NOT accepted automatically. Each runs through `example-quality-assess`:

- Candidates meeting the configured `--min-grade` (default MODERATE) land in `derivedPages.synthesizedExamples`.
- Below-threshold candidates land in `derivedPages.synthesizedQuarantine` for human review (per `human-authorization` rule — no auto-delete).
- Aggregate acceptance rate is reported; < 30% acceptance triggers a warning (likely prompt drift or hallucinating generator).

## Error Handling

- **API failures** — retry with exponential backoff (max 3 attempts); persistent failure aborts batch and logs `synthetic-generate-error`.
- **Model hallucination** — quality score < LOW with "hallucinated citation" downgrade → candidate rejected, incident counted toward batch stats.
- **Pattern/source mismatch** — fail fast with actionable error (e.g., "SQuAD pattern requires document sources; got example records").
- **Duplicate generation** — deduplicate on exact-match output before quality scoring; near-duplicates flagged for `decontamination-check`.

## Examples

```bash
# Bootstrap 50 examples per seed using Self-Instruct
example-synthesizer "examples/seed/*" --pattern self-instruct --count 50

# Deepen existing examples via Evol-Instruct with higher creativity
example-synthesizer "examples/raw/*" --pattern evol-instruct --temperature 0.9 --count 5

# Extract Q&A from ingested papers with reproducible seed
example-synthesizer "sources/papers/*" --pattern squad --count 20 --seed 42 --model opus
```

## Delegation

- Source loading: `@agentic/code/addons/semantic-memory/skills/memory-ingest/SKILL.md`
- Quality scoring: `@agentic/code/frameworks/training-complete/skills/example-quality-assess/SKILL.md`
- Deeper synthetic workflows (multi-turn, persona-grounded): `synthetic-data-generator` agent
- Event logging: `@agentic/code/addons/semantic-memory/skills/memory-log-append/SKILL.md`

## References

- REF-375 Self-Instruct — bootstrap from seed pool
- REF-436 Phi-1 — textbook-quality synthetic data
- REF-445 STaR — CoT rationale filtering
- REF-448 PersonaHub — persona-grounded generation
- REF-454 SQuAD — document-to-QA span extraction
- REF-470 Orca — reasoning-rich explanation synthesis

ADR-022 D10
