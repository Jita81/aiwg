"""Tests for the decontamination detection module (#842)."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

from aiwg_training.decontamination import (
    DecontaminationCheck,
    FuzzyChecker,
    NGramChecker,
    SemanticChecker,
    TargetResult,
    generate_markdown_report,
    load_targets,
)
from aiwg_training.decontamination.report import DecontaminationReport
from aiwg_training.decontamination.targets import DEFAULT_TARGETS_PATH, EvalTarget, TargetsConfig
from aiwg_training.schemas import (
    CanonicalRecord,
    ExampleMetadata,
    InputPayload,
    OutputPayload,
    QualityGrade,
    TaskType,
)

# --- Fixture builders ---


def _mk_record(idx: int, user: str, assistant: str) -> CanonicalRecord:
    return CanonicalRecord(
        id=f"ex-{idx:03d}",
        task_type=TaskType.INSTRUCTION_FOLLOWING,
        input=InputPayload(user=user),
        output=OutputPayload(assistant=assistant),
        metadata=ExampleMetadata(
            quality_grade=QualityGrade.HIGH,
            license="CC-BY-4.0",
            provenance_id=f"prov-{idx:03d}",
            created_at="2026-04-14T00:00:00+00:00",
        ),
    )


# Two deliberately-seeded contamination strings from the "eval set"
SEEDED_EVAL_A = (
    "What is the capital of the French Republic and which river runs through it "
    "providing both historical and modern importance to the city"
)
SEEDED_EVAL_B = (
    "Compute the derivative of x squared plus three x plus seven with respect to x "
    "and explain each step of the differentiation process clearly"
)

EVAL_RECORDS = [
    SEEDED_EVAL_A,
    SEEDED_EVAL_B,
    "Discuss the impact of renewable energy policies on industrial output in the European Union",
    "Translate the following phrase into classical Latin preserving its original rhetorical structure",
    "Write a short essay contrasting Stoic and Epicurean philosophies of happiness",
]


@pytest.fixture
def dataset_records() -> list[CanonicalRecord]:
    """10 dataset records, 2 contain seeded contamination overlap."""
    recs: list[CanonicalRecord] = []
    # 8 clean records
    clean_prompts = [
        ("Explain recursion in simple terms", "Recursion is when a function calls itself"),
        ("Summarize the theory of relativity", "Special relativity explains space and time"),
        ("List three prime numbers", "2, 3, and 5 are prime"),
        ("Describe how photosynthesis works", "Plants convert sunlight into chemical energy"),
        ("What is a monad in Haskell", "A monad wraps values with computational context"),
        ("Give an example of a palindrome", "racecar reads the same forwards and backwards"),
        ("Define entropy in thermodynamics", "Entropy measures disorder in a system"),
        ("Write a haiku about autumn", "Leaves drift in the wind, crimson against steel grey sky"),
    ]
    for i, (u, a) in enumerate(clean_prompts):
        recs.append(_mk_record(i, u, a))

    # 2 contaminated records — their concatenated input+output contains 13-gram overlap
    # with the SEEDED_EVAL_A / SEEDED_EVAL_B strings above.
    recs.append(
        _mk_record(
            8,
            "Tell me: what is the capital of the French Republic",
            "and which river runs through it providing both historical and modern importance to the city of Paris",
        )
    )
    recs.append(
        _mk_record(
            9,
            "Please compute the derivative of x squared plus three",
            "x plus seven with respect to x and explain each step of the differentiation process clearly",
        )
    )
    return recs


@pytest.fixture
def eval_records() -> list[str]:
    return list(EVAL_RECORDS)


# --- NGramChecker tests ---


def test_ngram_detects_seeded_contamination(
    dataset_records: list[CanonicalRecord], eval_records: list[str]
) -> None:
    checker = NGramChecker(ngram_size=13)
    result = checker.check(dataset_records, eval_records)
    assert result.examples_scanned == 10
    assert result.overlap_count == 2, f"expected 2 seeded hits, got {result.overlap_count}"
    assert result.overlapping_examples == {"ex-008", "ex-009"}
    assert len(result.sample_overlaps) == 2
    assert all(s.score == 1.0 for s in result.sample_overlaps)


def test_ngram_no_false_positives_on_clean_data() -> None:
    recs = [
        _mk_record(0, "Hello world", "Greetings to you too"),
        _mk_record(1, "What is 2+2", "The answer is four"),
    ]
    evals = [
        "This is a completely different benchmark question about astrophysics and dark matter",
        "Another entirely unrelated evaluation string about medieval European history",
    ]
    result = NGramChecker(ngram_size=13).check(recs, evals)
    assert result.overlap_count == 0
    assert result.overlapping_examples == set()


def test_ngram_respects_ngram_size() -> None:
    # At n=30 the seeded overlap windows should not match (too long).
    recs = [
        _mk_record(
            0,
            "Tell me: what is the capital of the French Republic",
            "and which river runs through it",
        )
    ]
    result = NGramChecker(ngram_size=30).check(recs, [SEEDED_EVAL_A])
    assert result.overlap_count == 0


# --- Threshold / passed behavior ---


def test_threshold_behavior_passed_when_overlap_within_threshold(
    dataset_records: list[CanonicalRecord], eval_records: list[str]
) -> None:
    targets = [
        EvalTarget(
            id="SEEDED",
            name="seeded",
            source="test",
            eval_set_path="inline",
            ngram_size=13,
            threshold=5,
            detection_modes=["exact-ngram"],
        )
    ]
    cfg = TargetsConfig(schema_version="1.0", targets=targets)
    check = DecontaminationCheck(
        targets=cfg,
        eval_sets={"SEEDED": eval_records},
        dataset_version="test-v1",
    )
    check.run(dataset_records)
    assert check.passed is True, "threshold=5, overlap=2 should pass"


def test_threshold_behavior_failed_when_overlap_exceeds_threshold(
    dataset_records: list[CanonicalRecord], eval_records: list[str]
) -> None:
    targets = [
        EvalTarget(
            id="SEEDED",
            name="seeded",
            source="test",
            eval_set_path="inline",
            ngram_size=13,
            threshold=0,
            detection_modes=["exact-ngram"],
        )
    ]
    cfg = TargetsConfig(schema_version="1.0", targets=targets)
    check = DecontaminationCheck(
        targets=cfg,
        eval_sets={"SEEDED": eval_records},
        dataset_version="test-v1",
    )
    check.run(dataset_records)
    assert check.passed is False, "threshold=0, overlap=2 should fail"
    assert check.event is not None
    assert check.event.overlap_counts["SEEDED"] == 2


# --- Target loading ---


def test_load_default_targets() -> None:
    cfg = load_targets()
    ids = {t.id for t in cfg.targets}
    assert {"MMLU", "GSM8K", "HumanEval", "HELM", "MT-Bench", "AlpacaEval"} <= ids
    humaneval = next(t for t in cfg.targets if t.id == "HumanEval")
    assert humaneval.ngram_size == 8


def test_load_targets_from_explicit_path() -> None:
    cfg = load_targets(DEFAULT_TARGETS_PATH)
    assert cfg.schema_version == "1.0"
    assert cfg.override_defaults is False
    assert len(cfg.targets) == 6


def test_user_targets_unioned_by_default(tmp_path: Path) -> None:
    user_yaml = tmp_path / "user-targets.yaml"
    user_yaml.write_text(
        """
override_defaults: false
user_targets:
  - id: CustomBench
    name: "My internal bench"
    source: "internal"
    eval_set_path: "./my-evals/"
    ngram_size: 13
    threshold: 0
    detection_modes: [exact-ngram]
""".strip(),
        encoding="utf-8",
    )
    from aiwg_training.decontamination.targets import merge_user_targets

    base = load_targets()
    merged = merge_user_targets(base, user_yaml)
    ids = {t.id for t in merged.targets}
    assert "CustomBench" in ids
    assert "MMLU" in ids, "defaults should still be present in union mode"


def test_user_targets_override_when_flag_set(tmp_path: Path) -> None:
    user_yaml = tmp_path / "user-targets.yaml"
    user_yaml.write_text(
        """
override_defaults: true
user_targets:
  - id: OnlyMine
    name: "Solo bench"
    source: "internal"
    eval_set_path: "./solo/"
    ngram_size: 13
    threshold: 0
    detection_modes: [exact-ngram]
""".strip(),
        encoding="utf-8",
    )
    from aiwg_training.decontamination.targets import merge_user_targets

    merged = merge_user_targets(load_targets(), user_yaml)
    ids = {t.id for t in merged.targets}
    assert ids == {"OnlyMine"}


# --- Report generation ---


def test_report_generation_produces_valid_markdown(
    dataset_records: list[CanonicalRecord], eval_records: list[str], tmp_path: Path
) -> None:
    targets = [
        EvalTarget(
            id="SEEDED",
            name="Seeded test bench",
            source="test-fixture",
            eval_set_path="inline",
            ngram_size=13,
            threshold=0,
            detection_modes=["exact-ngram"],
        )
    ]
    cfg = TargetsConfig(schema_version="1.0", targets=targets)
    check = DecontaminationCheck(
        targets=cfg,
        eval_sets={"SEEDED": eval_records},
        dataset_version="v2026.4-test",
    )
    out_dir = tmp_path / "reports"
    report = check.run(dataset_records, output_dir=out_dir)

    md_path = out_dir / "decontamination-v2026.4-test.md"
    assert md_path.exists(), "report file should be written"
    text = md_path.read_text(encoding="utf-8")

    # Sanity checks on rendered content
    assert "Decontamination Report — v2026.4-test" in text
    assert "SEEDED" in text
    assert "Seeded test bench" in text
    # FAIL path (threshold=0, overlap=2)
    assert "FAIL" in text
    # Unresolved template tokens should not leak through
    assert "{{" not in text and "}}" not in text
    # Top-10 overlap samples table should be present
    assert "Top-10 overlap samples" in text

    # Report object reflects the failure
    assert isinstance(report, DecontaminationReport)
    assert report.overall_passed is False
    assert any(isinstance(r, TargetResult) for r in report.target_results)


def test_report_generation_pass_path(tmp_path: Path) -> None:
    targets = [
        EvalTarget(
            id="EMPTY",
            name="empty bench",
            source="test",
            eval_set_path="inline",
            ngram_size=13,
            threshold=0,
        )
    ]
    cfg = TargetsConfig(schema_version="1.0", targets=targets)
    check = DecontaminationCheck(targets=cfg, eval_sets={"EMPTY": []}, dataset_version="clean-v1")
    out_dir = tmp_path / "reports"
    report = check.run([_mk_record(0, "hello", "world")], output_dir=out_dir)
    text = (out_dir / "decontamination-clean-v1.md").read_text(encoding="utf-8")
    assert "PASS" in text
    assert "No overlap detected" in text
    assert report.overall_passed is True


# --- Fuzzy and semantic dispatch ---


def test_fuzzy_checker_runs() -> None:
    """FuzzyChecker should run with either rapidfuzz or difflib backend."""
    recs = [_mk_record(0, "the capital of France is Paris", "yes it is the capital")]
    evals = ["the capital of France is Paris and it has many museums"]
    result = FuzzyChecker(distance_threshold=30, candidate_chunk_size=50).check(recs, evals)
    # Not asserting exact count because backends differ; just assert it runs
    # and returns a sensible result object.
    assert result.examples_scanned == 1
    assert result.mode == "fuzzy"


@pytest.mark.skipif(
    importlib.util.find_spec("sentence_transformers") is None,
    reason="sentence-transformers not installed (optional 'semantic' extra)",
)
def test_semantic_checker_runs() -> None:  # pragma: no cover - optional dep
    recs = [_mk_record(0, "The capital of France", "is Paris")]
    evals = ["What is the French capital city"]
    result = SemanticChecker(similarity_threshold=0.3).check(recs, evals)
    assert result.mode == "semantic"
    assert result.examples_scanned == 1


# --- Event emission ---


def test_event_records_overlap_counts_and_mode(
    dataset_records: list[CanonicalRecord], eval_records: list[str]
) -> None:
    targets = [
        EvalTarget(
            id="SEEDED",
            name="seeded",
            source="test",
            eval_set_path="inline",
            ngram_size=13,
            threshold=0,
            detection_modes=["exact-ngram"],
        )
    ]
    cfg = TargetsConfig(schema_version="1.0", targets=targets)
    check = DecontaminationCheck(
        targets=cfg,
        eval_sets={"SEEDED": eval_records},
        dataset_version="evt-test",
    )
    check.run(dataset_records)
    assert check.event is not None
    assert check.event.op == "decontamination-check"
    assert check.event.detection_mode == "exact_ngram"
    assert check.event.passed is False
    assert check.event.targets == ["SEEDED"]
    assert check.event.overlap_counts == {"SEEDED": 2}
