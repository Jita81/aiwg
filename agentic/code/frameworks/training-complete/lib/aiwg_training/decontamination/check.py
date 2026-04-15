"""Top-level orchestration for decontamination-check (#842).

Pulls together targets loading, the three checker backends, report generation,
and event logging. Used by the ``decontamination-check`` skill and by the
publication gate lint (#843).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Mapping

from aiwg_training.core import MemoryTopology, log_to_consumer, now_iso
from aiwg_training.decontamination.fuzzy import FuzzyChecker
from aiwg_training.decontamination.ngram import NGramChecker, NGramOverlapResult
from aiwg_training.decontamination.report import (
    DEFAULT_TEMPLATE_PATH,
    DecontaminationReport,
    TargetResult,
    generate_markdown_report,
    hash_file,
)
from aiwg_training.decontamination.semantic import SemanticChecker
from aiwg_training.decontamination.targets import (
    DEFAULT_TARGETS_PATH,
    EvalTarget,
    TargetsConfig,
    load_targets,
)
from aiwg_training.schemas import CanonicalRecord, DecontaminationCheckEvent


# ---- Mode normalization ----

# YAML / CLI use hyphenated names; the log-event enum uses underscores.
_MODE_TO_EVENT = {
    "exact-ngram": "exact_ngram",
    "fuzzy": "fuzzy",
    "semantic": "semantic",
}


def _primary_mode(modes: Iterable[str]) -> str:
    """Return the 'lead' mode for a target (used in the event record)."""
    for m in ("exact-ngram", "fuzzy", "semantic"):
        if m in modes:
            return m
    return "exact-ngram"


# ---- Result merging ----


def _merge_results(
    results: list[NGramOverlapResult], mode_label: str, max_samples: int = 10
) -> NGramOverlapResult:
    """Combine per-mode results for one target into a single row.

    Overlap count and overlapping_examples are unioned (by example id);
    samples are concatenated up to ``max_samples``.
    """
    merged = NGramOverlapResult(mode=mode_label)
    if not results:
        return merged
    merged.examples_scanned = max(r.examples_scanned for r in results)
    seen: set[str] = set()
    for r in results:
        for ex_id in r.overlapping_examples:
            if ex_id not in seen:
                seen.add(ex_id)
        for s in r.sample_overlaps:
            if len(merged.sample_overlaps) >= max_samples:
                break
            merged.sample_overlaps.append(s)
    merged.overlapping_examples = seen
    merged.overlap_count = len(seen)
    return merged


# ---- Orchestrator ----


@dataclass
class DecontaminationCheck:
    """Top-level decontamination runner.

    Parameters
    ----------
    targets:
        Parsed TargetsConfig.
    eval_sets:
        Mapping from target id -> list[str] of eval texts. The caller is
        responsible for loading eval sets (HuggingFace, local paths, etc.);
        this module is file-format agnostic.
    dataset_version:
        Dataset version label used in the report header and event payload.
    mode_override:
        If set, overrides each target's ``detection_modes`` with this single
        mode (useful for the ``--mode`` CLI flag).
    topology:
        Optional MemoryTopology for writing the log event via
        ``log_to_consumer``. If omitted, the event is returned but not
        persisted — callers can write it themselves.
    """

    targets: TargetsConfig
    eval_sets: Mapping[str, list[str]]
    dataset_version: str = "unversioned"
    mode_override: str | None = None
    topology: MemoryTopology | None = None
    ngram_size_override: int | None = None
    semantic_threshold_override: float | None = None

    # Populated after run()
    report: DecontaminationReport | None = field(default=None, init=False)
    passed: bool = field(default=True, init=False)
    event: DecontaminationCheckEvent | None = field(default=None, init=False)

    # ---- Factory helpers ----

    @classmethod
    def from_paths(
        cls,
        eval_sets: Mapping[str, list[str]],
        config_path: str | Path | None = None,
        dataset_version: str = "unversioned",
        mode_override: str | None = None,
        topology: MemoryTopology | None = None,
    ) -> DecontaminationCheck:
        """Build a check from a targets config path (defaults to shipped YAML)."""
        cfg = load_targets(config_path or DEFAULT_TARGETS_PATH)
        return cls(
            targets=cfg,
            eval_sets=eval_sets,
            dataset_version=dataset_version,
            mode_override=mode_override,
            topology=topology,
        )

    # ---- Per-target dispatch ----

    def _modes_for(self, target: EvalTarget) -> list[str]:
        if self.mode_override:
            return [self.mode_override]
        return list(target.detection_modes or ["exact-ngram"])

    def _run_one_target(
        self,
        target: EvalTarget,
        dataset_records: list[CanonicalRecord],
    ) -> TargetResult:
        eval_records = list(self.eval_sets.get(target.id, []) or [])
        modes = self._modes_for(target)

        per_mode: list[NGramOverlapResult] = []
        for mode in modes:
            if mode == "exact-ngram":
                checker: NGramChecker | FuzzyChecker | SemanticChecker = NGramChecker(
                    ngram_size=self.ngram_size_override or target.ngram_size,
                    normalize=target.normalize or self.targets.defaults.get("normalize") or {},
                )
            elif mode == "fuzzy":
                checker = FuzzyChecker(
                    normalize=target.normalize or self.targets.defaults.get("normalize") or {},
                )
            elif mode == "semantic":
                checker = SemanticChecker(
                    model_name=self.targets.semantic.embedding_model,
                    similarity_threshold=(
                        self.semantic_threshold_override
                        if self.semantic_threshold_override is not None
                        else self.targets.semantic.cosine_threshold
                    ),
                    batch_size=self.targets.semantic.batch_size,
                    normalize=target.normalize or self.targets.defaults.get("normalize") or {},
                )
            else:
                raise ValueError(f"Unknown detection mode {mode!r} for target {target.id}")
            per_mode.append(checker.check(dataset_records, eval_records))

        merged = _merge_results(per_mode, mode_label=",".join(modes))
        passed = merged.overlap_count <= target.threshold
        return TargetResult(target=target, overlap=merged, passed=passed)

    # ---- Public entrypoint ----

    def run(
        self,
        dataset_records: list[CanonicalRecord],
        output_dir: str | Path | None = None,
        report_filename: str | None = None,
        template_path: str | Path | None = None,
        targets_config_path: str | Path | None = None,
    ) -> DecontaminationReport:
        """Run the check, build the report, and (optionally) log + write it."""
        target_results = [self._run_one_target(t, dataset_records) for t in self.targets.targets]
        overall = all(r.passed for r in target_results)

        primary_mode = _primary_mode(
            [m for t in self.targets.targets for m in self._modes_for(t)]
            if not self.mode_override
            else [self.mode_override]
        )

        ngram_size = self.ngram_size_override or int(
            self.targets.defaults.get("ngram_size", 13)
        )
        normalization = ",".join(
            k for k, v in (self.targets.defaults.get("normalize") or {}).items() if v
        ) or "lowercase,collapse_whitespace"

        # Threshold reported at the event level: use the strictest target threshold.
        event_threshold = min(
            (t.threshold for t in self.targets.targets),
            default=0,
        )

        report = DecontaminationReport(
            dataset_version=self.dataset_version,
            generated_at=now_iso(),
            mode=primary_mode,
            ngram_size=ngram_size,
            target_results=target_results,
            normalization=normalization,
            embedding_model=(
                self.targets.semantic.embedding_model if "semantic" in primary_mode else ""
            ),
            cosine_threshold=self.targets.semantic.cosine_threshold,
            random_seed=self.targets.semantic.random_seed,
            targets_config_hash=hash_file(targets_config_path) if targets_config_path else "",
        )

        report_id = f"decontam-{uuid.uuid4()}"

        # Write markdown report
        if output_dir:
            out_dir = Path(output_dir)
            out_dir.mkdir(parents=True, exist_ok=True)
            fname = report_filename or f"decontamination-{self.dataset_version}.md"
            out_path = out_dir / fname
            generate_markdown_report(
                report,
                template_path=template_path or DEFAULT_TEMPLATE_PATH,
                output_path=out_path,
            )

        # Build + emit the log event
        event = DecontaminationCheckEvent(
            consumer=(self.topology.namespace if self.topology else "training-complete"),
            targets=[t.target.id for t in target_results],
            overlap_counts={t.target.id: t.overlap.overlap_count for t in target_results},
            threshold=event_threshold,
            passed=overall,
            detection_mode=_MODE_TO_EVENT.get(primary_mode, "exact_ngram"),
            report_id=report_id,
        )
        if self.topology is not None:
            log_to_consumer(event, self.topology)

        # Cache on self for callers that want object-style access
        self.report = report
        self.passed = overall
        self.event = event
        return report
