# Phase 6 — aiwg index Extensions for training-complete Fallback

**Issue**: #848
**Date**: 2026-04-14
**Scope**: Investigate gaps in `aiwg index` for use as the Fortemi fallback in `training-complete`
**Inputs**: `src/artifacts/*`, Phase 4 Fortemi review, ADR-022 D3/D5/D6, preference-generator SKILL.md (#839), dataset-version SKILL.md (#844)

---

## Current `aiwg index` Capabilities

### Command surface (`src/artifacts/cli.ts`)

| Subcommand | Purpose | File |
|---|---|---|
| `build` | Build/rebuild index; supports `--graph`, `--all`, `--force`, `--scope`, `--verbose` | `cli.ts:201-262`, `index-builder.ts:255-629` |
| `query` | Keyword + filter search | `cli.ts:269-320`, `query-engine.ts` |
| `deps` | Upstream/downstream traversal with `--direction`, `--depth`, `--edge-type`, `--json` | `cli.ts:327-365`, `dep-graph.ts` |
| `stats` | Per-graph statistics | `cli.ts:372-381`, `stats.ts` |
| `neighbors` | Single-node neighbor query with direction + edge-type filter | `cli.ts:388-446`, `graph-query.ts` |
| `set` | Intersection / union / difference across neighbor sets | `cli.ts:453-536`, `graph-query.ts` |
| `watch` | FS watcher for incremental rebuilds (#795) | `cli.ts:119-196`, `watcher.ts` |

### Node model (`src/artifacts/types.ts:18-51`)

`MetadataEntry` carries: `path`, `type`, `phase`, `title`, `tags[]`, `created`, `updated`, `checksum`, `summary`, `dependencies[]`, `dependents[]`. Arbitrary extra fields ride via a non-standard `captures` bag (filename-metadata strategy; `index-builder.ts:152-166`). Tags are a flat string array (`types.ts:32`) — **no broader/narrower hierarchy**.

### Edge model (`src/artifacts/types.ts:83-119`)

Edges are typed: `TypedEdge = { path, type }`. `DependencyGraph` stores `upstream[]` / `downstream[]` per node. Default edge type is `'depends-on'`; citation sidecar parser emits `cites` / `cited-by` (`citation-parser.ts` via `index-builder.ts:484-540`). **Edge attributes (metadata) are supported by the backend interface (`graph-backend.ts:31` — `addEdge(source, target, type?, attrs?)`) and the SQLite backend stores them as JSON (`sqlite-backend.ts:67, 93`), but `TypedEdge` serialized to `dependencies.json` only carries `{path, type}` — edge attrs are dropped on serialize.**

### Graph backends (`src/artifacts/graph-backend.ts`, `backends/*`)

Three swappable backends behind `GraphBackend`:
- `json` — zero-dep adjacency list, default.
- `graphology` — optional, community detection / rich traversal.
- `sqlite` — optional, native SQL set ops, WAL-mode persistent, `ATTACH DATABASE` federation noted in header comment (`sqlite-backend.ts:7`).

### Graph configuration (`types.ts:271-342`, `BUILTIN_GRAPH_CONFIGS` at `types.ts:347-369`)

Multi-graph: `project`, `codebase`, `framework` built-in; user-defined graphs via `.aiwg/config.yaml` (`types.ts:536-580`); module-declared graphs via framework `manifest.json` `index.graphs` (`types.ts:459-522`). Per-graph knobs: `scanDirs`, `extensions`, `nodeStrategy` (`default` | `filename-metadata`), `filenamePattern`, `metadataSupplements`, `edgeExtraction` (parser + edge defs), `graphBackend`, `embedding` (optional semantic index via `@xenova/transformers` + `hnswlib-node`).

### Edge creation paths

1. **Implicit via `@-mentions`** — `extractMentions` (`index-builder.ts:49-58`) + `depGraph` wiring (`index-builder.ts:456-482`). All edges typed `'depends-on'`.
2. **Citation sidecar parser** — `edgeExtraction.parser: 'citation-sidecar'` walks frontmatter tables to emit `cites`/`cited-by` (`index-builder.ts:484-540`, `citation-parser.ts`).
3. **Backend-level `addEdge(src, tgt, type, attrs)`** — available in-code but **no CLI surface for caller-supplied edges**; all edges are extracted from scanned files.

### What is **not** present

- No `aiwg index snapshot` / `archive` / `restore` command (the existing `snapshotCommand` in `src/extensions/commands/definitions.ts:1810` is the **reproducibility** workflow snapshot, not an index-content snapshot).
- No concept hierarchy / SKOS layer — `tags[]` is flat.
- No federated query across snapshots or across multiple graph instances.
- No batch / bulk edge ingestion command.
- No edge metadata on serialized JSON graph output (round-trip loses `attrs`).
- No per-edge confidence / rationale / timestamp fields in `TypedEdge`.

---

## Requirements (from training-complete)

Pulled from ADR-022 (D3, D5, D6), preference-generator SKILL.md (#839), dataset-version SKILL.md (#844), and Phase 4 integration gaps.

### R1. Preference edges with metadata (#839, ADR-022 D5)

Each preference pair needs **2 typed edges** (`chosen→rejected` + inverse) carrying edge metadata:

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

`preference-generator` needs to write these edges programmatically (not derived from file scan), query by edge type, filter by confidence, and include metadata on serialize.

### R2. Index snapshot / archive (#844, ADR-022 D3 + D6)

`dataset-version` creates **immutable, named snapshots** of an index state so `dataset-reproduce` can round-trip. The dataset manifest carries `aiwg_index_snapshot_id` (alternative to `fortemi_archive_id`). Needs:
- Capture: full copy of `.aiwg/.index/<graph>/` as named, immutable artifact.
- Identifier: UUID or named version (aligns with CalVer dataset version).
- List / restore / drop operations.
- Atomic: on publication failure, snapshot is rolled back (SKILL.md #844 line 76).

### R3. Bulk edge creation

`preference-generator` targets 100–thousands of pairs per run. File-scan-derived edges are too slow and indirect. Needs a CLI / API path to **ingest edges from a JSONL or YAML payload** without triggering a full rebuild.

### R4. Concept hierarchies (SKOS-like; ADR-022 D3 caveat)

Phase 4 flagged hierarchical filtering as a Fortemi-native capability that the fallback lacks. Preference pair filtering ("all python-codegen preferences under the programming/ concept") and dataset sharding benefit from broader/narrower relationships on tags or a dedicated concept graph. ADR-022 explicitly notes "Implementation tickets must identify any `aiwg index` tweaks needed for preference edges **+ SKOS-like hierarchies**" (line 91).

### R5. Federated query across snapshots

`dataset-reproduce` and cross-version diagnostics need to query over multiple snapshots (e.g., "did this example exist in v2026.3.0?"). Requires multi-index query (sqlite `ATTACH DATABASE` is already a foundation, but no CLI surface).

### R6. Decontamination-style set operations (already partially covered)

`aiwg index set --op {intersection|union|difference}` exists but operates on **neighbor sets of two nodes in one graph**. Decontamination gate (#843) needs set ops across **two full collections** (examples vs. held-out eval), which is a different shape.

---

## Gap Analysis

| Capability | Current | Required | Gap | Effort |
|---|---|---|---|---|
| **Edge type taxonomy** | Open string; default `'depends-on'`, parser extensions free to add | `preference`, `chosen→rejected`, plus existing `cites`/`depends-on` | None (already open) | — |
| **Edge metadata (attrs)** | Backend interface supports it; JSON serialize drops it | Edge carries `confidence`, `rationale_note_id`, `task_context`, etc.; must round-trip | **Serialization + `TypedEdge` shape** | S (extend type, update serialize paths, bump index version) |
| **Bulk edge creation (CLI)** | No CLI; only file-scan extraction | `preference-generator` writes N edges per run | **New `aiwg index edges add` / `edges import` command** | M (CLI + backend calls + transactional write) |
| **Snapshot / archive** | None; `snapshotCommand` is unrelated (reproducibility) | Named immutable copy, list, restore, drop | **New `aiwg index snapshot` subcommand** | M (copy `.aiwg/.index/<graph>/` tree + manifest + registry) |
| **Hierarchical tags / concepts** | Flat `tags[]` | Broader/narrower relations, closure for traversal | **New concept graph type** (or hierarchical tag extension) | L (schema, closure computation, query surface); could be a user-defined graph with a dedicated `edgeExtraction.parser: 'skos-concept'` |
| **Federated query across snapshots** | Single-graph per command; sqlite ATTACH noted but unexposed | Query across multiple snapshot `.db` files or `.index/` dirs | **New `--snapshot <id>` flag on `query`, `neighbors`, `deps`** | M (requires snapshot plumbing from R2) |
| **Set ops across collections** | Neighbor-set of two nodes | Two full collections (by tag, path glob, or selector) | **Extend `set` to accept collection selectors, not just `--node-a/--node-b`** | S (new flag shape; internal set algebra already present) |
| **Node→edge atomic write** | File scan only | Skill writes both a "rationale note" file and the edge referencing it | Already handled by R3 if edges can reference paths that get materialized later | — |
| **Edge confidence filter on query** | Not applicable (no attrs queryable) | `deps ... --edge-type preference --min-confidence 0.7` | **Add attr filters to `deps` / `neighbors`** | S (after R-edge-metadata) |
| **Graph versioning / aiwg_version tag** | `FrameworkGraphVersion` type exists (`types.ts:601`) but only for framework graph | Per-snapshot `aiwg_version`, `built_at`, source graph checksum | **Extend existing pattern to all graphs in snapshots** | S |

**Effort legend**: S = <1 iteration, M = 1–2 iterations, L = multi-iteration.

---

## Recommended Extensions

### E1. Edge metadata round-trip (unblocks #839)

**Specification**:
- Extend `TypedEdge` to `{ path, type, attrs?: Record<string, unknown> }`. Keep `attrs` optional.
- `DependencyGraph` serialize keeps `attrs` when present; omits when absent (keeps JSON lean for simple graphs).
- Bump `INDEX_VERSION` from `1.0.0` to `1.1.0`; readers that don't recognize `attrs` drop it (forward-compatible).
- Backends: `json-backend.ts` already discards `attrs` on serialize — update to preserve. `sqlite-backend.ts` already persists; expose in `serialize()`.
- Normalizer `normalizeEdge` (`types.ts:94`) stays backward-compatible (string → `{path, type: 'depends-on'}`).

**Backward compatibility**: Additive; existing `dependencies.json` files parse unchanged. Consumers that read `TypedEdge.path` and `.type` continue to work.

**Proposed sub-ticket**: `#848-A — Extend TypedEdge with optional edge attributes and round-trip through all backends`.

### E2. `aiwg index edges` command (unblocks #839 R3)

**Specification**:
```
aiwg index edges add --graph <name> --source <id> --target <id> --type <type> [--attr key=value]...
aiwg index edges import --graph <name> --from <path.jsonl>     # batch
aiwg index edges list --graph <name> [--type <t>] [--source <id>] [--target <id>] [--json]
aiwg index edges remove --graph <name> --source <id> --target <id> [--type <t>]
```
- Batch import reads JSONL with `{source, target, type, attrs}` records; wraps in a single backend transaction (sqlite) or single-write (json).
- Edges added via this path are **marked as externally-authored** (flag in attrs: `_source: "external"`) so they survive `--force` rebuild (they would otherwise be scrubbed). Store in a sibling file `.aiwg/.index/<graph>/external-edges.jsonl` and merge on build.
- Rebuild contract: `index build --force` preserves external edges; `index edges clear --external` removes them.

**Backward compatibility**: New subcommand; existing build path unchanged. External edges file is optional and additive.

**Proposed sub-ticket**: `#848-B — Add `aiwg index edges` subcommand family with batch import and rebuild-safe external edges`.

### E3. `aiwg index snapshot` subcommand (unblocks #844)

**Specification**:
```
aiwg index snapshot create <name> [--graph <name>] [--all-graphs]    # returns snapshot-id
aiwg index snapshot list [--json]
aiwg index snapshot show <id|name> [--json]
aiwg index snapshot restore <id|name> [--graph <name>] [--dry-run]
aiwg index snapshot drop <id|name>                                    # rollback atomicity
aiwg index snapshot diff <id-a> <id-b> [--graph <name>]              # cross-version set ops
```
- Storage: `.aiwg/.index/.snapshots/<snapshot-id>/<graph>/...` — full copy of the per-graph index dir (metadata.json, dependencies.json, tags.json, stats.json, plus `.db` for sqlite, plus external-edges.jsonl).
- Manifest: `.aiwg/.index/.snapshots/<snapshot-id>/manifest.json` — `{snapshot_id, name?, created, aiwg_version, graphs[], source_checksum}`.
- Registry: `.aiwg/.index/.snapshots/registry.json` lists all snapshots with names, timestamps, parent graph references.
- Atomicity: write to temp dir, rename into place on success; `drop` deletes the whole snapshot dir. Required by `dataset-version` rollback semantics (#844 line 76).
- Size / lifecycle: no automatic garbage collection; `snapshot drop` is operator-driven.

**Backward compatibility**: Additive; does not change live index files.

**Proposed sub-ticket**: `#848-C — Add `aiwg index snapshot` commands with manifest, registry, and atomic rollback`.

### E4. Federated query across snapshots (unblocks cross-version diagnostics)

**Specification**:
- Extend `query`, `neighbors`, `deps`, `stats`, `set` with `--snapshot <id|name>` flag. When present, the command reads from the snapshot's frozen index dir instead of the live `.aiwg/.index/<graph>/`.
- `--snapshot all` queries across every snapshot and returns union keyed by snapshot-id.
- SQLite backend: leverage `ATTACH DATABASE` (already noted in `sqlite-backend.ts:7`) — union queries across snapshot `.db` files as `SELECT ... FROM main.nodes UNION ALL SELECT ... FROM snap_<id>.nodes`.

**Backward compatibility**: Additive flag; absent `--snapshot` preserves current behavior.

**Proposed sub-ticket**: `#848-D — Support `--snapshot <id>` on read-only index commands (query/deps/neighbors/stats/set)`.

### E5. Concept / SKOS hierarchy support (partial — unblocks preference filtering and dataset sharding)

**Recommended minimum for fallback parity**: ship a **user-definable concept graph** rather than a full SKOS implementation.

**Specification**:
- New `edgeExtraction.parser: 'concept-hierarchy'` reads a dedicated concept file (e.g., `.aiwg/concepts.yaml`) with `{id, broader?, narrower?[], related?[], label, altLabels?[]}`.
- Materializes two edge types: `broader` (child→parent) and `narrower` (parent→child).
- `tagSkosMapping`-like file maps flat `tags[]` on existing nodes to concept IDs: `.aiwg/tag-concept-map.yaml`.
- New command `aiwg index concepts expand <tag>` returns all tags in the concept subtree (inclusive of broader ancestors' narrower children within a configurable depth).
- Closure table optional — for now, BFS traversal on query is sufficient for trees ≤ depth 5 (matches Fortemi's NISO Z39.19-2024 target from Phase 4 review).

**Backward compatibility**: Opt-in via user-defined graph; does not affect existing graphs.

**Proposed sub-ticket**: `#848-E — Add concept-hierarchy graph parser + `index concepts expand` command for SKOS-lite hierarchical filtering`. (Defer full SKOS closure / anti-pattern validators to a follow-up.)

### E6. Edge-attr filters on query / neighbors / deps

**Specification**:
- Add `--edge-attr key=value` (repeatable) and `--edge-attr-min confidence=0.7` (numeric comparator) to `deps`, `neighbors`, `set`.
- Implementation: post-filter `TypedEdge.attrs` after traversal; sqlite backend can push into WHERE clause.

**Backward compatibility**: Additive.

**Proposed sub-ticket**: `#848-F — Add `--edge-attr` and `--edge-attr-min` filters to traversal commands`. (Depends on E1.)

### E7. Collection-selector set ops (unblocks decontamination patterns)

**Specification**:
- Extend `aiwg index set` to accept `--selector-a`/`--selector-b` as alternatives to `--node-a`/`--node-b`. Selector shape: `tags=foo,bar` / `type=example` / `path=examples/raw/*` / `edge-type=preference`.
- Evaluates to a node set, then runs the chosen set op.

**Backward compatibility**: Additive; existing `--node-a`/`--node-b` path preserved.

**Proposed sub-ticket**: `#848-G — Extend `index set` with collection selectors for bulk set operations`.

---

## Sub-tickets to File

If the extensions above are accepted, file the following. All are additive; none block on each other except where noted.

| Ticket | Title | Depends on | Effort |
|---|---|---|---|
| `#848-A` | Extend `TypedEdge` with optional edge attributes; round-trip through json/graphology/sqlite backends; bump `INDEX_VERSION` to 1.1.0 | — | S |
| `#848-B` | Add `aiwg index edges add/import/list/remove` subcommand family with rebuild-safe external-edges.jsonl | `#848-A` (for attrs) | M |
| `#848-C` | Add `aiwg index snapshot create/list/show/restore/drop/diff` with atomic rollback and registry | — | M |
| `#848-D` | Support `--snapshot <id>` on read-only index commands (query, deps, neighbors, stats, set) | `#848-C` | M |
| `#848-E` | Add `concept-hierarchy` graph parser + `aiwg index concepts expand` for SKOS-lite hierarchical filtering | — | L |
| `#848-F` | Add `--edge-attr` and `--edge-attr-min` filters to deps/neighbors/set | `#848-A` | S |
| `#848-G` | Extend `index set` with `--selector-a`/`--selector-b` collection selectors | — | S |

**Minimum viable fallback** (what `training-complete` actually needs to ship): `#848-A + #848-B + #848-C`. Without these three, `preference-generator` (#839) and `dataset-version` (#844) cannot target `aiwg index` and ADR-022 D3's "both paths ship from day 1" commitment fails.

**Nice-to-have for parity with Fortemi**: `#848-D` (cross-version diagnostics), `#848-E` (concept filtering), `#848-F` (confidence filters), `#848-G` (bulk set ops).

---

## Backward Compatibility

Summary of impact on existing `aiwg index` consumers:

1. **`TypedEdge` shape change (#848-A)** — additive `attrs?` field. Readers that destructure `{path, type}` are unaffected. Index version bump to 1.1.0 signals capability; `loadGraphIndexFile` continues to accept 1.0.0 files (existing normalization via `normalizeEdge` handles both shapes).

2. **External edges file (#848-B)** — new `.aiwg/.index/<graph>/external-edges.jsonl`. Absent for existing projects; build path gracefully ignores missing file. `--force` semantics extended: previously wiped everything; now preserves `external-edges.jsonl` unless `--clear-external` is passed. **This is the one behavioral change** — document in CHANGELOG and the `index build` help text.

3. **Snapshot directory (#848-C)** — new `.aiwg/.index/.snapshots/`. Hidden prefix matches existing `.index` convention. `findArtifactFiles` already skips hidden dirs (`index-builder.ts:243`) so snapshots are not re-indexed as regular artifacts.

4. **New commands (edges, snapshot, concepts)** — additive subcommands; existing `build/query/deps/stats/neighbors/set/watch` unchanged.

5. **New flags (`--snapshot`, `--edge-attr`, `--selector-*`)** — all optional; absence yields current behavior.

6. **Concept graph (#848-E)** — purely opt-in via user-defined graph config. Zero impact on projects that don't define one.

7. **Deployment** — no changes to `aiwg use` flow; tweaks ship in the `aiwg` CLI itself.

8. **Tests** — update `test/unit/artifacts/*.test.ts` to cover round-tripped edge attrs and snapshot create/restore; existing tests should continue to pass unchanged.

---

## Appendix: File references

- CLI router: `src/artifacts/cli.ts`
- Builder: `src/artifacts/index-builder.ts`
- Types: `src/artifacts/types.ts`
- Backends: `src/artifacts/graph-backend.ts`, `src/artifacts/backends/{json,graphology,sqlite}-backend.ts`
- Query: `src/artifacts/query-engine.ts`, `src/artifacts/graph-query.ts`, `src/artifacts/dep-graph.ts`
- Stats: `src/artifacts/stats.ts`
- Watcher: `src/artifacts/watcher.ts`
- Checksum manifest: `src/artifacts/checksum-manifest.ts`
- Citation parser: `src/artifacts/citation-parser.ts`
- Reader: `src/artifacts/index-reader.ts`
- Reproducibility snapshot (distinct, do not confuse): `src/extensions/commands/definitions.ts:1810`
- Phase 4 gaps: `.aiwg/planning/training-framework/phase-4-fortemi-review.md`
- ADR-022: `.aiwg/architecture/decisions/ADR-022-training-framework.md`
- Preference generator: `agentic/code/frameworks/training-complete/skills/preference-generator/SKILL.md`
- Dataset versioner: `agentic/code/frameworks/training-complete/skills/dataset-version/SKILL.md`
