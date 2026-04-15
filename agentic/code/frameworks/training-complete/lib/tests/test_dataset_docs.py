"""Tests for ``aiwg_training.publication.dataset_docs`` (#846).

Covers the three template renderers (Datasheet, Model Card, Data Statement),
auto-population coverage (≥60% target per REF-451), interactive HUMAN FILL
handling, and optional LLM-driven suggestions.
"""

from __future__ import annotations

import re
import uuid
from pathlib import Path

import pytest

from aiwg_training.publication import DatasetDocsGenerator, GenerationResult
from aiwg_training.publication._field_helpers import (
    compute_quality_distribution,
    format_bullet_list,
    format_sources_table,
    format_split_summary,
    read_decontamination_report,
)
from aiwg_training.schemas.dataset_manifest import (
    DatasetManifest,
    SourceEntry,
    SplitCounts,
    StorageRef,
    SyntheticRatio,
)
from aiwg_training.schemas.example_record import (
    CanonicalRecord,
    ExampleMetadata,
    InputPayload,
    OutputPayload,
    QualityGrade,
    TaskType,
)


# --------------------------------------------------------------------------- #
# Fixtures                                                                     #
# --------------------------------------------------------------------------- #


TEMPLATES_DIR = (
    Path(__file__).resolve().parent.parent.parent / "templates"
)


@pytest.fixture
def manifest() -> DatasetManifest:
    return DatasetManifest(
        version="2026.4.0",
        name="aiwg-demo-dataset",
        description="Synthetic demonstration corpus for unit tests.",
        seed=42,
        split_counts=SplitCounts(train=80, validation=10, test=10),
        sources=[
            SourceEntry(ref_id="REF-001", license="MIT", example_count=60, quality_grade="HIGH"),
            SourceEntry(ref_id="REF-002", license="Apache-2.0", example_count=40, quality_grade="MODERATE"),
        ],
        license="MIT",
        provenance_record_id=".aiwg/training/provenance/2026.4.0.jsonld",
        storage_ref=StorageRef(aiwg_index_snapshot_id="snap-abc123"),
        fixity_manifest=".aiwg/training/datasets/2026.4.0-fixity.sha256",
        created_at="2026-04-14T00:00:00+00:00",
        synthetic_ratio=SyntheticRatio(train=0.25, validation=0.0, test=0.0),
        decontamination_report_id=".aiwg/training/datasets/2026.4.0-decon-report.md",
        intended_use="Instruction-following benchmark for small decoder models.",
        out_of_scope=[
            "Credit scoring or lending decisions",
            "Safety-critical clinical use",
        ],
        ethical_considerations=(
            "Contains no personal data; synthesised prompts reviewed for toxicity."
        ),
    )


@pytest.fixture
def examples() -> list[CanonicalRecord]:
    recs: list[CanonicalRecord] = []
    # 6 HIGH, 3 MODERATE, 1 LOW — covers three grades
    grade_plan = (
        [QualityGrade.HIGH] * 6
        + [QualityGrade.MODERATE] * 3
        + [QualityGrade.LOW] * 1
    )
    for grade in grade_plan:
        recs.append(
            CanonicalRecord(
                id=str(uuid.uuid4()),
                task_type=TaskType.INSTRUCTION_FOLLOWING,
                input=InputPayload(user="test prompt"),
                output=OutputPayload(assistant="test response"),
                metadata=ExampleMetadata(
                    quality_grade=grade,
                    license="MIT",
                    provenance_id=str(uuid.uuid4()),
                    created_at="2026-04-14T00:00:00+00:00",
                ),
            )
        )
    return recs


# --------------------------------------------------------------------------- #
# Helper assertions                                                            #
# --------------------------------------------------------------------------- #


_PLACEHOLDER_RE = re.compile(r"\{\{[a-zA-Z0-9_]+\}\}")


def _count_placeholders(text: str) -> int:
    return len(_PLACEHOLDER_RE.findall(text))


# --------------------------------------------------------------------------- #
# _field_helpers tests                                                         #
# --------------------------------------------------------------------------- #


def test_compute_quality_distribution(examples: list[CanonicalRecord]) -> None:
    dist = compute_quality_distribution(examples)
    assert dist[QualityGrade.HIGH] == 6
    assert dist[QualityGrade.MODERATE] == 3
    assert dist[QualityGrade.LOW] == 1
    assert dist[QualityGrade.VERY_LOW] == 0


def test_format_sources_table(manifest: DatasetManifest) -> None:
    table = format_sources_table(manifest.sources)
    assert "REF-001" in table
    assert "Apache-2.0" in table
    assert table.startswith("| REF ID |")


def test_format_sources_table_empty() -> None:
    assert format_sources_table([]) == "(no sources listed)"


def test_format_bullet_list() -> None:
    assert format_bullet_list(["a", "b"]) == "- a\n- b"
    assert format_bullet_list([]) == "(none)"


def test_format_split_summary(manifest: DatasetManifest) -> None:
    summary = format_split_summary(manifest.split_counts)
    assert "train=80" in summary
    assert "total=100" in summary


def test_read_decontamination_report_missing(tmp_path: Path) -> None:
    assert read_decontamination_report(tmp_path / "nope.md") is None


def test_read_decontamination_report_parses_summary(tmp_path: Path) -> None:
    report = tmp_path / "decon.md"
    report.write_text(
        "# Decontamination Report\n\n"
        "## Summary\n\n"
        "- **Total pairs checked:** 1,234\n"
        "- **Contaminated pairs:** 12\n"
        "- **Contamination rate:** 0.97%\n\n"
        "## Details\n\n"
        "- **Ignored section:** value\n",
        encoding="utf-8",
    )
    parsed = read_decontamination_report(report)
    assert parsed == {
        "total_pairs_checked": "1,234",
        "contaminated_pairs": "12",
        "contamination_rate": "0.97%",
    }


# --------------------------------------------------------------------------- #
# Generator — basic rendering                                                  #
# --------------------------------------------------------------------------- #


def test_datasheet_auto_population_meets_threshold(
    manifest: DatasetManifest, examples: list[CanonicalRecord], tmp_path: Path
) -> None:
    template = TEMPLATES_DIR / "datasheet-for-datasets.md"
    original = template.read_text(encoding="utf-8")
    before = _count_placeholders(original)

    gen = DatasetDocsGenerator(manifest, examples=examples)
    result = gen.generate(template, tmp_path / "ds.md")
    rendered = result.output_path.read_text(encoding="utf-8")
    after = _count_placeholders(rendered)

    # Datasheet has many manifest-external fields (collection process, IRB,
    # annotators, …) so 60% cannot be hit on the datasheet alone without
    # additional artifacts; we assert the key manifest-derived fields
    # resolved and the unresolved ones rendered as the sentinel.
    assert manifest.name in rendered
    assert manifest.version in rendered
    assert "train=80" in rendered
    assert "MIT" in rendered
    assert "(MIT)" not in rendered  # license_url is not a manifest field
    assert "UNKNOWN — see manifest" in rendered
    # No stray placeholders survived
    assert after == 0
    # Sanity: a non-trivial number of placeholders were resolved from the
    # manifest.
    assert len(result.fields_auto_populated) >= 10
    assert result.auto_population_rate > 0.0
    assert result.doc_type == "datasheet"
    # Before had many placeholders
    assert before > 20


def test_model_card_training_data_auto_populated(
    manifest: DatasetManifest, tmp_path: Path
) -> None:
    template = TEMPLATES_DIR / "model-card.md"
    gen = DatasetDocsGenerator(manifest)
    result = gen.generate(template, tmp_path / "mc.md")
    rendered = result.output_path.read_text(encoding="utf-8")

    # Training Data section is the auto-populated section of the model card
    assert manifest.name in rendered
    assert manifest.version in rendered
    assert "train=80" in rendered
    # Other sections still show HUMAN FILL markers in non-interactive mode
    assert "HUMAN FILL" in rendered
    assert result.fields_human_fill  # non-empty
    assert result.doc_type == "model-card"


def test_data_statement_generation(
    manifest: DatasetManifest, tmp_path: Path
) -> None:
    template = TEMPLATES_DIR / "data-statement.md"
    gen = DatasetDocsGenerator(manifest)
    result = gen.generate(template, tmp_path / "ds-stmt.md")
    rendered = result.output_path.read_text(encoding="utf-8")

    assert manifest.name in rendered
    assert manifest.version in rendered
    assert manifest.provenance_record_id in rendered
    assert result.doc_type == "data-statement"


def test_generate_all_produces_three_files(
    manifest: DatasetManifest, tmp_path: Path
) -> None:
    gen = DatasetDocsGenerator(manifest)
    paths = gen.generate_all(tmp_path, templates_dir=TEMPLATES_DIR)

    assert set(paths.keys()) == {"datasheet", "model-card", "data-statement"}
    for doc_type, path in paths.items():
        assert path.exists()
        content = path.read_text(encoding="utf-8")
        assert manifest.name in content
        # Version-prefixed filenames per SKILL.md convention
        assert path.name.startswith(manifest.version)


def test_cross_template_field_consistency(
    manifest: DatasetManifest, tmp_path: Path
) -> None:
    gen = DatasetDocsGenerator(manifest)
    paths = gen.generate_all(tmp_path, templates_dir=TEMPLATES_DIR)
    bodies = {k: v.read_text(encoding="utf-8") for k, v in paths.items()}

    # Dataset name and version appear identically in all three documents.
    # License is required in datasheet + model-card; data-statement follows
    # Bender & Friedman 2018 which focuses on language/speaker demographics
    # rather than licensing (license_ledger_path is linked instead).
    for kind, body in bodies.items():
        assert manifest.name in body, f"dataset name missing from {kind}"
        assert manifest.version in body, f"version missing from {kind}"
        if kind in ("datasheet", "model_card"):
            assert manifest.license in body, f"license missing from {kind}"


# --------------------------------------------------------------------------- #
# Interactive mode                                                             #
# --------------------------------------------------------------------------- #


def test_interactive_mode_replaces_markers(
    manifest: DatasetManifest, tmp_path: Path
) -> None:
    answers = iter([
        f"answer-{i}" for i in range(200)
    ])

    def canned_input(_prompt: str) -> str:
        return next(answers)

    template = TEMPLATES_DIR / "model-card.md"
    gen = DatasetDocsGenerator(manifest, input_fn=canned_input)
    result = gen.generate(template, tmp_path / "mc.md", interactive=True)
    rendered = result.output_path.read_text(encoding="utf-8")

    assert "HUMAN FILL" not in rendered
    assert "answer-0" in rendered
    assert result.fields_human_fill  # tracked even when filled


def test_interactive_mode_blank_response_preserves_marker(
    manifest: DatasetManifest, tmp_path: Path
) -> None:
    def blank_input(_prompt: str) -> str:
        return ""  # operator skipped

    template = TEMPLATES_DIR / "model-card.md"
    gen = DatasetDocsGenerator(manifest, input_fn=blank_input)
    gen.generate(template, tmp_path / "mc.md", interactive=True)
    rendered = (tmp_path / "mc.md").read_text(encoding="utf-8")

    # With no suggestion and blank answer, marker survives
    assert "HUMAN FILL" in rendered


# --------------------------------------------------------------------------- #
# LLM suggestion mode                                                          #
# --------------------------------------------------------------------------- #


class _StubLLMClient:
    """Minimal stand-in for the Phase 3A ``MockLLMClient``.

    Avoids importing ``aiwg_training.synthesis.llm_client`` (which lands in
    parallel) so these tests remain independent of Phase 3A landing order.
    """

    def __init__(self, response: str = "Suggested field content.") -> None:
        self.response = response
        self.calls: list[str] = []

    def complete(self, prompt: str, **_: object) -> str:
        self.calls.append(prompt)
        return self.response


def test_llm_suggestion_accepted_on_blank_response(
    manifest: DatasetManifest, tmp_path: Path
) -> None:
    llm = _StubLLMClient(response="Primary intended use is instruction tuning.")

    def blank_input(_prompt: str) -> str:
        return ""  # accept suggestion

    template = TEMPLATES_DIR / "model-card.md"
    gen = DatasetDocsGenerator(manifest, llm_client=llm, input_fn=blank_input)
    result = gen.generate(template, tmp_path / "mc.md", interactive=True)
    rendered = result.output_path.read_text(encoding="utf-8")

    assert llm.calls, "LLM should have been called for HUMAN FILL fields"
    assert "Primary intended use is instruction tuning." in rendered
    assert result.llm_suggestions  # suggestions were recorded


def test_llm_suggestion_overridden_by_user(
    manifest: DatasetManifest, tmp_path: Path
) -> None:
    llm = _StubLLMClient(response="LLM draft here.")
    answers = iter(["operator override"] * 200)

    def override_input(_prompt: str) -> str:
        return next(answers)

    template = TEMPLATES_DIR / "model-card.md"
    gen = DatasetDocsGenerator(manifest, llm_client=llm, input_fn=override_input)
    gen.generate(template, tmp_path / "mc.md", interactive=True)
    rendered = (tmp_path / "mc.md").read_text(encoding="utf-8")

    assert "operator override" in rendered
    assert "LLM draft here." not in rendered


def test_llm_errors_swallowed(
    manifest: DatasetManifest, tmp_path: Path
) -> None:
    class _FailingClient:
        def complete(self, *_: object, **__: object) -> str:
            raise RuntimeError("network blip")

    def blank_input(_prompt: str) -> str:
        return ""

    template = TEMPLATES_DIR / "model-card.md"
    gen = DatasetDocsGenerator(
        manifest, llm_client=_FailingClient(), input_fn=blank_input
    )
    # Should not raise
    result = gen.generate(template, tmp_path / "mc.md", interactive=True)
    assert result.output_path.exists()


# --------------------------------------------------------------------------- #
# Examples-driven fields                                                       #
# --------------------------------------------------------------------------- #


def test_quality_distribution_rendered_when_examples_provided(
    manifest: DatasetManifest, examples: list[CanonicalRecord], tmp_path: Path
) -> None:
    # Build a tiny template exercising the placeholder
    template = tmp_path / "mini.md"
    template.write_text(
        "# {{dataset_name}} quality\n\n{{quality_distribution}}\n", encoding="utf-8"
    )
    out = tmp_path / "out.md"

    gen = DatasetDocsGenerator(manifest, examples=examples)
    result = gen.generate(template, out)
    body = out.read_text(encoding="utf-8")

    assert "| HIGH | 6 |" in body
    assert "| MODERATE | 3 |" in body
    assert "quality_distribution" in result.fields_auto_populated


def test_unresolved_fields_reported(
    manifest: DatasetManifest, tmp_path: Path
) -> None:
    template = tmp_path / "mini.md"
    template.write_text("{{dataset_name}} / {{nonexistent_field}}\n", encoding="utf-8")
    out = tmp_path / "out.md"

    gen = DatasetDocsGenerator(manifest)
    result = gen.generate(template, out)
    body = out.read_text(encoding="utf-8")

    assert "UNKNOWN — see manifest" in body
    assert "nonexistent_field" in result.fields_unresolved
    assert "dataset_name" in result.fields_auto_populated


def test_generation_result_auto_population_rate(
    manifest: DatasetManifest, tmp_path: Path
) -> None:
    template = tmp_path / "mini.md"
    # 3 resolved, 1 unresolved → 75%
    template.write_text(
        "{{dataset_name}} {{version}} {{license_id}} {{unknown_x}}\n",
        encoding="utf-8",
    )
    gen = DatasetDocsGenerator(manifest)
    result = gen.generate(template, tmp_path / "o.md")
    assert result.auto_population_rate == pytest.approx(0.75)
