"""Fuzzy (edit-distance) overlap detection for decontamination-check (#842).

Uses rapidfuzz when installed for speed; falls back to ``difflib`` (stdlib)
otherwise. Documented as slower than ``exact-ngram`` — use sparingly, typically
as a supplemental check on paraphrase-prone eval sets.
"""

from __future__ import annotations

from aiwg_training.decontamination.ngram import (
    NGramOverlapResult,
    OverlapSample,
    _normalize,
    candidate_text,
)
from aiwg_training.schemas import CanonicalRecord

try:  # pragma: no cover - import path varies by install
    from rapidfuzz import fuzz as _rf_fuzz

    _HAVE_RAPIDFUZZ = True
except ImportError:  # pragma: no cover
    _rf_fuzz = None
    _HAVE_RAPIDFUZZ = False

if not _HAVE_RAPIDFUZZ:
    import difflib as _difflib


def _similarity(a: str, b: str) -> float:
    """Return a similarity ratio in [0.0, 1.0]."""
    if not a or not b:
        return 0.0
    if _HAVE_RAPIDFUZZ:
        # rapidfuzz returns 0..100; normalize.
        return _rf_fuzz.ratio(a, b) / 100.0  # type: ignore[union-attr]
    return _difflib.SequenceMatcher(None, a, b).ratio()


class FuzzyChecker:
    """Edit-distance overlap checker.

    Parameters
    ----------
    distance_threshold : int
        Maximum Levenshtein distance for a match. Approximated here as
        ``1.0 - (distance_threshold / candidate_chunk_size)`` similarity floor.
    candidate_chunk_size : int
        Characters per candidate text chunk. Larger chunks = coarser matching
        but faster.
    normalize : dict
        Normalization options.
    max_samples : int
        Number of overlap samples retained for the report.
    """

    def __init__(
        self,
        distance_threshold: int = 5,
        candidate_chunk_size: int = 200,
        normalize: dict | None = None,
        max_samples: int = 10,
    ) -> None:
        if distance_threshold < 0:
            raise ValueError(f"distance_threshold must be >= 0, got {distance_threshold}")
        if candidate_chunk_size < 1:
            raise ValueError(
                f"candidate_chunk_size must be >= 1, got {candidate_chunk_size}"
            )
        self.distance_threshold = distance_threshold
        self.candidate_chunk_size = candidate_chunk_size
        self.normalize = normalize or {"lowercase": True, "collapse_whitespace": True}
        self.max_samples = max_samples
        # Minimum similarity that qualifies as a fuzzy hit.
        self._similarity_floor = max(
            0.0, 1.0 - (distance_threshold / max(1, candidate_chunk_size))
        )

    def _chunks(self, text: str) -> list[str]:
        """Split text into fixed-size character chunks."""
        cs = self.candidate_chunk_size
        if len(text) <= cs:
            return [text]
        return [text[i : i + cs] for i in range(0, len(text), cs)]

    def check(
        self,
        dataset_records: list[CanonicalRecord],
        eval_records: list[str],
    ) -> NGramOverlapResult:
        """Return an NGramOverlapResult reusing the same result type."""
        result = NGramOverlapResult(mode="fuzzy")
        result.examples_scanned = len(dataset_records)
        if not dataset_records or not eval_records:
            return result

        eval_norm: list[str] = [_normalize(e, self.normalize) for e in eval_records]

        for rec in dataset_records:
            text = candidate_text(rec, self.normalize)
            if not text:
                continue
            best_score = 0.0
            best_eval_idx = -1
            best_chunk = ""
            for chunk in self._chunks(text):
                for idx, eval_text in enumerate(eval_norm):
                    # Compare chunk against eval_text; use min-length bound.
                    score = _similarity(chunk, eval_text)
                    if score > best_score:
                        best_score = score
                        best_eval_idx = idx
                        best_chunk = chunk
                        if best_score >= 0.999:
                            break
                if best_score >= 0.999:
                    break
            if best_score >= self._similarity_floor and best_eval_idx >= 0:
                result.overlap_count += 1
                result.overlapping_examples.add(rec.id)
                if len(result.sample_overlaps) < self.max_samples:
                    excerpt = best_chunk if len(best_chunk) <= 200 else best_chunk[:197] + "..."
                    result.sample_overlaps.append(
                        OverlapSample(
                            example_id=rec.id,
                            target_item_id=f"eval-{best_eval_idx}",
                            excerpt=excerpt,
                            score=round(best_score, 4),
                        )
                    )

        return result


def backend_name() -> str:
    """Return which similarity backend is active (for reports / debugging)."""
    return "rapidfuzz" if _HAVE_RAPIDFUZZ else "difflib"
