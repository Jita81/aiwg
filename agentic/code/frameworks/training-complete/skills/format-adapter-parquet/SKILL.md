---
name: format-adapter-parquet
description: Convert canonical training examples to Parquet format for training frameworks
namespace: training-complete
category: format
platforms: [claude, copilot, cursor, factory, windsurf, warp, codex, opencode, openclaw, hermes]
commandHint:
  argumentHint: "<input-glob> [--output <path>] [--validate-round-trip]"
---

# format-adapter-parquet

Convert canonical training example records (`@agentic/code/frameworks/training-complete/schemas/example-record.yaml`) into Apache Parquet files via Apache Arrow — the columnar, compressed, shardable format native to HuggingFace Datasets and high-throughput training pipelines.

## When to Use

- Publishing to HuggingFace Hub (Datasets loads Parquet natively and lazily)
- Large datasets (>100k examples) where JSONL scan cost dominates
- Pipelines that benefit from columnar projection (read only `input.user` + `output.assistant` without materializing metadata)
- Shardable storage for distributed training data loaders

## Parameters

- `<input-glob>` (required) — canonical records (typically the output of `format-adapter-jsonl`)
- `--output <path>` (optional) — default: `.aiwg/training/exports/canonical-<timestamp>.parquet`. Use `<path>/` suffix to shard.
- `--validate-round-trip` (optional) — read Parquet back and verify invariants against input
- `--shard-size <N>` (optional) — rows per shard when producing a directory of Parquet files

## Format Spec

Apache Arrow schema materialized as Parquet — columnar, Snappy-compressed by default, with nested struct columns for `input`, `output`, and `metadata`:

```text
id: string
task_type: string
input: struct<system: string, user: string, context_refs: list<string>, tools_available: list<...>>
output: struct<assistant: string, reasoning_trace: string, tool_calls: list<...>>
metadata: struct<quality_grade: string, license: string, provenance_id: string, created_at: timestamp, domain: list<string>, source_refs: list<string>, difficulty: double, synthetic: bool, synthetic_depth: int32, created_by_agent: string>
```

## Operation

1. **Load canonical records** — parse inputs (commonly JSONL from the identity adapter).
2. **Transform** — build a pyarrow Table with the schema above; coerce timestamps; normalize optional fields to null.
3. **Validate target** — write once to a temp path, reopen, verify column-level schema matches expectation and row count equals input.
4. **Round-trip check** (if `--validate-round-trip`) — reconstruct canonical records from Parquet rows and confirm all `round_trip_invariants` hold.
5. **Write output + log** — finalize single `.parquet` or sharded directory, emit `_metadata` sidecar describing shard layout, append `format-convert` event.

## Round-Trip Invariants

All canonical fields round-trip via nested struct columns. Parquet preserves strong typing and nulls — `id`, `task_type`, `input.user`, `output.assistant`, `metadata.quality_grade`, `metadata.license`, `metadata.provenance_id` all survive verbatim.

## Sidecar Metadata

`<output>.metadata.yaml` (or `_metadata` inside a sharded directory) records: Arrow schema version, compression codec, shard layout, row count per shard, and any columns that were dropped due to cross-record schema inconsistency (should be zero for well-formed inputs).

## Acceptance Criteria

- Output opens cleanly with `pyarrow.parquet.read_table()` and `datasets.load_dataset("parquet", ...)`.
- `--validate-round-trip` reconstructs 100% of canonical invariants.
- Row count equals input record count (minus explicitly rejected schema-invalid inputs).
- `format-convert` event logged with compression ratio and shard count.

## References

- REF-471 — HuggingFace Datasets (Parquet as native storage)
- REF-473 — Apache Arrow + Parquet columnar format
- ADR-022 D7 — canonical + adapter strategy

## Delegation

- `@agentic/code/addons/semantic-memory/skills/memory-log-append/SKILL.md` — logging the `format-convert` event
