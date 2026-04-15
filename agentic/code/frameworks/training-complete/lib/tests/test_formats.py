"""Format adapter round-trip tests.

Each adapter is exercised against a fixture of five heterogeneous
canonical records covering the common task types. The core property we
validate is:

    canonical -> format -> canonical  preserves ROUND_TRIP_INVARIANTS

Adapters that cannot cover a given task type (e.g. Alpaca + preference
records) are expected to raise ``NotImplementedError``.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from aiwg_training.formats import (
    ADAPTERS,
    AlpacaAdapter,
    CanonicalJsonlAdapter,
    ChatMLAdapter,
    ParquetAdapter,
    ShareGPTAdapter,
    get_adapter,
    validate_round_trip,
)
from aiwg_training.formats.base import read_sidecar
from aiwg_training.schemas import (
    ROUND_TRIP_INVARIANTS,
    CanonicalRecord,
    ExampleMetadata,
    InputPayload,
    OutputPayload,
    PreferenceOutput,
    QualityGrade,
    TaskType,
)


# --------------------------------------------------------------------------- #
# Fixtures                                                                    #
# --------------------------------------------------------------------------- #


def _meta(grade: QualityGrade = QualityGrade.HIGH) -> ExampleMetadata:
    return ExampleMetadata(
        quality_grade=grade,
        license="MIT",
        provenance_id="00000000-0000-0000-0000-000000000001",
        created_at="2026-04-14T00:00:00+00:00",
        domain=["test"],
    )


def _instruction_record() -> CanonicalRecord:
    return CanonicalRecord(
        id="rec-instruction",
        task_type=TaskType.INSTRUCTION_FOLLOWING,
        input=InputPayload(
            system="You are a helpful assistant.",
            user="Explain photosynthesis in one sentence.",
        ),
        output=OutputPayload(
            assistant="Plants convert sunlight, water, and CO2 into glucose and oxygen.",
        ),
        metadata=_meta(),
    )


def _reasoning_record() -> CanonicalRecord:
    return CanonicalRecord(
        id="rec-reasoning",
        task_type=TaskType.REASONING,
        input=InputPayload(user="What is 17 * 23?"),
        output=OutputPayload(
            assistant="391",
            reasoning_trace="17 * 23 = 17 * 20 + 17 * 3 = 340 + 51 = 391",
        ),
        metadata=_meta(),
    )


def _dialogue_record() -> CanonicalRecord:
    return CanonicalRecord(
        id="rec-dialogue",
        task_type=TaskType.DIALOGUE,
        input=InputPayload(
            system="You are Claude.",
            user="Hi there!",
            context_refs=["prev-turn-1"],
        ),
        output=OutputPayload(assistant="Hello! How can I help?"),
        metadata=_meta(QualityGrade.MODERATE),
    )


def _tool_use_record() -> CanonicalRecord:
    return CanonicalRecord(
        id="rec-tool-use",
        task_type=TaskType.TOOL_USE,
        input=InputPayload(
            user="What time is it in Tokyo?",
            tools_available=[{"name": "now", "parameters": {"tz": "string"}}],
        ),
        output=OutputPayload(
            assistant="",
            tool_calls=[
                {
                    "id": "t1",
                    "type": "function",
                    "function": {"name": "now", "arguments": '{"tz": "Asia/Tokyo"}'},
                }
            ],
        ),
        metadata=_meta(),
    )


def _preference_record() -> CanonicalRecord:
    return CanonicalRecord(
        id="rec-preference",
        task_type=TaskType.PREFERENCE,
        input=InputPayload(user="Write a haiku about autumn."),
        output=PreferenceOutput(
            chosen="Crimson leaves drifting / bare branches against gray sky / winter waits its turn",
            rejected="Autumn is a season with falling leaves and colder weather.",
            confidence=0.9,
        ),
        metadata=_meta(),
    )


@pytest.fixture
def records() -> list[CanonicalRecord]:
    return [
        _instruction_record(),
        _reasoning_record(),
        _dialogue_record(),
        _tool_use_record(),
        _preference_record(),
    ]


@pytest.fixture
def standard_records() -> list[CanonicalRecord]:
    return [
        _instruction_record(),
        _reasoning_record(),
        _dialogue_record(),
        _tool_use_record(),
    ]


# --------------------------------------------------------------------------- #
# Registry                                                                    #
# --------------------------------------------------------------------------- #


def test_registry_has_all_adapters() -> None:
    for name in ("alpaca", "sharegpt", "chatml", "jsonl", "canonical", "parquet"):
        assert name in ADAPTERS
    assert isinstance(get_adapter("alpaca"), AlpacaAdapter)
    assert isinstance(get_adapter("JSONL"), CanonicalJsonlAdapter)
    with pytest.raises(KeyError):
        get_adapter("not-a-format")


# --------------------------------------------------------------------------- #
# In-memory round trip per adapter                                            #
# --------------------------------------------------------------------------- #


def _assert_invariants(orig: CanonicalRecord, rebuilt: CanonicalRecord) -> None:
    assert orig.id == rebuilt.id
    assert orig.task_type == rebuilt.task_type
    assert orig.input.user == rebuilt.input.user
    # output.assistant vs. output.chosen is handled by the helper.
    if orig.is_preference():
        assert isinstance(rebuilt.output, PreferenceOutput)
        assert orig.output.chosen == rebuilt.output.chosen  # type: ignore[union-attr]
    else:
        assert orig.output.assistant == rebuilt.output.assistant  # type: ignore[union-attr]
    assert orig.metadata.quality_grade == rebuilt.metadata.quality_grade
    assert orig.metadata.license == rebuilt.metadata.license
    assert orig.metadata.provenance_id == rebuilt.metadata.provenance_id


def test_jsonl_round_trip(records: list[CanonicalRecord]) -> None:
    adapter = CanonicalJsonlAdapter()
    report = validate_round_trip(records, adapter)
    assert report.ok, report.missing
    assert report.total == len(records)


def test_jsonl_on_disk_round_trip(tmp_path: Path, records: list[CanonicalRecord]) -> None:
    adapter = CanonicalJsonlAdapter()
    out = tmp_path / "out.jsonl"
    adapter.write(records, out)
    # Identity format needs no sidecar.
    assert not Path(str(out) + ".metadata.yaml").exists()
    rebuilt = adapter.read(out)
    assert len(rebuilt) == len(records)
    for o, r in zip(records, rebuilt):
        _assert_invariants(o, r)


@pytest.mark.parametrize(
    "adapter_cls",
    [AlpacaAdapter, ShareGPTAdapter, ChatMLAdapter],
)
def test_on_disk_round_trip_with_sidecar(
    tmp_path: Path,
    standard_records: list[CanonicalRecord],
    adapter_cls: type,
) -> None:
    adapter = adapter_cls()
    out = tmp_path / f"out{adapter.extension}"
    adapter.write(standard_records, out)
    assert Path(str(out) + ".metadata.yaml").exists(), "sidecar must be written"
    rebuilt = adapter.read(out)
    assert len(rebuilt) == len(standard_records)
    for orig, got in zip(standard_records, rebuilt):
        _assert_invariants(orig, got)


# --------------------------------------------------------------------------- #
# Alpaca-specific behaviour                                                   #
# --------------------------------------------------------------------------- #


def test_alpaca_rejects_preference_records() -> None:
    adapter = AlpacaAdapter()
    with pytest.raises(NotImplementedError):
        list(adapter.to_target([_preference_record()]))


def test_alpaca_sidecar_preserves_reasoning_trace(tmp_path: Path) -> None:
    adapter = AlpacaAdapter()
    records = [_reasoning_record()]
    out = tmp_path / "alpaca.jsonl"
    adapter.write(records, out)
    sidecar = read_sidecar(out)
    assert 1 in sidecar
    assert sidecar[1]["output"]["reasoning_trace"].startswith("17 * 23")


def test_alpaca_sidecar_preserves_tool_calls(tmp_path: Path) -> None:
    adapter = AlpacaAdapter()
    records = [_tool_use_record()]
    out = tmp_path / "alpaca.jsonl"
    adapter.write(records, out)
    sidecar = read_sidecar(out)
    assert sidecar[1]["output"]["tool_calls"][0]["id"] == "t1"


def test_alpaca_promotes_user_to_instruction_when_no_system() -> None:
    adapter = AlpacaAdapter()
    record = CanonicalRecord(
        id="rec-no-system",
        task_type=TaskType.INSTRUCTION_FOLLOWING,
        input=InputPayload(user="List the planets."),
        output=OutputPayload(assistant="Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune."),
        metadata=_meta(),
    )
    rows = list(adapter.to_target([record]))
    assert rows[0]["instruction"] == "List the planets."
    assert rows[0]["input"] == ""


# --------------------------------------------------------------------------- #
# ChatML-specific behaviour (tool calls are native, not sidecar-only)         #
# --------------------------------------------------------------------------- #


def test_chatml_preserves_tool_calls_natively() -> None:
    adapter = ChatMLAdapter()
    rows = list(adapter.to_target([_tool_use_record()]))
    assistant_msg = [m for m in rows[0]["messages"] if m["role"] == "assistant"][0]
    assert assistant_msg["tool_calls"][0]["id"] == "t1"

    rebuilt = adapter.from_target(rows)
    assert rebuilt[0].output.tool_calls is not None  # type: ignore[union-attr]
    assert rebuilt[0].output.tool_calls[0]["id"] == "t1"  # type: ignore[union-attr,index]


def test_chatml_rejects_preference_records() -> None:
    adapter = ChatMLAdapter()
    with pytest.raises(NotImplementedError):
        list(adapter.to_target([_preference_record()]))


# --------------------------------------------------------------------------- #
# ShareGPT role mapping                                                       #
# --------------------------------------------------------------------------- #


def test_sharegpt_role_mapping() -> None:
    adapter = ShareGPTAdapter()
    rows = list(adapter.to_target([_dialogue_record()]))
    roles = [t["from"] for t in rows[0]["conversations"]]
    assert roles == ["system", "human", "gpt"]


# --------------------------------------------------------------------------- #
# ROUND_TRIP_INVARIANTS contract                                              #
# --------------------------------------------------------------------------- #


def test_round_trip_invariants_stable() -> None:
    # Guard against accidental churn to the invariants contract.
    expected = {
        "id",
        "task_type",
        "input.user",
        "output.assistant",
        "metadata.quality_grade",
        "metadata.license",
        "metadata.provenance_id",
    }
    assert set(ROUND_TRIP_INVARIANTS) == expected


# --------------------------------------------------------------------------- #
# Optional: Parquet (skipped unless pyarrow is installed)                     #
# --------------------------------------------------------------------------- #


def _pyarrow_available() -> bool:
    try:
        import pyarrow  # noqa: F401
        return True
    except ImportError:
        return False


_skip_no_pyarrow = pytest.mark.skipif(
    not _pyarrow_available(), reason="pyarrow optional extra not installed"
)


@_skip_no_pyarrow
def test_parquet_round_trip(tmp_path: Path, records: list[CanonicalRecord]) -> None:
    adapter = ParquetAdapter()
    out = tmp_path / "out.parquet"
    adapter.write(records, out)
    rebuilt = adapter.read(out)
    assert len(rebuilt) == len(records)
    for orig, got in zip(records, rebuilt):
        _assert_invariants(orig, got)


@_skip_no_pyarrow
def test_parquet_sharded_output(tmp_path: Path, standard_records: list[CanonicalRecord]) -> None:
    adapter = ParquetAdapter(shard_size=2)
    out_dir = tmp_path / "shards"
    adapter.write(standard_records, out_dir)
    shards = sorted(out_dir.glob("*.parquet"))
    assert len(shards) == 2
    rebuilt = adapter.read(out_dir)
    assert len(rebuilt) == len(standard_records)


def test_parquet_graceful_import_error_without_pyarrow(tmp_path: Path) -> None:
    """ParquetAdapter construction is cheap; write() raises clear ImportError."""
    if _pyarrow_available():
        pytest.skip("pyarrow installed — this test exercises the missing-extra path")
    adapter = ParquetAdapter()
    with pytest.raises(ImportError, match="pyarrow"):
        adapter.write([_instruction_record()], tmp_path / "out.parquet")
