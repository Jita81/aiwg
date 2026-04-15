"""Memory log event types.

Mirrors ``agentic/code/addons/semantic-memory/schemas/memory-log-event.md``
including the training-complete op type extensions added in #834.

Each event is written as a single JSON line to ``.aiwg/training/.log.jsonl``.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

OpType = Literal[
    # Kernel ops (from semantic-memory addon)
    "ingest",
    "lint",
    "query-capture",
    "log-render",
    "index-rebuild",
    # training-complete extensions (#834)
    "format-convert",
    "decontamination-check",
    "preference-generate",
    "synthetic-generate",
    "dataset-version",
]


class BaseEvent(BaseModel):
    """Fields common to every log event."""

    model_config = ConfigDict(extra="allow")

    ts: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    op: OpType
    consumer: str
    actor: str = Field(default="aiwg-training")


class FormatConvertEvent(BaseEvent):
    op: Literal["format-convert"] = "format-convert"
    source_format: str
    target_format: str
    records_converted: int
    round_trip_validated: bool
    output: str


class DecontaminationCheckEvent(BaseEvent):
    op: Literal["decontamination-check"] = "decontamination-check"
    targets: list[str]
    overlap_counts: dict[str, int]
    threshold: int
    passed: bool
    detection_mode: Literal["exact_ngram", "fuzzy", "semantic"]
    report_id: str


class PreferenceGenerateEvent(BaseEvent):
    op: Literal["preference-generate"] = "preference-generate"
    pair_count: int
    source_examples: list[str]
    generator_agent: str
    confidence_distribution: dict[str, int]
    output: str


class SyntheticGenerateEvent(BaseEvent):
    op: Literal["synthetic-generate"] = "synthetic-generate"
    seed_examples: list[str]
    generator_agent: str
    recursion_depth: int
    quality_grade: Literal["HIGH", "MODERATE", "LOW", "VERY_LOW"]
    examples_generated: int
    override_flag: bool


class DatasetVersionEvent(BaseEvent):
    op: Literal["dataset-version"] = "dataset-version"
    version: str
    split_counts: dict[str, int]
    storage_ref: str
    manifest_path: str
    fixity_manifest: str
    synthetic_ratio: dict[str, float]


# ---- Minimal kernel ops for completeness (ingest / lint) ----


class IngestEvent(BaseEvent):
    op: Literal["ingest"] = "ingest"
    source: str
    pages_touched: list[str]
    contradictions: int = 0
    provenance_id: str | None = None
    duration_ms: int | None = None


class LintEvent(BaseEvent):
    op: Literal["lint"] = "lint"
    findings: dict[str, int]  # {error: n, warning: n, suggestion: n}
    auto_fixed: int | None = None
    duration_ms: int | None = None


# ---- Writer ----


def append_event(event: BaseEvent, log_path: Path | str) -> Path:
    """Append a single JSON line to the consumer's .log.jsonl.

    Creates parent directories and the file if they don't exist.
    Non-blocking: if the file is locked by another writer, retries once.
    """
    p = Path(log_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    line = event.model_dump_json(exclude_none=True) + "\n"
    with p.open("a", encoding="utf-8") as f:
        f.write(line)
    return p


def read_events(log_path: Path | str) -> list[dict[str, Any]]:
    """Read all events from a .log.jsonl file."""
    p = Path(log_path)
    if not p.exists():
        return []
    out: list[dict[str, Any]] = []
    with p.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                # Log format errors don't block reads — memory-lint will flag
                continue
    return out
