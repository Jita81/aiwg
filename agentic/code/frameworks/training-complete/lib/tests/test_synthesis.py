"""Tests for the synthesis modules (#838 + #840).

All tests use :class:`~aiwg_training.synthesis.mock_client.MockLLMClient` —
no real API calls are made.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
import yaml

from aiwg_training.schemas import (
    CanonicalRecord,
    ExampleMetadata,
    InputPayload,
    OutputPayload,
    QualityGrade,
    TaskType,
)
from aiwg_training.synthesis import (
    ExampleSynthesizer,
    GenerationResult,
    GeneratorConfig,
    GeneratorConfigError,
    MockLLMClient,
    ModelCollapseGuardError,
    SynthesisError,
    SynthesisResult,
    SyntheticDataGenerator,
)

# ---------------------------------------------------------------------------
# Fixture builders
# ---------------------------------------------------------------------------


def _mk_record(
    idx: int,
    user: str,
    assistant: str,
    *,
    synthetic: bool = False,
    depth: int = 0,
    task_type: TaskType = TaskType.INSTRUCTION_FOLLOWING,
    domain: list[str] | None = None,
    system: str | None = None,
) -> CanonicalRecord:
    return CanonicalRecord(
        id=f"ex-{idx:03d}",
        task_type=task_type,
        input=InputPayload(user=user, system=system),
        output=OutputPayload(assistant=assistant),
        metadata=ExampleMetadata(
            quality_grade=QualityGrade.HIGH,
            license="CC-BY-4.0",
            provenance_id=f"prov-{idx:03d}",
            created_at="2026-04-14T00:00:00+00:00",
            domain=domain or ["general"],
            synthetic=synthetic,
            synthetic_depth=depth,
        ),
    )


@pytest.fixture
def human_seeds() -> list[CanonicalRecord]:
    """Small seed pool of purely human records (synthetic_depth=0)."""
    return [
        _mk_record(0, "Explain recursion in simple terms", "Recursion is when a function calls itself."),
        _mk_record(1, "List three prime numbers", "2, 3, and 5 are prime."),
        _mk_record(2, "What is entropy", "Entropy measures disorder in a system."),
    ]


@pytest.fixture
def passage_seeds() -> list[CanonicalRecord]:
    """Seed records carrying a document-like passage in the system prompt."""
    return [
        _mk_record(
            10,
            "Who is the subject?",
            "The passage describes the French Revolution.",
            system=(
                "The French Revolution was a period of radical political and "
                "societal change in France that began in 1789. It led to the "
                "decline of absolute monarchy and the rise of the Republic."
            ),
        ),
    ]


@pytest.fixture
def synthetic_seed() -> CanonicalRecord:
    """A seed already tagged as synthetic depth=1 (should trip the guard)."""
    return _mk_record(
        99,
        "Synthetic instruction",
        "Synthetic response",
        synthetic=True,
        depth=1,
    )


# ---------------------------------------------------------------------------
# ExampleSynthesizer — self-instruct
# ---------------------------------------------------------------------------


def test_self_instruct_produces_synthetic_records(human_seeds: list[CanonicalRecord]) -> None:
    mock = MockLLMClient(
        responses=[
            {
                "items": [
                    {"instruction": "Explain memoization", "response": "Memoization caches results."},
                    {"instruction": "What are closures?", "response": "Closures capture variables."},
                    {"instruction": "Describe a trie", "response": "A trie is a prefix tree."},
                ]
            }
        ]
    )
    synth = ExampleSynthesizer(llm_client=mock)
    result = synth.synthesize(human_seeds, pattern="self-instruct", count=3)

    assert isinstance(result, SynthesisResult)
    assert result.count == 3
    for rec in result.records:
        assert rec.metadata.synthetic is True
        assert rec.metadata.synthetic_depth == 1
        assert rec.metadata.created_by_agent == "example-synthesizer"
        # Source refs trace back to the seeds
        assert set(rec.metadata.source_refs).issubset({s.id for s in human_seeds})
        assert rec.input.user
        assert isinstance(rec.output, OutputPayload)
        assert rec.output.assistant


def test_synthesize_rejects_unknown_pattern(human_seeds: list[CanonicalRecord]) -> None:
    mock = MockLLMClient()
    synth = ExampleSynthesizer(llm_client=mock)
    with pytest.raises(ValueError, match="Unknown pattern"):
        synth.synthesize(human_seeds, pattern="nope", count=1)


def test_synthesize_rejects_empty_sources() -> None:
    mock = MockLLMClient()
    synth = ExampleSynthesizer(llm_client=mock)
    with pytest.raises(ValueError, match="non-empty"):
        synth.synthesize([], pattern="self-instruct", count=3)


# ---------------------------------------------------------------------------
# ExampleSynthesizer — evol-instruct
# ---------------------------------------------------------------------------


def test_evol_instruct_alternates_strategies(human_seeds: list[CanonicalRecord]) -> None:
    mock = MockLLMClient(
        responses=[
            {"instruction": "Explain recursion with a tail call optimization note", "response": "..."},
            {"instruction": "Tell me a prime-number story in Latin", "response": "..."},
        ]
    )
    synth = ExampleSynthesizer(llm_client=mock)
    result = synth.synthesize(human_seeds, pattern="evol-instruct", count=2)

    assert result.count == 2
    patterns = [r.metadata.generation_pattern for r in result.records]
    assert any("depth" in p for p in patterns)
    assert any("breadth" in p for p in patterns)
    for rec in result.records:
        assert rec.metadata.synthetic is True
        assert rec.metadata.synthetic_depth == 1  # seeds are human


# ---------------------------------------------------------------------------
# ExampleSynthesizer — squad
# ---------------------------------------------------------------------------


def test_squad_extracts_qa_from_passages(passage_seeds: list[CanonicalRecord]) -> None:
    mock = MockLLMClient(
        responses=[
            {
                "items": [
                    {"question": "When did the Revolution begin?", "answer": "1789."},
                    {"question": "What form of government declined?", "answer": "Absolute monarchy."},
                ]
            }
        ]
    )
    synth = ExampleSynthesizer(llm_client=mock)
    result = synth.synthesize(passage_seeds, pattern="squad", count=2)

    assert result.count == 2
    for rec in result.records:
        assert rec.task_type == TaskType.EXTRACTION
        assert rec.metadata.synthetic is True
        assert rec.metadata.generation_pattern == "squad"


# ---------------------------------------------------------------------------
# ExampleSynthesizer — star
# ---------------------------------------------------------------------------


def test_star_augments_with_reasoning_trace(human_seeds: list[CanonicalRecord]) -> None:
    mock = MockLLMClient(
        responses=[
            {
                "instruction": "Explain recursion in simple terms",
                "response": "Recursion is when a function calls itself.",
                "reasoning_trace": "Step 1: define base case. Step 2: reduce problem.",
            },
            {
                "instruction": "List three prime numbers",
                "response": "2, 3, and 5 are prime.",
                "reasoning_trace": "Step 1: recall primes divisible only by 1 and self. Step 2: pick small examples.",
            },
        ]
    )
    synth = ExampleSynthesizer(llm_client=mock)
    result = synth.synthesize(human_seeds, pattern="star", count=2)

    assert result.count == 2
    for rec in result.records:
        assert rec.task_type == TaskType.REASONING
        assert isinstance(rec.output, OutputPayload)
        assert rec.output.reasoning_trace
        assert rec.metadata.synthetic is True
        assert rec.metadata.generation_pattern == "star"


# ---------------------------------------------------------------------------
# ExampleSynthesizer — provenance traces to seeds
# ---------------------------------------------------------------------------


def test_provenance_traces_to_seeds(human_seeds: list[CanonicalRecord]) -> None:
    mock = MockLLMClient(
        responses=[
            {
                "items": [
                    {"instruction": "Define recursion base case", "response": "The termination condition."},
                ]
            }
        ]
    )
    synth = ExampleSynthesizer(llm_client=mock)
    result = synth.synthesize(human_seeds, pattern="self-instruct", count=1)

    assert result.prov_record is not None
    # Seeds + generated are both represented as entities.
    entity_labels = {e.label for e in result.prov_record.entities}
    assert any(s.id in entity_labels for s in human_seeds)

    # At least one activity links seeds → generated record.
    assert any(a.type == "aiwg:Synthesis" for a in result.prov_record.activities)
    # Every activity must have an ``ended_at`` stamp (finalized).
    for a in result.prov_record.activities:
        assert a.ended_at is not None


def test_quality_gate_filters_low_grade(human_seeds: list[CanonicalRecord]) -> None:
    mock = MockLLMClient(
        responses=[
            {
                "items": [
                    {"instruction": "Good task", "response": "Good response"},
                    {"instruction": "Bad task", "response": "Bad response"},
                ]
            }
        ]
    )
    synth = ExampleSynthesizer(llm_client=mock)

    def grader(rec: CanonicalRecord) -> QualityGrade:
        if "Bad" in rec.input.user:
            return QualityGrade.LOW
        return QualityGrade.HIGH

    result = synth.synthesize(
        human_seeds,
        pattern="self-instruct",
        count=2,
        quality_assessor=grader,
        min_grade=QualityGrade.MODERATE,
    )
    assert len(result.records) == 1
    assert len(result.rejected_records) == 1
    assert result.records[0].metadata.quality_grade == QualityGrade.HIGH
    assert result.rejected_records[0].metadata.quality_grade == QualityGrade.LOW


def test_parse_error_when_llm_returns_bad_shape(human_seeds: list[CanonicalRecord]) -> None:
    mock = MockLLMClient(
        responses=[{"unexpected": "shape"}]  # no 'items'/'pairs'/etc. list value
    )
    synth = ExampleSynthesizer(llm_client=mock)
    with pytest.raises(SynthesisError):
        synth.synthesize(human_seeds, pattern="self-instruct", count=1)


# ---------------------------------------------------------------------------
# Config loading
# ---------------------------------------------------------------------------


@pytest.fixture
def orca_config_file(tmp_path: Path) -> Path:
    """Minimal orca config dumped to disk."""
    cfg: dict[str, object] = {
        "generator": "orca",
        "count": 2,
        "batch_size": 2,
        "output_path": "examples/synthesized/test-orca/",
        "temperature": 0.5,
        "model": {"teacher": "claude-sonnet-4-6", "provider": "anthropic"},
    }
    p = tmp_path / "orca.yaml"
    p.write_text(yaml.safe_dump(cfg), encoding="utf-8")
    return p


def test_config_loads_from_yaml(orca_config_file: Path) -> None:
    cfg = GeneratorConfig.load(orca_config_file)
    assert cfg.generator == "orca"
    assert cfg.count == 2
    assert cfg.batch_size == 2
    assert cfg.temperature == 0.5
    assert cfg.model["teacher"] == "claude-sonnet-4-6"
    assert cfg.quality_threshold == QualityGrade.MODERATE  # default


def test_config_rejects_unknown_generator(tmp_path: Path) -> None:
    p = tmp_path / "bad.yaml"
    p.write_text(
        yaml.safe_dump({"generator": "not-a-thing", "count": 1, "output_path": "/tmp"}),
        encoding="utf-8",
    )
    with pytest.raises(GeneratorConfigError, match="Unknown generator"):
        GeneratorConfig.load(p)


def test_config_rejects_missing_keys(tmp_path: Path) -> None:
    p = tmp_path / "bad.yaml"
    p.write_text(yaml.safe_dump({"generator": "orca"}), encoding="utf-8")
    with pytest.raises(GeneratorConfigError, match="missing"):
        GeneratorConfig.load(p)


# ---------------------------------------------------------------------------
# SyntheticDataGenerator — Model Collapse guard
# ---------------------------------------------------------------------------


def test_model_collapse_guard_rejects_synthetic_seeds(
    orca_config_file: Path,
    synthetic_seed: CanonicalRecord,
    human_seeds: list[CanonicalRecord],
) -> None:
    mock = MockLLMClient()
    gen = SyntheticDataGenerator(llm_client=mock, config_path=orca_config_file)
    # Mix one synthetic seed into the pool — should trigger the guard.
    mixed = human_seeds + [synthetic_seed]
    with pytest.raises(ModelCollapseGuardError) as excinfo:
        gen.generate(seed_records=mixed, allow_recursive_synthetic=False)
    err = excinfo.value
    assert err.max_depth >= 1
    assert synthetic_seed.id in err.offending_seeds


def test_allow_recursive_synthetic_sets_override_flag(
    orca_config_file: Path,
    synthetic_seed: CanonicalRecord,
) -> None:
    mock = MockLLMClient(
        responses=[
            {"instruction": "Iter-2 task A", "response": "Iter-2 resp A", "reasoning_trace": "..."},
            {"instruction": "Iter-2 task B", "response": "Iter-2 resp B", "reasoning_trace": "..."},
        ]
    )
    gen = SyntheticDataGenerator(llm_client=mock, config_path=orca_config_file)
    with pytest.warns(UserWarning, match="Recursive synthetic generation"):
        result = gen.generate(
            seed_records=[synthetic_seed], allow_recursive_synthetic=True
        )
    assert isinstance(result, GenerationResult)
    assert result.override_flag is True
    # Seed depth was 1; generated records must be depth=2.
    assert result.recursion_depth == 2
    for rec in result.records:
        assert rec.metadata.synthetic_depth == 2


def test_human_seeds_generate_without_warning(
    orca_config_file: Path, human_seeds: list[CanonicalRecord]
) -> None:
    mock = MockLLMClient(
        responses=[
            {"instruction": "Orca output A", "response": "response A", "reasoning_trace": "trace"},
            {"instruction": "Orca output B", "response": "response B", "reasoning_trace": "trace"},
        ]
    )
    gen = SyntheticDataGenerator(llm_client=mock, config_path=orca_config_file)
    result = gen.generate(seed_records=human_seeds, allow_recursive_synthetic=False)
    assert result.override_flag is False
    assert result.recursion_depth == 1
    for rec in result.records:
        assert rec.metadata.synthetic_depth == 1


# ---------------------------------------------------------------------------
# SyntheticDataGenerator — all 5 generators produce records
# ---------------------------------------------------------------------------


def _make_config(
    tmp_path: Path,
    *,
    generator: str,
    count: int = 1,
    extras: dict[str, object] | None = None,
) -> Path:
    cfg: dict[str, object] = {
        "generator": generator,
        "count": count,
        "batch_size": count,
        "output_path": f"examples/synthesized/test-{generator}/",
        "temperature": 0.5,
    }
    if extras:
        cfg.update(extras)
    p = tmp_path / f"{generator}.yaml"
    p.write_text(yaml.safe_dump(cfg), encoding="utf-8")
    return p


def test_orca_generator_produces_record(tmp_path: Path, human_seeds: list[CanonicalRecord]) -> None:
    cfg = _make_config(tmp_path, generator="orca", count=1)
    mock = MockLLMClient(
        responses=[
            {"instruction": "Q", "response": "A", "reasoning_trace": "Step 1..."},
        ]
    )
    gen = SyntheticDataGenerator(llm_client=mock, config_path=cfg)
    result = gen.generate(seed_records=human_seeds)
    assert result.count == 1
    assert result.generator_name == "orca"
    assert result.records[0].metadata.generation_pattern == "orca"


def test_orca2_generator_produces_record(tmp_path: Path, human_seeds: list[CanonicalRecord]) -> None:
    cfg = _make_config(tmp_path, generator="orca-2", count=1)
    mock = MockLLMClient(
        responses=[
            {
                "instruction": "Q",
                "response": "A",
                "reasoning_trace": "step-by-step",
                "strategy": "step-by-step",
            }
        ]
    )
    gen = SyntheticDataGenerator(llm_client=mock, config_path=cfg)
    result = gen.generate(seed_records=human_seeds)
    assert result.count == 1
    assert result.records[0].task_type == TaskType.REASONING
    assert result.records[0].metadata.generation_pattern == "orca-2"


def test_phi_generator_requires_no_seeds(tmp_path: Path) -> None:
    cfg = _make_config(tmp_path, generator="phi", count=1)
    mock = MockLLMClient(
        responses=[{"instruction": "What is a Turing machine?", "response": "An abstract model."}]
    )
    gen = SyntheticDataGenerator(llm_client=mock, config_path=cfg)
    result = gen.generate(seed_records=None)  # phi works without seeds
    assert result.count == 1
    assert result.records[0].metadata.synthetic_depth == 1
    assert result.records[0].metadata.source_refs == []


def test_personahub_generator_applies_personas(
    tmp_path: Path, human_seeds: list[CanonicalRecord]
) -> None:
    cfg = _make_config(
        tmp_path,
        generator="personahub",
        count=1,
        extras={"diversity_settings": {"persona_count": 3}},
    )
    mock = MockLLMClient(
        responses=[
            {"instruction": "Explain recursion for a kid", "response": "Like a story inside a story", "persona": "a kid"},
        ]
    )
    gen = SyntheticDataGenerator(llm_client=mock, config_path=cfg)
    result = gen.generate(seed_records=human_seeds)
    assert result.count == 1
    rec = result.records[0]
    assert rec.metadata.generation_pattern == "personahub"


def test_star_generator_with_reward_filter(
    tmp_path: Path, human_seeds: list[CanonicalRecord]
) -> None:
    cfg = _make_config(tmp_path, generator="star", count=2)
    mock = MockLLMClient(
        responses=[
            {
                "instruction": "Q1",
                "response": "A1",
                "reasoning_trace": "Steps",
                "rationale_correct": True,
            },
            {
                "instruction": "Q2",
                "response": "A2",
                "reasoning_trace": "Steps",
                "rationale_correct": False,
            },
        ]
    )
    gen = SyntheticDataGenerator(llm_client=mock, config_path=cfg)
    result = gen.generate(seed_records=human_seeds)
    # Second response was filtered (rationale_correct=False)
    assert result.count == 1
    assert result.records[0].input.user == "Q1"


def test_rest_generator_is_legitimate_recursion_case(
    tmp_path: Path, synthetic_seed: CanonicalRecord
) -> None:
    cfg = _make_config(tmp_path, generator="rest", count=1)
    mock = MockLLMClient(
        responses=[
            {
                "instruction": "Iter-2 refined",
                "response": "Improved response",
                "reasoning_trace": "trace",
                "improvement_notes": "tighter bounds",
            }
        ]
    )
    gen = SyntheticDataGenerator(llm_client=mock, config_path=cfg)
    # ReST: iter-N synthetic seeds → iter-N+1 outputs; must use override.
    with pytest.warns(UserWarning):
        result = gen.generate(
            seed_records=[synthetic_seed], allow_recursive_synthetic=True
        )
    assert result.override_flag is True
    assert result.records[0].metadata.synthetic_depth == 2


# ---------------------------------------------------------------------------
# Output shape: canonical record is valid JSON-round-trippable
# ---------------------------------------------------------------------------


def test_generated_records_are_serializable(
    orca_config_file: Path, human_seeds: list[CanonicalRecord]
) -> None:
    mock = MockLLMClient(
        responses=[
            {"instruction": "Q A", "response": "A A", "reasoning_trace": "t"},
            {"instruction": "Q B", "response": "A B", "reasoning_trace": "t"},
        ]
    )
    gen = SyntheticDataGenerator(llm_client=mock, config_path=orca_config_file)
    result = gen.generate(seed_records=human_seeds)
    for rec in result.records:
        line = rec.to_jsonl_line()
        restored = CanonicalRecord.from_jsonl_line(line)
        # Round-trip invariants per schema
        assert restored.id == rec.id
        assert restored.input.user == rec.input.user
        assert restored.metadata.synthetic is True
        assert restored.metadata.synthetic_depth == rec.metadata.synthetic_depth
        # Full dict round-trip works too
        assert json.loads(line)
