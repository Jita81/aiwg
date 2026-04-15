"""Tests for the preference generator + export modules (#839)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from aiwg_training.schemas import (
    CanonicalRecord,
    ExampleMetadata,
    InputPayload,
    OutputPayload,
    PreferenceOutput,
    QualityGrade,
    TaskType,
    read_events,
)
from aiwg_training.synthesis import (
    MockLLMClient,
    PreferenceGenerator,
    PreferenceResult,
    export,
    export_dpo,
    export_kto,
    export_orpo,
    export_simpo,
)
from aiwg_training.core import MemoryTopology


# --- Fixtures -------------------------------------------------------------


def _mk_record(
    idx: int,
    user: str,
    assistant: str,
    *,
    reasoning_trace: str | None = None,
    source_refs: list[str] | None = None,
    grade: QualityGrade = QualityGrade.HIGH,
) -> CanonicalRecord:
    return CanonicalRecord(
        id=f"ex-{idx:03d}",
        task_type=TaskType.INSTRUCTION_FOLLOWING,
        input=InputPayload(user=user),
        output=OutputPayload(assistant=assistant, reasoning_trace=reasoning_trace),
        metadata=ExampleMetadata(
            quality_grade=grade,
            license="CC-BY-4.0",
            provenance_id=f"prov-{idx:03d}",
            created_at="2026-04-14T00:00:00+00:00",
            source_refs=source_refs or [],
        ),
    )


def _judge_response(
    chosen: str = "a",
    confidence: float = 0.85,
    rationale: str = "clearer reasoning and better structure.",
) -> str:
    return json.dumps({
        "chosen": chosen,
        "confidence": confidence,
        "rationale": rationale,
    })


@pytest.fixture
def same_prompt_pair() -> tuple[CanonicalRecord, CanonicalRecord]:
    prompt = "Explain recursion in one paragraph."
    a = _mk_record(1, prompt, "Recursion is a function calling itself with a base case.")
    b = _mk_record(2, prompt, "Recursion.")
    return a, b


@pytest.fixture
def topology(tmp_path: Path) -> MemoryTopology:
    log_path = tmp_path / ".aiwg" / "training" / ".log.jsonl"
    return MemoryTopology(
        namespace="training-complete",
        raw_sources=str(tmp_path / "raw"),
        log=str(log_path),
    )


# --- llm-judge mode -------------------------------------------------------


class TestLLMJudgeMode:
    def test_produces_preference_record(
        self, same_prompt_pair: tuple[CanonicalRecord, CanonicalRecord]
    ) -> None:
        mock = MockLLMClient(responses=[_judge_response(chosen="a", confidence=0.9)])
        gen = PreferenceGenerator(llm_client=mock)
        result = gen.generate([same_prompt_pair], mode="llm-judge", min_confidence=0.7)

        assert result.pair_count == 1
        rec = result.records[0]
        assert rec.task_type == TaskType.PREFERENCE
        assert isinstance(rec.output, PreferenceOutput)
        # Candidate A should be chosen per mock.
        assert rec.output.chosen == same_prompt_pair[0].output.assistant
        assert rec.output.rejected == same_prompt_pair[1].output.assistant
        assert rec.output.confidence == 0.9

    def test_rationale_note_linking(
        self, same_prompt_pair: tuple[CanonicalRecord, CanonicalRecord]
    ) -> None:
        rationale = "Candidate A has specific algorithmic detail."
        mock = MockLLMClient(responses=[
            _judge_response(chosen="b", confidence=0.85, rationale=rationale),
        ])
        gen = PreferenceGenerator(llm_client=mock)
        result = gen.generate(
            [same_prompt_pair], mode="llm-judge", capture_rationale_notes=True,
        )
        assert len(result.rationale_notes) == 1
        note = result.rationale_notes[0]
        assert note.task_type == TaskType.COMPLETION
        assert rationale in note.output.assistant  # type: ignore[union-attr]
        # Linked via rationale_note_id on the preference record.
        assert result.records[0].output.rationale_note_id == note.id  # type: ignore[union-attr]

    def test_b_chosen_swaps_roles(
        self, same_prompt_pair: tuple[CanonicalRecord, CanonicalRecord]
    ) -> None:
        mock = MockLLMClient(responses=[_judge_response(chosen="b", confidence=0.8)])
        gen = PreferenceGenerator(llm_client=mock)
        result = gen.generate([same_prompt_pair], mode="llm-judge")
        rec = result.records[0]
        assert rec.output.chosen == same_prompt_pair[1].output.assistant  # type: ignore[union-attr]
        assert rec.output.rejected == same_prompt_pair[0].output.assistant  # type: ignore[union-attr]

    def test_tie_is_dropped(
        self, same_prompt_pair: tuple[CanonicalRecord, CanonicalRecord]
    ) -> None:
        mock = MockLLMClient(responses=[_judge_response(chosen="tie", confidence=0.4)])
        gen = PreferenceGenerator(llm_client=mock)
        result = gen.generate([same_prompt_pair], mode="llm-judge")
        assert result.pair_count == 0
        assert result.dropped_ties == 1

    def test_invalid_json_becomes_tie(
        self, same_prompt_pair: tuple[CanonicalRecord, CanonicalRecord]
    ) -> None:
        # Every response is unparseable; mock retries exhaust -> JSONParseError -> tie.
        mock = MockLLMClient(
            responses=["not json", "still not json", "nope"],
            max_retries=1,
        )
        gen = PreferenceGenerator(llm_client=mock)
        result = gen.generate([same_prompt_pair], mode="llm-judge")
        assert result.pair_count == 0


# --- rule-based mode ------------------------------------------------------


class TestRuleBasedMode:
    def test_shorter_wins_when_both_correct(self) -> None:
        prompt = "What is 2 + 2?"
        a = _mk_record(1, prompt, "The answer is 4.")
        # Add >50 extra chars.
        b = _mk_record(
            2, prompt,
            "The answer is 4 because when you add two positive integers of value two "
            "you get a sum equal to four in base ten arithmetic indeed.",
        )
        gen = PreferenceGenerator()
        result = gen.generate([(a, b)], mode="rule-based", min_confidence=0.5)
        assert result.pair_count == 1
        assert result.records[0].output.chosen == a.output.assistant  # type: ignore[union-attr]

    def test_cites_source_wins(self) -> None:
        prompt = "Who wrote Hamlet?"
        a = _mk_record(1, prompt, "Shakespeare wrote Hamlet in 1600.", source_refs=["doc-1"])
        b = _mk_record(2, prompt, "Shakespeare wrote Hamlet in 1600.")
        gen = PreferenceGenerator()
        result = gen.generate([(a, b)], mode="rule-based", min_confidence=0.5)
        assert result.pair_count == 1
        assert result.records[0].output.chosen == a.output.assistant  # type: ignore[union-attr]

    def test_reasoning_trace_wins(self) -> None:
        prompt = "Solve x + 3 = 7."
        a = _mk_record(
            1, prompt, "x = 4.",
            reasoning_trace="Subtract 3 from both sides: x = 7 - 3 = 4.",
        )
        b = _mk_record(2, prompt, "x = 4.")
        gen = PreferenceGenerator()
        result = gen.generate([(a, b)], mode="rule-based", min_confidence=0.5)
        assert result.pair_count == 1
        assert result.records[0].output.chosen == a.output.assistant  # type: ignore[union-attr]

    def test_no_hallucination_wins_over_hallucination(self) -> None:
        prompt = "Describe photosynthesis."
        a = _mk_record(1, prompt, "Plants convert sunlight into energy.")
        # B claims a source but has no source_refs -> penalty.
        b = _mk_record(
            2, prompt,
            "According to the Botanical Review, plants use chlorophyll to synthesize sugar.",
        )
        gen = PreferenceGenerator()
        result = gen.generate([(a, b)], mode="rule-based", min_confidence=0.5)
        assert result.pair_count == 1
        assert result.records[0].output.chosen == a.output.assistant  # type: ignore[union-attr]

    def test_coherent_wins_over_truncated(self) -> None:
        prompt = "Define entropy."
        a = _mk_record(1, prompt, "Entropy is a measure of disorder.")
        b = _mk_record(2, prompt, "Entropy is a measure of")  # no terminal punct
        gen = PreferenceGenerator()
        result = gen.generate([(a, b)], mode="rule-based", min_confidence=0.5)
        assert result.pair_count == 1
        assert result.records[0].output.chosen == a.output.assistant  # type: ignore[union-attr]

    def test_confidence_capped_at_0_8(self) -> None:
        prompt = "Who wrote Hamlet?"
        # Stack every heuristic in A's favor.
        a = _mk_record(
            1, prompt, "Shakespeare.",  # short + coherent + cites
            reasoning_trace="Historical record attributes Hamlet (1600) to Shakespeare.",
            source_refs=["doc-1"],
        )
        b = _mk_record(
            2, prompt,
            "According to the Globe Theatre archive, Hamlet was penned by a group of collaborators "
            "and we cannot be sure without further evidence from the period in question indeed",
        )
        gen = PreferenceGenerator()
        result = gen.generate([(a, b)], mode="rule-based", min_confidence=0.5)
        assert result.pair_count == 1
        assert result.records[0].output.confidence is not None  # type: ignore[union-attr]
        assert result.records[0].output.confidence <= 0.8  # type: ignore[union-attr]


# --- human mode -----------------------------------------------------------


class TestHumanMode:
    def test_human_callback_picks_a(
        self, same_prompt_pair: tuple[CanonicalRecord, CanonicalRecord]
    ) -> None:
        gen = PreferenceGenerator(human_prompt_callback=lambda a, b: "a")
        result = gen.generate([same_prompt_pair], mode="human", min_confidence=0.5)
        assert result.pair_count == 1
        assert result.records[0].task_type == TaskType.PREFERENCE
        assert result.records[0].output.chosen == same_prompt_pair[0].output.assistant  # type: ignore[union-attr]

    def test_human_skip_drops_pair(
        self, same_prompt_pair: tuple[CanonicalRecord, CanonicalRecord]
    ) -> None:
        gen = PreferenceGenerator(human_prompt_callback=lambda a, b: "skip")
        result = gen.generate([same_prompt_pair], mode="human")
        assert result.pair_count == 0
        assert result.dropped_ties == 1


# --- min_confidence filter -----------------------------------------------


def test_min_confidence_drops_low_pairs(
    same_prompt_pair: tuple[CanonicalRecord, CanonicalRecord],
) -> None:
    mock = MockLLMClient(responses=[
        _judge_response(chosen="a", confidence=0.5),  # below default 0.7
        _judge_response(chosen="a", confidence=0.8),
    ])
    gen = PreferenceGenerator(llm_client=mock)
    a, b = same_prompt_pair
    a2 = _mk_record(3, a.input.user, "Another answer.")
    result = gen.generate(
        [(a, b), (a, a2)],
        mode="llm-judge",
        min_confidence=0.7,
    )
    assert result.pair_count == 1
    assert result.dropped_low_confidence == 1


def test_mismatched_prompts_raise() -> None:
    a = _mk_record(1, "prompt one", "answer one")
    b = _mk_record(2, "prompt two", "answer two")
    gen = PreferenceGenerator()
    with pytest.raises(ValueError, match="mismatched prompts"):
        gen.generate([(a, b)], mode="rule-based")


# --- generate_from_pool --------------------------------------------------


def test_generate_from_pool_groups_by_prompt() -> None:
    prompt = "What is a monad?"
    pool = [
        _mk_record(1, prompt, "A monad wraps a value with context."),
        _mk_record(2, prompt, "A monad is a burrito."),
        _mk_record(3, "Different prompt", "Unrelated answer."),
    ]
    mock = MockLLMClient(responses=[_judge_response(chosen="a", confidence=0.85)])
    gen = PreferenceGenerator(llm_client=mock)
    result = gen.generate_from_pool(pool, pair_count=5, mode="llm-judge")
    assert result.pair_count == 1  # only one valid group with >=2 items


# --- Event logging --------------------------------------------------------


def test_event_logged_with_distribution(
    same_prompt_pair: tuple[CanonicalRecord, CanonicalRecord],
    topology: MemoryTopology,
) -> None:
    mock = MockLLMClient(responses=[
        _judge_response(chosen="a", confidence=0.92),
        _judge_response(chosen="b", confidence=0.71),
    ])
    gen = PreferenceGenerator(llm_client=mock, topology=topology)
    a, b = same_prompt_pair
    a2 = _mk_record(3, a.input.user, "Yet another answer.")
    result = gen.generate([(a, b), (a, a2)], mode="llm-judge", min_confidence=0.7)
    assert result.pair_count == 2

    events = read_events(topology.log)
    assert len(events) == 1
    evt = events[0]
    assert evt["op"] == "preference-generate"
    assert evt["pair_count"] == 2
    # Distribution should capture at least the high/very-high buckets.
    assert sum(evt["confidence_distribution"].values()) >= 2
    # Source examples include all three inputs.
    assert set(evt["source_examples"]) == {"ex-001", "ex-002", "ex-003"}


# --- Export formats -------------------------------------------------------


def _mk_pref_records() -> list[CanonicalRecord]:
    """Two preference records for export tests."""
    recs: list[CanonicalRecord] = []
    for i, (prompt, chosen, rejected, conf) in enumerate([
        ("Q1", "good answer 1", "bad answer 1", 0.85),
        ("Q2", "good answer 2", "bad answer 2", 0.72),
    ], start=10):
        recs.append(CanonicalRecord(
            id=f"pref-{i}",
            task_type=TaskType.PREFERENCE,
            input=InputPayload(user=prompt),
            output=PreferenceOutput(
                chosen=chosen,
                rejected=rejected,
                confidence=conf,
            ),
            metadata=ExampleMetadata(
                quality_grade=QualityGrade.HIGH,
                license="CC-BY-4.0",
                provenance_id=f"prov-{i}",
                created_at="2026-04-14T00:00:00+00:00",
            ),
        ))
    return recs


def _read_jsonl(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def test_export_dpo(tmp_path: Path) -> None:
    out = tmp_path / "dpo.jsonl"
    n = export_dpo(_mk_pref_records(), out)
    assert n == 2
    rows = _read_jsonl(out)
    assert all(set(r.keys()) == {"prompt", "chosen", "rejected"} for r in rows)
    assert rows[0]["chosen"] == "good answer 1"
    assert rows[0]["rejected"] == "bad answer 1"


def test_export_kto_produces_two_records_per_pair(tmp_path: Path) -> None:
    out = tmp_path / "kto.jsonl"
    n = export_kto(_mk_pref_records(), out)
    assert n == 4  # 2 pairs * 2 rows each
    rows = _read_jsonl(out)
    labels = [r["label"] for r in rows]
    assert labels.count(True) == 2
    assert labels.count(False) == 2
    # Chosen always paired with label=True.
    assert all(set(r.keys()) == {"prompt", "completion", "label"} for r in rows)


def test_export_orpo_includes_odds_ratio(tmp_path: Path) -> None:
    out = tmp_path / "orpo.jsonl"
    n = export_orpo(_mk_pref_records(), out)
    assert n == 2
    rows = _read_jsonl(out)
    assert "odds_ratio_metadata" in rows[0]
    assert rows[0]["odds_ratio_metadata"]["ratio"] == 0.85
    assert rows[0]["chosen"] == "good answer 1"


def test_export_simpo_includes_length_hint(tmp_path: Path) -> None:
    out = tmp_path / "simpo.jsonl"
    n = export_simpo(_mk_pref_records(), out)
    assert n == 2
    rows = _read_jsonl(out)
    hint = rows[0]["length_normalized_hint"]
    assert "chosen_len_chars" in hint
    assert "rejected_len_chars" in hint
    assert hint["avg_log_prob_available"] is False


def test_export_dispatcher(tmp_path: Path) -> None:
    recs = _mk_pref_records()
    assert export(recs, "dpo", tmp_path / "a.jsonl") == 2
    assert export(recs, "kto", tmp_path / "b.jsonl") == 4
    assert export(recs, "orpo", tmp_path / "c.jsonl") == 2
    assert export(recs, "simpo", tmp_path / "d.jsonl") == 2
    with pytest.raises(ValueError, match="Unknown preference export format"):
        export(recs, "rlhf", tmp_path / "e.jsonl")


def test_export_skips_non_preference_records(tmp_path: Path) -> None:
    prefs = _mk_pref_records()
    non_pref = _mk_record(99, "regular prompt", "regular answer")
    out = tmp_path / "mixed.jsonl"
    n = export_dpo([*prefs, non_pref], out)
    assert n == 2  # only the two preference records are exported
