"""Tests for license-check, dataset-version, and dataset-reproduce modules.

Covers issues #837 (license inheritance + C1–C5) and #844 (dataset-version
atomic publication). The reproduce orchestrator is exercised via its
standalone ``compare_fixity`` helper since the replay step depends on modules
that have not landed yet.
"""

from __future__ import annotations

import uuid
from pathlib import Path

import pytest

from aiwg_training.core.fixity import write_manifest as write_fixity_manifest, FixityEntry
from aiwg_training.core.topology import MemoryTopology
from aiwg_training.publication import (
    DatasetReproducer,
    DatasetVersioner,
    PublicationGateError,
)
from aiwg_training.quality.license_check import (
    IncompatibleLicensesError,
    LicenseChecker,
    compute_effective_license,
    validate_inheritance,
)
from aiwg_training.schemas.dataset_manifest import SourceEntry
from aiwg_training.schemas.example_record import (
    CanonicalRecord,
    ExampleMetadata,
    InputPayload,
    OutputPayload,
    QualityGrade,
    TaskType,
)
from aiwg_training.schemas.log_event import read_events


# --------------------------------------------------------------------------- #
# Fixtures                                                                     #
# --------------------------------------------------------------------------- #


def _make_topology(tmp_path: Path) -> MemoryTopology:
    return MemoryTopology(
        namespace="training-complete",
        raw_sources=str(tmp_path / "raw"),
        derived_pages={},
        index=str(tmp_path / ".index.json"),
        log=str(tmp_path / ".log.jsonl"),
    )


def _make_example(
    *,
    license: str = "MIT",
    source_refs: list[str] | None = None,
    synthetic: bool = False,
) -> CanonicalRecord:
    return CanonicalRecord(
        id=str(uuid.uuid4()),
        task_type=TaskType.INSTRUCTION_FOLLOWING,
        input=InputPayload(user="test prompt"),
        output=OutputPayload(assistant="test response"),
        metadata=ExampleMetadata(
            quality_grade=QualityGrade.HIGH,
            license=license,
            provenance_id=str(uuid.uuid4()),
            created_at="2026-04-14T00:00:00+00:00",
            source_refs=source_refs or [],
            synthetic=synthetic,
        ),
    )


@pytest.fixture
def fixture_examples() -> list[CanonicalRecord]:
    """50 examples, 20 synthetic, half referencing source A, half source B."""
    examples: list[CanonicalRecord] = []
    for i in range(50):
        ref = "src-A" if i % 2 == 0 else "src-B"
        examples.append(
            _make_example(
                license="MIT",
                source_refs=[ref],
                synthetic=(i < 20),
            )
        )
    return examples


@pytest.fixture
def fixture_sources() -> list[SourceEntry]:
    return [
        SourceEntry(ref_id="src-A", license="MIT", example_count=25, quality_grade="HIGH"),
        SourceEntry(ref_id="src-B", license="Apache-2.0", example_count=25, quality_grade="HIGH"),
    ]


# --------------------------------------------------------------------------- #
# License module                                                               #
# --------------------------------------------------------------------------- #


def test_compute_effective_license_gpl_beats_mit() -> None:
    assert compute_effective_license(["MIT", "GPL-3.0-only"]) == "GPL-3.0-only"
    assert compute_effective_license(["Apache-2.0", "MIT", "GPL-3.0-only"]) == "GPL-3.0-only"


def test_compute_effective_license_prefers_most_restrictive() -> None:
    assert compute_effective_license(["MIT", "Apache-2.0"]) in ("MIT", "Apache-2.0")
    assert compute_effective_license(["MIT", "CC-BY-SA-4.0"]) == "CC-BY-SA-4.0"
    assert compute_effective_license(["CC-BY-SA-4.0", "GPL-3.0-only"]) == "GPL-3.0-only"
    # NC + GPL is intentionally rejected (NC forbids GPL's commercial-use guarantee)
    assert compute_effective_license(["MIT", "CC-BY-NC-4.0"]) == "CC-BY-NC-4.0"


def test_compute_effective_license_raises_on_gpl_nc_combo() -> None:
    """GPL family is incompatible with CC-BY-NC (commercial vs non-commercial conflict)."""
    with pytest.raises(IncompatibleLicensesError):
        compute_effective_license(["GPL-3.0-only", "CC-BY-NC-4.0"])


def test_compute_effective_license_raises_on_gpl2_gpl3() -> None:
    with pytest.raises(IncompatibleLicensesError):
        compute_effective_license(["GPL-2.0-only", "GPL-3.0-only"])


def test_validate_inheritance_flags_laundering() -> None:
    # MIT example derived from GPL-3.0-only sources is laundering — should fail.
    assert validate_inheritance("MIT", ["GPL-3.0-only"]) is False
    # GPL-3.0-only example from MIT sources is fine (more restrictive is allowed).
    assert validate_inheritance("GPL-3.0-only", ["MIT", "Apache-2.0"]) is True
    # Same-license round-trip.
    assert validate_inheritance("MIT", ["MIT"]) is True


def test_license_checker_c1_flags_missing_license() -> None:
    sources = [
        SourceEntry(ref_id="src-A", license="", example_count=10, quality_grade="HIGH"),
        SourceEntry(ref_id="src-B", license="MIT", example_count=10, quality_grade="HIGH"),
    ]
    # Pydantic accepts empty string; check_sources flags it.
    result = LicenseChecker().check_sources(sources)
    assert result.severity == "ERROR"
    assert result.passed is False
    assert any("missing license" in f for f in result.findings)


def test_license_checker_c2_flags_laundering(fixture_sources: list[SourceEntry]) -> None:
    # Replace src-A with GPL-3.0-only so MIT examples derived from it launder.
    fixture_sources[0] = SourceEntry(
        ref_id="src-A", license="GPL-3.0-only", example_count=25, quality_grade="HIGH"
    )
    examples = [_make_example(license="MIT", source_refs=["src-A"])]
    result = LicenseChecker().check_examples(examples, fixture_sources)
    assert result.severity == "ERROR"
    assert not result.passed
    assert any("laundering" in f for f in result.findings)


# --------------------------------------------------------------------------- #
# Dataset versioning                                                           #
# --------------------------------------------------------------------------- #


def test_compute_split_counts_deterministic(
    fixture_examples: list[CanonicalRecord], tmp_path: Path
) -> None:
    versioner = DatasetVersioner(workdir=tmp_path, topology=_make_topology(tmp_path))
    ratios = {"train": 0.8, "validation": 0.1, "test": 0.1}
    c1, a1 = versioner.compute_split_counts(fixture_examples, ratios, seed=42)
    c2, a2 = versioner.compute_split_counts(fixture_examples, ratios, seed=42)
    assert c1 == c2
    assert a1 == a2
    assert c1.total == len(fixture_examples)
    assert c1.train == 40
    assert c1.validation == 5
    assert c1.test == 5

    # Different seed must produce a different assignment (with high probability).
    _, a3 = versioner.compute_split_counts(fixture_examples, ratios, seed=1337)
    assert a1 != a3


def test_publish_end_to_end(
    fixture_examples: list[CanonicalRecord],
    fixture_sources: list[SourceEntry],
    tmp_path: Path,
) -> None:
    topology = _make_topology(tmp_path)
    versioner = DatasetVersioner(workdir=tmp_path, topology=topology)
    output_dir = tmp_path / "datasets"

    result = versioner.publish(
        version="2026.4.0",
        examples=fixture_examples,
        sources=fixture_sources,
        output_dir=output_dir,
        name="test-dataset",
        description="End-to-end publish fixture",
        seed=42,
        activity_log=tmp_path / "activity.log",
        # C5 requires SA ack when SA sources are present; our sources are
        # MIT + Apache so this is unnecessary here but documents the pattern.
        ethical_considerations="No share-alike sources; commercial use permitted.",
    )

    # YAML + JSON both written
    assert result.manifest_yaml.exists()
    assert result.manifest_json.exists()
    assert result.manifest_yaml.read_text().startswith("version:") or "version:" in result.manifest_yaml.read_text()

    # Fixity manifest exists and parses
    assert result.fixity_manifest.exists()
    fixity_text = result.fixity_manifest.read_text()
    assert "# AIWG Training Fixity Manifest" in fixity_text

    # Provenance record exists and is valid JSON-LD
    import json
    prov_data = json.loads(result.provenance_record.read_text())
    assert "@graph" in prov_data
    assert any(
        "aiwg:DatasetVersion" in entry.get("@type", [])
        for entry in prov_data["@graph"]
    )

    # DatasetVersionEvent appended to log
    events = read_events(topology.log)
    assert len(events) == 1
    assert events[0]["op"] == "dataset-version"
    assert events[0]["version"] == "2026.4.0"

    # Activity log entry
    activity_log = (tmp_path / "activity.log").read_text()
    assert "dataset-version published" in activity_log
    assert "2026.4.0" in activity_log

    # Staging directory is cleaned up
    assert not (output_dir / ".staging").exists()

    # Manifest has computed effective license (MIT vs Apache-2.0 — attribution tier)
    assert result.manifest.license in ("MIT", "Apache-2.0")
    assert result.manifest.split_counts.total == 50
    assert result.snapshot_id.startswith("fortemi-snapshot-2026.4.0-")


def test_publish_rollback_on_failure(
    fixture_examples: list[CanonicalRecord],
    fixture_sources: list[SourceEntry],
    tmp_path: Path,
) -> None:
    topology = _make_topology(tmp_path)
    versioner = DatasetVersioner(workdir=tmp_path, topology=topology)
    output_dir = tmp_path / "datasets"

    with pytest.raises(RuntimeError, match="simulate_failure_after"):
        versioner.publish(
            version="2026.4.1",
            examples=fixture_examples,
            sources=fixture_sources,
            output_dir=output_dir,
            name="rollback-test",
            description="Simulated mid-publish failure",
            seed=42,
            activity_log=tmp_path / "activity.log",
            ethical_considerations="Test fixture",
            simulate_failure_after="manifest",
        )

    # No final files should remain on disk
    assert not (output_dir / "2026.4.1.yaml").exists()
    assert not (output_dir / "2026.4.1.json").exists()
    assert not (output_dir / "2026.4.1-CHECKSUMS.sha256").exists()
    assert not (output_dir / "provenance" / "dataset-2026.4.1.jsonld").exists()

    # Staging directory cleaned up
    assert not (output_dir / ".staging").exists()

    # No log event emitted
    events = read_events(topology.log)
    assert events == []


def test_publish_blocks_on_incompatible_licenses_without_ack(
    fixture_examples: list[CanonicalRecord],
    tmp_path: Path,
) -> None:
    topology = _make_topology(tmp_path)
    versioner = DatasetVersioner(workdir=tmp_path, topology=topology)
    bad_sources = [
        SourceEntry(ref_id="src-A", license="GPL-2.0-only", example_count=25, quality_grade="HIGH"),
        SourceEntry(ref_id="src-B", license="GPL-3.0-only", example_count=25, quality_grade="HIGH"),
    ]
    with pytest.raises(PublicationGateError):
        versioner.publish(
            version="2026.4.2",
            examples=fixture_examples,
            sources=bad_sources,
            output_dir=tmp_path / "datasets",
            seed=42,
            activity_log=tmp_path / "activity.log",
        )


def test_publish_rejects_duplicate_version(
    fixture_examples: list[CanonicalRecord],
    fixture_sources: list[SourceEntry],
    tmp_path: Path,
) -> None:
    topology = _make_topology(tmp_path)
    versioner = DatasetVersioner(workdir=tmp_path, topology=topology)
    output_dir = tmp_path / "datasets"
    versioner.publish(
        version="2026.4.3",
        examples=fixture_examples,
        sources=fixture_sources,
        output_dir=output_dir,
        name="dup-test",
        description="first publish",
        seed=42,
        activity_log=tmp_path / "activity.log",
        ethical_considerations="Test fixture",
    )
    with pytest.raises(FileExistsError):
        versioner.publish(
            version="2026.4.3",
            examples=fixture_examples,
            sources=fixture_sources,
            output_dir=output_dir,
            name="dup-test",
            description="second publish attempt",
            seed=42,
            activity_log=tmp_path / "activity.log",
            ethical_considerations="Test fixture",
        )


def test_compute_synthetic_ratio(
    fixture_examples: list[CanonicalRecord], tmp_path: Path
) -> None:
    versioner = DatasetVersioner(workdir=tmp_path, topology=_make_topology(tmp_path))
    _, assignments = versioner.compute_split_counts(
        fixture_examples, {"train": 0.8, "validation": 0.1, "test": 0.1}, seed=42
    )
    ratio = versioner.compute_synthetic_ratio(fixture_examples, assignments)
    # 20/50 synthetic = 0.4 overall; per-split will vary with seed
    assert 0.0 <= ratio.train <= 1.0
    assert 0.0 <= ratio.validation <= 1.0
    assert 0.0 <= ratio.test <= 1.0


# --------------------------------------------------------------------------- #
# Dataset reproduction (fixity compare is the standalone path)                 #
# --------------------------------------------------------------------------- #


def test_compare_fixity_match(tmp_path: Path) -> None:
    entries = [FixityEntry(sha256="a" * 64, size_bytes=1, path="foo.jsonl")]
    m1 = tmp_path / "m1.sha256"
    m2 = tmp_path / "m2.sha256"
    write_fixity_manifest(entries, m1)
    write_fixity_manifest(entries, m2)
    cmp_ = DatasetReproducer().compare_fixity(m1, m2)
    assert cmp_.verdict == "MATCH"
    assert cmp_.matched == ["foo.jsonl"]


def test_compare_fixity_mismatch(tmp_path: Path) -> None:
    orig = [FixityEntry(sha256="a" * 64, size_bytes=1, path="foo.jsonl")]
    rebuilt = [FixityEntry(sha256="b" * 64, size_bytes=1, path="foo.jsonl")]
    m1 = tmp_path / "orig.sha256"
    m2 = tmp_path / "rebuilt.sha256"
    write_fixity_manifest(orig, m1)
    write_fixity_manifest(rebuilt, m2)
    cmp_ = DatasetReproducer().compare_fixity(m2, m1)
    assert cmp_.verdict == "MISMATCH"
    assert cmp_.mismatched == ["foo.jsonl"]


def test_reproduce_raises_notimplemented_on_replay(tmp_path: Path) -> None:
    """The replay step should raise until synthesis/filter modules land."""
    # Build a minimal manifest on disk
    from aiwg_training.schemas.dataset_manifest import (
        DatasetManifest,
        SplitCounts,
        StorageRef,
    )
    manifest = DatasetManifest(
        version="2026.4.99",
        name="repro-fixture",
        description="stub for reproduce NotImplementedError",
        seed=42,
        split_counts=SplitCounts(train=1, validation=0, test=0),
        sources=[
            SourceEntry(ref_id="src-A", license="MIT", example_count=1, quality_grade="HIGH")
        ],
        license="MIT",
        provenance_record_id="prov-stub",
        storage_ref=StorageRef(fortemi_archive_id="stub"),
        fixity_manifest=str(tmp_path / "CHECKSUMS.sha256"),
        created_at="2026-04-14T00:00:00+00:00",
    )
    manifest_path = tmp_path / "2026.4.99.yaml"
    manifest.save_yaml(manifest_path)

    workdir = tmp_path / "repro"
    with pytest.raises(NotImplementedError):
        DatasetReproducer().reproduce(manifest_path, workdir)
