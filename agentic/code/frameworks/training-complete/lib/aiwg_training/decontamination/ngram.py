"""Exact n-gram overlap detection for decontamination-check (#842).

Hash-based sliding-window n-gram overlap. Fast, deterministic, recommended
default per REF-442 (13-gram convention).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable

from aiwg_training.schemas import CanonicalRecord


# ---- Result types ----


@dataclass
class OverlapSample:
    """One overlap instance, surfaced for the report's top-N table."""

    example_id: str
    target_item_id: str
    excerpt: str
    score: float = 1.0  # 1.0 for exact n-gram; fractional for fuzzy/semantic


@dataclass
class NGramOverlapResult:
    """Result of a single checker invocation."""

    overlap_count: int = 0
    overlapping_examples: set[str] = field(default_factory=set)
    sample_overlaps: list[OverlapSample] = field(default_factory=list)
    examples_scanned: int = 0
    mode: str = "exact-ngram"

    @property
    def passed(self) -> bool:
        """Set by the orchestrator after applying the per-target threshold."""
        return True


# ---- Candidate text extraction ----


def candidate_text(record: CanonicalRecord, normalize: dict | None = None) -> str:
    """Pull the text we compare against an eval set.

    For standard records: input.user + output.assistant.
    For preference records: input.user + output.chosen.
    """
    parts: list[str] = [record.input.user]
    if record.is_preference():
        pref = record.require_preference_output()
        parts.append(pref.chosen)
    else:
        std = record.require_standard_output()
        parts.append(std.assistant)
    text = "\n".join(p for p in parts if p)
    return _normalize(text, normalize or {})


def _normalize(text: str, opts: dict) -> str:
    """Apply optional normalization (lowercase, whitespace collapse, etc.)."""
    if not text:
        return text
    if opts.get("lowercase", True):
        text = text.lower()
    if opts.get("collapse_whitespace", True):
        text = " ".join(text.split())
    if opts.get("strip_punctuation", False):
        import string

        text = text.translate(str.maketrans("", "", string.punctuation))
    return text


# ---- N-gram machinery ----


def _tokens(text: str) -> list[str]:
    """Simple whitespace tokenization.

    Documented limitation: users needing code-aware or language-aware
    tokenization should subclass NGramChecker and override this.
    """
    return text.split()


def _ngrams(tokens: list[str], n: int) -> Iterable[tuple[str, ...]]:
    """Sliding window of size n. Emits nothing if tokens < n."""
    if len(tokens) < n:
        return
    for i in range(len(tokens) - n + 1):
        yield tuple(tokens[i : i + n])


def _excerpt(tokens: list[str], ngram: tuple[str, ...], max_words: int = 20) -> str:
    """Return a human-readable excerpt around the matching n-gram."""
    joined = " ".join(ngram)
    return joined if len(joined) <= 200 else joined[:197] + "..."


# ---- Public API ----


class NGramChecker:
    """Exact n-gram overlap checker.

    Parameters
    ----------
    ngram_size : int
        N-gram window size. Default 13 per REF-442 benchmark contamination.
    normalize : dict
        Normalization options. See ``_normalize``.
    max_samples : int
        How many overlap samples to retain for the report (top-N).
    """

    def __init__(
        self,
        ngram_size: int = 13,
        normalize: dict | None = None,
        max_samples: int = 10,
    ) -> None:
        if ngram_size < 1:
            raise ValueError(f"ngram_size must be >= 1, got {ngram_size}")
        self.ngram_size = ngram_size
        self.normalize = normalize or {"lowercase": True, "collapse_whitespace": True}
        self.max_samples = max_samples

    def _index_eval(
        self, eval_records: list[str]
    ) -> dict[tuple[str, ...], list[tuple[int, tuple[str, ...]]]]:
        """Build a n-gram -> list[(eval_index, ngram)] index."""
        index: dict[tuple[str, ...], list[tuple[int, tuple[str, ...]]]] = {}
        for idx, raw in enumerate(eval_records):
            norm = _normalize(raw, self.normalize)
            toks = _tokens(norm)
            for ng in _ngrams(toks, self.ngram_size):
                index.setdefault(ng, []).append((idx, ng))
        return index

    def check(
        self,
        dataset_records: list[CanonicalRecord],
        eval_records: list[str],
    ) -> NGramOverlapResult:
        """Return an NGramOverlapResult for the given dataset vs. eval set."""
        result = NGramOverlapResult(mode="exact-ngram")
        result.examples_scanned = len(dataset_records)
        if not dataset_records or not eval_records:
            return result

        eval_index = self._index_eval(eval_records)
        if not eval_index:
            return result

        for rec in dataset_records:
            text = candidate_text(rec, self.normalize)
            toks = _tokens(text)
            hit_ngrams: list[tuple[str, ...]] = []
            hit_eval_idx: int | None = None
            for ng in _ngrams(toks, self.ngram_size):
                if ng in eval_index:
                    hit_ngrams.append(ng)
                    hit_eval_idx = eval_index[ng][0][0]
                    break  # one hit per record is enough to mark it
            if hit_ngrams:
                result.overlap_count += 1
                result.overlapping_examples.add(rec.id)
                if len(result.sample_overlaps) < self.max_samples:
                    result.sample_overlaps.append(
                        OverlapSample(
                            example_id=rec.id,
                            target_item_id=f"eval-{hit_eval_idx}",
                            excerpt=_excerpt(toks, hit_ngrams[0]),
                            score=1.0,
                        )
                    )

        return result
