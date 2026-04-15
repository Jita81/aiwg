"""Format adapters for the aiwg-training package.

Adapters convert between the canonical :class:`CanonicalRecord` and
common dataset formats (Alpaca, ShareGPT, ChatML, Parquet, canonical
JSONL). Lookup adapters via :func:`get_adapter` or the
:data:`ADAPTERS` registry.
"""

from __future__ import annotations

from aiwg_training.formats.alpaca import AlpacaAdapter
from aiwg_training.formats.base import (
    FormatAdapter,
    RoundTripError,
    RoundTripReport,
    read_sidecar,
    validate_round_trip,
    write_sidecar,
)
from aiwg_training.formats.chatml import ChatMLAdapter
from aiwg_training.formats.jsonl import CanonicalJsonlAdapter
from aiwg_training.formats.parquet import ParquetAdapter
from aiwg_training.formats.sharegpt import ShareGPTAdapter

ADAPTERS: dict[str, type[FormatAdapter]] = {
    "alpaca": AlpacaAdapter,
    "sharegpt": ShareGPTAdapter,
    "chatml": ChatMLAdapter,
    "jsonl": CanonicalJsonlAdapter,
    "canonical": CanonicalJsonlAdapter,
    "parquet": ParquetAdapter,
}


def get_adapter(name: str, **kwargs: object) -> FormatAdapter:
    """Factory for the named adapter.

    Raises ``KeyError`` with the known adapter list when ``name`` is
    unrecognized. Adapter-specific constructor kwargs (e.g. Parquet's
    ``shard_size``) pass through.
    """
    key = name.lower()
    if key not in ADAPTERS:
        known = ", ".join(sorted(ADAPTERS))
        raise KeyError(f"Unknown format adapter '{name}'. Known: {known}")
    return ADAPTERS[key](**kwargs)  # type: ignore[call-arg]


__all__ = [
    "ADAPTERS",
    "AlpacaAdapter",
    "CanonicalJsonlAdapter",
    "ChatMLAdapter",
    "FormatAdapter",
    "ParquetAdapter",
    "RoundTripError",
    "RoundTripReport",
    "ShareGPTAdapter",
    "get_adapter",
    "read_sidecar",
    "validate_round_trip",
    "write_sidecar",
]
