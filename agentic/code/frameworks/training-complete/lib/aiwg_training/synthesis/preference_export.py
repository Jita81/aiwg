"""Export preference ``CanonicalRecord`` objects to training formats.

Four output formats — DPO, KTO, ORPO, SimPO — all writing JSONL to disk.
Input records must have ``task_type=PREFERENCE`` and ``output`` must be a
``PreferenceOutput``; non-preference records are skipped with a warning log.

References:
    - REF-376 DPO — ``{prompt, chosen, rejected}``
    - REF-391 KTO — ``{prompt, completion, label}`` (2 records per pair)
    - REF-392 ORPO — DPO shape + odds-ratio metadata
    - REF-393 SimPO — DPO-compatible + avg-log-prob hint metadata
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable, Literal

from aiwg_training.schemas import CanonicalRecord, PreferenceOutput, TaskType

ExportFormat = Literal["dpo", "kto", "orpo", "simpo"]


def _preference_only(records: Iterable[CanonicalRecord]) -> list[CanonicalRecord]:
    """Filter to valid preference records only."""
    out: list[CanonicalRecord] = []
    for r in records:
        if r.task_type != TaskType.PREFERENCE:
            continue
        if not isinstance(r.output, PreferenceOutput):
            continue
        if not isinstance(r.input.user, str) or not r.input.user:
            continue
        out.append(r)
    return out


def _write_jsonl_dicts(rows: list[dict[str, Any]], output_path: Path | str) -> int:
    """Low-level writer: serialize list-of-dicts to JSONL."""
    p = Path(output_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False))
            f.write("\n")
    return len(rows)


def export_dpo(records: Iterable[CanonicalRecord], output_path: Path | str) -> int:
    """Write DPO-format JSONL: ``{prompt, chosen, rejected}``."""
    prefs = _preference_only(records)
    rows: list[dict[str, Any]] = []
    for rec in prefs:
        pref: PreferenceOutput = rec.output  # type: ignore[assignment]
        rows.append({
            "prompt": rec.input.user,
            "chosen": pref.chosen,
            "rejected": pref.rejected,
        })
    return _write_jsonl_dicts(rows, output_path)


def export_kto(records: Iterable[CanonicalRecord], output_path: Path | str) -> int:
    """Write KTO-format JSONL: ``{prompt, completion, label}``.

    KTO requires *unpaired* labeled examples. Each preference record
    contributes two rows: chosen→label=true and rejected→label=false.
    """
    prefs = _preference_only(records)
    rows: list[dict[str, Any]] = []
    for rec in prefs:
        pref: PreferenceOutput = rec.output  # type: ignore[assignment]
        rows.append({
            "prompt": rec.input.user,
            "completion": pref.chosen,
            "label": True,
        })
        rows.append({
            "prompt": rec.input.user,
            "completion": pref.rejected,
            "label": False,
        })
    return _write_jsonl_dicts(rows, output_path)


def export_orpo(records: Iterable[CanonicalRecord], output_path: Path | str) -> int:
    """Write ORPO-format JSONL: DPO shape + ``odds_ratio_metadata``.

    ORPO training consumes DPO triples plus an odds-ratio hint derived
    from the preference confidence. We expose ``ratio: confidence`` so
    the trainer can scale the odds-ratio term per-pair.
    """
    prefs = _preference_only(records)
    rows: list[dict[str, Any]] = []
    for rec in prefs:
        pref: PreferenceOutput = rec.output  # type: ignore[assignment]
        confidence = pref.confidence if pref.confidence is not None else 0.0
        rows.append({
            "prompt": rec.input.user,
            "chosen": pref.chosen,
            "rejected": pref.rejected,
            "odds_ratio_metadata": {
                "ratio": confidence,
                "source_confidence": confidence,
            },
        })
    return _write_jsonl_dicts(rows, output_path)


def export_simpo(records: Iterable[CanonicalRecord], output_path: Path | str) -> int:
    """Write SimPO-format JSONL: DPO triples + avg-log-prob hint metadata.

    SimPO is reference-model-free; we attach a ``length_normalized_hint``
    with basic length stats so downstream scripts can compute the average
    log-probability margin without re-tokenizing.
    """
    prefs = _preference_only(records)
    rows: list[dict[str, Any]] = []
    for rec in prefs:
        pref: PreferenceOutput = rec.output  # type: ignore[assignment]
        rows.append({
            "prompt": rec.input.user,
            "chosen": pref.chosen,
            "rejected": pref.rejected,
            "length_normalized_hint": {
                "chosen_len_chars": len(pref.chosen),
                "rejected_len_chars": len(pref.rejected),
                "avg_log_prob_available": False,
            },
        })
    return _write_jsonl_dicts(rows, output_path)


def export(
    records: Iterable[CanonicalRecord],
    format: str,
    output_path: Path | str,
) -> int:
    """Dispatch to the right format writer. Returns number of rows written."""
    fmt = format.strip().lower()
    if fmt == "dpo":
        return export_dpo(records, output_path)
    if fmt == "kto":
        return export_kto(records, output_path)
    if fmt == "orpo":
        return export_orpo(records, output_path)
    if fmt == "simpo":
        return export_simpo(records, output_path)
    raise ValueError(
        f"Unknown preference export format: {format!r}. "
        "Choose one of: dpo, kto, orpo, simpo."
    )


__all__ = [
    "ExportFormat",
    "export",
    "export_dpo",
    "export_kto",
    "export_orpo",
    "export_simpo",
]
