---
name: format-adapter-jsonl
description: Convert canonical training examples to JSONL format for training frameworks
namespace: training-complete
category: format
platforms: [claude, copilot, cursor, factory, windsurf, warp, codex, opencode, openclaw, hermes]
commandHint:
  argumentHint: "<input-glob> [--output <path>] [--validate-round-trip]"
---

# format-adapter-jsonl

The identity adapter. Emit canonical training example records (`@agentic/code/frameworks/training-complete/schemas/example-record.yaml`) as one-record-per-line JSONL with schema validation. This is the reference serialization for canonical form and the source format consumed by the Parquet adapter.

## When to Use

- Shipping canonical records to tooling that speaks AIWG-native training JSONL
- Acting as the upstream input for `format-adapter-parquet`
- Producing a lossless intermediate that can be fanned out to any other adapter later
- Diagnostics: dump any record set with zero field loss for inspection

## Parameters

- `<input-glob>` (required) — glob of canonical records
- `--output <path>` (optional) — default: `.aiwg/training/exports/canonical-<timestamp>.jsonl`
- `--validate-round-trip` (optional) — reload output and verify byte-level (or structural) equivalence

## Format Spec

One canonical JSON object per line — no transformation, no field dropping:

```json
{"id": "550e8400-...", "task_type": "instruction_following", "input": {"system": "...", "user": "..."}, "output": {"assistant": "..."}, "metadata": {"quality_grade": "HIGH", "license": "CC-BY-4.0", "provenance_id": "prov-...", "created_at": "2026-04-15T01:00:00Z"}}
```

## Operation

1. **Load canonical records** — parse each input file; validate against `example-record.yaml`.
2. **Transform** — identity pass; no field mapping.
3. **Validate target** — re-serialize and confirm every record satisfies `example-record.yaml` validation rules.
4. **Round-trip check** (if `--validate-round-trip`) — reparse output and assert structural equality with input.
5. **Write output + log** — emit JSONL, no sidecar required, append `format-convert` event with `adapter: jsonl` and `lossless: true`.

## Round-Trip Invariants

All fields round-trip. Zero loss. This adapter is the benchmark against which other adapters' invariant preservation is measured.

## Sidecar Metadata

Not required — JSONL preserves the full canonical record. A sidecar is emitted only when callers explicitly request per-line indexing (`<output>.index.yaml` mapping line numbers to record IDs for random access).

## Acceptance Criteria

- Every input record produces exactly one output line; no rejections except for schema-invalid inputs.
- `--validate-round-trip` succeeds with 100% structural equality.
- All `round_trip_invariants` from `example-record.yaml` are preserved verbatim.
- `format-convert` event logged with `lossless: true`.

## References

- `@agentic/code/frameworks/training-complete/schemas/example-record.yaml` — source-of-truth schema
- ADR-022 D7 — canonical + adapter strategy (this adapter is the canonical serialization)

## Delegation

- `@agentic/code/addons/semantic-memory/skills/memory-log-append/SKILL.md` — logging the `format-convert` event
