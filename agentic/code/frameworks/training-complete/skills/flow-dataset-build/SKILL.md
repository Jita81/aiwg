---
name: flow-dataset-build
description: End-to-end training dataset pipeline — acquire sources through publication
namespace: training-complete
category: flow
platforms: [claude, copilot, cursor, factory, windsurf, warp, codex, opencode, openclaw, hermes]
commandHint:
  argumentHint: "<config-file> [--stages <stage1,stage2,...>] [--dry-run] [--version <v>] [--interactive]"
---

# Flow: Dataset Build

End-to-end orchestrator that runs the full corpus-to-dataset pipeline in a single invocation, chaining every downstream training-complete skill from acquisition through published dataset version.

## When to Use

- You have a pipeline config file and want a complete dataset with one command
- You are re-running a known-good pipeline against a new source manifest or a new version
- You need a reproducible, auditable build with per-stage logs and a pipeline-level report
- You want human authorization gates before expensive/irreversible stages

Do NOT use this flow for ad hoc experiments; invoke individual stage skills directly when iterating on a single stage.

## Parameters

- `<config-file>` — path to pipeline config YAML specifying sources, synthesis patterns, preference mode, format targets, decontamination targets (see schema below)
- `--stages <list>` — comma-separated subset of stages to run (default: all). Example: `--stages acquire,quality-assess`
- `--dry-run` — simulate every stage; validate config, print intended actions, write no artifacts
- `--version <v>` — target version string for published dataset (overrides `config.version_pattern` default)
- `--interactive` — pause at every stage boundary for human approval (per `@native-ux-tools` rule)
- `--continue-on-warn` — do not block on WARNING-level lint findings (default: strict; ERROR always blocks)
- `--acknowledge-license-risk` — bypass license-check gate on ERROR (requires explicit acknowledgement in pipeline report)
- `--acknowledge-contamination` — bypass decontamination gate on ERROR (same requirement)

## Default Pipeline (10 Stages)

1. **acquire** — run `acquire-training-source` once per source declared in `config.sources`. Writes raw corpus to `.aiwg/training/working/<run-id>/raw/`.
2. **quality-assess** — run `example-quality-assess` against sources and raw examples. Emits GRADE-style quality scores per source and per example.
3. **license-check** — lint gate. Block on ERROR-level license findings unless `--acknowledge-license-risk` supplied. Incompatible licenses fail the pipeline here.
4. **synthesize** — run `example-synthesizer` if `config.synthesis` declares patterns. Optional; skipped silently if absent.
5. **synthetic-bulk** — run `synthetic-data-generator` if `config.synthetic_generator_config` present. Optional.
6. **preference** — run `preference-generator` if `config.preference_generation` declares a mode (DPO/RLHF/constitutional). Optional.
7. **format** — run format adapters per `config.format_exports`: any of `alpaca`, `sharegpt`, `chatml`, `jsonl`, `parquet`. Each adapter is a separate skill.
8. **decontamination** — run `decontamination-check` against `config.decontamination_targets` plus default targets (MMLU, HumanEval, GSM8K, HellaSwag, TruthfulQA, ARC, Winogrande).
9. **decontamination-gate** — lint gate. Block on ERROR-level contamination overlap unless `--acknowledge-contamination` supplied.
10. **publish** — run `dataset-version`. Creates manifest, SHA-256 fixity, W3C PROV provenance record, and archive snapshot at `datasets/<version>.yaml`.

### Stage Selection

- `--stages acquire,quality-assess` runs only those two stages.
- Prerequisite stages skipped explicitly emit a **WARNING** (e.g., running `format` without `quality-assess` is permitted but flagged).
- Config may declare `skip_stages: [synthetic-bulk]` to default-skip a stage every run.
- Stage dependencies (informational, not enforced): `acquire → quality-assess → license-check → {synthesize, synthetic-bulk, preference} → format → decontamination → decontamination-gate → publish`.

### Human Authorization Gates

Per `@human-authorization` rule, the pipeline pauses for explicit human approval at these points:

- **Between stages 3 and 4** — after license-check passes, before invoking synthesis. Synthesis is expensive and rework is painful; confirm license posture first.
- **Between stages 9 and 10** — after decontamination passes, before publishing. Publishing creates an immutable versioned artifact.
- **Every stage boundary** — when `--interactive` is set.

Gates use the platform-native question tool when available (AskUserQuestion on Claude Code; fallback to formatted stdout elsewhere).

## Config File Schema

```yaml
# pipeline-config.yaml
version_pattern: "v{major}.{minor}.{patch}"   # overridden by --version
split_ratios:
  train: 0.9
  validation: 0.05
  test: 0.05

sources:
  - uri: "hf://datasets/example/source1"
    license: "apache-2.0"
  - uri: "https://example.com/corpus.jsonl"
    license: "cc-by-4.0"

license_policy:
  allowlist: ["apache-2.0", "mit", "cc-by-4.0", "cc0-1.0"]
  blocklist: ["cc-by-nc-4.0", "proprietary"]

synthesis:                        # optional — omit to skip stage 4
  patterns: ["qa-rewrite", "chain-of-thought"]
  max_examples: 5000

synthetic_generator_config:       # optional — omit to skip stage 5
  backend: "openai:gpt-4o"
  target_count: 10000

preference_generation:            # optional — omit to skip stage 6
  mode: "dpo"                     # dpo | rlhf | constitutional
  rater_model: "claude-opus-4"

format_exports: ["alpaca", "jsonl", "parquet"]

decontamination_targets:
  - "mmlu"
  - "humaneval"
  - "custom:./eval/internal-holdout.jsonl"

skip_stages: []                   # e.g., ["synthetic-bulk"] to default-skip
```

## Error Handling

- Any stage error aborts the pipeline immediately.
- `--continue-on-warn` downgrades WARNING-level lint findings to informational; ERRORs still abort.
- Partial outputs are preserved in `.aiwg/training/working/<run-id>/` for post-mortem and resumption.
- Resumption is manual: re-invoke with `--stages <remaining-stages>` pointing at the same run-id.

## Output

- **Per-stage logs** — every stage appends structured events via `memory-log-append` to the run-scoped log at `.aiwg/training/working/<run-id>/events.jsonl`.
- **Pipeline-level report** — human-readable Markdown at `.aiwg/training/reports/pipeline-<version>-<timestamp>.md` summarizing each stage, gate decisions, authorization records, and final artifact pointers.
- **Final artifact** — `datasets/<version>.yaml` manifest plus sibling outputs (provenance, fixity, archive snapshot) produced by `dataset-version`.
- **Activity log entry** — per `@activity-log` rule, one line appended to `.aiwg/activity.log`.

## Examples

```bash
# Full pipeline
aiwg flow-dataset-build ./configs/instruct-v3.yaml --version v3.1.0

# Subset: acquire and quality-assess only (dry run iteration)
aiwg flow-dataset-build ./configs/instruct-v3.yaml \
  --stages acquire,quality-assess

# Dry-run the whole pipeline to validate config before committing compute
aiwg flow-dataset-build ./configs/instruct-v3.yaml \
  --dry-run --version v3.1.0-rc.1
```

## Delegation

Downstream skills invoked by this flow:

- `acquire-training-source` — stage 1
- `example-quality-assess` — stage 2
- `example-synthesizer` — stage 4
- `synthetic-data-generator` — stage 5
- `preference-generator` — stage 6
- `format-adapter-alpaca`, `format-adapter-sharegpt`, `format-adapter-chatml`, `format-adapter-jsonl`, `format-adapter-parquet` — stage 7
- `decontamination-check` — stage 8
- `dataset-version` — stage 10

## References

- ADR-022 Section D2 — training dataset pipeline architecture
- `@human-authorization` rule — authorization gate requirements
- `@native-ux-tools` rule — interactive prompt patterns
- `@activity-log` rule — post-run logging requirement
