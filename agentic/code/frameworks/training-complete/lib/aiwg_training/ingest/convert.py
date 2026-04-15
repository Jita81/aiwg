"""Raw-source → :class:`CanonicalRecord` conversion.

Bridges the acquisition layer (staged files on disk) and the canonical
record schema. Phase 2 implements light-weight deterministic converters
for common inputs (markdown, JSONL in known shapes, plain text). Phase 3
adds LLM-driven enrichment via the ``example-synthesizer`` agent.

Conventions:
- Records produced here are tagged ``quality_grade=MODERATE`` as a
  placeholder. Real GRADE assessment happens in the
  ``example-quality-assess`` agent.
- When no structural signal is available (e.g. a flat markdown file with
  no headers), the whole document becomes a single ``COMPLETION``
  record. Phase 3 is expected to split / refine further.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from aiwg_training.core import ProvRecord, now_iso
from aiwg_training.formats.alpaca import AlpacaAdapter
from aiwg_training.formats.sharegpt import ShareGPTAdapter
from aiwg_training.schemas import (
    CanonicalRecord,
    ExampleMetadata,
    InputPayload,
    OutputPayload,
    QualityGrade,
    TaskType,
)

__all__ = [
    "UnknownFormatError",
    "convert_directory",
    "convert_jsonl_to_records",
    "convert_markdown_to_records",
]


# Match H2 / H3 headers at the start of a line.
_HEADER_RE = re.compile(r"^(#{2,3})\s+(.+?)\s*$", re.MULTILINE)


class UnknownFormatError(ValueError):
    """Raised when a JSONL file can't be matched to a known shape."""


def _make_metadata(
    source_id: str,
    license: str,
    provenance_id: str | None = None,
) -> ExampleMetadata:
    """Build the placeholder metadata stamped onto Phase 2 records."""
    return ExampleMetadata(
        quality_grade=QualityGrade.MODERATE,
        license=license,
        provenance_id=provenance_id or ProvRecord().id,
        created_at=now_iso(),
        domain=[],
        source_refs=[source_id],
        created_by_agent="aiwg-training.ingest.convert",
        synthetic=False,
        synthetic_depth=0,
    )


# ---- Markdown -----------------------------------------------------------


def convert_markdown_to_records(
    file_path: Path | str,
    source_id: str,
    license: str,
) -> list[CanonicalRecord]:
    """Chunk a markdown file by H2/H3 headers into records.

    Each chunk becomes a single ``COMPLETION`` record whose ``input.user``
    is the header text and ``output.assistant`` is the section body. When
    the file has no H2/H3 headers, the whole file becomes one record
    whose prompt is the filename stem.
    """
    p = Path(file_path)
    text = p.read_text(encoding="utf-8", errors="replace")
    chunks = _split_markdown_by_header(text)
    if not chunks:
        # No H2/H3 — emit a single record for the whole file.
        chunks = [(p.stem.replace("-", " ").replace("_", " "), text.strip())]

    records: list[CanonicalRecord] = []
    for heading, body in chunks:
        if not body.strip():
            # Skip empty sections outright — they carry no training signal.
            continue
        records.append(
            CanonicalRecord(
                task_type=TaskType.COMPLETION,
                input=InputPayload(
                    user=heading,
                    context_refs=[],
                ),
                output=OutputPayload(assistant=body.strip()),
                metadata=_make_metadata(source_id, license),
            )
        )
    return records


def _split_markdown_by_header(text: str) -> list[tuple[str, str]]:
    """Return ``[(heading, body), ...]`` splits at every H2/H3 header.

    Text appearing before the first H2/H3 is dropped (typically intro
    matter, title, or frontmatter) — Phase 3 can enrich this.
    """
    matches = list(_HEADER_RE.finditer(text))
    if not matches:
        return []
    result: list[tuple[str, str]] = []
    for idx, match in enumerate(matches):
        heading = match.group(2).strip()
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        body = text[start:end].strip()
        result.append((heading, body))
    return result


# ---- JSONL --------------------------------------------------------------


def convert_jsonl_to_records(
    file_path: Path | str,
    source_id: str,
    license: str,
) -> list[CanonicalRecord]:
    """Convert a JSONL file into canonical records.

    Shape detection is done on the first non-empty row:

    * If it carries ``task_type`` + ``input`` + ``output`` → canonical.
    * If it carries ``instruction`` and ``output`` → Alpaca.
    * If it carries ``messages`` or ``conversations`` → dialogue (ChatML /
      ShareGPT).
    * Otherwise :exc:`UnknownFormatError` is raised.
    """
    p = Path(file_path)
    rows = _read_jsonl(p)
    if not rows:
        return []

    first = rows[0]
    shape = _detect_jsonl_shape(first)

    if shape == "canonical":
        records = [CanonicalRecord.model_validate(row) for row in rows]
        # Stamp source_refs if the row didn't carry one already.
        for r in records:
            if not r.metadata.source_refs:
                r.metadata.source_refs = [source_id]
        return records

    if shape == "alpaca":
        adapter = AlpacaAdapter()
        records = adapter.from_target(rows)
        _stamp(records, source_id, license)
        return records

    if shape == "sharegpt":
        adapter = ShareGPTAdapter()
        records = adapter.from_target(rows)
        _stamp(records, source_id, license)
        return records

    if shape == "chatml":
        return _convert_chatml(rows, source_id, license)

    raise UnknownFormatError(
        f"{p}: unrecognised JSONL shape. Supported: canonical, alpaca, "
        "sharegpt, chatml (messages=[{role, content}, ...])"
    )


def _detect_jsonl_shape(row: dict) -> str:
    if isinstance(row, dict):
        if "task_type" in row and "input" in row and "output" in row:
            return "canonical"
        if "instruction" in row and "output" in row:
            return "alpaca"
        if "conversations" in row and isinstance(row["conversations"], list):
            return "sharegpt"
        if "messages" in row and isinstance(row["messages"], list):
            return "chatml"
    return "unknown"


def _read_jsonl(path: Path) -> list[dict]:
    rows: list[dict] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def _convert_chatml(
    rows: list[dict],
    source_id: str,
    license: str,
) -> list[CanonicalRecord]:
    """Convert OpenAI-style ``{messages: [{role, content}, ...]}`` rows."""
    records: list[CanonicalRecord] = []
    for row in rows:
        messages = row.get("messages") or []
        system: str | None = None
        user_parts: list[str] = []
        assistant_parts: list[str] = []
        for msg in messages:
            role = msg.get("role")
            content = msg.get("content", "") or ""
            if role == "system":
                system = content
            elif role == "user":
                user_parts.append(content)
            elif role == "assistant":
                assistant_parts.append(content)
        records.append(
            CanonicalRecord(
                task_type=TaskType.DIALOGUE,
                input=InputPayload(
                    user="\n".join(user_parts),
                    system=system,
                ),
                output=OutputPayload(assistant="\n".join(assistant_parts)),
                metadata=_make_metadata(source_id, license),
            )
        )
    return records


def _stamp(records: list[CanonicalRecord], source_id: str, license: str) -> None:
    """Re-stamp records produced by format adapters with fresh metadata.

    The adapter reconstruction path emits placeholder metadata
    (``license="UNKNOWN"``, ``provenance_id="reconstructed"``). We
    overwrite it with the ingest-time values so downstream GRADE + license
    gates have real data to work with.
    """
    for r in records:
        r.metadata = _make_metadata(source_id, license)


# ---- Directory walker --------------------------------------------------


def convert_directory(
    raw_dir: Path | str,
    source_id: str,
    license: str,
) -> list[CanonicalRecord]:
    """Walk ``raw_dir`` and convert every supported file to canonical records.

    Files whose extension isn't recognised are skipped silently — Phase 3
    can add LLM-driven extraction for the long tail.
    """
    root = Path(raw_dir)
    records: list[CanonicalRecord] = []
    for p in sorted(root.rglob("*")):
        if not p.is_file() or p.name.startswith("."):
            continue
        # Skip the metadata artifacts produced by the acquirer.
        if p.name in {"source.yaml", "fixity.sha256"}:
            continue
        ext = p.suffix.lower()
        try:
            if ext in {".md", ".markdown"}:
                records.extend(convert_markdown_to_records(p, source_id, license))
            elif ext == ".jsonl":
                records.extend(convert_jsonl_to_records(p, source_id, license))
            elif ext == ".txt":
                records.extend(_convert_txt(p, source_id, license))
            # Other extensions (code, pdfs, binaries) are deferred to Phase 3.
        except UnknownFormatError:
            # Keep walking — a single unparseable file shouldn't abort the batch.
            continue
    return records


def _convert_txt(
    path: Path,
    source_id: str,
    license: str,
) -> list[CanonicalRecord]:
    text = path.read_text(encoding="utf-8", errors="replace").strip()
    if not text:
        return []
    return [
        CanonicalRecord(
            task_type=TaskType.COMPLETION,
            input=InputPayload(user=path.stem.replace("-", " ").replace("_", " ")),
            output=OutputPayload(assistant=text),
            metadata=_make_metadata(source_id, license),
        )
    ]
