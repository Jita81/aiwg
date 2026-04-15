---
name: example-quality-assess
description: GRADE quality assessment adapted for individual training examples
namespace: training-complete
category: quality
platforms: [claude, copilot, cursor, factory, windsurf, warp, codex, opencode, openclaw, hermes]
commandHint:
  argumentHint: "<example-id | batch-glob> [--min-grade <HIGH|MODERATE|LOW>] [--report <path>]"
---

# example-quality-assess

Apply the GRADE framework (REF-060) to rate individual training examples — not just their sources. Writes `quality_grade` into each example's metadata and emits an aggregate quality report per dataset version.

## When to Use

- After ingest, before synthesis and publication
- When filtering candidates for a high-quality subset
- As a quality gate before preference pair generation
- During dataset versioning (feeds aggregate quality into dataset manifest)

## Parameters

### `<example-id | batch-glob>` (required)
Either a single example ID or a glob matching multiple examples (e.g., `examples/raw/*`).

### `--min-grade <HIGH|MODERATE|LOW>` (optional)
Only pass examples rated at or above this grade. Default: no filter.

### `--report <path>` (optional)
Write aggregate quality report to this path. Default: `.aiwg/training/reports/quality-<timestamp>.md`.

### `--non-interactive` (optional)
Skip interactive mode (useful for batch).

## Operation

1. **Load example(s)** — via kernel `memory-ingest` consumer interface.
2. **Apply source-level GRADE** — inherited from `acquire-training-source` output (already stored in `metadata.source_refs` lineage).
3. **Apply example-level scoring rules**:

### Upgrade Factors (each +1)

| Factor | Criterion |
|---|---|
| Clear reasoning trace | `output.reasoning_trace` is present and steps are coherent |
| Diverse task type for domain | This example's task type is under-represented in its domain |
| Cross-source corroboration | `source_refs` has 2+ independent sources supporting the same claim |
| Verifiable output | Output can be validated (e.g., code compiles, math correct, citation resolves) |
| Human-written | `synthetic: false` and `synthetic_depth: 0` |

### Downgrade Factors

| Factor | Criterion | Penalty |
|---|---|---|
| Hallucinated citation | `output` cites a source that doesn't resolve | −3 |
| Out-of-distribution | Example topic diverges from declared `domain` | −2 |
| Ambiguous prompt | `input.user` can be interpreted multiple ways | −1 |
| Truncated output | `output.assistant` ends mid-sentence | −1 |
| Unsafe content | Flagged by Llama Guard (REF-443) or similar | −2 |
| Synthetic depth > 1 | Recursion beyond first generation (ADR-022 D10) | −2 |

### Baseline Mapping

Source-level GRADE sets the baseline:

- HIGH source → example starts at **HIGH**
- MODERATE source → starts at **MODERATE**
- LOW source → starts at **LOW**
- VERY LOW source → starts at **VERY LOW**

Apply upgrade / downgrade factors (each adjusts by one tier). Cap at HIGH; floor at VERY LOW.

4. **Write grade** — set `metadata.quality_grade` on the example record.
5. **Apply `--min-grade` filter** — if set, flag examples below threshold for removal or review (does NOT auto-delete per `human-authorization` rule).
6. **Emit aggregate report** — `reports/quality-<timestamp>.md` with:
   - GRADE distribution (counts per tier)
   - Worst-offending examples (top 10 by downgrade score)
   - Domain-level quality breakdown
   - Synthetic vs human quality comparison
   - Recommendations (examples to remove, patterns to investigate)
7. **Log** — `memory-log-append` with op `lint` including findings distribution.

## Integration with Pipeline

- **decontamination-check (#842)**: Low-quality examples still count for overlap. Quality gate happens before decontamination, not after.
- **preference-generator (#839)**: Prefers HIGH-graded examples as "chosen"; LOW-graded as "rejected" candidates.
- **dataset-version (#844)**: Dataset manifest declares minimum grade applied to each split.

## Examples

```bash
# Assess all raw examples with a MODERATE minimum
example-quality-assess "examples/raw/*" --min-grade MODERATE

# Assess a single example
example-quality-assess ex-550e8400

# Generate report to custom path
example-quality-assess "examples/synthesized/*" --report reports/synth-quality-v1.md
```

## Schema Reference

- `@agentic/code/frameworks/sdlc-complete/schemas/research/quality-assessment.yaml` — GRADE schema (reused)
- `@agentic/code/frameworks/training-complete/schemas/example-record.yaml` — target record format (sets `metadata.quality_grade`)

## Delegation

- GRADE framework origin: `@agentic/code/frameworks/research-complete/skills/research-quality/SKILL.md`
- Kernel lint integration: `@agentic/code/addons/semantic-memory/skills/memory-lint/SKILL.md`
- Authorization on removal decisions: `@agentic/code/addons/aiwg-utils/rules/human-authorization.md`

## References

- REF-060 GRADE Handbook — methodology basis
- REF-442 Benchmark Contamination — hallucinated citation criterion
- REF-443 Llama Guard — unsafe content detection
- REF-446 Model Collapse — synthetic recursion penalty rationale
