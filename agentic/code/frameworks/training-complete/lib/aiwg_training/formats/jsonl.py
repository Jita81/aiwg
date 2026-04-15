"""Canonical JSONL identity adapter.

Pass-through adapter that emits the canonical record shape verbatim. Useful
as a reference implementation and as an input source for columnar adapters
like :mod:`aiwg_training.formats.parquet`.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable

from aiwg_training.schemas import ROUND_TRIP_INVARIANTS, CanonicalRecord

from aiwg_training.formats.base import FormatAdapter


class CanonicalJsonlAdapter(FormatAdapter):
    """Identity adapter — canonical JSONL in, canonical JSONL out.

    All canonical fields are preserved natively; no sidecar is written.
    """

    name = "jsonl"
    extension = ".jsonl"
    # Identity format covers every invariant natively.
    native_fields = tuple(ROUND_TRIP_INVARIANTS) + (
        "input.system",
        "input.context_refs",
        "input.tools_available",
        "output.reasoning_trace",
        "output.tool_calls",
    )

    def to_target(self, records: list[CanonicalRecord]) -> Iterable[dict[str, Any]]:
        for r in records:
            yield r.to_dict()

    def from_target(self, data: Any) -> list[CanonicalRecord]:
        rows = self._coerce_rows(data)
        return [CanonicalRecord.model_validate(row) for row in rows]

    @staticmethod
    def _coerce_rows(data: Any) -> list[dict[str, Any]]:
        if isinstance(data, dict) and "rows" in data:
            return list(data["rows"])
        return list(data)

    def _needs_sidecar(self) -> bool:  # pragma: no cover - trivial override
        return False

    def write(
        self,
        records: list[CanonicalRecord],
        path: Path | str,
        *,
        write_sidecar_file: bool = False,
    ) -> Path:
        """Write JSONL without a sidecar — the identity format is lossless."""
        return super().write(records, path, write_sidecar_file=False)


__all__ = ["CanonicalJsonlAdapter"]
