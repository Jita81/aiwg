"""Dataset reproduction — the ``dataset-reproduce`` skill backend.

Implements the 7-step operation from ``skills/dataset-reproduce/SKILL.md``:
load manifest → version compat check → acquire sources → replay pipeline →
apply seed → regenerate fixity → compare and report.

The replay step depends on the synthesis + preference + decontamination
modules; until those land, the corresponding phases raise
``NotImplementedError`` so this skill can be composed in but not driven
end-to-end.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from aiwg_training.core.fixity import scan_directory, sha256_file, write_manifest as write_fixity_manifest
from aiwg_training.schemas.dataset_manifest import DatasetManifest


Verdict = Literal["MATCH", "PARTIAL", "MISMATCH"]


@dataclass
class FixityComparison:
    """Per-file diff between original fixity manifest and rebuilt one."""

    matched: list[str] = field(default_factory=list)
    mismatched: list[str] = field(default_factory=list)
    missing_in_rebuild: list[str] = field(default_factory=list)
    extra_in_rebuild: list[str] = field(default_factory=list)

    @property
    def verdict(self) -> Verdict:
        if not self.mismatched and not self.missing_in_rebuild and not self.extra_in_rebuild:
            return "MATCH"
        if not self.matched:
            return "MISMATCH"
        return "PARTIAL"

    def to_markdown(self) -> str:
        lines = [
            f"- Verdict: **{self.verdict}**",
            f"- Matched: {len(self.matched)}",
            f"- Mismatched: {len(self.mismatched)}",
            f"- Missing in rebuild: {len(self.missing_in_rebuild)}",
            f"- Extra in rebuild: {len(self.extra_in_rebuild)}",
        ]
        if self.mismatched:
            lines.append("")
            lines.append("### Mismatched files")
            for m in self.mismatched[:20]:
                lines.append(f"- `{m}`")
            if len(self.mismatched) > 20:
                lines.append(f"- … and {len(self.mismatched) - 20} more")
        return "\n".join(lines)


@dataclass
class ReproductionResult:
    """Result of a single ``DatasetReproducer.reproduce`` run."""

    rebuilt_manifest: DatasetManifest | None
    fixity_match: bool
    mismatched_files: list[str] = field(default_factory=list)
    nondeterminism_warnings: list[str] = field(default_factory=list)
    comparison: FixityComparison | None = None
    workdir: Path | None = None

    @property
    def verdict(self) -> Verdict:
        if self.comparison is None:
            return "MISMATCH"
        return self.comparison.verdict


def _parse_fixity_manifest(path: Path) -> dict[str, str]:
    """Read a ``write_fixity_manifest`` output back into ``{path: sha256}``."""
    result: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("  ", 1)
        if len(parts) != 2:
            continue
        sha, rel = parts
        result[rel] = sha
    return result


class DatasetReproducer:
    """Orchestrates deterministic rebuild + fixity diff per SKILL.md.

    The replay phases (source acquisition, synthesis, preference, filter,
    decontamination) delegate to skills that are not yet wired up. Until
    those modules expose a callable API, ``reproduce()`` raises
    ``NotImplementedError`` at the replay step. The ``compare_fixity``
    helper is standalone and works end-to-end today.
    """

    def __init__(self) -> None:
        pass

    # ------------------------------------------------------------------ #
    # Orchestration                                                        #
    # ------------------------------------------------------------------ #

    def reproduce(
        self,
        manifest_path: Path | str,
        workdir: Path | str,
        *,
        compare_fixity: bool = True,
    ) -> ReproductionResult:
        """Full 7-step rebuild.

        Returns a ``ReproductionResult`` if fixity comparison completes; raises
        ``NotImplementedError`` where the synthesis/preference/filter modules
        will plug in (the replay step).
        """
        manifest_p = Path(manifest_path)
        workdir = Path(workdir)

        # Step 1 — load manifest
        manifest = DatasetManifest.load(manifest_p)

        # Step 2 — version compatibility check
        warnings: list[str] = []
        recipe = manifest.reproduction_recipe
        if recipe.aiwg_version is None:
            warnings.append(
                "manifest.reproduction_recipe.aiwg_version is unset — cross-version determinism unverifiable"
            )
        if recipe.training_complete_version is None:
            warnings.append(
                "manifest.reproduction_recipe.training_complete_version is unset — replay may drift"
            )

        # Step 3 — workdir validation
        if workdir.exists() and any(workdir.iterdir()):
            raise FileExistsError(
                f"workdir {workdir} is not empty; reproduce refuses to overwrite"
            )
        workdir.mkdir(parents=True, exist_ok=True)

        # Steps 3b–5 — acquire sources, replay pipeline, enforce seed determinism.
        # Pending synthesis/preference/decontamination/filter modules.
        raise NotImplementedError(
            "dataset-reproduce replay phase awaits acquire/synthesize/preference/filter "
            "module integration. ``compare_fixity`` works standalone. See issue #844."
        )

    # ------------------------------------------------------------------ #
    # Fixity comparison (standalone helper)                                #
    # ------------------------------------------------------------------ #

    def compare_fixity(
        self,
        rebuilt_manifest_path: Path | str,
        original_manifest_path: Path | str,
    ) -> FixityComparison:
        """Diff two fixity manifests written by ``core.fixity.write_manifest``.

        The manifests are keyed on relative path; we report matches, mismatches,
        and one-sided entries separately so the caller can classify each diff
        against the non-determinism sources listed in SKILL.md.
        """
        rebuilt = _parse_fixity_manifest(Path(rebuilt_manifest_path))
        original = _parse_fixity_manifest(Path(original_manifest_path))

        result = FixityComparison()
        for path, sha in original.items():
            if path not in rebuilt:
                result.missing_in_rebuild.append(path)
            elif rebuilt[path] == sha:
                result.matched.append(path)
            else:
                result.mismatched.append(path)
        for path in rebuilt:
            if path not in original:
                result.extra_in_rebuild.append(path)
        return result

    # ------------------------------------------------------------------ #
    # Report rendering                                                    #
    # ------------------------------------------------------------------ #

    def write_report(
        self,
        result: ReproductionResult,
        report_path: Path | str,
        *,
        manifest_version: str,
    ) -> Path:
        """Write the Markdown report at ``reports/reproduce-<version>-<ts>.md``."""
        p = Path(report_path)
        p.parent.mkdir(parents=True, exist_ok=True)
        lines = [
            f"# Dataset Reproduction Report — {manifest_version}",
            "",
            f"- Verdict: **{result.verdict}**",
            f"- Fixity match: {result.fixity_match}",
            f"- Mismatched file count: {len(result.mismatched_files)}",
            "",
        ]
        if result.nondeterminism_warnings:
            lines.append("## Non-determinism warnings")
            for w in result.nondeterminism_warnings:
                lines.append(f"- {w}")
            lines.append("")
        if result.comparison is not None:
            lines.append("## Fixity comparison")
            lines.append(result.comparison.to_markdown())
        p.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return p


# Re-export the standalone fixity SHA helper for convenience.
__all__ = [
    "DatasetReproducer",
    "FixityComparison",
    "ReproductionResult",
    "sha256_file",
    "scan_directory",
    "write_fixity_manifest",
]
