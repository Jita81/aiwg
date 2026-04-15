"""Alpaca format adapter.

Stanford self-instruct schema — ``{instruction, input, output}`` one JSON
object per line. Fields outside that triple (reasoning traces, tool
calls, metadata, preference shape, etc.) are written to a sidecar
``<output>.metadata.yaml``.
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

from aiwg_training.formats.base import FormatAdapter, read_sidecar


class AlpacaAdapter(FormatAdapter):
    """Canonical ↔ Alpaca JSONL.

    Mapping:
        canonical.input.system  -> alpaca.instruction (falls back to input.user)
        canonical.input.user    -> alpaca.input       ("" when promoted to instruction)
        canonical.output.assistant -> alpaca.output

    Preference records cannot be represented — callers should route those
    to a DPO-specific adapter.
    """

    name = "alpaca"
    extension = ".jsonl"
    native_fields = ("input.user", "output.assistant")

    def to_target(self, records: list[CanonicalRecord]) -> Iterable[dict[str, str]]:
        for r in records:
            if r.is_preference():
                raise NotImplementedError(
                    f"Alpaca has no preference shape; record {r.id} must use a DPO adapter"
                )
            out = r.require_standard_output()
            if r.input.system:
                instruction = r.input.system
                user_input = r.input.user
            else:
                # Promote the user prompt when there is no system prompt.
                instruction = r.input.user
                user_input = ""
            yield {
                "instruction": instruction,
                "input": user_input,
                "output": out.assistant,
            }

    def from_target(self, data: Any) -> list[CanonicalRecord]:
        rows, sidecar = self._split_rows_and_sidecar(data)
        out: list[CanonicalRecord] = []
        for idx, row in enumerate(rows, start=1):
            sc = sidecar.get(idx, {})
            record = self._rebuild(row, sc)
            out.append(record)
        return out

    # ---- Internal ----

    @staticmethod
    def _split_rows_and_sidecar(
        data: Any,
    ) -> tuple[list[dict[str, Any]], dict[int, dict[str, Any]]]:
        if isinstance(data, dict) and "rows" in data:
            rows = list(data["rows"])
            sidecar = data.get("sidecar") or {}
        else:
            rows = list(data)
            sidecar = {}
        return rows, sidecar

    @staticmethod
    def _rebuild(row: dict[str, Any], sidecar_entry: dict[str, Any]) -> CanonicalRecord:
        instruction = row.get("instruction", "") or ""
        user_input = row.get("input", "") or ""
        assistant = row.get("output", "") or ""

        # When a sidecar is present we may reconstitute the exact canonical
        # record. Otherwise we fall back to a best-effort rebuild with
        # synthesized metadata (quality=LOW to flag the reconstruction).
        if user_input:
            system = instruction
            user = user_input
        else:
            system = None
            user = instruction

        out_extra = (sidecar_entry.get("output") or {}) if sidecar_entry else {}
        in_extra = (sidecar_entry.get("input") or {}) if sidecar_entry else {}

        output = OutputPayload(
            assistant=assistant,
            reasoning_trace=out_extra.get("reasoning_trace"),
            tool_calls=out_extra.get("tool_calls"),
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
        task_type = TaskType(task_type_raw) if task_type_raw else TaskType.INSTRUCTION_FOLLOWING

        input_payload = InputPayload(
            user=user,
            system=system,
            context_refs=in_extra.get("context_refs", []) or [],
            tools_available=in_extra.get("tools_available"),
        )

        record_id = sidecar_entry.get("id") if sidecar_entry else None
        if record_id:
            return CanonicalRecord(
                id=record_id,
                task_type=task_type,
                input=input_payload,
                output=output,
                metadata=metadata,
            )
        return CanonicalRecord(
            task_type=task_type,
            input=input_payload,
            output=output,
            metadata=metadata,
        )


# Re-exported for tests that want to mock sidecar IO directly.
_read_sidecar = read_sidecar

__all__ = ["AlpacaAdapter"]
