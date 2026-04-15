"""Tests for the ingest layer (source acquisition + canonical conversion)."""

from __future__ import annotations

import json
import shutil
import socket
from pathlib import Path

import pytest
import yaml

from aiwg_training.ingest import (
    AcquisitionResult,
    LicenseRequiredError,
    SourceAcquirer,
    UnknownFormatError,
    convert_jsonl_to_records,
    convert_markdown_to_records,
    detect_format,
)
from aiwg_training.schemas import (
    CanonicalRecord,
    ExampleMetadata,
    InputPayload,
    OutputPayload,
    QualityGrade,
    TaskType,
    write_jsonl,
)


def _have_network() -> bool:
    try:
        socket.create_connection(("1.1.1.1", 53), timeout=1).close()
    except OSError:
        return False
    return True


def _have_git() -> bool:
    return shutil.which("git") is not None


# ---- acquire_filesystem ------------------------------------------------


def test_acquire_filesystem_stages_files_and_metadata(tmp_path: Path) -> None:
    src = tmp_path / "corpus"
    src.mkdir()
    for i in range(3):
        (src / f"doc{i}.md").write_text(f"# Doc {i}\n\n## Section\nBody {i}\n", encoding="utf-8")

    acquirer = SourceAcquirer(workspace=tmp_path / "ws")
    result = acquirer.acquire(f"file:{src}", license="MIT")

    assert isinstance(result, AcquisitionResult)
    assert result.source_type == "filesystem"
    assert result.license == "MIT"
    assert result.file_count == 3
    assert result.raw_dir.is_dir()

    # source.yaml records declared metadata.
    meta = yaml.safe_load((result.raw_dir / "source.yaml").read_text(encoding="utf-8"))
    assert meta["license"] == "MIT"
    assert meta["source_type"] == "filesystem"
    assert meta["file_count"] == 3

    # Fixity manifest exists and has one entry per staged file.
    manifest_text = result.fixity_manifest_path.read_text(encoding="utf-8")
    data_lines = [ln for ln in manifest_text.splitlines() if ln and not ln.startswith("#")]
    assert len(data_lines) == 3

    # Provenance JSON-LD was produced.
    prov_path = Path(meta["provenance_path"])
    assert prov_path.is_file()
    prov = json.loads(prov_path.read_text(encoding="utf-8"))
    assert "@graph" in prov


def test_license_gate_blocks_unlicensed_sources(tmp_path: Path) -> None:
    src = tmp_path / "corpus"
    src.mkdir()
    (src / "a.md").write_text("# a", encoding="utf-8")

    acquirer = SourceAcquirer(workspace=tmp_path / "ws")
    with pytest.raises(LicenseRequiredError):
        acquirer.acquire(f"file:{src}", license=None, allow_unlicensed=False)


def test_allow_unlicensed_tags_license_unknown(tmp_path: Path) -> None:
    src = tmp_path / "corpus"
    src.mkdir()
    (src / "a.md").write_text("# a", encoding="utf-8")

    acquirer = SourceAcquirer(workspace=tmp_path / "ws")
    result = acquirer.acquire(f"file:{src}", license=None, allow_unlicensed=True)
    assert result.license == "unknown"
    meta = yaml.safe_load((result.raw_dir / "source.yaml").read_text(encoding="utf-8"))
    assert meta["license"] == "unknown"
    assert meta["license_source"] == "unknown"


# ---- detect_format -----------------------------------------------------


def test_detect_format_code(tmp_path: Path) -> None:
    for i in range(4):
        (tmp_path / f"mod{i}.py").write_text(f"def f{i}():\n    return {i}\n", encoding="utf-8")
    assert detect_format(tmp_path) == "code"


def test_detect_format_docs(tmp_path: Path) -> None:
    for i in range(3):
        (tmp_path / f"doc{i}.md").write_text(f"# d{i}\n", encoding="utf-8")
    assert detect_format(tmp_path) == "docs"


def test_detect_format_mixed(tmp_path: Path) -> None:
    (tmp_path / "a.py").write_text("x=1\n", encoding="utf-8")
    (tmp_path / "b.md").write_text("# b\n", encoding="utf-8")
    (tmp_path / "c.md").write_text("# c\n", encoding="utf-8")
    # 1 code + 2 docs = no bucket >=60%, so "mixed"
    # (docs is 66%, so actually docs would dominate; use 50/50 instead)
    (tmp_path / "d.py").write_text("y=1\n", encoding="utf-8")
    assert detect_format(tmp_path) == "mixed"


def test_detect_format_empty(tmp_path: Path) -> None:
    assert detect_format(tmp_path) == "mixed"


# ---- convert_markdown_to_records ---------------------------------------


def test_convert_markdown_produces_records(tmp_path: Path) -> None:
    md = tmp_path / "guide.md"
    md.write_text(
        "# Title\n\nIntro dropped.\n\n"
        "## First\nBody of first.\n\n"
        "## Second\nBody of second.\n\n"
        "### Nested\nNested body.\n",
        encoding="utf-8",
    )
    records = convert_markdown_to_records(md, source_id="src-test", license="MIT")
    assert len(records) == 3
    headings = [r.input.user for r in records]
    assert headings == ["First", "Second", "Nested"]
    for r in records:
        assert r.task_type == TaskType.COMPLETION
        assert r.metadata.license == "MIT"
        assert r.metadata.quality_grade == QualityGrade.MODERATE
        assert "src-test" in r.metadata.source_refs
        assert r.output.assistant.strip()


def test_convert_markdown_fallback_no_headers(tmp_path: Path) -> None:
    md = tmp_path / "flat.md"
    md.write_text("Just some prose with no headers at all.\n", encoding="utf-8")
    records = convert_markdown_to_records(md, source_id="src-flat", license="CC-BY-4.0")
    assert len(records) == 1
    assert records[0].output.assistant.startswith("Just some prose")


# ---- convert_jsonl_to_records ------------------------------------------


def _build_canonical_record() -> CanonicalRecord:
    return CanonicalRecord(
        id="rec-1",
        task_type=TaskType.INSTRUCTION_FOLLOWING,
        input=InputPayload(user="What is 2+2?"),
        output=OutputPayload(assistant="4"),
        metadata=ExampleMetadata(
            quality_grade=QualityGrade.HIGH,
            license="MIT",
            provenance_id="prov-xyz",
            created_at="2026-04-14T00:00:00+00:00",
        ),
    )


def test_convert_jsonl_round_trip_canonical(tmp_path: Path) -> None:
    record = _build_canonical_record()
    jsonl_path = tmp_path / "canonical.jsonl"
    write_jsonl([record], jsonl_path)

    loaded = convert_jsonl_to_records(jsonl_path, source_id="src-canon", license="MIT")
    assert len(loaded) == 1
    assert loaded[0].id == "rec-1"
    assert loaded[0].input.user == "What is 2+2?"
    assert loaded[0].output.assistant == "4"
    assert loaded[0].metadata.provenance_id == "prov-xyz"


def test_convert_jsonl_alpaca(tmp_path: Path) -> None:
    alpaca_path = tmp_path / "alpaca.jsonl"
    alpaca_path.write_text(
        json.dumps({"instruction": "Translate", "input": "hola", "output": "hello"}) + "\n",
        encoding="utf-8",
    )
    records = convert_jsonl_to_records(alpaca_path, source_id="src-alp", license="Apache-2.0")
    assert len(records) == 1
    # Metadata re-stamped by the ingest layer.
    assert records[0].metadata.license == "Apache-2.0"


def test_convert_jsonl_chatml(tmp_path: Path) -> None:
    chatml_path = tmp_path / "chat.jsonl"
    chatml_path.write_text(
        json.dumps(
            {
                "messages": [
                    {"role": "system", "content": "Be terse."},
                    {"role": "user", "content": "Hi"},
                    {"role": "assistant", "content": "Hello."},
                ]
            }
        )
        + "\n",
        encoding="utf-8",
    )
    records = convert_jsonl_to_records(chatml_path, source_id="src-chat", license="MIT")
    assert len(records) == 1
    assert records[0].task_type == TaskType.DIALOGUE
    assert records[0].input.system == "Be terse."
    assert records[0].output.assistant == "Hello."


def test_convert_jsonl_unknown_raises(tmp_path: Path) -> None:
    weird = tmp_path / "weird.jsonl"
    weird.write_text(json.dumps({"foo": "bar"}) + "\n", encoding="utf-8")
    with pytest.raises(UnknownFormatError):
        convert_jsonl_to_records(weird, source_id="s", license="MIT")


# ---- git / url are network-dependent -----------------------------------


@pytest.mark.skipif(not _have_network() or not _have_git(), reason="offline or git missing")
def test_acquire_git_smoke(tmp_path: Path) -> None:
    """Smoke test — skipped offline. Not part of CI default run."""
    acquirer = SourceAcquirer(workspace=tmp_path / "ws")
    # Use a tiny, stable public repo. If this flakes, mark xfail.
    result = acquirer.acquire(
        "git:https://github.com/octocat/Hello-World.git",
        license="MIT",
    )
    assert result.source_type == "git"
    assert result.file_count > 0


@pytest.mark.skipif(not _have_network(), reason="offline")
def test_acquire_url_smoke(tmp_path: Path) -> None:
    acquirer = SourceAcquirer(workspace=tmp_path / "ws")
    result = acquirer.acquire(
        "https://raw.githubusercontent.com/octocat/Hello-World/master/README",
        license="MIT",
    )
    assert result.source_type == "url"
    assert result.file_count >= 1
