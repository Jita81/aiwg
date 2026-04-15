"""Field extraction helpers for ``DatasetDocsGenerator``.

These helpers compute derived values that the dataset-docs templates need
(quality distribution, markdown tables, bullet lists, decontamination
summary). They are intentionally small, pure functions so tests can exercise
them in isolation.
"""

from __future__ import annotations

import re
from collections import Counter
from pathlib import Path
from typing import TYPE_CHECKING, Iterable

from aiwg_training.schemas.example_record import QualityGrade

if TYPE_CHECKING:
    from aiwg_training.schemas.dataset_manifest import SourceEntry, SplitCounts
    from aiwg_training.schemas.example_record import CanonicalRecord


def compute_quality_distribution(
    examples: Iterable["CanonicalRecord"],
) -> dict[QualityGrade, int]:
    """Count examples by GRADE tier.

    Returns a dict keyed by every ``QualityGrade`` (zero-filled) so callers
    can render a stable table regardless of which grades are present.
    """
    counts: Counter[QualityGrade] = Counter()
    for ex in examples:
        counts[ex.metadata.quality_grade] += 1
    # Zero-fill every grade for a stable rendering order
    return {grade: counts.get(grade, 0) for grade in QualityGrade}


def format_quality_distribution(
    distribution: dict[QualityGrade, int],
) -> str:
    """Render a quality distribution dict as a small markdown table."""
    total = sum(distribution.values())
    lines = ["| Grade | Count | Percent |", "|-------|-------|---------|"]
    for grade in QualityGrade:
        count = distribution.get(grade, 0)
        pct = (count / total * 100.0) if total else 0.0
        lines.append(f"| {grade.value} | {count} | {pct:.1f}% |")
    return "\n".join(lines)


def format_sources_table(sources: list["SourceEntry"]) -> str:
    """Render a list of ``SourceEntry`` as a markdown table.

    Columns: ``REF ID``, ``License``, ``Example count``, ``Quality grade``.
    Returns the literal ``(no sources listed)`` if the list is empty so the
    rendered doc does not leave a dangling heading.
    """
    if not sources:
        return "(no sources listed)"
    lines = [
        "| REF ID | License | Example count | Quality grade |",
        "|--------|---------|---------------|---------------|",
    ]
    for src in sources:
        lines.append(
            f"| {src.ref_id} | {src.license} | {src.example_count} | {src.quality_grade} |"
        )
    return "\n".join(lines)


def format_bullet_list(items: Iterable[str]) -> str:
    """Render an iterable of strings as a markdown bullet list."""
    items = [str(x).strip() for x in items if str(x).strip()]
    if not items:
        return "(none)"
    return "\n".join(f"- {item}" for item in items)


def format_split_summary(split_counts: "SplitCounts") -> str:
    """One-line textual summary of split counts."""
    total = split_counts.total
    return (
        f"train={split_counts.train}, "
        f"validation={split_counts.validation}, "
        f"test={split_counts.test} "
        f"(total={total})"
    )


# --------------------------------------------------------------------------- #
# Decontamination report parsing                                              #
# --------------------------------------------------------------------------- #


_SUMMARY_LINE = re.compile(
    r"^-\s+\*\*(?P<key>[^*]+?):\*\*\s+(?P<value>.+?)\s*$"
)


def read_decontamination_report(report_path: Path | str) -> dict[str, str] | None:
    """Parse a rendered decontamination report for its summary block.

    The decontamination skill renders a markdown report with a ``## Summary``
    section whose bullets follow ``- **key:** value``. We tolerate small
    layout drift (blank lines, trailing fields, case of heading).

    Returns a dict of ``key -> value`` strings or ``None`` if the file does
    not exist or no summary section is found.
    """
    p = Path(report_path)
    if not p.exists():
        return None

    text = p.read_text(encoding="utf-8")
    summary: dict[str, str] = {}
    in_summary = False
    for raw in text.splitlines():
        line = raw.rstrip()
        if line.strip().lower().startswith("## summary"):
            in_summary = True
            continue
        if in_summary and line.startswith("## "):
            break
        if in_summary:
            match = _SUMMARY_LINE.match(line)
            if match:
                key = match.group("key").strip().lower().replace(" ", "_")
                summary[key] = match.group("value").strip()
    return summary or None


def format_decontamination_summary(summary: dict[str, str] | None) -> str:
    """Render a parsed decontamination summary as a bullet list."""
    if not summary:
        return "(no decontamination report available)"
    lines = []
    for key, value in summary.items():
        label = key.replace("_", " ").title()
        lines.append(f"- **{label}:** {value}")
    return "\n".join(lines)
