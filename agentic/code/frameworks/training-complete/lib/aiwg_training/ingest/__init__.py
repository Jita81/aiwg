"""Ingest layer — source acquisition and raw → canonical conversion.

Public API:

- :class:`SourceAcquirer` — stages a source into ``raw/<source-id>/``,
  produces fixity + source.yaml + provenance.
- :class:`AcquisitionResult` — dataclass returned by every acquirer.
- :exc:`LicenseRequiredError` — raised when a source lacks a license and
  ``--allow-unlicensed`` was not set.
- :func:`detect_format` — classify a raw directory into ``code`` / ``docs``
  / ``papers`` / ``dialogues`` / ``mixed``.
- :func:`convert_markdown_to_records`, :func:`convert_jsonl_to_records`,
  :func:`convert_directory` — raw → :class:`CanonicalRecord` converters.
- :exc:`UnknownFormatError` — raised by the JSONL converter when the shape
  can't be matched.
"""

from aiwg_training.ingest.acquire import (
    AcquisitionResult,
    LicenseRequiredError,
    SourceAcquirer,
    detect_format,
)
from aiwg_training.ingest.convert import (
    UnknownFormatError,
    convert_directory,
    convert_jsonl_to_records,
    convert_markdown_to_records,
)

__all__ = [
    "AcquisitionResult",
    "LicenseRequiredError",
    "SourceAcquirer",
    "UnknownFormatError",
    "convert_directory",
    "convert_jsonl_to_records",
    "convert_markdown_to_records",
    "detect_format",
]
