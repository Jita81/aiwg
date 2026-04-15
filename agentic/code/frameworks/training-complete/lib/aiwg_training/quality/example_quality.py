"""Per-example GRADE quality assessment (``example-quality-assess`` skill).

Implements the scoring rules from ``skills/example-quality-assess/SKILL.md``
at the record level. Some factors are evaluated deterministically from record
fields (synthetic depth, human-written, cross-source corroboration, truncated
output); the remaining subjective factors (clear reasoning, ambiguous prompt,
hallucinated citation, out-of-distribution topic) are delegated to an LLM via
:class:`aiwg_training.synthesis.llm_client.LLMClient`.

Baseline mapping:

- HIGH source → example starts at **HIGH**
- MODERATE → MODERATE
- LOW → LOW
- VERY_LOW → VERY_LOW

Each upgrade adjusts the grade up by one tier; each downgrade adjusts by the
stated tier count. Final grade is capped at HIGH and floored at VERY_LOW.

Usage:

.. code-block:: python

    from aiwg_training.synthesis import LLMClient
    from aiwg_training.quality import QualityAssessor, LicenseChecker

    llm = LLMClient()
    assessor = QualityAssessor(llm_client=llm, license_checker=LicenseChecker())
    assessment = assessor.assess(record)
    report = assessor.assess_batch(records, min_grade=QualityGrade.MODERATE)
    assessor.write_report(report, Path("reports/quality-v1.md"))
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any

from aiwg_training.schemas.example_record import (
    CanonicalRecord,
    OutputPayload,
    PreferenceOutput,
    QualityGrade,
)

if TYPE_CHECKING:
    from aiwg_training.quality.license_check import LicenseChecker


# ---------------------------------------------------------------------------
# Scoring tables (from SKILL.md)
# ---------------------------------------------------------------------------

# Upgrade factors — each worth +1 tier.
UPGRADE_FACTORS: tuple[str, ...] = (
    "clear_reasoning",
    "diverse_task_type",
    "cross_source_corroboration",
    "verifiable_output",
    "human_written",
)

# Downgrade factors — each worth the listed penalty (tier count).
DOWNGRADE_FACTORS: dict[str, int] = {
    "hallucinated_citation": 3,
    "out_of_distribution": 2,
    "ambiguous_prompt": 1,
    "truncated_output": 1,
    "unsafe_content": 2,
    "synthetic_depth": 2,
}

# Grade ordering, most-severe first.
_GRADE_ORDER: tuple[QualityGrade, ...] = (
    QualityGrade.VERY_LOW,
    QualityGrade.LOW,
    QualityGrade.MODERATE,
    QualityGrade.HIGH,
)


def _grade_index(g: QualityGrade) -> int:
    return _GRADE_ORDER.index(g)


def _index_to_grade(i: int) -> QualityGrade:
    i = max(0, min(i, len(_GRADE_ORDER) - 1))
    return _GRADE_ORDER[i]


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------


@dataclass
class QualityAssessment:
    """Result of assessing a single record."""

    record_id: str
    grade: QualityGrade
    source_baseline: QualityGrade
    upgrades_applied: list[str] = field(default_factory=list)
    downgrades_applied: list[dict[str, Any]] = field(default_factory=list)
    # ``{"factor": str, "penalty": int, "severity": str?}`` per entry.
    notes: str = ""
    llm_response_summary: str = ""

    @property
    def net_adjustment(self) -> int:
        """Net tier delta from baseline (positive = upgrade)."""
        up = len(self.upgrades_applied)
        down = sum(d.get("penalty", 0) for d in self.downgrades_applied)
        return up - down

    @property
    def total_penalty(self) -> int:
        return sum(d.get("penalty", 0) for d in self.downgrades_applied)


@dataclass
class QualityReport:
    """Aggregate report across a batch of assessments."""

    total_records: int
    distribution: dict[QualityGrade, int] = field(default_factory=dict)
    worst_offenders: list[QualityAssessment] = field(default_factory=list)
    domain_breakdown: dict[str, dict[QualityGrade, int]] = field(default_factory=dict)
    synthetic_vs_human: dict[str, dict[QualityGrade, int]] = field(default_factory=dict)
    recommendations: list[str] = field(default_factory=list)
    min_grade: QualityGrade | None = None
    below_threshold_ids: list[str] = field(default_factory=list)
    generated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ---------------------------------------------------------------------------
# QualityAssessor
# ---------------------------------------------------------------------------


# JSON schema hint passed to the LLM — keep minimal; model fills the rest.
_LLM_SCHEMA_HINT: dict[str, Any] = {
    "factors_present": ["list of upgrade factor names the example satisfies"],
    "factors_absent_with_penalty": [
        {"factor": "downgrade factor name", "severity": "low|medium|high"}
    ],
    "notes": "one-sentence summary of your reasoning",
}

_LLM_UPGRADE_CANDIDATES = ("clear_reasoning", "diverse_task_type")
_LLM_DOWNGRADE_CANDIDATES = (
    "hallucinated_citation",
    "out_of_distribution",
    "ambiguous_prompt",
)


class QualityAssessor:
    """Applies GRADE scoring to individual training examples.

    Parameters
    ----------
    llm_client:
        Any object implementing the ``LLMClient`` duck type (``complete_json``).
        Use :class:`aiwg_training.synthesis.MockLLMClient` in tests.
    license_checker:
        Optional :class:`LicenseChecker`. Not currently consulted in scoring,
        but reserved for future "license mismatch" downgrade rules.
    use_llm:
        When False, skip the subjective LLM pass and score purely from
        deterministic rules. Useful for offline / dry-run reports.
    """

    def __init__(
        self,
        llm_client: Any,
        license_checker: LicenseChecker | None = None,
        use_llm: bool = True,
    ) -> None:
        self.llm = llm_client
        self.license_checker = license_checker
        self.use_llm = use_llm

    # ------------------------------------------------------------------
    # Single-record assessment
    # ------------------------------------------------------------------

    def assess(
        self,
        record: CanonicalRecord,
        source_baseline: QualityGrade | None = None,
    ) -> QualityAssessment:
        """Assess one record and return a :class:`QualityAssessment`."""
        baseline = source_baseline or record.metadata.quality_grade or QualityGrade.MODERATE

        upgrades: list[str] = []
        downgrades: list[dict[str, Any]] = []

        # --- Deterministic factors ---
        # Human-written upgrade.
        if not record.metadata.synthetic and record.metadata.synthetic_depth == 0:
            upgrades.append("human_written")

        # Cross-source corroboration (2+ distinct refs).
        if len({r for r in record.metadata.source_refs if r}) >= 2:
            upgrades.append("cross_source_corroboration")

        # Synthetic depth penalty.
        if record.metadata.synthetic_depth > 1:
            downgrades.append(
                {
                    "factor": "synthetic_depth",
                    "penalty": DOWNGRADE_FACTORS["synthetic_depth"],
                    "reason": f"synthetic_depth={record.metadata.synthetic_depth}",
                }
            )

        # Truncated-output heuristic (standard records only).
        if not record.is_preference():
            out = record.output if isinstance(record.output, OutputPayload) else None
            if out is not None and _looks_truncated(out.assistant):
                downgrades.append(
                    {
                        "factor": "truncated_output",
                        "penalty": DOWNGRADE_FACTORS["truncated_output"],
                        "reason": "output does not end with terminal punctuation",
                    }
                )

        # --- LLM-driven factors ---
        llm_summary = ""
        if self.use_llm:
            llm_data = self._llm_assess(record)
            llm_summary = str(llm_data.get("notes", ""))[:280]

            for f in llm_data.get("factors_present", []):
                name = str(f).strip().lower()
                if name in _LLM_UPGRADE_CANDIDATES and name not in upgrades:
                    upgrades.append(name)

            for entry in llm_data.get("factors_absent_with_penalty", []):
                if not isinstance(entry, dict):
                    continue
                name = str(entry.get("factor", "")).strip().lower()
                if name not in _LLM_DOWNGRADE_CANDIDATES:
                    continue
                # Avoid duplicating deterministic penalties.
                if any(d["factor"] == name for d in downgrades):
                    continue
                penalty = DOWNGRADE_FACTORS.get(name, 1)
                downgrades.append(
                    {
                        "factor": name,
                        "penalty": penalty,
                        "severity": str(entry.get("severity", "")).lower() or None,
                    }
                )

        # --- Aggregate ---
        idx = _grade_index(baseline) + len(upgrades) - sum(d["penalty"] for d in downgrades)
        final_grade = _index_to_grade(idx)

        return QualityAssessment(
            record_id=record.id,
            grade=final_grade,
            source_baseline=baseline,
            upgrades_applied=upgrades,
            downgrades_applied=downgrades,
            notes=self._compose_notes(baseline, final_grade, upgrades, downgrades),
            llm_response_summary=llm_summary,
        )

    # ------------------------------------------------------------------
    # Batch assessment
    # ------------------------------------------------------------------

    def assess_batch(
        self,
        records: list[CanonicalRecord],
        min_grade: QualityGrade | None = None,
    ) -> QualityReport:
        """Assess many records and return an aggregate :class:`QualityReport`."""
        assessments: list[QualityAssessment] = [self.assess(r) for r in records]

        distribution: dict[QualityGrade, int] = dict(
            Counter(a.grade for a in assessments)
        )
        for g in QualityGrade:
            distribution.setdefault(g, 0)

        # Domain breakdown.
        by_domain: dict[str, dict[QualityGrade, int]] = {}
        for record, a in zip(records, assessments):
            domains = record.metadata.domain or ["<none>"]
            for d in domains:
                by_domain.setdefault(d, {g: 0 for g in QualityGrade})
                by_domain[d][a.grade] += 1

        # Synthetic vs human.
        synth_vs_human: dict[str, dict[QualityGrade, int]] = {
            "synthetic": {g: 0 for g in QualityGrade},
            "human": {g: 0 for g in QualityGrade},
        }
        for record, a in zip(records, assessments):
            bucket = "synthetic" if record.metadata.synthetic else "human"
            synth_vs_human[bucket][a.grade] += 1

        # Worst offenders — largest net penalty, tie-break by record_id for stability.
        worst = sorted(
            assessments,
            key=lambda a: (-a.total_penalty, a.record_id),
        )[:10]

        # Below-threshold IDs.
        below: list[str] = []
        if min_grade is not None:
            cutoff = _grade_index(min_grade)
            below = [a.record_id for a in assessments if _grade_index(a.grade) < cutoff]

        recommendations = self._build_recommendations(
            assessments, distribution, synth_vs_human, min_grade, below
        )

        return QualityReport(
            total_records=len(records),
            distribution=distribution,
            worst_offenders=worst,
            domain_breakdown=by_domain,
            synthetic_vs_human=synth_vs_human,
            recommendations=recommendations,
            min_grade=min_grade,
            below_threshold_ids=below,
        )

    # ------------------------------------------------------------------
    # Report writing
    # ------------------------------------------------------------------

    def write_report(self, report: QualityReport, output_path: Path | str) -> Path:
        """Render a :class:`QualityReport` to a Markdown file; return the path."""
        p = Path(output_path)
        p.parent.mkdir(parents=True, exist_ok=True)

        lines: list[str] = []
        lines.append("# Example Quality Report")
        lines.append("")
        lines.append(f"- Generated: `{report.generated_at}`")
        lines.append(f"- Records assessed: **{report.total_records}**")
        if report.min_grade is not None:
            lines.append(f"- Minimum grade threshold: **{report.min_grade.value}**")
            lines.append(f"- Below threshold: **{len(report.below_threshold_ids)}**")
        lines.append("")

        # Distribution.
        lines.append("## GRADE distribution")
        lines.append("")
        lines.append("| Grade | Count | Share |")
        lines.append("| --- | ---: | ---: |")
        total = max(report.total_records, 1)
        for g in reversed(_GRADE_ORDER):  # HIGH → VERY_LOW
            count = report.distribution.get(g, 0)
            pct = 100.0 * count / total
            lines.append(f"| {g.value} | {count} | {pct:.1f}% |")
        lines.append("")

        # Synthetic vs human.
        lines.append("## Synthetic vs human")
        lines.append("")
        lines.append("| Bucket | HIGH | MODERATE | LOW | VERY_LOW |")
        lines.append("| --- | ---: | ---: | ---: | ---: |")
        for bucket in ("human", "synthetic"):
            row = report.synthetic_vs_human.get(bucket, {})
            lines.append(
                f"| {bucket} | "
                f"{row.get(QualityGrade.HIGH, 0)} | "
                f"{row.get(QualityGrade.MODERATE, 0)} | "
                f"{row.get(QualityGrade.LOW, 0)} | "
                f"{row.get(QualityGrade.VERY_LOW, 0)} |"
            )
        lines.append("")

        # Domain breakdown.
        if report.domain_breakdown:
            lines.append("## Domain breakdown")
            lines.append("")
            lines.append("| Domain | HIGH | MODERATE | LOW | VERY_LOW |")
            lines.append("| --- | ---: | ---: | ---: | ---: |")
            for domain in sorted(report.domain_breakdown):
                row = report.domain_breakdown[domain]
                lines.append(
                    f"| {domain} | "
                    f"{row.get(QualityGrade.HIGH, 0)} | "
                    f"{row.get(QualityGrade.MODERATE, 0)} | "
                    f"{row.get(QualityGrade.LOW, 0)} | "
                    f"{row.get(QualityGrade.VERY_LOW, 0)} |"
                )
            lines.append("")

        # Worst offenders.
        if report.worst_offenders:
            lines.append("## Worst offenders (top 10 by penalty)")
            lines.append("")
            lines.append("| Record ID | Grade | Baseline | Penalty | Factors |")
            lines.append("| --- | --- | --- | ---: | --- |")
            for a in report.worst_offenders:
                factors = ", ".join(d["factor"] for d in a.downgrades_applied) or "—"
                lines.append(
                    f"| `{a.record_id}` | {a.grade.value} | {a.source_baseline.value} | "
                    f"{a.total_penalty} | {factors} |"
                )
            lines.append("")

        # Recommendations.
        if report.recommendations:
            lines.append("## Recommendations")
            lines.append("")
            for r in report.recommendations:
                lines.append(f"- {r}")
            lines.append("")

        # Below-threshold list (truncated).
        if report.below_threshold_ids:
            preview = report.below_threshold_ids[:50]
            lines.append(f"## Below-threshold records ({len(report.below_threshold_ids)})")
            lines.append("")
            lines.append("_No auto-deletion performed. Review per `human-authorization` rule._")
            lines.append("")
            for rid in preview:
                lines.append(f"- `{rid}`")
            if len(report.below_threshold_ids) > len(preview):
                remaining = len(report.below_threshold_ids) - len(preview)
                lines.append(f"- … and {remaining} more")
            lines.append("")

        p.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return p

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _llm_assess(self, record: CanonicalRecord) -> dict[str, Any]:
        """Ask the LLM which subjective factors apply to this example."""
        example_payload = {
            "id": record.id,
            "task_type": record.task_type.value,
            "domain": record.metadata.domain,
            "input": {
                "user": record.input.user,
                "system": record.input.system,
            },
            "output": _serialize_output(record.output),
            "source_refs": record.metadata.source_refs,
            "synthetic": record.metadata.synthetic,
            "synthetic_depth": record.metadata.synthetic_depth,
        }

        system = (
            "You are a quality assessor for a supervised fine-tuning corpus. "
            "Apply the GRADE adaptation from the example-quality-assess skill. "
            "Only report factors you can justify from the example content.\n\n"
            "Upgrade factors you may report:\n"
            "- clear_reasoning: output.reasoning_trace exists AND its steps are coherent\n"
            "- diverse_task_type: the task type is unusual/rare for this domain\n\n"
            "Downgrade factors you may report:\n"
            "- hallucinated_citation: output cites a source that cannot plausibly exist\n"
            "- out_of_distribution: the topic diverges from the declared domain\n"
            "- ambiguous_prompt: input.user has multiple reasonable interpretations\n\n"
            "Return an empty list if none apply. Severity: low | medium | high."
        )
        messages = [
            {
                "role": "user",
                "content": (
                    "Assess this training example.\n\n"
                    "```json\n"
                    f"{_safe_json(example_payload)}"
                    "\n```"
                ),
            }
        ]

        try:
            data = self.llm.complete_json(
                messages=messages,
                system=system,
                schema_hint=_LLM_SCHEMA_HINT,
            )
        except Exception as e:  # noqa: BLE001
            # Fall back to no-LLM-factors if the call fails — never crash
            # a batch assessment on a single bad response.
            return {
                "factors_present": [],
                "factors_absent_with_penalty": [],
                "notes": f"LLM assessment unavailable: {e}",
            }

        if not isinstance(data, dict):
            return {"factors_present": [], "factors_absent_with_penalty": [], "notes": ""}
        # Normalize keys.
        data.setdefault("factors_present", [])
        data.setdefault("factors_absent_with_penalty", [])
        data.setdefault("notes", "")
        return data

    def _compose_notes(
        self,
        baseline: QualityGrade,
        final: QualityGrade,
        upgrades: list[str],
        downgrades: list[dict[str, Any]],
    ) -> str:
        up = f"+{len(upgrades)}" if upgrades else "+0"
        dn = sum(d["penalty"] for d in downgrades)
        dn_s = f"-{dn}" if dn else "-0"
        return f"baseline={baseline.value} {up}{dn_s} → {final.value}"

    def _build_recommendations(
        self,
        assessments: list[QualityAssessment],
        distribution: dict[QualityGrade, int],
        synth_vs_human: dict[str, dict[QualityGrade, int]],
        min_grade: QualityGrade | None,
        below_threshold: list[str],
    ) -> list[str]:
        recs: list[str] = []
        total = len(assessments) or 1

        very_low = distribution.get(QualityGrade.VERY_LOW, 0)
        low = distribution.get(QualityGrade.LOW, 0)
        if (very_low + low) / total > 0.2:
            recs.append(
                f"{very_low + low} of {total} records ({(very_low + low) * 100 // total}%) "
                "scored LOW or VERY_LOW — investigate before publishing."
            )

        # Factor frequency.
        factor_counts: Counter[str] = Counter()
        for a in assessments:
            for d in a.downgrades_applied:
                factor_counts[d["factor"]] += 1
        for factor, n in factor_counts.most_common(3):
            if n >= max(5, total // 10):
                recs.append(
                    f"`{factor}` triggered on {n} records — consider a targeted cleanup pass."
                )

        # Synthetic quality skew.
        synth = synth_vs_human.get("synthetic", {})
        synth_total = sum(synth.values())
        if synth_total:
            synth_low = synth.get(QualityGrade.LOW, 0) + synth.get(QualityGrade.VERY_LOW, 0)
            if synth_low / synth_total > 0.3:
                recs.append(
                    f"Synthetic records skew low-quality ({synth_low}/{synth_total}); "
                    "review synthesis prompts or depth limits."
                )

        if min_grade is not None and below_threshold:
            recs.append(
                f"{len(below_threshold)} records fall below the `{min_grade.value}` threshold. "
                "Flag for human review — do NOT auto-delete (see `human-authorization` rule)."
            )

        if not recs:
            recs.append("No material quality issues detected in this batch.")
        return recs


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _looks_truncated(text: str) -> bool:
    """Heuristic: output ends with an ellipsis/dash OR no terminal punctuation.

    Conservative — requires the text to be non-trivial (>20 chars) so very
    short deliberate answers ("42", "yes") are not penalized.
    """
    if not text:
        return False
    t = text.rstrip()
    if len(t) < 20:
        return False
    if t.endswith("...") or t.endswith("…") or t.endswith("—") or t.endswith("-"):
        return True
    return t[-1] not in ".!?\"')]}`"


def _serialize_output(output: OutputPayload | PreferenceOutput) -> dict[str, Any]:
    if isinstance(output, PreferenceOutput):
        return {
            "chosen": output.chosen,
            "rejected": output.rejected,
            "confidence": output.confidence,
        }
    return {
        "assistant": output.assistant,
        "reasoning_trace": output.reasoning_trace,
    }


def _safe_json(obj: Any) -> str:
    import json

    return json.dumps(obj, indent=2, default=str, ensure_ascii=False)[:8000]


__all__ = [
    "DOWNGRADE_FACTORS",
    "QualityAssessment",
    "QualityAssessor",
    "QualityReport",
    "UPGRADE_FACTORS",
]
