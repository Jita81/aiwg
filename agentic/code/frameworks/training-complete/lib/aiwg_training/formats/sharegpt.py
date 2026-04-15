"""ShareGPT format adapter.

Multi-turn conversation schema used by Axolotl, LLaMA-Factory, and the
broader open-source dialogue-tuning community:

    {"conversations": [{"from": "system|human|gpt|tool", "value": "..."}]}

Role mapping: ``system -> "system"``, user ``-> "human"``, assistant
``-> "gpt"``, tool results ``-> "tool"``.
"""

from __future__ import annotations

import json
from typing import Any, Iterable

from aiwg_training.schemas import (
    CanonicalRecord,
    ExampleMetadata,
    InputPayload,
    OutputPayload,
    QualityGrade,
    TaskType,
)

from aiwg_training.formats.base import FormatAdapter


class ShareGPTAdapter(FormatAdapter):
    """Canonical ↔ ShareGPT JSONL.

    Multi-turn preserved via canonical ``input.context_refs``: adapters
    that have access to referenced records can prepend them as prior
    turns. This adapter is self-contained — it serializes the current
    record's turns and relies on the sidecar for structural metadata.
    """

    name = "sharegpt"
    extension = ".jsonl"
    native_fields = ("input.system", "input.user", "output.assistant")

    def to_target(self, records: list[CanonicalRecord]) -> Iterable[dict[str, Any]]:
        for r in records:
            if r.is_preference():
                raise NotImplementedError(
                    f"ShareGPT has no preference shape; record {r.id} must use a DPO adapter"
                )
            out = r.require_standard_output()
            conversations: list[dict[str, str]] = []
            if r.input.system:
                conversations.append({"from": "system", "value": r.input.system})
            conversations.append({"from": "human", "value": r.input.user})
            conversations.append({"from": "gpt", "value": out.assistant})
            # Embed small tool calls as a follow-up tool turn. Large
            # payloads are routed to the sidecar by the base class.
            if out.tool_calls:
                serialized = json.dumps(out.tool_calls, ensure_ascii=False)
                if len(serialized) <= 2048:
                    conversations.append({"from": "tool", "value": serialized})
            yield {"conversations": conversations}

    def from_target(self, data: Any) -> list[CanonicalRecord]:
        rows, sidecar = self._split(data)
        out: list[CanonicalRecord] = []
        for idx, row in enumerate(rows, start=1):
            out.append(self._rebuild(row, sidecar.get(idx, {})))
        return out

    # ---- Internal ----

    @staticmethod
    def _split(data: Any) -> tuple[list[dict[str, Any]], dict[int, dict[str, Any]]]:
        if isinstance(data, dict) and "rows" in data:
            return list(data["rows"]), data.get("sidecar") or {}
        return list(data), {}

    @staticmethod
    def _rebuild(row: dict[str, Any], sidecar_entry: dict[str, Any]) -> CanonicalRecord:
        system: str | None = None
        user_parts: list[str] = []
        assistant_parts: list[str] = []
        tool_turns: list[dict[str, Any]] = []

        for turn in row.get("conversations", []):
            who = turn.get("from")
            value = turn.get("value", "") or ""
            if who == "system":
                system = value
            elif who == "human":
                user_parts.append(value)
            elif who == "gpt":
                assistant_parts.append(value)
            elif who == "tool":
                # Attempt to deserialize JSON-encoded tool payloads.
                try:
                    parsed = json.loads(value)
                    if isinstance(parsed, list):
                        tool_turns.extend(parsed)
                    else:
                        tool_turns.append(parsed)
                except json.JSONDecodeError:
                    tool_turns.append({"raw": value})

        user_text = "\n".join(user_parts)
        assistant_text = "\n".join(assistant_parts)

        in_extra = (sidecar_entry.get("input") or {}) if sidecar_entry else {}
        out_extra = (sidecar_entry.get("output") or {}) if sidecar_entry else {}

        # Sidecar-provided tool calls win — they are the authoritative copy.
        tool_calls = out_extra.get("tool_calls") or (tool_turns or None)

        output = OutputPayload(
            assistant=assistant_text,
            reasoning_trace=out_extra.get("reasoning_trace"),
            tool_calls=tool_calls,
        )

        input_payload = InputPayload(
            user=user_text,
            system=system,
            context_refs=in_extra.get("context_refs", []) or [],
            tools_available=in_extra.get("tools_available"),
        )

        md_src = sidecar_entry.get("metadata") if sidecar_entry else None
        if md_src:
            metadata = ExampleMetadata.model_validate(md_src)
        else:
            metadata = ExampleMetadata(
                quality_grade=QualityGrade.LOW,
                license="UNKNOWN",
                provenance_id="reconstructed",
                created_at="1970-01-01T00:00:00+00:00",
            )

        task_type_raw = sidecar_entry.get("task_type") if sidecar_entry else None
        task_type = TaskType(task_type_raw) if task_type_raw else TaskType.DIALOGUE

        kwargs: dict[str, Any] = {
            "task_type": task_type,
            "input": input_payload,
            "output": output,
            "metadata": metadata,
        }
        record_id = sidecar_entry.get("id") if sidecar_entry else None
        if record_id:
            kwargs["id"] = record_id
        return CanonicalRecord(**kwargs)


__all__ = ["ShareGPTAdapter"]
