---
name: acquire-training-source
description: Acquire a training data source with license validation and delegate ingest to the semantic memory kernel
namespace: training-complete
category: ingest
platforms: [claude, copilot, cursor, factory, windsurf, warp, codex, opencode, openclaw, hermes]
commandHint:
  argumentHint: "<source> [--license <spdx>] [--allow-unlicensed] [--format <type>]"
---

# acquire-training-source

Acquire a training data source — filesystem directory, URL, git repo, or existing AIWG research REF — with license validation and format detection. Delegates ingest mechanics to the semantic memory kernel.

## When to Use

- You have a corpus (GitHub repo, paper collection, conversation dataset, docs site) and want to turn it into training data
- You need to track license, provenance, and source-level quality per training example

## Parameters

### `<source>` (required)
Source location. Supported forms:
- `file:/path/to/dir` — local filesystem directory
- `file:/path/to/file.{md,txt,json,jsonl,pdf}` — single file
- `https://...` — URL (document, tarball, API endpoint)
- `git:<repo-url>` — git repository (shallow clone)
- `ref:REF-XXX` — existing AIWG research REF (reuse corpus)

### `--license <spdx>` (optional)
SPDX license identifier for the source. Required unless `--allow-unlicensed` is set. See https://spdx.org/licenses/ for valid identifiers.

### `--allow-unlicensed` (optional)
Override the license-required gate. Emits a warning and tags the source `license: unknown` in metadata. Examples derived from unlicensed sources inherit `unknown` and will be blocked by `license-check` lint at publication time.

### `--format <type>` (optional)
Hint the expected format: `code`, `docs`, `papers`, `dialogues`, `mixed`. Used by downstream synthesis skills. Auto-detected if omitted.

## Operation

1. **Resolve source** — parse the input form. For `ref:REF-XXX`, look up the REF in `.aiwg/research/` and reuse its files as the source.
2. **License gate** — fail unless `--license` is provided or `--allow-unlicensed` is set. For `ref:` sources, inherit the REF's declared license.
3. **Format detection** — if `--format` is not given, scan file extensions + sampled content to classify (code / docs / papers / dialogues / mixed).
4. **Stage raw source** — copy or download into `.aiwg/training/raw/<source-id>/`.
5. **Delegate ingest** — call `memory-ingest --consumer training-complete --source .aiwg/training/raw/<source-id>/`. Kernel handles:
   - Reading files per topology contract
   - Creating example note per document (granularity per ADR-022 D4)
   - Writing to `derivedPages.rawExamples`
   - Cross-references and index update
6. **Record source-level metadata** — write `source.yaml` in the raw dir capturing:
   - `source_id`, `source_type`, `acquired_at`, `acquired_by`
   - `license` (SPDX), `license_source` (declared vs inherited)
   - `format_detected`
   - `file_count`, `total_bytes`, `sha256_manifest_ref`
7. **Create provenance record** — W3C PROV Entity for the source + Activity for acquisition, via existing `provenance-create` skill.
8. **Log** — `memory-log-append` with op `ingest` (inherited from kernel) plus source-level summary.

## Retained Research-Side Layers

The kernel handles ingest mechanics. This skill retains training-specific layers on top:

- **License validation** — fail-closed without SPDX declaration
- **Format detection** — classifies for downstream synthesis hints
- **REF reuse** — first-class support for `ref:REF-XXX` sources to pull from existing research corpus
- **Source-level fixity** — SHA-256 manifest at source level for reproducibility

## Error Handling

- **Unlicensed source without override** — fail with clear instructions to use `--license` or `--allow-unlicensed`
- **Invalid SPDX identifier** — fail with pointer to https://spdx.org/licenses/
- **Source unreachable** (URL, git) — retry once, then fail with network detail
- **Ingest pipeline failure** — delegate error to kernel; surface with source context

## Examples

```bash
# Acquire a GitHub repo as training source
acquire-training-source git:https://github.com/rust-lang/rust --license "Apache-2.0 OR MIT" --format code

# Reuse a research REF as a training source
acquire-training-source ref:REF-375 --format papers

# Acquire a local directory
acquire-training-source file:/home/user/datasets/code-review --license MIT

# Acquire unlicensed source (emits warning)
acquire-training-source https://example.com/dataset.tar.gz --allow-unlicensed
```

## Schema Reference

- `@agentic/code/frameworks/training-complete/schemas/example-record.yaml` — target example format
- `@agentic/code/frameworks/sdlc-complete/schemas/research/license-metadata.yaml` — SPDX tracking

## Delegation

- Ingest mechanics: `@agentic/code/addons/semantic-memory/skills/memory-ingest/SKILL.md`
- Research-side acquisition patterns: `@agentic/code/frameworks/research-complete/skills/research-acquire/SKILL.md`
- Provenance: `@agentic/code/frameworks/sdlc-complete/skills/provenance-create/SKILL.md`
- Integrity manifests: `@agentic/code/frameworks/media-curator/skills/integrity-verification/SKILL.md`
