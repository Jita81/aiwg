"""Embedding-based (semantic) overlap detection for decontamination-check (#842).

Uses sentence-transformers if installed. Raises ImportError with an install
hint otherwise (semantic mode is opt-in; default mode is exact-ngram).
"""

from __future__ import annotations

from aiwg_training.decontamination.ngram import (
    NGramOverlapResult,
    OverlapSample,
    _normalize,
    candidate_text,
)
from aiwg_training.schemas import CanonicalRecord

_INSTALL_HINT = (
    "Semantic mode requires 'sentence-transformers' and 'numpy'. "
    "Install via: pip install 'aiwg-training[semantic]' "
    "or: pip install sentence-transformers numpy"
)


class SemanticChecker:
    """Cosine-similarity based overlap checker using sentence embeddings.

    Parameters
    ----------
    model_name : str
        Sentence-transformers model identifier. Default ``all-MiniLM-L6-v2``
        (fast, 384-dim, good general-purpose paraphrase detection).
    similarity_threshold : float
        Cosine similarity threshold for a match (default 0.95).
    batch_size : int
        Embedding batch size.
    normalize : dict
        Text normalization options.
    max_samples : int
        Top-N overlap samples retained for the report.
    """

    def __init__(
        self,
        model_name: str = "all-MiniLM-L6-v2",
        similarity_threshold: float = 0.95,
        batch_size: int = 256,
        normalize: dict | None = None,
        max_samples: int = 10,
    ) -> None:
        if not 0.0 <= similarity_threshold <= 1.0:
            raise ValueError(
                f"similarity_threshold must be in [0,1], got {similarity_threshold}"
            )
        self.model_name = model_name
        self.similarity_threshold = similarity_threshold
        self.batch_size = batch_size
        self.normalize = normalize or {"lowercase": True, "collapse_whitespace": True}
        self.max_samples = max_samples
        self._model = None

    def _load_model(self):  # pragma: no cover - requires optional dep
        if self._model is not None:
            return self._model
        try:
            from sentence_transformers import SentenceTransformer  # type: ignore
        except ImportError as e:
            raise ImportError(_INSTALL_HINT) from e
        self._model = SentenceTransformer(self.model_name)
        return self._model

    def check(
        self,
        dataset_records: list[CanonicalRecord],
        eval_records: list[str],
    ) -> NGramOverlapResult:
        """Return an NGramOverlapResult with semantic similarity hits."""
        result = NGramOverlapResult(mode="semantic")
        result.examples_scanned = len(dataset_records)
        if not dataset_records or not eval_records:
            return result

        try:
            import numpy as np  # type: ignore
        except ImportError as e:  # pragma: no cover
            raise ImportError(_INSTALL_HINT) from e

        model = self._load_model()

        cand_texts = [candidate_text(r, self.normalize) for r in dataset_records]
        eval_norm = [_normalize(e, self.normalize) for e in eval_records]

        cand_emb = model.encode(
            cand_texts, batch_size=self.batch_size, convert_to_numpy=True, show_progress_bar=False
        )
        eval_emb = model.encode(
            eval_norm, batch_size=self.batch_size, convert_to_numpy=True, show_progress_bar=False
        )

        # Normalize rows for cosine similarity.
        def _norm(mat):
            n = np.linalg.norm(mat, axis=1, keepdims=True)
            n[n == 0] = 1.0
            return mat / n

        cand_n = _norm(cand_emb)
        eval_n = _norm(eval_emb)

        # similarity[i, j] = cand_i . eval_j
        sim = cand_n @ eval_n.T  # shape (N_cand, N_eval)

        best_eval_idx = sim.argmax(axis=1)
        best_score = sim.max(axis=1)

        for i, rec in enumerate(dataset_records):
            score = float(best_score[i])
            if score >= self.similarity_threshold:
                result.overlap_count += 1
                result.overlapping_examples.add(rec.id)
                if len(result.sample_overlaps) < self.max_samples:
                    excerpt = cand_texts[i][:197] + (
                        "..." if len(cand_texts[i]) > 200 else ""
                    )
                    result.sample_overlaps.append(
                        OverlapSample(
                            example_id=rec.id,
                            target_item_id=f"eval-{int(best_eval_idx[i])}",
                            excerpt=excerpt,
                            score=round(score, 4),
                        )
                    )

        return result
