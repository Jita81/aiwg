"""Tests for the per-example quality assessor.

All tests use :class:`MockLLMClient` — no real API calls. Tests covering the
live ``anthropic`` SDK path are skipped unless ``ANTHROPIC_API_KEY`` is set
(and are not included here; this suite intentionally exercises only the
deterministic + mocked surface).
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path

import pytest

from aiwg_training.quality import (
    DOWNGRADE_FACTORS,
    QualityAssessment,
    QualityAssessor,
    QualityReport,
)
from aiwg_training.schemas import (
    CanonicalRecord,
    ExampleMetadata,
    InputPayload,
    OutputPayload,
    QualityGrade,
    TaskType,
)
from aiwg_training.synthesis import MockLLMClient


# ---------------------------------------------------------------------------
# Fixture helpers
# ---------------------------------------------------------------------------


def _make_record(
    *,
    user: str = "What is 2+2?",
    assistant: str = "The answer is 4.",
    reasoning_trace: str | None = None,
    quality: QualityGrade = QualityGrade.MODERATE,
    synthetic: bool = False,
    synthetic_depth: int = 0,
    source_refs: list[str] | None = None,
    domain: list[str] | None = None,
) -> CanonicalRecord:
    return CanonicalRecord(
        id=f"ex-{uuid.uuid4().hex[:12]}",
        task_type=TaskType.REASONING,
        input=InputPayload(user=user),
        output=OutputPayload(assistant=assistant, reasoning_trace=reasoning_trace),
        metadata=ExampleMetadata(
            quality_grade=quality,
            license="MIT",
            provenance_id=f"prov-{uuid.uuid4().hex[:12]}",
            created_at="2026-04-14T00:00:00+00:00",
            domain=domain or ["math"],
            source_refs=source_refs or ["src:textbook-a"],
            synthetic=synthetic,
            synthetic_depth=synthetic_depth,
        ),
    )


def _no_factors_response() -> str:
    return json.dumps(
        {
            "factors_present": [],
            "factors_absent_with_penalty": [],
            "notes": "nothing notable",
        }
    )


def _fixture_batch(n: int = 50) -> list[CanonicalRecord]:
    records: list[CanonicalRecord] = []
    domains = [["math"], ["code"], ["writing"], ["science"]]
    for i in range(n):
        records.append(
            _make_record(
                user=f"Explain concept #{i}.",
                assistant=f"Concept #{i} means X because Y and Z.",
                quality=[QualityGrade.HIGH, QualityGrade.MODERATE, QualityGrade.LOW][i % 3],
                synthetic=(i % 4 == 0),
                synthetic_depth=(2 if i % 8 == 0 else 0),
                source_refs=["src:a", "src:b"] if i % 5 == 0 else ["src:a"],
                domain=domains[i % len(domains)],
            )
        )
    return records


# ---------------------------------------------------------------------------
# Deterministic factor tests (use_llm=False)
# ---------------------------------------------------------------------------


def test_human_written_upgrade():
    """synthetic=False + synthetic_depth=0 → +1 upgrade (human_written)."""
    r = _make_record(quality=QualityGrade.MODERATE, synthetic=False, synthetic_depth=0)
    assessor = QualityAssessor(llm_client=MockLLMClient(), use_llm=False)
    a = assessor.assess(r)
    assert "human_written" in a.upgrades_applied
    assert a.grade == QualityGrade.HIGH  # MODERATE + 1


def test_cross_source_corroboration_upgrade():
    """2+ distinct source_refs → +1 upgrade."""
    r = _make_record(
        quality=QualityGrade.LOW,
        synthetic=True,  # disable human_written
        source_refs=["src:a", "src:b"],
    )
    assessor = QualityAssessor(llm_client=MockLLMClient(), use_llm=False)
    a = assessor.assess(r)
    assert "cross_source_corroboration" in a.upgrades_applied
    assert "human_written" not in a.upgrades_applied
    assert a.grade == QualityGrade.MODERATE  # LOW + 1


def test_synthetic_depth_penalty():
    """synthetic_depth > 1 → -2 downgrade (Model Collapse)."""
    r = _make_record(
        quality=QualityGrade.HIGH,
        synthetic=True,
        synthetic_depth=2,
        source_refs=["src:a"],
    )
    assessor = QualityAssessor(llm_client=MockLLMClient(), use_llm=False)
    a = assessor.assess(r)
    factors = [d["factor"] for d in a.downgrades_applied]
    assert "synthetic_depth" in factors
    assert a.grade == QualityGrade.LOW  # HIGH - 2


def test_synthetic_depth_one_does_not_penalize():
    """synthetic_depth == 1 is the first generation; no penalty."""
    r = _make_record(
        quality=QualityGrade.MODERATE,
        synthetic=True,
        synthetic_depth=1,
    )
    assessor = QualityAssessor(llm_client=MockLLMClient(), use_llm=False)
    a = assessor.assess(r)
    factors = [d["factor"] for d in a.downgrades_applied]
    assert "synthetic_depth" not in factors


def test_truncated_output_penalty():
    """Output ending in ellipsis → -1 truncated_output."""
    r = _make_record(
        assistant="The answer is that we must consider many factors before...",
        quality=QualityGrade.MODERATE,
        synthetic=True,  # disable human_written
    )
    assessor = QualityAssessor(llm_client=MockLLMClient(), use_llm=False)
    a = assessor.assess(r)
    factors = [d["factor"] for d in a.downgrades_applied]
    assert "truncated_output" in factors
    assert a.grade == QualityGrade.LOW  # MODERATE - 1


def test_short_output_not_truncated():
    """Short deliberate answers are not flagged as truncated."""
    r = _make_record(assistant="42", quality=QualityGrade.MODERATE, synthetic=True)
    assessor = QualityAssessor(llm_client=MockLLMClient(), use_llm=False)
    a = assessor.assess(r)
    factors = [d["factor"] for d in a.downgrades_applied]
    assert "truncated_output" not in factors


def test_floor_at_very_low():
    """Floor: VERY_LOW baseline + any downgrade stays at VERY_LOW."""
    r = _make_record(
        quality=QualityGrade.VERY_LOW,
        synthetic=True,
        synthetic_depth=3,
        assistant="This is an obviously truncated response that ends with...",
    )
    assessor = QualityAssessor(llm_client=MockLLMClient(), use_llm=False)
    a = assessor.assess(r)
    assert a.grade == QualityGrade.VERY_LOW


def test_cap_at_high():
    """Cap: HIGH baseline + upgrades stays at HIGH."""
    r = _make_record(
        quality=QualityGrade.HIGH,
        synthetic=False,
        synthetic_depth=0,
        source_refs=["src:a", "src:b", "src:c"],
    )
    assessor = QualityAssessor(llm_client=MockLLMClient(), use_llm=False)
    a = assessor.assess(r)
    assert "human_written" in a.upgrades_applied
    assert "cross_source_corroboration" in a.upgrades_applied
    assert a.grade == QualityGrade.HIGH


# ---------------------------------------------------------------------------
# Aggregation tests (with LLM mock)
# ---------------------------------------------------------------------------


def test_high_source_plus_clear_reasoning_stays_high():
    """HIGH + human_written + corroboration + clear_reasoning → HIGH (capped)."""
    r = _make_record(
        quality=QualityGrade.HIGH,
        reasoning_trace="First, ...; then, ...; therefore, ...",
        source_refs=["src:a", "src:b"],
    )
    mock = MockLLMClient(
        responses=[
            json.dumps(
                {
                    "factors_present": ["clear_reasoning"],
                    "factors_absent_with_penalty": [],
                    "notes": "coherent chain of thought",
                }
            )
        ]
    )
    a = QualityAssessor(llm_client=mock).assess(r)
    assert "clear_reasoning" in a.upgrades_applied
    assert a.grade == QualityGrade.HIGH


def test_low_source_plus_three_downgrades_goes_very_low():
    """LOW source + truncated + hallucinated_citation → VERY_LOW."""
    r = _make_record(
        quality=QualityGrade.LOW,
        synthetic=True,  # kill human_written
        assistant=(
            "The answer draws on many considerations that cannot be summarized in..."
        ),
    )
    mock = MockLLMClient(
        responses=[
            json.dumps(
                {
                    "factors_present": [],
                    "factors_absent_with_penalty": [
                        {"factor": "hallucinated_citation", "severity": "high"},
                    ],
                    "notes": "cites nonexistent source",
                }
            )
        ]
    )
    a = QualityAssessor(llm_client=mock).assess(r)
    factors = [d["factor"] for d in a.downgrades_applied]
    assert "hallucinated_citation" in factors
    assert "truncated_output" in factors
    assert a.grade == QualityGrade.VERY_LOW


def test_llm_unavailable_falls_back_to_deterministic():
    """If the LLM raises, assessment still completes using only rule factors."""

    class FailingClient:
        def complete_json(self, **_kwargs):
            raise RuntimeError("API went boom")

    r = _make_record(quality=QualityGrade.MODERATE)
    a = QualityAssessor(llm_client=FailingClient()).assess(r)
    # Deterministic human_written upgrade still applied.
    assert "human_written" in a.upgrades_applied
    # LLM-only factors are absent.
    assert not any(
        d["factor"] in ("clear_reasoning", "ambiguous_prompt") for d in a.downgrades_applied
    )
    assert "unavailable" in a.llm_response_summary.lower()


# ---------------------------------------------------------------------------
# Batch + report
# ---------------------------------------------------------------------------


def test_assess_batch_produces_valid_report(tmp_path: Path):
    records = _fixture_batch(50)
    # Provide 50 canned no-factor responses — enough for each record's single LLM call.
    mock = MockLLMClient(
        responses=[_no_factors_response() for _ in records],
        default_response=_no_factors_response(),
    )
    assessor = QualityAssessor(llm_client=mock)
    report = assessor.assess_batch(records, min_grade=QualityGrade.MODERATE)

    assert isinstance(report, QualityReport)
    assert report.total_records == 50
    # Distribution buckets should sum back to 50.
    assert sum(report.distribution.values()) == 50
    # All four tiers populated as keys.
    for g in QualityGrade:
        assert g in report.distribution
    # Worst offenders capped at 10.
    assert len(report.worst_offenders) <= 10
    # Below-threshold list only includes LOW / VERY_LOW.
    assert all(isinstance(rid, str) for rid in report.below_threshold_ids)
    # Domain breakdown populated.
    assert report.domain_breakdown
    # Synthetic vs human buckets both present.
    assert "synthetic" in report.synthetic_vs_human
    assert "human" in report.synthetic_vs_human

    # Write the report and verify file contents.
    out = tmp_path / "quality-report.md"
    path = assessor.write_report(report, out)
    assert path.exists()
    text = path.read_text(encoding="utf-8")
    assert "# Example Quality Report" in text
    assert "GRADE distribution" in text
    assert "Synthetic vs human" in text
    assert "Recommendations" in text


def test_below_threshold_flagged_not_deleted():
    """min_grade filtering only flags records — human-authorization rule."""
    records = [
        _make_record(quality=QualityGrade.HIGH),
        _make_record(quality=QualityGrade.VERY_LOW, synthetic=True, synthetic_depth=3),
    ]
    mock = MockLLMClient(
        responses=[_no_factors_response(), _no_factors_response()],
        default_response=_no_factors_response(),
    )
    report = QualityAssessor(llm_client=mock).assess_batch(
        records, min_grade=QualityGrade.MODERATE
    )
    assert report.below_threshold_ids  # at least the very-low one
    assert any(
        "human-authorization" in r or "human review" in r.lower()
        for r in report.recommendations
    )


def test_downgrade_factors_table_is_canonical():
    """Guard against drift: the table in code matches SKILL.md."""
    assert DOWNGRADE_FACTORS["hallucinated_citation"] == 3
    assert DOWNGRADE_FACTORS["out_of_distribution"] == 2
    assert DOWNGRADE_FACTORS["synthetic_depth"] == 2
    assert DOWNGRADE_FACTORS["truncated_output"] == 1


# ---------------------------------------------------------------------------
# MockLLMClient sanity
# ---------------------------------------------------------------------------


def test_mock_client_fifo_queue():
    mock = MockLLMClient(responses=['{"a": 1}', '{"a": 2}'])
    d1 = mock.complete_json(messages=[{"role": "user", "content": "x"}])
    d2 = mock.complete_json(messages=[{"role": "user", "content": "x"}])
    assert d1 == {"a": 1}
    assert d2 == {"a": 2}
    assert mock.call_count == 2


def test_mock_client_records_calls():
    mock = MockLLMClient(responses=["hello"])
    mock.complete(messages=[{"role": "user", "content": "ping"}], system="sys")
    assert mock.call_log[0]["system"] == "sys"
    assert mock.call_log[0]["messages"][0]["content"] == "ping"


def test_mock_client_json_retries_on_parse_failure():
    """Parse-fail responses should be retried; final good response wins."""
    mock = MockLLMClient(
        responses=["not json at all", "also not json", '{"ok": true}'],
        max_retries=2,
    )
    data = mock.complete_json(messages=[{"role": "user", "content": "x"}])
    assert data == {"ok": True}
    assert mock.call_count == 3


def test_mock_client_raises_after_retries_exhausted():
    from aiwg_training.synthesis import JSONParseError

    mock = MockLLMClient(
        responses=["bad", "bad", "bad"],
        default_response="bad",
        max_retries=1,
    )
    with pytest.raises(JSONParseError):
        mock.complete_json(messages=[{"role": "user", "content": "x"}])


def test_assessment_dataclass_roundtrip():
    a = QualityAssessment(
        record_id="ex-abc",
        grade=QualityGrade.MODERATE,
        source_baseline=QualityGrade.HIGH,
        upgrades_applied=["human_written"],
        downgrades_applied=[{"factor": "ambiguous_prompt", "penalty": 1}],
        notes="baseline=HIGH +1-1 → HIGH",
    )
    assert a.net_adjustment == 0
    assert a.total_penalty == 1
