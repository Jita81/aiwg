---
name: format-adapter-sharegpt
description: Convert canonical training examples to ShareGPT format for training frameworks
namespace: training-complete
category: format
platforms: [claude, copilot, cursor, factory, windsurf, warp, codex, opencode, openclaw, hermes]
commandHint:
  argumentHint: "<input-glob> [--output <path>] [--validate-round-trip]"
---

# format-adapter-sharegpt

Convert canonical training example records (`@agentic/code/frameworks/training-complete/schemas/example-record.yaml`) into ShareGPT-format JSONL — the multi-turn conversation schema popularized by Axolotl, LLaMA-Factory, and the open-source dialogue tuning community.

## When to Use

- Emitting multi-turn `dialogue` task examples where turn roles matter
- Axolotl training runs (ShareGPT is Axolotl's preferred format for conversations)
- Preserving multi-turn structure that Alpaca flattens away

## Parameters

- `<input-glob>` (required) — glob of canonical records
- `--output <path>` (optional) — default: `.aiwg/training/exports/sharegpt-<timestamp>.jsonl`
- `--validate-round-trip` (optional) — reload output and verify invariants

## Format Spec

One JSON object per line with a `conversations` array of `{from, value}` turns:

```json
{"conversations": [{"from": "system", "value": "You are helpful."}, {"from": "human", "value": "Hello"}, {"from": "gpt", "value": "Hi there!"}]}
```

Role mapping: `system → "system"`, user → `"human"`, assistant → `"gpt"`.

## Operation

1. **Load canonical records** — validate against schema.
2. **Transform** — build `conversations` array:
   - `input.system` → `{from: "system", value: ...}` (if present)
   - `input.user` → `{from: "human", value: ...}`
   - `output.assistant` → `{from: "gpt", value: ...}`
   - Multi-turn: traverse `context_refs` chain to reconstruct prior turns if any.
3. **Validate target** — at least one human + one gpt turn; role sequence alternates sensibly; Axolotl-compatibility check.
4. **Round-trip check** (if `--validate-round-trip`) — rebuild canonical record from conversations + sidecar.
5. **Write output + log** — emit JSONL, write sidecar, append `format-convert` event.

## Round-Trip Invariants

Conversation structure captures `input.system`, `input.user`, `output.assistant`. Preserved via sidecar: `id`, `task_type`, full `metadata`, `reasoning_trace`. Tool calls are inlined into the `gpt` turn value (serialized JSON) when small; otherwise routed to sidecar.

## Sidecar Metadata

`<output>.metadata.yaml` holds per-line: `id`, `task_type`, full `metadata.*`, `output.reasoning_trace`, large `output.tool_calls`, and any `context_refs` that could not be reconstructed as prior turns.

## Acceptance Criteria

- Every canonical record emits a valid ShareGPT conversation (or is rejected with a logged reason).
- Multi-turn sequences preserve role ordering per Axolotl conventions.
- `--validate-round-trip` reconstructs all round-trip invariants.
- `format-convert` event logged with input/output/rejection counts.

## References

- REF-472 — ChatML / ShareGPT / OpenAI messages format comparison
- ADR-022 D7 — canonical + adapter strategy

## Delegation

- `@agentic/code/addons/semantic-memory/skills/memory-log-append/SKILL.md` — logging the `format-convert` event
