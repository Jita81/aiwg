# ADR-022: AI Training Framework — Corpus-to-Dataset Pipeline

**Status**: Proposed
**Date**: 2026-04-14
**Deciders**: Architecture Designer (proposing), Project Owner (review pending)
**Context**: Issue #822 — AI training and enhancement framework

---

## Context and Problem Statement

AIWG has built comprehensive infrastructure for research curation, semantic memory, provenance tracking, and quality assessment — but has no framework for **training data creation and enhancement**. Users with a corpus (research papers, codebases, conversations, documentation) currently have no AIWG-native path to transform that corpus into training-ready datasets.

Issue #822 proposes a new AIWG framework that:

> "Point at any corpus. Get a training-ready dataset out. With provenance, quality scores, deduplication, format flexibility, and decontamination built in."

Phases 0-4 of #822 are complete:
- 485 research REFs inducted covering every major dataset methodology (Self-Instruct, Evol-Instruct, DPO, KTO, ORPO, SimPO, GRPO, IPO, RLAIF, Orca 1/2, Phi 1/3, UltraFeedback, STaR, V-STaR, PersonaHub, ReST, LIMA, TRL, LoRA, QLoRA, DoRA, GPTQ, AWQ, SparseGPT, Wanda, FlashAttention, GQA, Model Collapse, Llama Guard, Sleeper Agents, Benchmark Contamination, LM Eval Harness, AlpacaEval, Datasheets, Model Cards, Data Statements, ML Repro Checklist, HF Datasets, Arrow+Parquet, Dataset Versioning, LAION)
- Asset inventory complete (Phase 3) — ~65% reuse from existing AIWG frameworks + semantic memory kernel
- Fortemi architecture review complete (Phase 4) — integration feasible with minor workarounds

This ADR locks the framework's architectural decisions before implementation tickets are filed.

## Decision Drivers

- **Reuse first**: existing kernel skills, GRADE assessment, provenance patterns should be composed, not duplicated
- **Format flexibility**: output must serve Alpaca, ShareGPT, JSONL, HF Datasets, Parquet without forcing a choice upstream
- **Provenance-first**: every example traces back to its source via W3C PROV — no orphan examples
- **Decontamination as first-class**: benchmark leakage detection is a pipeline stage, not a post-hoc check
- **Dual storage**: Fortemi for durable/relationship-rich storage; AIWG index for session-scoped fast lookup
- **Cost-aware**: decomposable pipelines so cheap models (Haiku) handle bulk work, expensive models (Opus) handle synthesis

---

## Decisions

Ten interlocking decisions. Numbered D1–D10 for downstream reference.

### D1: Framework name and location

**Options**:
1. `training-complete` — parallels `sdlc-complete`, `research-complete`, `forensics-complete`, `media-curator`
2. `dataset-forge` — more evocative but inconsistent naming
3. `ai-training` — ambiguous (model training vs data prep)

**Decision**: **`training-complete`** at `agentic/code/frameworks/training-complete/`.

**Rationale**:
- Consistent naming with existing production frameworks
- Framework (not addon) because it's a complete end-to-end workflow with its own artifact topology
- Scope is explicitly **dataset creation and enhancement**, not model training itself (no GPU orchestration, no trainer integration — those are external tools the user invokes with the datasets we produce)

**Consequence**: Adds one entry to framework registry. Declares `mode` alias `training` for `aiwg use training`.

### D2: Pipeline topology

**Options**:
1. Skills-only — each stage is a skill; composition happens in flow skills that chain them
2. DAG-orchestrated — explicit pipeline DAG schema; orchestrator walks the DAG
3. Linear flows — single `flow-dataset-build` skill with hardcoded stages

**Decision**: **Skills + flow-orchestrated**. Each pipeline stage ships as a standalone skill (invocable independently). A `flow-dataset-build` skill chains them for the default end-to-end path. Advanced users compose their own flows.

**Rationale**:
- Matches existing AIWG pattern (`flow-gate-check`, `flow-delivery-track`, etc.)
- Individual skills stay callable for custom pipelines (e.g., decontamination-only check against an existing dataset)
- DAG schema is premature — flow skills are already the AIWG way to express ordered chains

**Consequence**: Each stage gets its own skill directory. `flow-dataset-build` provides the default end-to-end path.

### D3: Storage model — Fortemi vs AIWG index vs filesystem

**Decision**: **Three-tier dual storage** (from Phase 4):

| Tier | Purpose | Lifetime |
|------|---------|----------|
| **Filesystem** (`.aiwg/training/raw/`) | Raw sources before ingestion | Immutable reference |
| **Fortemi** (via MCP) | Durable, relationship-rich, cross-session | Persistent |
| **AIWG index** | Session-scoped fast lookup | Session |

**Rules**:
- Raw sources land in filesystem first (`raw/` directory)
- Ingestion via `memory-ingest` writes to Fortemi (each example = one Fortemi note)
- Training loop queries via AIWG index (cache of Fortemi subset)
- Dataset exports write back to filesystem in target format

**Rationale**: Phase 4 confirmed Fortemi excels at durable relationship-rich storage and multi-hop retrieval for preference pair synthesis. AIWG index is already the in-session primitive. Filesystem is natural for raw inputs and published outputs.

**Consequence**: Framework declares two namespace roots — `.aiwg/training/` for AIWG-side artifacts, Fortemi for examples. Export skill writes to `.aiwg/training/exports/<format>/`.

### D4: Example granularity in Fortemi

**Options**:
1. 1 example = 1 Fortemi note (full linking, scales to 1M+)
2. Dataset = 1 note with examples in JSONB (batch-efficient, loses linking)
3. Hybrid (examples as notes + indexed in dataset-note JSONB)

**Decision**: **Option 1 — 1 example = 1 Fortemi note.**

**Rationale**:
- Enables finest-grained provenance + cold-spot detection per example
- Multi-hop retrieval for preference pair synthesis requires per-example graph nodes
- Fortemi's topology optimizations (PFNET, SNN, Louvain) are designed for node-level operation
- Scale risk mitigated: Fortemi's HNSW index is O(log N); batch ingest via `bulk_create` handles millions

**Consequence**: Expect Fortemi instances with 100K–1M+ notes per training project. Dataset-level metadata stored in a separate "dataset manifest" note with JSONB containing split seeds, counts, derivation record.

### D5: Preference pair representation

**Options**:
1. Note-to-note links with `edge_metadata.preference: "better" | "worse" | "equal"` (leverage existing graph)
2. Dedicated `preference_pairs` table in Fortemi (schema extension — requires upstream change)
3. External preference DB; Fortemi stores examples only (loose coupling)

**Decision**: **Option 1 — preference edges in Fortemi's graph with metadata.**

Encoding:
- Each preference pair = 2 edges between the 2 example notes
- Edge type: `preference`
- Edge metadata: `{ chosen_note, rejected_note, confidence, created_by_agent, rationale_note?, task_context }`

**Rationale**:
- No upstream Fortemi changes required
- `explore_graph` and `get_note_links` work unchanged
- SKOS concept tagging on examples transfers to preference pair filtering
- Rationale (if present) is itself a note, reachable via link

**Consequence**: Preference-generator skill creates these edges via `manage_embeddings` + `update_note` with link metadata. DPO export walks preference edges to produce `{prompt, chosen, rejected}` triples.

### D6: Dataset versioning

**Options**:
1. Fortemi collections + archive snapshots (all in Fortemi)
2. `.aiwg/training/datasets.yaml` manifest (external to Fortemi)
3. Both — Fortemi stores examples; AIWG manifests store dataset-level metadata

**Decision**: **Option 3 — both**. Fortemi collections partition splits; `.aiwg/training/datasets/<version>.yaml` manifests capture dataset-level metadata (split seeds, label distributions, reproduction recipe, license inheritance, decontamination audit).

**Rationale**:
- Fortemi collections handle example-level organization
- YAML manifests are human-readable, git-committable, and diff-friendly (critical for reproducibility)
- Dataset manifests can reference Fortemi archive snapshot IDs for point-in-time restore
- Matches ML Reproducibility Checklist (REF-475) requirements

**Consequence**: New schema `dataset-manifest.yaml` with required fields: version, seed, split_counts, sources, decontamination_report_id, license, provenance_record_id, fortemi_archive_id.

### D7: Canonical internal format + adapters

**Options**:
1. Canonical JSONL + format adapters (Alpaca, ShareGPT, ChatML, Parquet)
2. Alpaca as canonical; others derived
3. Native HF Datasets format throughout

**Decision**: **Option 1 — canonical JSONL + adapters.**

Canonical record shape (per example note):
```json
{
  "id": "uuid",
  "task_type": "instruction_following | reasoning | dialogue | tool_use | classification | ...",
  "input": { "system": "...", "user": "...", "context_refs": [...] },
  "output": { "assistant": "...", "reasoning_trace": "...", "tool_calls": [...] },
  "metadata": {
    "difficulty": 0.0-1.0,
    "domain": ["..."],
    "source_refs": [...],
    "quality_grade": "HIGH|MODERATE|LOW|VERY_LOW",
    "license": "SPDX-identifier",
    "provenance_id": "...",
    "created_at": "...",
    "created_by_agent": "..."
  }
}
```

Adapters ship for: Alpaca (instruction/input/output), ShareGPT (conversations), ChatML (OpenAI messages), JSONL (canonical pass-through), Parquet (via Arrow).

**Rationale**:
- Format pluralism matters — users need Alpaca for SFT, ShareGPT for multi-turn, Parquet for scale (REF-471, REF-472, REF-473)
- Canonical format prevents adapter-to-adapter translation (N×N complexity)
- Metadata-rich record preserves provenance across format conversions

**Consequence**: Each adapter is a separate skill with round-trip tests. Format conversion logs to `memory-log-append` with op `format-convert`.

### D8: Decontamination as first-class stage

**Options**:
1. Pipeline stage — decontamination is a gate before publication
2. Lint rule — `memory-lint` flags contamination
3. Post-hoc — separate audit after publication

**Decision**: **Option 1 — first-class pipeline stage**, plus Option 2 **as belt-and-braces** (lint rule catches missed runs).

Stage operation:
- Compares dataset candidate against declared eval sets (`decontamination-targets.yaml`: MMLU, GSM8K, HumanEval, HELM, MT-Bench, etc.)
- Three detection modes: exact n-gram overlap, fuzzy (edit distance), semantic (embedding similarity)
- Produces `decontamination-report.md` with findings per eval set
- **Gate**: publication fails if any eval set has contamination > declared threshold

**Rationale**:
- REF-442 (Benchmark Contamination position paper) establishes this as non-optional
- Post-hoc audit is too late — contaminated datasets get used
- Lint rule alone is too weak — users might not run lint

**Consequence**: `decontamination-check` skill; `decontamination-targets.yaml` schema; `decontamination-report.md` template; `decontamination-gate` lint rule.

### D9: Provenance model

**Decision**: **W3C PROV-O** (consistent with existing AIWG `provenance-create`, `provenance-validate`).

Entity-Activity-Agent chain per example:
```
Raw source (Entity)
  ↓ (Activity: ingest, Agent: source-curator)
Raw example in Fortemi (Entity)
  ↓ (Activity: synthesize, Agent: example-synthesizer)
Synthesized example (Entity)
  ↓ (Activity: quality-score, Agent: example-quality-assess)
Graded example (Entity)
  ↓ (Activity: format-convert, Agent: format-converter-alpaca)
Exported record in training-v1.0.jsonl (Entity)
```

Stored as PROV records in `.aiwg/training/provenance/`. Fortemi records the `prov_id` in example note metadata.

**Rationale**: Reuses existing AIWG provenance infrastructure (`provenance-create`, `provenance-query`, `provenance-validate`). Required by ML Reproducibility Checklist (REF-475) and Datasheets for Datasets (REF-451).

**Consequence**: Every stage writes a PROV activity record. Dataset manifest references the top-level provenance bundle ID.

### D10: Synthetic data policy

**Decision**: **Synthetic data is first-class but segregated.**

Rules:
- Synthetic examples live in a separate `derivedPages.synthesizedExamples` collection (distinct from `derivedPages.rawExamples`)
- Every synthetic example's provenance identifies the generator agent + seed example(s)
- Mixing policy (human:synthetic ratio, per-split) declared in dataset manifest
- **Model Collapse guard** (REF-446): max 1 generation of synthetic-from-synthetic; further recursion requires explicit `--allow-recursive-synthetic` flag with warning

**Rationale**: REF-446 (Shumailov 2024) proved recursive synthetic-on-synthetic training causes model collapse. REF-436/437 (Phi-1/3) showed synthetic data can outperform web scrape when curated. Both must be respected.

**Consequence**: New schema `synthetic-generator-config.yaml`; `synthetic-data-generator` skill enforces recursion limit; dataset manifest declares human:synthetic ratio per split.

---

## Consequences

### Positive

- **Zero duplicate ingest/lint/log** — kernel from #823 does it all
- **Format pluralism** — canonical + adapters means no user has to re-prepare data
- **Reproducibility-by-default** — provenance + dataset manifests + fixity manifests enforce ML Repro Checklist out of the box
- **Cost-controlled** — RLM integration lets cheap models do bulk work; expensive models reserved for synthesis and quality judgment
- **Decontamination gate** prevents silent benchmark leakage
- **Synthetic segregation** respects the Model Collapse findings

### Negative

- **New framework = new maintenance surface** — one more framework to version, deploy, test
- **Fortemi dependency** — users who don't run Fortemi get a degraded experience (filesystem-only fallback required)
- **Scale validation needed** — Fortemi at 1M+ notes per project is plausible but untested at AIWG scale
- **Format adapter count** — 5+ adapters means 5+ round-trip test suites

### Risks

**Risk: Fortemi at scale** (MEDIUM)
- **Probability**: Medium — 1M notes is a big jump from typical AIWG usage.
- **Impact**: Slow ingest, slow queries, possible index issues.
- **Mitigation**: Benchmark early with synthetic 100K / 500K / 1M note corpora. Escalate to Fortemi team if bottlenecks found.

**Risk: License compliance drift** (MEDIUM)
- **Probability**: Medium — users ingest sources without declaring licenses; derived examples inherit wrong license.
- **Impact**: Legal exposure on published datasets.
- **Mitigation**: `license-check` lint rule fails if any source lacks a declared SPDX identifier. Derived examples inherit strictest license up the chain.

**Risk: Fortemi-only lock-in** (LOW)
- **Probability**: Low.
- **Impact**: Users without Fortemi can't run the framework.
- **Mitigation**: Filesystem-only fallback with degraded features (no graph-based preference pairing, no SKOS filtering). Documented as "constrained mode."

---

## Rollout Plan

Phased delivery after this ADR is accepted:

### Foundation (parallel)
- **#TBD-A**: Framework scaffold (`agentic/code/frameworks/training-complete/`) with manifest.json declaring `memory.topology` + `mode: training` alias
- **#TBD-B**: Canonical example record schema + dataset manifest schema
- **#TBD-C**: Extend `memory-log-event` with training-specific op types (`format-convert`, `decontamination-check`, `preference-generate`, `synthetic-generate`)

### Ingest + Quality (parallel, after Foundation)
- **#TBD-D**: `acquire-training-source` skill (wraps `research-acquire`)
- **#TBD-E**: `example-quality-assess` skill (wraps `research-quality` GRADE)
- **#TBD-F**: `license-check` lint rule + license inheritance logic

### Synthesis + Preferences (parallel)
- **#TBD-G**: `example-synthesizer` skill (LLM synthesis with Model Collapse guard)
- **#TBD-H**: `preference-generator` skill (writes Fortemi preference edges)
- **#TBD-I**: `synthetic-data-generator` skill + recursion limit

### Format + Decontamination (parallel)
- **#TBD-J**: 5 format adapters (alpaca, sharegpt, chatml, jsonl, parquet) with round-trip tests
- **#TBD-K**: `decontamination-check` skill + `decontamination-targets.yaml` schema
- **#TBD-L**: `decontamination-gate` lint rule

### Version + Publish
- **#TBD-M**: `dataset-version` skill + `dataset-reproduce` skill
- **#TBD-N**: `flow-dataset-build` orchestrator skill (end-to-end default pipeline)
- **#TBD-O**: Datasheet and model card template integration

### Agents (staggered)
- `source-curator-agent`, `example-synthesizer-agent`, `preference-generator-agent`, `format-converter-agent`, `decontamination-agent`, `dataset-evaluator-agent`, `dataset-publication-agent`

---

## Open Questions for Human Reviewer

Five questions warrant explicit acceptance before implementation tickets are filed:

1. **Framework name**: `training-complete` vs `dataset-forge` vs something else? (D1 recommendation: training-complete for consistency)
2. **Fortemi-only vs fallback**: ship filesystem-only constrained mode from day 1, or Fortemi-required for v1 with fallback in v2? (Current recommendation: require Fortemi for v1, design fallback later if demand exists)
3. **Synthetic recursion depth**: max 1 generation of synthetic-on-synthetic, or allow 2 with larger warning? (D10 recommendation: 1 max per Model Collapse findings)
4. **Dataset manifest format**: YAML as proposed, or JSON for machine-first? (D6 recommendation: YAML for human/git ergonomics)
5. **Decontamination target list**: ship with a default set (MMLU, GSM8K, HumanEval, HELM, MT-Bench) or require user declaration? (Recommendation: ship defaults, users can override; default list is a living config)

---

## Alternatives Considered (system-level)

### Alternative A: Fork research-complete and specialize

**Rejected because**: research-complete is optimized for scholarly source tracking (GRADE, citations, literature notes). Training data has different primitives (preference pairs, format adapters, decontamination) that don't belong in research-complete. Better to build a peer framework that reuses `induct-research` via the kernel delegation pattern.

### Alternative B: Skip the framework; ship skills only

**Rejected because**: Users need a cohesive workflow, not a toolkit. The `flow-dataset-build` orchestration and dataset manifest semantics are framework-level concerns. Skills-only would leak pipeline assembly into user CLAUDE.md files.

### Alternative C: Build on HuggingFace Datasets instead of Fortemi

**Rejected because**: HF Datasets is a storage/serving format, not a curation system. We need graph-based relationship discovery (preference pair synthesis), SKOS-tagged quality assessment, and cross-session durability — all of which Fortemi provides and HF Datasets does not. We use HF Datasets as an export target (adapter), not as the source of truth.

---

## References

- @.aiwg/architecture/decisions/ADR-021-semantic-memory-kernel.md — kernel this framework consumes
- @.aiwg/planning/training-framework/phase-3-asset-inventory.md — reuse map
- @.aiwg/planning/training-framework/phase-4-fortemi-review.md — Fortemi capability map
- @agentic/code/addons/semantic-memory/manifest.json — kernel contract
- @agentic/code/frameworks/research-complete/manifest.json — wrap pattern reference
- @agentic/code/addons/rlm/manifest.json — cost-aware decomposition

**Key research REFs** (from /home/roctinam/dev/research-papers):
- REF-375 Self-Instruct, REF-376 DPO, REF-391 KTO, REF-392 ORPO, REF-393 SimPO, REF-394 GRPO, REF-395 IPO, REF-396 RLAIF
- REF-438 UltraFeedback, REF-439 Dolly, REF-470 Orca, REF-435 Orca 2, REF-436 Phi-1, REF-437 Phi-3, REF-445 STaR, REF-457 V-STaR, REF-448 PersonaHub, REF-456 ReST, REF-458 LIMA
- REF-377 LoRA, REF-378 QLoRA, REF-379 DoRA, REF-477 TRL, REF-478 Axolotl/LLaMA-Factory/Unsloth
- REF-442 Benchmark Contamination, REF-443 Llama Guard, REF-444 Sleeper Agents, REF-446 Model Collapse
- REF-449 LM Eval Harness, REF-450 AlpacaEval, REF-451 Datasheets, REF-452 Model Cards, REF-453 Data Statements, REF-475 ML Repro Checklist
- REF-471 HF Datasets, REF-472 ChatML/ShareGPT, REF-473 Arrow+Parquet, REF-474 Dataset Versioning
- REF-454 SQuAD, REF-455 LAION-5B
- REF-405 DeepSeek-R1 (pure-RL → emergent CoT — relevant for reasoning dataset design)

**Issue references**:
- Epic: #822 (to be replaced by implementation tickets after ADR acceptance)

---

**Last Updated**: 2026-04-14
**Author**: Claude (Architecture Designer / Orchestrator)
**Reviewers**: Project Owner (pending)
