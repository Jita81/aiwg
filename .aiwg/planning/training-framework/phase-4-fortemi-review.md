# Phase 4 Fortemi Architecture Review — Training Framework

**Scope**: Map Fortemi's semantic memory capabilities to the AI training data pipeline (issue #822).
**Date**: 2026-04-14
**Source**: REF-250, REF-251, REF-252 (Fortemi research docs) + Fortemi MCP tool surface.

---

## Summary

Fortemi is a Rust/PostgreSQL semantic memory system with enterprise-grade knowledge graph infrastructure. It combines SKOS-compliant concept hierarchies, topology-aware linking (PFNET/SNN/Louvain), MRL-enabled embeddings (nomic-embed-text), and W3C PROV provenance tracking. For AIWG's training data pipeline, Fortemi serves as the durable, cross-session knowledge repository for training examples, preference pairs, and dataset versioning — complementing AIWG's session-scoped index with relationship-rich graph capabilities that enable multi-hop retrieval, concept-based filtering, and provenance-traced lineage.

---

## Fortemi Architecture

### Storage Model

**Layered persistence with three tiers:**

1. **PostgreSQL entity tables (SKOS + metadata)**
   - `notes` (UUID PK, original_content, revised_content, metadata JSONB)
   - `note_links` (bidirectional semantic edges with cosine similarity scores)
   - `skos_schemes` (vocabulary metadata)
   - `skos_concepts` (hierarchical tags with broader/narrower relations)
   - `skos_labels` (altLabel, hiddenLabel for search expansion)
   - `skos_mappings` (external vocabulary mappings: exactMatch, closeMatch)
   - `skos_hierarchy_paths` (materialized closure table — sub-100ms hierarchy traversal)
   - `tag_skos_mapping` (bridge linking organizational tags to SKOS concepts)

2. **File attachments + extraction pipeline**
   - `attachments` (UUID, note_id FK, MIME type, provenance metadata)
   - Automatic extraction: OCR (images), transcription (audio), keyframes (video), text+layout (PDFs)
   - Document type inference (python-source, markdown-document, etc.)

3. **Embedding vectors (pgvector + HNSW index)**
   - 768-dim vectors from nomic-embed-text-v1.5 (MRL-enabled)
   - Matryoshka truncation: 768/512/256/128/64 dims with <11% accuracy loss at 64-dim
   - HNSW index for O(log N) approximate nearest neighbor search

**Key design patterns:**
- All notes immutable; updates create new versions (original + revised tracked)
- Metadata extensibility via JSONB (source, priority, project_id, custom fields)
- Soft-delete support (deleted_at timestamp for recovery)
- Tag-to-SKOS bridge enables hierarchical filtering and concept expansion

### Graph Topology (SKOS, PFNet, SNN)

**SKOS concept layer** (REF-250):
- W3C SKOS standard for controlled vocabularies (broader/narrower/related)
- Materialized hierarchy with closure tables (pre-computed ancestor-descendant paths)
- 7 anti-pattern validators: cyclic hierarchies, orphan concepts, label conflicts, reflexivity
- Hierarchy depth target: 3–5 levels (NISO Z39.19-2024); max 100 to prevent infinite recursion
- Bridge table links organizational tags to SKOS concepts for inheritance + expansion

**Link topology optimization** (REF-251):
- **Problem:** Threshold-based linking (cosine ≥ 0.7) creates star topologies in 768-dim space
  - Intra-cluster similarities concentrate: μ ≈ 0.75, σ ≈ 0.05
  - At T=0.70, ~84% of intra-cluster pairs exceed threshold → near-complete subgraph per topic
  - Result: bimodal degree distribution, clustering coefficient ≈ 0.0, all paths ≤ 2.0 hops

- **Post-processing pipeline** (production, merged Feb 2026):
  1. **Normalization** — Edge weight scaling with configurable gamma
  2. **SNN scoring** — Shared Nearest Neighbor: |kNN(A) ∩ kNN(B)| / k
  3. **PFNET sparsification** — Topology-preserving edge pruning (Schvaneveldt 1990)
  4. **Louvain community detection** — O(N log N) modularity-based; labeled with SKOS concept names
  5. **MRL 64-dim coarse detection** — Fast community grouping using Matryoshka embeddings

- **Effectiveness metrics** (post-implementation targets):
  - Clustering coefficient: 0.0 → 0.3–0.6
  - Average degree: bimodal → 5–10 (uniform)
  - Average path length: ~2.0 → 3–4
  - Multi-hop traversal (depth > 1): <10% → >30%

---

## MCP Tool Surface

| Tool | Purpose | Training Pipeline Role |
|------|---------|------------------------|
| `capture_knowledge` | Create note with NLP pipeline | Ingestion: training examples → Fortemi |
| `update_note` | Revise note (versioning) | Refinement: example improvements |
| `get_note` | Retrieve full note | Access: query training example |
| `list_notes` | Filter/paginate notes | Browsing: find dataset subset |
| `search` | Text/semantic/spatial/temporal | Retrieval: similar examples, cross-validation |
| `explore_graph` | Traverse knowledge graph | Relationship: multi-hop example discovery |
| `get_related_notes` | Semantic similarity + graph | Clustering: sibling examples in same topic |
| `get_note_links` | Direct graph edges | Validation: check linking quality |
| `manage_collection` | Organize notes in folders | Organization: dataset versioning |
| `manage_embeddings` | Curate semantic subsets | Filtering: dataset-scoped search indexes |
| `manage_concepts` | SKOS vocabulary curation | Tagging: conceptual alignment of examples |
| `manage_tags` | Tag assignment/review | Annotation: label training examples |
| `record_provenance` | Spatial-temporal metadata | Lineage: track data source/context |
| `get_access_frequency` | Hot/cold spot analytics | Curation: identify underexplored examples |
| `get_cold_spots` | Knowledge gap detection | Quality: find stale/disconnected examples |
| `recompute_snn_scores` | Structural link quality | Maintenance: post-import graph tuning |
| `pfnet_sparsify` | Topology-preserving pruning | Maintenance: reduce redundant links |
| `coarse_community_detection` | Fast clustering (64-dim MRL) | Analysis: topic clustering |
| `manage_jobs` | Background processing | Pipeline: monitor ingestion + AI revision |
| `bulk_reprocess_notes` | Batch AI revision | Enhancement: improve examples via LLM |
| `manage_backups` | Archive operations | Safety: dataset versioning, rollback |
| `manage_archives` | Multi-memory isolation | Multi-dataset: separate train/val/test |
| `delete_note` / `restore_note` | Soft-delete + recovery | Cleanup: remove erroneous examples |
| `get_knowledge_health` | System metrics | Monitoring: dataset health status |
| `get_graph_diagnostics` | Embedding quality + topology | Validation: graph construction quality |
| `capture_diagnostics_snapshot` | Before/after comparison | Experimentation: A/B test graph changes |
| `compare_diagnostics_snapshots` | Delta analysis | Analysis: quantify topology improvements |
| `trigger_graph_maintenance` | Full pipeline execution | Batch: scheduled graph QA |

---

## Training Pipeline Mapping

| Stage | Input | Output | Fortemi Tool(s) | Why |
|-------|-------|--------|-----------------|-----|
| **1. Source Ingestion** | Raw data (API, CSV, files, code) | Parsed documents with metadata | `capture_knowledge` (bulk), `record_provenance` | Batch ingest with automatic NLP pipeline; provenance tracks source context |
| **2. Extraction** | Documents, code, images, audio, video | Structured content + attachments | `manage_attachments`, `manage_jobs` | Automatic pipeline: OCR, transcription, keyframe analysis, code embedding |
| **3. Enrichment** | Raw notes | Annotated notes (tags, concepts, relationships) | `manage_concepts`, `manage_tags`, `capture_knowledge` (contextual revision) | Two-phase AI revision + automatic SKOS concept tagging; SNN links during embedding |
| **4. Filtering** | All notes | Subset filtered by quality/tags/topic | `search`, `manage_embeddings`, `get_cold_spots` | Semantic search + tag filtering + embedding sets with auto-criteria |
| **5. Synthesis** | Filtered examples | Training pairs | `capture_knowledge`, `explore_graph` | Graph traversal finds sibling examples for preference pair construction |
| **6. Formatting** | Synthesis output | JSON training records | `export_note`, `get_note_links`, `record_provenance` | Structured YAML frontmatter + markdown; edge list; PROV lineage |
| **7. Validation** | Training dataset | Quality metrics + statistics | `get_knowledge_health`, `get_graph_diagnostics`, `get_access_frequency`, `trigger_graph_maintenance` | Anisotropy check; degree variance; access skew |
| **8. Publication** | Validated dataset | Training records in external format | `manage_backups` (export_shard), `manage_archives`, `search` (federated) | Full archive export; archive cloning for train/val/test snapshots |

---

## Dual Storage Model

### Fortemi (durable, session-agnostic)

**Use when:**
- Data must persist **across sessions**
- **Relationship context matters** (multi-hop retrieval, topic clustering)
- **Provenance tracking required** (lineage, collection context)
- **Long-term versioning** (rollback, compare snapshots)
- **Cross-project sharing** (reuse across training projects)
- **Hierarchical organization** (SKOS concepts, nested collections)

**Typical roles:**
- Training example repository — curated examples as notes
- Preference pair store — related examples linked via SNN; exploration finds pairs
- Dataset versions — collections partition train/val/test; archives enable snapshots
- Metadata layer — SKOS concepts tag examples; materialized hierarchy enables topic filtering
- Feedback loops — access frequency reveals learning-driving examples; cold spots flag stale data

### AIWG Index (session-scoped, fast lookup)

**Use when:**
- Single-session lifetime
- Speed-critical (<100ms retrieval)
- No persistence needed
- Minimal graph structure

**Typical roles:**
- Working cache during training loop
- Candidate ranking (BM25 + semantic) for hard-negative mining
- Intermediate pipeline state

### Direct Filesystem (external datasets)

**Use when:**
- External origin (GitHub repos, published datasets, APIs)
- Immutable reference (read-only archive)
- Streaming required (too large for DB)

**Typical roles:**
- Raw input before Fortemi ingestion
- Model checkpoints (weights, not training data)

### Integration Pattern

```
Filesystem (raw)
  → capture_knowledge (bulk)
  → Fortemi (notes + embeddings)
  → search/explore (session)
  → AIWG index (cache)
  → Training loop
  → feedback
  → update_note (Fortemi)
```

---

## Integration Gaps

### ✅ Fortemi Has
1. Multi-session persistence
2. Graph-based relationships (multi-hop retrieval, clustering, community detection)
3. Concept hierarchies (SKOS enables semantic filtering)
4. Metadata extensibility (JSONB for custom attributes)
5. Provenance tracking (W3C PROV)
6. Batch operations (`bulk_create`, `bulk_reprocess_notes`)
7. Versioning (collections + archive export/import)
8. Quality diagnostics (anisotropy, degree distribution, cold spots, access frequency)
9. Soft deletion with restore
10. Multi-memory isolation (archives for train/val/test)

### ❌ Fortemi Missing — Gaps for Training

1. **Preference pair schema** — no native {better, worse} pair storage
   - Workaround: note-to-note links with metadata edge type (`link_metadata: {type: "preference", preference: "better"}`)
   - Gap: no SKOS-backed preference semantics; SNN doesn't differentiate direction

2. **Batch embedding operations** — `manage_jobs` queues individual notes
   - Workaround: loop `bulk_reprocess_notes` (AI revision only); embeddings incremental
   - Gap: can't efficiently swap embedding models for entire corpus

3. **Dataset-level versioning schema** — no explicit "training dataset" resource type
   - Workaround: collection with versioned name + snapshot via `manage_backups`
   - Gap: no metadata like train_size, val_size, split_seed, model_target, label_counts

4. **Label distribution tracking** — no built-in histogram
   - Workaround: query access frequency + concept stats; post-process in Python
   - Gap: no native "histogram by tag" or "distribution by metadata field"

5. **Synthetic example generation** — no template system
   - Workaround: `capture_knowledge` imports generated examples; manually create
   - Gap: no "generate N examples similar to X" capability

6. **Preference weighting** — no native importance weights
   - Workaround: JSONB metadata; apply during pipeline
   - Gap: no native weighting in graph or search

7. **Selective re-embedding** — can't update embeddings for subset without full pipeline
   - Workaround: tag + `bulk_reprocess_notes`
   - Gap: no "update embeddings only" job type

8. **Multi-model embeddings** — single active embedding model per instance
   - Workaround: separate Fortemi instance per model; federated search
   - Gap: no native multi-embedding

9. **Quality metrics per dataset** — no "dataset-level" health snapshot
   - Workaround: export collection, analyze locally
   - Gap: no pre-built "compare two collections" diagnostic

10. **Training-specific metadata** — no standard fields for loss/accuracy/epoch
    - Workaround: JSONB metadata
    - Gap: no schema enforcement or validation rules

---

## Open Questions for Phase 5 ADR

1. **Note granularity**: every training example = one Fortemi note, or bulk-stored in JSONB?
   - A: 1 example = 1 note (simple, full linking, scales to 1M+)
   - B: dataset = 1 note, examples = JSONB array (batch efficient, loses relationships)
   - C: hybrid (examples as notes + indexed in dataset note's JSONB)

2. **Preference pair representation**: how to express {better, worse, equal} in Fortemi's graph?
   - A: note-to-note links with `edge_metadata.preference` (leverages existing graph)
   - B: dedicated `preference_pairs` table (schema extension in Fortemi)
   - C: external preference DB; Fortemi stores examples only

3. **Dataset versioning**: train/val/test as collection, archive, or external record?
   - A: collections organize splits; archive snapshot per version
   - B: each split = separate archive instance (isolation but overhead)
   - C: splits stored externally; Fortemi stores master example pool

4. **Batch embedding operations**: request Fortemi feature, build external, or accept incremental?
   - A: request `embed_subset` task type in Fortemi
   - B: external embedding service; sync vectors back
   - C: incremental only; full rebuild expensive

5. **Preference weighting**: Fortemi-level or pipeline-level?
   - A: add `weight` field to note metadata
   - B: external weighting (Python training code)
   - C: extend SNN scoring with preference direction

6. **Multi-model embeddings**: text + code simultaneously?
   - A: multi-vector schema extension
   - B: separate instances + federated search
   - C: code as attachments; extract via pipeline

7. **Cold spot feedback loop**: how should cold spot info flow to curation?
   - A: export list + human review
   - B: automated re-emphasis (below-threshold examples get boosted weight)
   - C: automated removal (delete cold > N weeks)

8. **Training dataset schema**: formalize with model_target/split_seed/label_distribution?
   - A: Fortemi collection metadata (JSONB)
   - B: `.aiwg/training/datasets.yaml` manifest (external)
   - C: both (redundant but clear)

9. **Synthetic example generation**: Phase 5 tool to generate contrastive examples?
   - A: Fortemi-based template system
   - B: external generation service
   - C: LLM-based (Claude API) with synthetic labels

10. **Graph topology for training**: reuse retrieval topology or tune separately?
    - A: reuse (prefers multi-hop diversity)
    - B: training-optimized (higher SNN threshold, tight clusters)
    - C: dual topology (complex maintenance)

---

## Conclusion

Fortemi is a well-architected semantic knowledge system with production-grade topology algorithms (PFNET, SNN, Louvain) and enterprise metadata (SKOS, PROV). For AIWG training data pipelines, it excels at:

- **Durable example storage** with cross-session access
- **Relationship-rich retrieval** (multi-hop for preference pair synthesis)
- **Hierarchical organization** (SKOS enables topic filtering)
- **Provenance lineage** (source, context, device, time)
- **Dataset versioning** (archive snapshots for train/val/test rollback)

**Integration is feasible** with minor workarounds for preference pairs (link metadata), batch embedding (loop bulk_reprocess), and dataset schema (collection + JSONB). **Phase 5 should decide** on preference pair representation, dataset versioning strategy, and whether to request Fortemi feature extensions (batch re-embedding, preference weighting, multi-model).

---

## References

- `/home/roctinam/dev/research-papers/cross-project/Fortemi--fortemi.md`
- `/home/roctinam/dev/research-papers/documentation/references/REF-250-fortemi-skos-implementation.md`
- `/home/roctinam/dev/research-papers/documentation/references/REF-251-fortemi-graph-topology.md`
- `/home/roctinam/dev/research-papers/documentation/references/REF-252-fortemi-embedding-models-2026.md`
