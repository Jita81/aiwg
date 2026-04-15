"""Apache Arrow + Parquet adapter.

HuggingFace Datasets-compatible columnar export. Requires the optional
``pyarrow`` dependency — install via ``pip install -e .[parquet]`` or
``pip install pyarrow>=15``.

The adapter serializes the entire canonical record shape (no information
loss) by JSON-encoding the nested ``input``, ``output``, and ``metadata``
structs. This keeps the Arrow schema stable across heterogeneous records
(e.g. preference vs. standard outputs) while preserving lossless round
trips. Analytics pipelines that need native columnar projection can
extend the schema with a typed-struct variant — the ``--shard-size``
option is implemented here and carries over.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable

from aiwg_training.schemas import CanonicalRecord

from aiwg_training.formats.base import FormatAdapter

_PYARROW_IMPORT_ERROR = (
    "pyarrow is required for the Parquet adapter. "
    "Install with `pip install -e .[parquet]` or `pip install pyarrow>=15`."
)


def _require_pyarrow() -> Any:
    try:
        import pyarrow as pa  # type: ignore[import-not-found]
        import pyarrow.parquet as pq  # type: ignore[import-not-found]
    except ImportError as exc:  # pragma: no cover - exercised in env without pyarrow
        raise ImportError(_PYARROW_IMPORT_ERROR) from exc
    return pa, pq


class ParquetAdapter(FormatAdapter):
    """Canonical ↔ Parquet via Apache Arrow.

    ``write`` emits either a single ``.parquet`` file (when
    ``shard_size`` is 0 or unset) or a directory of numbered shards.

    Requires ``pip install -e .[parquet]``.
    """

    name = "parquet"
    extension = ".parquet"
    native_fields = (
        "id",
        "task_type",
        "input.user",
        "input.system",
        "output.assistant",
        "output.reasoning_trace",
        "output.tool_calls",
        "metadata.quality_grade",
        "metadata.license",
        "metadata.provenance_id",
    )

    def __init__(self, shard_size: int = 0) -> None:
        self.shard_size = max(0, int(shard_size))

    # ---- Transform ----

    def to_target(self, records: list[CanonicalRecord]) -> Iterable[dict[str, Any]]:
        """Yield flat dicts suitable for :meth:`pyarrow.Table.from_pylist`.

        Nested structs are JSON-encoded to stabilize the schema across
        heterogeneous record variants (preference vs. standard output).
        """
        for r in records:
            d = r.to_dict()
            yield {
                "id": r.id,
                "task_type": r.task_type.value,
                "input_json": json.dumps(d.get("input", {}), ensure_ascii=False),
                "output_json": json.dumps(d.get("output", {}), ensure_ascii=False),
                "metadata_json": json.dumps(d.get("metadata", {}), ensure_ascii=False),
            }

    def from_target(self, data: Any) -> list[CanonicalRecord]:
        rows = self._coerce_rows(data)
        out: list[CanonicalRecord] = []
        for row in rows:
            doc = {
                "id": row["id"],
                "task_type": row["task_type"],
                "input": json.loads(row["input_json"]),
                "output": json.loads(row["output_json"]),
                "metadata": json.loads(row["metadata_json"]),
            }
            out.append(CanonicalRecord.model_validate(doc))
        return out

    @staticmethod
    def _coerce_rows(data: Any) -> list[dict[str, Any]]:
        if isinstance(data, dict) and "rows" in data:
            return list(data["rows"])
        return list(data)

    # ---- Disk IO (overrides the JSONL default) ----

    def write(
        self,
        records: list[CanonicalRecord],
        path: Path | str,
        *,
        write_sidecar_file: bool = True,
    ) -> Path:
        """Write records as a single Parquet file or a sharded directory.

        When ``self.shard_size > 0`` and ``path`` is a directory (or has
        no ``.parquet`` suffix), emit ``part-0001.parquet`` etc. under
        ``path``. Otherwise write one file at ``path``.
        """
        pa, pq = _require_pyarrow()

        rows = list(self.to_target(records))
        table = pa.Table.from_pylist(rows)

        out_path = Path(path)

        if self.shard_size > 0:
            out_path.mkdir(parents=True, exist_ok=True)
            for shard_idx, start in enumerate(range(0, len(rows), self.shard_size), start=1):
                shard_rows = rows[start : start + self.shard_size]
                shard_table = pa.Table.from_pylist(shard_rows)
                shard_path = out_path / f"part-{shard_idx:04d}.parquet"
                pq.write_table(shard_table, shard_path, compression="snappy")
        else:
            out_path.parent.mkdir(parents=True, exist_ok=True)
            pq.write_table(table, out_path, compression="snappy")

        if write_sidecar_file and self._needs_sidecar():
            from aiwg_training.formats.base import write_sidecar

            write_sidecar(records, out_path, self.native_fields)
        return out_path

    def read(self, path: Path | str) -> list[CanonicalRecord]:
        pa, pq = _require_pyarrow()
        p = Path(path)

        if p.is_dir():
            tables = []
            for shard in sorted(p.glob("*.parquet")):
                tables.append(pq.read_table(shard))
            if not tables:
                return []
            table = pa.concat_tables(tables)
        else:
            table = pq.read_table(p)

        rows = table.to_pylist()
        return self.from_target({"rows": rows, "sidecar": {}})


__all__ = ["ParquetAdapter"]
