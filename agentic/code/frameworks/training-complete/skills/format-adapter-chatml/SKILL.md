---
name: format-adapter-chatml
description: Convert canonical training examples to ChatML format for training frameworks
namespace: training-complete
category: format
platforms: [claude, copilot, cursor, factory, windsurf, warp, codex, opencode, openclaw, hermes]
commandHint:
  argumentHint: "<input-glob> [--output <path>] [--validate-round-trip]"
---

# format-adapter-chatml

Convert canonical training example records (`@agentic/code/frameworks/training-complete/schemas/example-record.yaml`) into ChatML / OpenAI messages format — the native structure used by OpenAI fine-tuning, most modern chat models, and HuggingFace `apply_chat_template`.

## When to Use

- Fine-tuning on OpenAI-compatible APIs (gpt-4o-mini, etc.)
- Training chat models with HuggingFace `SFTTrainer` and a ChatML tokenizer template
- Preserving native `tool_calls` structure without serialization losses

## Parameters

- `<input-glob>` (required) — glob of canonical records
- `--output <path>` (optional) — default: `.aiwg/training/exports/chatml-<timestamp>.jsonl`
- `--validate-round-trip` (optional) — reload output and verify invariants

## Format Spec

One JSON object per line containing a `messages` array with typed roles:

```json
{"messages": [{"role": "system", "content": "You are helpful."}, {"role": "user", "content": "What time is it?"}, {"role": "assistant", "content": null, "tool_calls": [{"id": "t1", "type": "function", "function": {"name": "now", "arguments": "{}"}}]}, {"role": "tool", "tool_call_id": "t1", "content": "12:00"}]}
```

Roles: `system | user | assistant | tool`. Native `tool_calls` on assistant messages.

## Operation

1. **Load canonical records** — validate against schema.
2. **Transform** — build `messages` array:
   - `input.system` → `{role: "system", content: ...}` (if present)
   - `input.user` → `{role: "user", content: ...}`
   - `output.assistant` → `{role: "assistant", content: ...}` with native `tool_calls` attached
   - Tool results (from tool_use chains) → `{role: "tool", tool_call_id, content}`
3. **Validate target** — OpenAI messages schema: non-empty content OR non-empty tool_calls on assistant; valid role enum.
4. **Round-trip check** (if `--validate-round-trip`) — rebuild canonical record and verify invariants.
5. **Write output + log** — emit JSONL, write sidecar, append `format-convert` event.

## Round-Trip Invariants

ChatML preserves `input.system`, `input.user`, `output.assistant`, and `output.tool_calls` natively. Preserved via sidecar: `id`, `task_type`, full `metadata`, `output.reasoning_trace` (ChatML has no first-class CoT field — reasoning lives in sidecar unless using `<thinking>` tags).

## Sidecar Metadata

`<output>.metadata.yaml` holds per-line: `id`, `task_type`, full `metadata.*`, `output.reasoning_trace`, and any `context_refs` / `tools_available` schemas that were not inlined into messages.

## Acceptance Criteria

- Every canonical record emits a valid ChatML message sequence (or is rejected with a logged reason).
- `tool_use` records round-trip without loss (native `tool_calls` used).
- `--validate-round-trip` reconstructs all canonical invariants.
- `format-convert` event logged with input/output/rejection counts.

## References

- REF-472 — ChatML / ShareGPT / OpenAI messages format comparison
- ADR-022 D7 — canonical + adapter strategy

## Delegation

- `@agentic/code/addons/semantic-memory/skills/memory-log-append/SKILL.md` — logging the `format-convert` event
