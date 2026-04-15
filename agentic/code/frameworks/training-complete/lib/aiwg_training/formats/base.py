"""Format adapter abstract base class.

Every format adapter subclasses :class:`FormatAdapter` and provides a
round-trip between :class:`CanonicalRecord` and the target format.

Adapters MUST preserve the fields listed in
:data:`aiwg_training.schemas.ROUND_TRIP_INVARIANTS`, either natively in
the target format or via a sidecar file written alongside the output.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

import yaml

from aiwg_training.schemas import (
    ROUND_TRIP_INVARIANTS,
    CanonicalRecord,
    OutputPayload,
    PreferenceOutput,
)


class RoundTripError(Exception):
    """Raised when a round-trip through an adapter loses an invariant field."""


@dataclass
class RoundTripReport:
    """Result of :func:`validate_round_trip`.

    ``ok`` is True only when every canonical invariant survives the
    round-trip for every record. ``missing`` enumerates per-record losses.
    """

    ok: bool
    total: int
    missing: list[dict[str, Any]] = field(default_factory=list)

    def __bool__(self) -> bool:  # pragma: no cover - convenience
        return self.ok


def _get_invariant(record: CanonicalRecord, path: str) -> Any:
    """Resolve a dotted invariant path on a canonical record.

    ``output.assistant`` is special-cased for preference records where the
    equivalent field is ``output.chosen``.
    """
    obj: Any = record
    parts = path.split(".")

    # Preference records substitute chosen for assistant.
    if path == "output.assistant" and record.is_preference():
        parts = ["output", "chosen"]

    for part in parts:
        if obj is None:
            return None
        if isinstance(obj, dict):
            obj = obj.get(part)
        else:
            obj = getattr(obj, part, None)
    return obj


def validate_round_trip(
    records: list[CanonicalRecord],
    adapter: FormatAdapter,
) -> RoundTripReport:
    """Run ``canonical -> target -> canonical`` and diff the invariants.

    The adapter's :meth:`FormatAdapter.to_target` and
    :meth:`FormatAdapter.from_target` are composed in-memory — no files
    are written. Preservation of invariants via sidecar metadata is out
    of scope for this helper; pair with :meth:`FormatAdapter.write` +
    :meth:`FormatAdapter.read` to exercise the on-disk path.
    """
    missing: list[dict[str, Any]] = []
    target_payload = list(adapter.to_target(records))
    reconstructed = adapter.from_target(target_payload)

    by_id = {r.id: r for r in reconstructed}

    for original in records:
        rebuilt = by_id.get(original.id)
        if rebuilt is None:
            missing.append({"id": original.id, "lost": ["<entire record>"]})
            continue
        lost: list[str] = []
        for inv in ROUND_TRIP_INVARIANTS:
            a = _get_invariant(original, inv)
            b = _get_invariant(rebuilt, inv)
            if a != b:
                lost.append(inv)
        if lost:
            missing.append({"id": original.id, "lost": lost})

    return RoundTripReport(ok=not missing, total=len(records), missing=missing)


def _extract_sidecar_payload(record: CanonicalRecord, native_fields: set[str]) -> dict[str, Any]:
    """Build the sidecar dict for a single record.

    ``native_fields`` enumerates the dotted paths the target format stores
    natively. Everything else in the canonical record lands in the sidecar.
    """
    dumped = record.to_dict()
    payload: dict[str, Any] = {
        "id": record.id,
        "task_type": record.task_type.value,
        "metadata": dumped.get("metadata", {}),
    }

    # Always include structural losses that adapters commonly drop.
    out = dumped.get("output") or {}
    if isinstance(record.output, OutputPayload):
        if record.output.reasoning_trace is not None and "output.reasoning_trace" not in native_fields:
            payload.setdefault("output", {})["reasoning_trace"] = record.output.reasoning_trace
        if record.output.tool_calls and "output.tool_calls" not in native_fields:
            payload.setdefault("output", {})["tool_calls"] = record.output.tool_calls
    elif isinstance(record.output, PreferenceOutput):
        # Preference records are structural — keep the full output in the sidecar.
        payload["output"] = out

    inp = dumped.get("input") or {}
    if inp.get("context_refs"):
        payload.setdefault("input", {})["context_refs"] = inp["context_refs"]
    if inp.get("tools_available") and "input.tools_available" not in native_fields:
        payload.setdefault("input", {})["tools_available"] = inp["tools_available"]

    # Spill unknown extras preserved by Pydantic extra="allow".
    known = {"id", "task_type", "input", "output", "metadata"}
    extras = {k: v for k, v in dumped.items() if k not in known}
    if extras:
        payload["extras"] = extras
    return payload


def write_sidecar(
    records: list[CanonicalRecord],
    output_path: Path | str,
    native_fields: Iterable[str],
) -> Path:
    """Write ``<output>.metadata.yaml`` with per-line canonical metadata.

    Sidecar rows are keyed by 1-based line number matching the target
    format's record ordering. Returns the written path.
    """
    native = set(native_fields)
    sidecar_path = Path(str(output_path) + ".metadata.yaml")
    sidecar_path.parent.mkdir(parents=True, exist_ok=True)

    entries: dict[int, dict[str, Any]] = {}
    for idx, record in enumerate(records, start=1):
        entries[idx] = _extract_sidecar_payload(record, native)

    with sidecar_path.open("w", encoding="utf-8") as f:
        yaml.safe_dump(
            {"version": 1, "records": entries},
            f,
            sort_keys=False,
            allow_unicode=True,
        )
    return sidecar_path


def read_sidecar(output_path: Path | str) -> dict[int, dict[str, Any]]:
    """Load a sidecar written by :func:`write_sidecar`.

    Returns an empty dict when the sidecar is missing — callers should
    treat absence as "no extra metadata to merge".
    """
    sidecar_path = Path(str(output_path) + ".metadata.yaml")
    if not sidecar_path.exists():
        return {}
    with sidecar_path.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    records = data.get("records", {}) or {}
    # YAML may deserialize integer keys as int already; normalize.
    return {int(k): v for k, v in records.items()}


class FormatAdapter(ABC):
    """Abstract base class for all format adapters.

    Subclasses define :attr:`name`, :attr:`extension`, and the two
    transformation methods. :meth:`write` and :meth:`read` provide the
    default on-disk path (JSONL for most adapters, overridden for
    columnar formats like Parquet).

    ``native_fields`` lists the canonical dotted paths the target format
    preserves natively — used by :meth:`write` to decide whether a
    sidecar is required.
    """

    name: str = ""
    extension: str = ".jsonl"
    native_fields: tuple[str, ...] = ()

    @abstractmethod
    def to_target(self, records: list[CanonicalRecord]) -> Iterable[Any]:
        """Transform canonical records into target-format records."""

    @abstractmethod
    def from_target(self, data: Any) -> list[CanonicalRecord]:
        """Reverse :meth:`to_target`.

        ``data`` is typically the iterable returned by :meth:`to_target`
        or a list read back from disk. Adapters may consult a sidecar via
        :func:`read_sidecar` when reading from a path (see
        :meth:`read`).
        """

    # ---- Default on-disk path (JSONL) ----

    def write(
        self,
        records: list[CanonicalRecord],
        path: Path | str,
        *,
        write_sidecar_file: bool = True,
    ) -> Path:
        """Write records to ``path`` as JSONL and (optionally) a sidecar."""
        import json

        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        with p.open("w", encoding="utf-8") as f:
            for item in self.to_target(records):
                f.write(json.dumps(item, ensure_ascii=False))
                f.write("\n")

        if write_sidecar_file and self._needs_sidecar():
            write_sidecar(records, p, self.native_fields)
        return p

    def read(self, path: Path | str) -> list[CanonicalRecord]:
        """Read JSONL from ``path`` and merge the sidecar if present."""
        import json

        p = Path(path)
        rows: list[dict[str, Any]] = []
        with p.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                rows.append(json.loads(line))

        sidecar = read_sidecar(p)
        return self.from_target({"rows": rows, "sidecar": sidecar})

    # ---- Helpers ----

    def _needs_sidecar(self) -> bool:
        """True when any canonical invariant is not covered natively."""
        native = set(self.native_fields)
        for inv in ROUND_TRIP_INVARIANTS:
            if inv not in native:
                return True
        return False


__all__ = [
    "FormatAdapter",
    "RoundTripError",
    "RoundTripReport",
    "validate_round_trip",
    "write_sidecar",
    "read_sidecar",
]
