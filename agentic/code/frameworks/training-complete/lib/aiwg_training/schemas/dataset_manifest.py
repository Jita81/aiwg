"""Dataset manifest — version-level metadata with full reproducibility fields.

Mirrors ``schemas/dataset-manifest.yaml``. The YAML file on disk is the
source of truth; the JSON sibling is auto-exported.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field


class SplitCounts(BaseModel):
    train: int = Field(..., ge=0)
    validation: int = Field(..., ge=0)
    test: int = Field(..., ge=0)

    @property
    def total(self) -> int:
        return self.train + self.validation + self.test


class SourceEntry(BaseModel):
    """One contributing source in the dataset's provenance chain."""

    model_config = ConfigDict(extra="allow")

    ref_id: str = Field(..., description="REF ID from research-papers or source file path")
    license: str = Field(..., description="SPDX identifier")
    example_count: int = Field(..., ge=0)
    quality_grade: Literal["HIGH", "MODERATE", "LOW", "VERY_LOW"]


class StorageRef(BaseModel):
    """Points to the immutable storage for this dataset version.

    Exactly one of ``fortemi_archive_id`` or ``aiwg_index_snapshot_id`` must be set.
    """

    fortemi_archive_id: str | None = None
    aiwg_index_snapshot_id: str | None = None

    def backend(self) -> Literal["fortemi", "aiwg_index"]:
        if self.fortemi_archive_id and self.aiwg_index_snapshot_id:
            raise ValueError("storage_ref: set exactly one of fortemi_archive_id or aiwg_index_snapshot_id")
        if self.fortemi_archive_id:
            return "fortemi"
        if self.aiwg_index_snapshot_id:
            return "aiwg_index"
        raise ValueError("storage_ref: neither backend ID set")


class SyntheticRatio(BaseModel):
    """Per-split synthetic ratio (0.0 = all human, 1.0 = all synthetic)."""

    train: float = Field(default=0.0, ge=0.0, le=1.0)
    validation: float = Field(default=0.0, ge=0.0, le=1.0)
    test: float = Field(default=0.0, ge=0.0, le=1.0)


class ReproductionRecipe(BaseModel):
    """Deterministic rebuild instructions."""

    model_config = ConfigDict(extra="allow")

    generator_configs: list[str] = Field(default_factory=list)
    preference_config: str | None = None
    filter_thresholds: dict[str, Any] = Field(default_factory=dict)
    decontamination_thresholds: dict[str, float] = Field(default_factory=dict)
    aiwg_version: str | None = None
    training_complete_version: str | None = None


class DatasetManifest(BaseModel):
    """Version-level metadata for a training dataset.

    Written as YAML (source of truth) with JSON auto-export for programmatic
    consumers. See ADR-022 D6.
    """

    model_config = ConfigDict(extra="allow")

    # Required
    version: str = Field(..., description="CalVer or SemVer")
    name: str
    description: str
    seed: int
    split_counts: SplitCounts
    sources: list[SourceEntry]
    license: str = Field(..., description="Effective license (most-restrictive-wins)")
    provenance_record_id: str
    storage_ref: StorageRef
    fixity_manifest: str = Field(..., description="Path to SHA-256 fixity manifest")
    created_at: str

    # Optional
    synthetic_ratio: SyntheticRatio = Field(default_factory=SyntheticRatio)
    decontamination_report_id: str | None = None
    reproduction_recipe: ReproductionRecipe = Field(default_factory=ReproductionRecipe)
    format_exports: list[str] = Field(default_factory=list)
    target_model: str | None = None
    intended_use: str | None = None
    out_of_scope: list[str] = Field(default_factory=list)
    ethical_considerations: str | None = None

    # ---- I/O ----

    @classmethod
    def load(cls, path: Path | str) -> DatasetManifest:
        """Load a manifest from YAML or JSON (autodetected by extension)."""
        p = Path(path)
        text = p.read_text(encoding="utf-8")
        if p.suffix in (".yaml", ".yml"):
            data = yaml.safe_load(text)
        elif p.suffix == ".json":
            data = json.loads(text)
        else:
            raise ValueError(f"Unsupported manifest extension: {p.suffix}")
        return cls.model_validate(data)

    def save_yaml(self, path: Path | str) -> Path:
        """Write YAML manifest (source of truth)."""
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        data = self.model_dump(mode="json", exclude_none=True)
        p.write_text(yaml.safe_dump(data, sort_keys=False, default_flow_style=False), encoding="utf-8")
        return p

    def save_json(self, path: Path | str) -> Path:
        """Auto-export JSON sibling."""
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        data = self.model_dump(mode="json", exclude_none=True)
        p.write_text(json.dumps(data, indent=2, sort_keys=False), encoding="utf-8")
        return p

    def save_both(self, yaml_path: Path | str) -> tuple[Path, Path]:
        """Write YAML + auto-export JSON sibling."""
        yaml_out = self.save_yaml(yaml_path)
        json_out = self.save_json(yaml_out.with_suffix(".json"))
        return yaml_out, json_out

    # ---- Validation helpers ----

    def validate_totals(self) -> None:
        """Check that example counts sum to split totals. Raises on mismatch."""
        source_total = sum(s.example_count for s in self.sources)
        if source_total != self.split_counts.total:
            raise ValueError(
                f"Source example counts ({source_total}) do not match "
                f"split totals ({self.split_counts.total})"
            )
