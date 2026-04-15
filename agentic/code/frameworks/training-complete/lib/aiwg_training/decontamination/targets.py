"""Eval target loading for decontamination-check (#842).

Loads ``decontamination-targets.yaml``, applies defaults, and implements the
union-vs-replace flag per the shipped schema.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

# Path to the framework-shipped defaults, resolved relative to this file.
# lib/aiwg_training/decontamination/targets.py -> ../../../schemas/decontamination-targets.yaml
DEFAULT_TARGETS_PATH = (
    Path(__file__).resolve().parent.parent.parent.parent
    / "schemas"
    / "decontamination-targets.yaml"
)


@dataclass
class EvalTarget:
    """A single benchmark eval target entry."""

    id: str
    name: str
    source: str
    eval_set_path: str
    ngram_size: int = 13
    threshold: int = 0
    detection_modes: list[str] = field(default_factory=lambda: ["exact-ngram"])
    normalize: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "source": self.source,
            "eval_set_path": self.eval_set_path,
            "ngram_size": self.ngram_size,
            "threshold": self.threshold,
            "detection_modes": list(self.detection_modes),
            "normalize": dict(self.normalize),
        }


@dataclass
class SemanticConfig:
    """Semantic-mode configuration block from the targets YAML."""

    embedding_model: str = "all-MiniLM-L6-v2"
    cosine_threshold: float = 0.95
    batch_size: int = 256
    random_seed: int = 42


@dataclass
class TargetsConfig:
    """Full parsed targets configuration."""

    schema_version: str
    targets: list[EvalTarget]
    override_defaults: bool = False
    defaults: dict[str, Any] = field(default_factory=dict)
    semantic: SemanticConfig = field(default_factory=SemanticConfig)
    raw: dict[str, Any] = field(default_factory=dict)


def _apply_defaults(entry: dict[str, Any], defaults: dict[str, Any]) -> EvalTarget:
    """Build an EvalTarget from a raw entry, filling missing fields from defaults."""
    merged = {**defaults, **{k: v for k, v in entry.items() if v is not None}}
    return EvalTarget(
        id=entry["id"],
        name=entry.get("name", entry["id"]),
        source=entry.get("source", "unspecified"),
        eval_set_path=entry.get("eval_set_path", ""),
        ngram_size=int(merged.get("ngram_size", 13)),
        threshold=int(merged.get("threshold", 0)),
        detection_modes=list(merged.get("detection_modes", ["exact-ngram"])),
        normalize=dict(merged.get("normalize", {})),
    )


def load_targets(
    config_path: str | Path | None = None,
    override_defaults: bool | None = None,
) -> TargetsConfig:
    """Load a decontamination-targets.yaml into a TargetsConfig.

    Parameters
    ----------
    config_path:
        Path to the YAML file. If None, loads the framework-shipped defaults.
    override_defaults:
        If provided, overrides the YAML's ``override_defaults`` flag.

    Returns
    -------
    TargetsConfig with ``targets`` = shipped defaults + ``user_targets`` (union)
    unless override_defaults is true, in which case only user_targets are kept.
    """
    path = Path(config_path) if config_path else DEFAULT_TARGETS_PATH
    if not path.exists():
        raise FileNotFoundError(f"Targets config not found: {path}")
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}

    defaults = dict(raw.get("defaults", {}))
    use_override = (
        override_defaults
        if override_defaults is not None
        else bool(raw.get("override_defaults", False))
    )

    base_entries = list(raw.get("targets", []) or [])
    user_entries = list(raw.get("user_targets", []) or [])

    if use_override:
        entries = user_entries
    else:
        # Union: shipped defaults + user entries, user wins on id collision.
        by_id: dict[str, dict[str, Any]] = {}
        for e in base_entries:
            by_id[e["id"]] = e
        for e in user_entries:
            by_id[e["id"]] = e
        entries = list(by_id.values())

    targets = [_apply_defaults(e, defaults) for e in entries]

    sem_raw = raw.get("semantic") or {}
    semantic = SemanticConfig(
        embedding_model=sem_raw.get("embedding_model", "all-MiniLM-L6-v2"),
        cosine_threshold=float(sem_raw.get("cosine_threshold", 0.95)),
        batch_size=int(sem_raw.get("batch_size", 256)),
        random_seed=int(sem_raw.get("random_seed", 42)),
    )

    return TargetsConfig(
        schema_version=str(raw.get("schema_version", "1.0")),
        targets=targets,
        override_defaults=use_override,
        defaults=defaults,
        semantic=semantic,
        raw=raw,
    )


def merge_user_targets(
    defaults: TargetsConfig,
    user_yaml_path: str | Path,
) -> TargetsConfig:
    """Merge a user-declared targets YAML on top of an existing config.

    If the user YAML sets ``override_defaults: true``, the result contains only
    the user's targets. Otherwise the two target lists are unioned (user wins
    on id collision).
    """
    user_path = Path(user_yaml_path)
    user_raw = yaml.safe_load(user_path.read_text(encoding="utf-8")) or {}
    user_override = bool(user_raw.get("override_defaults", False))

    user_defaults_block = dict(user_raw.get("defaults", {}))
    merged_defaults = {**defaults.defaults, **user_defaults_block}

    user_entries = list(user_raw.get("user_targets", []) or []) + list(
        user_raw.get("targets", []) or []
    )

    if user_override:
        entries_source = user_entries
    else:
        by_id: dict[str, EvalTarget] = {t.id: t for t in defaults.targets}
        for e in user_entries:
            t = _apply_defaults(e, merged_defaults)
            by_id[t.id] = t
        return TargetsConfig(
            schema_version=defaults.schema_version,
            targets=list(by_id.values()),
            override_defaults=False,
            defaults=merged_defaults,
            semantic=defaults.semantic,
            raw=defaults.raw,
        )

    targets = [_apply_defaults(e, merged_defaults) for e in entries_source]
    return TargetsConfig(
        schema_version=defaults.schema_version,
        targets=targets,
        override_defaults=True,
        defaults=merged_defaults,
        semantic=defaults.semantic,
        raw=defaults.raw,
    )
