"""Decontamination detection for training-complete (#842).

Detects overlap between candidate training examples and benchmark eval sets
(MMLU, GSM8K, HumanEval, HELM, MT-Bench, AlpacaEval, user-declared) before a
dataset version is published. Per ADR-022 D8, decontamination is a first-class
pipeline stage; this module provides the runtime used by the
``decontamination-check`` skill and the ``decontamination-gate`` lint (#843).

Public API:
    targets    — EvalTarget, TargetsConfig, load_targets, merge_user_targets
    ngram      — NGramChecker (exact n-gram, default)
    fuzzy      — FuzzyChecker (edit-distance; rapidfuzz or stdlib fallback)
    semantic   — SemanticChecker (sentence-transformers; optional dep)
    report     — DecontaminationReport, generate_markdown_report
    check      — DecontaminationCheck orchestrator
"""

from aiwg_training.decontamination.check import DecontaminationCheck
from aiwg_training.decontamination.fuzzy import FuzzyChecker, backend_name
from aiwg_training.decontamination.ngram import (
    NGramChecker,
    NGramOverlapResult,
    OverlapSample,
    candidate_text,
)
from aiwg_training.decontamination.report import (
    DEFAULT_TEMPLATE_PATH,
    DecontaminationReport,
    TargetResult,
    generate_markdown_report,
    hash_file,
    render_template,
)
from aiwg_training.decontamination.semantic import SemanticChecker
from aiwg_training.decontamination.targets import (
    DEFAULT_TARGETS_PATH,
    EvalTarget,
    SemanticConfig,
    TargetsConfig,
    load_targets,
    merge_user_targets,
)

__all__ = [
    "DEFAULT_TARGETS_PATH",
    "DEFAULT_TEMPLATE_PATH",
    "DecontaminationCheck",
    "DecontaminationReport",
    "EvalTarget",
    "FuzzyChecker",
    "NGramChecker",
    "NGramOverlapResult",
    "OverlapSample",
    "SemanticChecker",
    "SemanticConfig",
    "TargetResult",
    "TargetsConfig",
    "backend_name",
    "candidate_text",
    "generate_markdown_report",
    "hash_file",
    "load_targets",
    "merge_user_targets",
    "render_template",
]
