---
name: format-adapter-alpaca
description: Convert canonical training examples to Alpaca format for training frameworks
namespace: training-complete
category: format
platforms: [claude, copilot, cursor, factory, windsurf, warp, codex, opencode, openclaw, hermes]
commandHint:
  argumentHint: "<input-glob> [--output <path>] [--validate-round-trip]"
---

# format-adapter-alpaca

Convert canonical training example records (`@agentic/code/frameworks/training-complete/schemas/example-record.yaml`) into Alpaca-format JSONL for downstream SFT training frameworks. Alpaca is the original Stanford self-instruct format and remains widely supported by trainers like Axolotl, LLaMA-Factory, and Unsloth.

## When to Use

- Emitting a training split for a tuner that consumes Alpaca JSONL
- Shipping a public dataset in the lowest-common-denominator instruction format
- Interoperating with legacy pipelines that predate ChatML/ShareGPT

## Parameters

- `<input-glob>` (required) — glob of canonical records (e.g., `examples/raw/*.json`)
- `--output <path>` (optional) — output JSONL path. Default: `.aiwg/training/exports/alpaca-<timestamp>.jsonl`
- `--validate-round-trip` (optional) — reload output and diff against canonical invariants before succeeding

## Format Spec

One JSON object per line with fields `{instruction, input, output}`:

```json
{"instruction": "You are a helpful assistant.", "input": "Explain photosynthesis in one sentence.", "output": "Photosynthesis is the process by which plants convert sunlight, water, and CO2 into glucose and oxygen."}
```

## Operation

1. **Load canonical records** — parse each file per `example-record.yaml`; reject invalid records.
2. **Transform** — map fields:
   - `instruction` ← `input.system` (fallback to `input.user` if no system prompt)
   - `input` ← `input.user` (empty string `""` if `input.system` was empty and `input.user` was promoted to `instruction`)
   - `output` ← `output.assistant`
3. **Validate target** — ensure `instruction` and `output` are non-empty; reject preference/tool_use records (not representable — route to sharegpt/chatml adapter).
4. **Round-trip check** (if `--validate-round-trip`) — parse output back and confirm canonical invariants (id, task_type, input.user, output.assistant, quality_grade, license, provenance_id) survive via sidecar.
5. **Write output + log** — emit JSONL, write sidecar, append `format-convert` event via `memory-log-append`.

## Round-Trip Invariants

Alpaca fields cover only `input.user` and `output.assistant`. All other invariant fields (id, task_type, quality_grade, license, provenance_id) are preserved via sidecar.

## Sidecar Metadata

Written alongside output as `<output>.metadata.yaml` — contains a list keyed by line number with: `id`, `task_type`, `metadata.*`, `output.reasoning_trace`, `output.tool_calls`, `input.context_refs`, and `input.tools_available`. Reasoning traces and tool calls are structural losses in Alpaca — always go to sidecar.

## Acceptance Criteria

- Every canonical record produces exactly one Alpaca line (or is rejected with a logged reason).
- `--validate-round-trip` reconstructs canonical invariants 100% from (JSONL + sidecar).
- Preference and tool_use records are rejected with a pointer to the correct adapter.
- A `format-convert` event is logged with input count, output count, and rejection count.

## References

- Alpaca methodology — Taori et al. 2023 (Stanford Alpaca, implied)
- ADR-022 D7 — canonical + adapter strategy

## Delegation

- `@agentic/code/addons/semantic-memory/skills/memory-log-append/SKILL.md` — logging the `format-convert` event
