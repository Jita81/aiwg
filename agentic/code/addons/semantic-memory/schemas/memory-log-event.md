# Memory Log Event Schema

## Overview

Every kernel operation appends a single JSON object (one line) to the consumer's `.log.jsonl` file. This schema defines the required and operation-specific fields.

**Storage**: `.aiwg/<namespace>/.log.jsonl` (append-only JSON Lines)
**Rendered view**: `.aiwg/<namespace>/log.md` (generated on demand by `memory-log-render`)

## Required Fields (all events)

| Field | Type | Description |
|-------|------|-------------|
| `ts` | string (ISO 8601) | Timestamp of the operation |
| `op` | string (enum) | Operation type — see below |
| `consumer` | string | Consumer ID (e.g., `research-complete`, `sdlc-complete`) |
| `actor` | string | Model or agent that performed the operation |

## Operation Types

### `ingest`

Source material processed into semantic memory.

| Field | Type | Description |
|-------|------|-------------|
| `source` | string | Path or URI of ingested source |
| `pages_touched` | string[] | Derived pages created or updated |
| `contradictions` | number | Count of contradictions flagged |
| `provenance_id` | string? | W3C PROV record ID (if `ingestRequires` includes provenance) |
| `duration_ms` | number | Processing time in milliseconds |

```jsonl
{"ts":"2026-04-14T14:32:17Z","op":"ingest","consumer":"research-complete","source":"papers/anthropic-2024-constitutional.pdf","pages_touched":["knowledge/entities/anthropic.md","knowledge/concepts/constitutional-ai.md","summaries/2024-constitutional-ai.md"],"contradictions":0,"actor":"claude-opus-4-6","duration_ms":14203}
```

### `lint`

Health check performed on semantic memory.

| Field | Type | Description |
|-------|------|-------------|
| `findings` | object | Counts grouped by severity: `{ error, warning, suggestion }` |
| `auto_fixed` | number? | Count of findings auto-fixed (when `--fix` used) |
| `duration_ms` | number | Processing time in milliseconds |

```jsonl
{"ts":"2026-04-14T14:45:02Z","op":"lint","consumer":"research-complete","findings":{"error":0,"warning":2,"suggestion":5},"actor":"claude-opus-4-6","duration_ms":3401}
```

### `query-capture`

Query synthesis captured as a durable page.

| Field | Type | Description |
|-------|------|-------------|
| `query_summary` | string | Brief description of the captured query |
| `page_created` | string | Path of the newly created page |
| `page_type` | string | Type of page (synthesis, comparison, analysis, gap) |
| `refs_added` | string[] | Cross-references added to the new page |

```jsonl
{"ts":"2026-04-14T15:10:33Z","op":"query-capture","consumer":"research-complete","query_summary":"Comparison of constitutional AI approaches","page_created":"synthesis/constitutional-ai-comparison.md","page_type":"comparison","refs_added":["entities/anthropic.md","concepts/constitutional-ai.md"],"actor":"claude-opus-4-6"}
```

### `log-render`

Rendered view regenerated from JSON Lines source.

| Field | Type | Description |
|-------|------|-------------|
| `entries_rendered` | number | Total log entries processed |
| `output` | string | Path to rendered markdown file |

```jsonl
{"ts":"2026-04-14T16:00:00Z","op":"log-render","consumer":"research-complete","entries_rendered":47,"output":".aiwg/research/log.md","actor":"claude-opus-4-6"}
```

### `index-rebuild`

Master index file regenerated.

| Field | Type | Description |
|-------|------|-------------|
| `pages_indexed` | number | Total pages in rebuilt index |
| `output` | string | Path to index file |

```jsonl
{"ts":"2026-04-14T16:01:00Z","op":"index-rebuild","consumer":"research-complete","pages_indexed":142,"output":".aiwg/research/index.md","actor":"claude-opus-4-6"}
```

## Rendered View Convention

The `memory-log-render` skill converts `.log.jsonl` into `log.md` with this line prefix:

```markdown
## [YYYY-MM-DD] <op> | <subject>
```

This convention makes the rendered log greppable with unix tools:

```bash
grep "^## \[" log.md | tail -5          # Last 5 operations
grep "ingest" .log.jsonl | jq .source   # All ingested sources
```

## Compatibility

This format is compatible with the existing `activity-log` rule in `aiwg-utils`. The kernel's `memory-log-append` skill also appends an entry to `.aiwg/activity.log` per that rule, ensuring the unified cross-framework timeline remains intact.
