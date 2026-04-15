# Phase 3 Asset Inventory — Training Framework

**Issue**: #822
**Date**: 2026-04-14
**Scope**: Inventory existing AIWG assets for potential reuse in the training framework (Phase 5 design)

---

## Summary

The AIWG codebase contains extensive infrastructure for knowledge management, semantic memory, quality assessment, and metadata tracking across three primary production frameworks (`research-complete`, `media-curator`, `sdlc-complete`) and critical kernel addons (`semantic-memory`, `rlm`). **The training framework can reuse ~65% of existing patterns** with a domain-specific wrapper layer.

**Key findings:**

1. **Semantic memory kernel** (addons/semantic-memory) provides a topology-agnostic ingest → lint → query → log pipeline that can be directly reused by declaring a `memory.topology` contract for dataset-derived pages.
2. **Research-complete framework** provides a well-tested 8-stage workflow for source acquisition, quality assessment (GRADE), citation management, and provenance tracking — patterns directly applicable to dataset example sourcing.
3. **Media-curator framework** demonstrates quality filtering, integrity verification, tag collection, and provenance tracking patterns that transfer directly to dataset management.
4. **RLM addon** enables decomposing large corpus transformations (1M+ examples from raw → Alpaca format → preference pairs) into parallel recursive sub-tasks.
5. **SDLC schemas** (quality-assessment, citation-audit, fixity-manifest, license-metadata) are directly reusable for dataset examples.

**Major gaps requiring net-new code:**
- Preference pair generation (SFT → DPO intermediate format)
- ShareGPT / Alpaca / JSONL format adapters with round-trip validation
- Benchmark contamination detection (dataset overlap with eval sets)
- Synthetic data pipeline integration
- Dataset versioning with reproducibility metadata
- Example-level quality metadata schema

---

## Reuse Map

| AIWG Asset | Reuse Pattern | Training Framework Role |
|---|---|---|
| **memory-ingest / lint / log** | Core pipeline | Ingest sources → lint corpus → log transformations |
| **memory-topology contract** | Consumer declaration | Declare derivedPages (rawExamples, synthesizedExamples, preferences, evaluations, formatConverted) |
| **research-acquire** | Source acquisition | Acquire training sources (papers, code, docs) |
| **research-quality** | GRADE assessment | Rate example source quality + assess example quality |
| **research-cite** | Citation tracking | Track training source citations; map example derivation |
| **research-provenance** | W3C PROV logging | Record full example provenance (source → pipeline → human curation) |
| **quality-filtering** (media-curator) | Quality heuristics | Adapt scoring for low-quality example filtering |
| **integrity-verification** | SHA-256 checksums | Verify dataset artifact integrity; generate fixity manifests |
| **provenance-tracking** | Entity-Activity-Agent PROV | Track example derivation chains through pipeline |
| **tag-collection** | Metadata tagging | Apply domain taxonomy tags to training examples |
| **quality-assessment schema** | GRADE framework | Apply directly to rate example source quality |
| **citation-audit schema** | Citation verification | Verify all claimed sources in training examples exist |
| **fixity-manifest schema** | Checksum generation | Create fixity manifests for dataset versions |
| **license-metadata schema** | License tracking | Document license compliance per training source |
| **rlm-query / batch** | Sub-agent spawning | Parallelize format conversion, preference pair generation |
| **rlm-task-tree schema** | Task decomposition | Model dataset transformation as recursive task tree |

---

## Section 1: research-complete Framework

**Location**: `agentic/code/frameworks/research-complete/`

**20 skills** including `induct-research` (delegates to `memory-ingest` post-#830), `research-acquire`, `research-document`, `research-cite`, `research-quality` (GRADE), `research-provenance` (W3C PROV), `research-lint`, `research-status`, corpus management skills.

**Memory topology** (declared in #825) — `manifest.json`:
- rawSources: `.aiwg/research/sources`
- derivedPages: summary, entity, concept, synthesis
- ingestRequires: provenance, grade-quality
- lintRules: citation-guard, link-check, mention-lint

**Template manifest** — 8 templates: literature-note, summary, extraction (YAML), quality-assessment, citation-network, provenance-record, acquisition-report, gap-report.

**Lint rules** — 10 checks: ref-frontmatter, ref-id-unique, citation-resolves, grade-present, provenance-present, cross-ref-bidirectional, orphan-detection, frontmatter-date-format, source-file-exists, citation-bidirectional.

### Reusable as-is
- `research-quality` (GRADE framework) — use for rating training source quality
- `research-provenance` (W3C PROV) — use for full example derivation chains
- Quality-assessment template — apply to examples
- Provenance-record template — track derivation

### Wrappable with new domain layer
- `induct-research` → wrap as `induct-training-sources`
- `research-acquire` → wrap as `acquire-training-sources` (with license check)
- `research-cite` → wrap as `cite-training-source` (verify existence)

### Net-new agents required
- `source-curator-agent` — decide which sources admit to training corpus
- `example-synthesizer-agent` — generate examples from sources
- `preference-generator-agent` — generate {chosen, rejected} pairs
- `format-converter-agent` — Alpaca / ShareGPT / JSONL adapters
- `decontamination-agent` — detect eval-set overlap
- `dataset-evaluator-agent` — compute dataset-level metrics

---

## Section 2: media-curator Framework

**Location**: `agentic/code/frameworks/media-curator/`

**18 skills** including `quality-filtering`, `integrity-verification`, `provenance-tracking`, `tag-collection`, plus media-specific skills (youtube-acquisition, audio-extraction, cover-art-embedding).

**Memory topology** (declared in #825):
- rawSources: `.aiwg/media/sources`
- derivedPages: artist, discography, session, synthesis
- lintRules: link-check, mention-lint

### Reusable patterns

**quality-filtering**: Title keyword scoring with +3/−4 modifiers. Directly transferable:
- peer-reviewed source: +3
- blog post: −2
- hallucinated reasoning: −3
- clear trace: +1

**integrity-verification**: Bash SHA-256 manifest generation with null-terminated filenames, deterministic output, self-verifying headers, nanosecond timestamps. **Copy directly** to training framework.

**provenance-tracking**: Entity-Activity-Agent PROV model. Apply as:
- (source paper → acquisition → example synthesis → curation → format conversion → evaluation) as PROV entity chain.

**tag-collection**: Metadata tagging + file organization. Apply domain taxonomy tags to examples.

---

## Section 3: Semantic Memory Kernel

**Location**: `agentic/code/addons/semantic-memory/`

**5 core skills** (all from #826/#827/#828/#829):
1. **memory-ingest** — topology-agnostic ingest pipeline
2. **memory-lint** — 8 built-in checks with auto-fix
3. **memory-query-capture** — capture query result as durable synthesis page
4. **memory-log-append** — append JSON Lines event to `.log.jsonl`
5. **memory-log-render** — JSON Lines → markdown timeline

**Memory topology contract** (declared per consumer):
- namespace, rawSources, derivedPages, index, log, crossRefStyle, pageTemplate, ingestRequires, lintRules

**ADR-021 D4 consumer resolution**: explicit `--consumer` > wrapper context > auto-detect.

**Log event schema** — four operation types:
- **ingest**: source, pages_touched, contradictions, duration_ms
- **lint**: findings (error/warning/suggestion counts), auto_fixed, duration_ms
- **query-capture**: query_summary, page_created, page_type, refs_added
- **log-render**: entries_rendered, output

### Training reuse

**100% reusable as-is.** Declare training-specific topology with derivedPages:
- `rawExamples`: ingested raw sources turned into examples
- `synthesizedExamples`: LLM-generated examples
- `preferences`: DPO-style {chosen, rejected} pairs
- `evaluations`: per-example eval results
- `formatConverted`: Alpaca / ShareGPT / JSONL outputs

Extend log event schema with new op types: `format-convert`, `decontamination-check`, `preference-generate`, `synthetic-generate`.

---

## Section 4: SDLC Schemas for Datasets

**Location**: `agentic/code/frameworks/sdlc-complete/schemas/research/`

Four schemas directly applicable:

### 1. quality-assessment.yaml
GRADE framework with source-type baselines (peer-reviewed HIGH, preprint MODERATE, blog LOW) + downgrade factors (risk of bias, inconsistency, indirectness, imprecision, publication bias, each −1) + upgrade factors (large effect +1, confounding works against +1, dose-response +1).

**Training adaptation**: apply directly to rate example sources and examples themselves (diversity +1, clear reasoning +1, hallucination −3, out-of-distribution −2).

### 2. citation-audit.yaml
Verifies citations point to real documents. Tracks location, text, verification status (verified / hallucinated / unreachable / malformed / inconsistent), confidence score.

**Training reuse**: verify all training examples cite actual sources (not fabricated papers). Detect hallucinated citations in reasoning traces.

### 3. fixity-manifest.yaml
OAIS Fixity Information with SHA-256 checksums per artifact, manifest timestamp, file size, verification status.

**Training reuse**: generate fixity manifests for dataset versions (e.g., `training-data-v1.0-CHECKSUMS.sha256`).

### 4. license-metadata.yaml
SPDX license identifier, permissions (commercial, derivative, share-alike), attribution requirements.

**Training reuse**: track license compliance per training source and derived examples. Declare inherited license for examples derived from licensed sources.

---

## Section 5: RLM Addon

**Location**: `agentic/code/addons/rlm/`

**Architecture**: Maps RLM to AIWG:
- REPL (code execution) → Read, Grep, Glob, Bash
- llm_query() → Task tool (sub-agent spawning)
- Final env variable → task completion criteria

**2 core skills**:
- `rlm-query`: spawn sub-agent for specific context (no full conversation history)
- `rlm-batch`: parallel fan-out across multiple files

**RLM task tree schema** (`schemas/rlm-task-tree.yaml`): hierarchical decomposition with `node_id`, `prompt`, `context`, `children`, `status`, `result`, `cost`, `timestamps`, `preferred_model` (haiku / sonnet / opus).

### Cost model
- Haiku: $0.80/1M tokens
- Sonnet: $3/1M tokens
- Opus: $15/1M tokens

For 1M examples × avg 500 tokens/example:
- Screening (haiku): ~$400
- Synthesis (sonnet): ~$6,000
- Format conversion (haiku): ~$800
- **Total**: ~$7,200

### Training reuse

Model dataset transformation as RLM task tree with parallel sub-tasks:
```
/rlm-query examples/raw/batch-001.json "Convert to Alpaca format" --model sonnet
/rlm-batch "examples/raw/**/*.json" "Convert to Alpaca format"
/rlm-batch "formats/alpaca/training-v1.0.jsonl" "Generate DPO preference pairs"
```

---

## Gaps — Net-New Code Required

1. **Preference pair generation** — no skill generates DPO `(x, y_w, y_l)` or reward-model pairs.
   - Need: `preference-generator` skill with LLM synthesis, human ranking, or heuristic ranking modes.

2. **Format adapters** — no Alpaca / ShareGPT / HuggingFace Dataset adapters with round-trip validation.
   - Need: `format-adapter-alpaca`, `format-adapter-sharegpt`, `format-adapter-jsonl` skills + validator.

3. **Benchmark contamination detection** — no mechanism to detect training-eval overlap.
   - Need: `decontamination-checker` skill (exact match, fuzzy match, semantic similarity) + contamination report schema.

4. **Synthetic data pipeline** — no framework for mixing human + synthetic examples with separate provenance.
   - Need: `synthetic-data-generator` skill + synthetic data quality schema + mixing policy config.

5. **Dataset versioning & reproducibility** — no schema for versioning datasets with git commits, random seeds, hyperparameters.
   - Need: `dataset-version` skill + version manifest schema with reproducibility metadata + `dataset-reproduce` skill.

6. **Example-level quality metadata** — no schema for tracking difficulty / domain / task type / reasoning quality per example.
   - Need: extended example metadata schema with task_metadata, quality_metadata, diversity_metadata, provenance fields.

---

## Recommended Framework Shape

1. **Declare memory topology** in manifest.json with derivedPages: rawExamples, synthesizedExamples, preferences, evaluations, formatConverted
2. **Reuse semantic memory kernel** (memory-ingest, memory-lint, memory-log-append) with training-specific topology
3. **Wrap research-complete patterns** with source-curator-agent, example-quality-assessment
4. **Wrap media-curator patterns** with quality-filtering, integrity-verification, tag-collection adaptations
5. **Implement net-new skills**: preference-generator, format-adapters, decontamination-checker, synthetic-data-generator, dataset-version, example-quality-assess
6. **Extend SDLC schemas** — copy quality-assessment, citation-audit, fixity-manifest, license-metadata; create new training-specific schemas
7. **Implement RLM integration** with task tree decomposition for parallel dataset curation
8. **Create domain agents**: source-curator, example-synthesizer, preference-generator, format-converter, decontamination, dataset-evaluator, dataset-publication
9. **Declare lint rules**: citation-guard, license-check, format-validation, decontamination-check, example-completeness, provenance-present
10. **End-to-end workflow**: induct sources → curate quality → synthesize examples → generate preferences → convert formats → decontaminate → version → evaluate

**Total reusable**: ~15,000 lines of code (SKILL.md files, schemas, templates, lint rules)
**Total net-new**: ~8,000 lines (6 new domain skills + 6 new schemas + 7 new agents + domain lint rules)
**Reuse ratio**: ~65% existing / ~35% net-new domain logic
