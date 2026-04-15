"""Pydantic schemas for the training-complete framework.

Mirror the YAML schemas in ``../schemas/*.yaml`` with runtime validation.
"""

from aiwg_training.schemas.dataset_manifest import (
    DatasetManifest,
    ReproductionRecipe,
    SourceEntry,
    SplitCounts,
    StorageRef,
    SyntheticRatio,
)
from aiwg_training.schemas.example_record import (
    ROUND_TRIP_INVARIANTS,
    CanonicalRecord,
    ExampleMetadata,
    InputPayload,
    OutputPayload,
    PreferenceOutput,
    QualityGrade,
    TaskType,
    write_jsonl,
)
from aiwg_training.schemas.log_event import (
    BaseEvent,
    DatasetVersionEvent,
    DecontaminationCheckEvent,
    FormatConvertEvent,
    IngestEvent,
    LintEvent,
    PreferenceGenerateEvent,
    SyntheticGenerateEvent,
    append_event,
    read_events,
)

__all__ = [
    "ROUND_TRIP_INVARIANTS",
    "BaseEvent",
    "CanonicalRecord",
    "DatasetManifest",
    "DatasetVersionEvent",
    "DecontaminationCheckEvent",
    "ExampleMetadata",
    "FormatConvertEvent",
    "IngestEvent",
    "InputPayload",
    "LintEvent",
    "OutputPayload",
    "PreferenceGenerateEvent",
    "PreferenceOutput",
    "QualityGrade",
    "ReproductionRecipe",
    "SourceEntry",
    "SplitCounts",
    "StorageRef",
    "SyntheticGenerateEvent",
    "SyntheticRatio",
    "TaskType",
    "append_event",
    "read_events",
    "write_jsonl",
]
