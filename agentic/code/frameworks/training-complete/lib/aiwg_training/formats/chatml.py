"""ChatML / OpenAI messages adapter.

Native structure used by OpenAI fine-tuning, most modern chat models, and
HuggingFace ``apply_chat_template``:

    {"messages": [
        {"role": "system", "content": "..."},
        {"role": "user", "content": "..."},
        {"role": "assistant", "content": "...", "tool_calls": [...]},
        {"role": "tool", "tool_call_id": "t1", "content": "..."}
    ]}

Unlike ShareGPT, ChatML has native first-class support for ``tool_calls``
— tool-using records round-trip losslessly without JSON encoding into
plain-text turns.
"""

from __future__ import annotations

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


class ChatMLAdapter(FormatAdapter):
    """Canonical ↔ ChatML JSONL with native ``tool_calls``."""

    name = "chatml"
    extension = ".jsonl"
    native_fields = (
        "input.system",
        "input.user",
        "output.assistant",
        "output.tool_calls",
    )

    def to_target(self, records: list[CanonicalRecord]) -> Iterable[dict[str, Any]]:
        for r in records:
            if r.is_preference():
                raise NotImplementedError(
                    f"ChatML has no preference shape; record {r.id} must use a DPO adapter"
                )
            out = r.require_standard_output()
            messages: list[dict[str, Any]] = []
            if r.input.system:
                messages.append({"role": "system", "content": r.input.system})
            messages.append({"role": "user", "content": r.input.user})
            assistant_msg: dict[str, Any] = {
                "role": "assistant",
                "content": out.assistant,
            }
            if out.tool_calls:
                assistant_msg["tool_calls"] = out.tool_calls
            messages.append(assistant_msg)
            yield {"messages": messages}

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
        tool_calls: list[dict[str, Any]] | None = None

        for msg in row.get("messages", []):
            role = msg.get("role")
            content = msg.get("content") or ""
            if role == "system":
                system = content
            elif role == "user":
                user_parts.append(content)
            elif role == "assistant":
                assistant_parts.append(content)
                if msg.get("tool_calls"):
                    tool_calls = msg["tool_calls"]
            # tool-role messages are execution results — we retain the
            # canonical record as a tool_use example; downstream
            # reconstruction of tool-result turns lives in the sidecar.

        in_extra = (sidecar_entry.get("input") or {}) if sidecar_entry else {}
        out_extra = (sidecar_entry.get("output") or {}) if sidecar_entry else {}

        output = OutputPayload(
            assistant="\n".join(assistant_parts),
            reasoning_trace=out_extra.get("reasoning_trace"),
            tool_calls=tool_calls if tool_calls is not None else out_extra.get("tool_calls"),
        )
        input_payload = InputPayload(
            user="\n".join(user_parts),
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


__all__ = ["ChatMLAdapter"]
