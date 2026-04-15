"""Canonical training example record.

Mirrors ``schemas/example-record.yaml``. This is the internal representation
every format adapter reads from and writes to.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class TaskType(str, Enum):
    """Canonical task type enum per ``example-record.yaml``."""

    INSTRUCTION_FOLLOWING = "instruction_following"
    REASONING = "reasoning"
    DIALOGUE = "dialogue"
    TOOL_USE = "tool_use"
    CLASSIFICATION = "classification"
    PREFERENCE = "preference"
    COMPLETION = "completion"
    EXTRACTION = "extraction"
    SUMMARIZATION = "summarization"
    TRANSLATION = "translation"
    CODE_GENERATION = "code_generation"
    CODE_REVIEW = "code_review"


class QualityGrade(str, Enum):
    """GRADE assessment tier."""

    HIGH = "HIGH"
    MODERATE = "MODERATE"
    LOW = "LOW"
    VERY_LOW = "VERY_LOW"


class InputPayload(BaseModel):
    """Input side of an example."""

    model_config = ConfigDict(extra="allow")

    user: str = Field(..., description="User-facing prompt or question")
    system: str | None = Field(default=None, description="Optional system prompt")
    context_refs: list[str] = Field(default_factory=list, description="IDs of referenced records")
    tools_available: list[dict[str, Any]] | None = Field(
        default=None, description="Tool schemas when task_type=tool_use"
    )


class OutputPayload(BaseModel):
    """Output side of a standard (non-preference) example."""

    model_config = ConfigDict(extra="allow")

    assistant: str = Field(..., description="Assistant response")
    reasoning_trace: str | None = Field(
        default=None, description="Optional CoT trace (for reasoning datasets)"
    )
    tool_calls: list[dict[str, Any]] | None = Field(
        default=None, description="Tool invocations when task_type=tool_use"
    )


class PreferenceOutput(BaseModel):
    """Output side of a preference record."""

    model_config = ConfigDict(extra="allow")

    chosen: str = Field(..., description="Preferred response")
    rejected: str = Field(..., description="Less-preferred response")
    confidence: float | None = Field(
        default=None, ge=0.0, le=1.0, description="Confidence in the preference direction"
    )
    rationale_note_id: str | None = Field(
        default=None, description="UUID of a rationale note explaining the judgment"
    )


class ExampleMetadata(BaseModel):
    """Metadata fields required on every example."""

    model_config = ConfigDict(extra="allow")

    quality_grade: QualityGrade
    license: str = Field(..., description="SPDX identifier")
    provenance_id: str = Field(..., description="UUID of W3C PROV record for this example")
    created_at: str = Field(..., description="ISO 8601 timestamp")
    difficulty: float | None = Field(default=None, ge=0.0, le=1.0)
    domain: list[str] = Field(default_factory=list)
    source_refs: list[str] = Field(default_factory=list)
    created_by_agent: str | None = Field(default=None)
    synthetic: bool = Field(default=False)
    synthetic_depth: int = Field(default=0, ge=0)

    @field_validator("created_at", mode="before")
    @classmethod
    def _coerce_datetime(cls, v: Any) -> str:
        if isinstance(v, datetime):
            return v.astimezone(timezone.utc).isoformat()
        return str(v)


class CanonicalRecord(BaseModel):
    """A single training example in canonical form.

    When ``task_type == PREFERENCE``, ``output`` is a ``PreferenceOutput``.
    Otherwise it is an ``OutputPayload``.
    """

    model_config = ConfigDict(extra="allow")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    task_type: TaskType
    input: InputPayload
    output: OutputPayload | PreferenceOutput
    metadata: ExampleMetadata

    # ---- Convenience constructors ----

    @classmethod
    def from_jsonl_line(cls, line: str) -> CanonicalRecord:
        """Parse a single JSONL line into a record."""
        return cls.model_validate(json.loads(line))

    @classmethod
    def load_jsonl(cls, path: Path | str) -> list[CanonicalRecord]:
        """Load all records from a JSONL file."""
        p = Path(path)
        with p.open("r", encoding="utf-8") as f:
            return [cls.from_jsonl_line(line) for line in f if line.strip()]

    # ---- Serialization ----

    def to_jsonl_line(self) -> str:
        """Serialize this record to a single JSON line (no trailing newline)."""
        return self.model_dump_json(by_alias=True, exclude_none=False)

    def to_dict(self) -> dict[str, Any]:
        """Serialize to a plain dict (for adapters that build non-JSON structures)."""
        return self.model_dump(mode="json", exclude_none=False)

    # ---- Guards ----

    def is_preference(self) -> bool:
        return self.task_type == TaskType.PREFERENCE

    def require_standard_output(self) -> OutputPayload:
        """Return the standard output or raise if this is a preference record."""
        if self.is_preference():
            raise ValueError(f"Example {self.id} is a preference record, not a standard record")
        assert isinstance(self.output, OutputPayload)  # noqa: S101
        return self.output

    def require_preference_output(self) -> PreferenceOutput:
        """Return the preference output or raise if this is a standard record."""
        if not self.is_preference():
            raise ValueError(f"Example {self.id} is a standard record, not a preference record")
        assert isinstance(self.output, PreferenceOutput)  # noqa: S101
        return self.output


def write_jsonl(records: list[CanonicalRecord], path: Path | str) -> int:
    """Write records to a JSONL file. Returns count written."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("w", encoding="utf-8") as f:
        for r in records:
            f.write(r.to_jsonl_line())
            f.write("\n")
    return len(records)


ROUND_TRIP_INVARIANTS = (
    "id",
    "task_type",
    "input.user",
    "output.assistant",  # preference records use output.chosen instead
    "metadata.quality_grade",
    "metadata.license",
    "metadata.provenance_id",
)
"""Field paths that format adapters MUST preserve across round-trip
(per ``example-record.yaml`` round_trip_invariants section).

Adapters may write unsupported fields to a sidecar ``<output>.metadata.yaml``
to preserve them out-of-band.
"""
