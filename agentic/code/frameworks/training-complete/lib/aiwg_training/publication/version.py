"""Dataset versioning — the ``dataset-version`` skill backend.

Implements the nine-step operation from ``skills/dataset-version/SKILL.md``:
gate → split → license → synthetic ratio → fixity → provenance → snapshot →
manifest → log event. Publication is atomic — writes to a staging directory
and renames on success; partial failure rolls back.

Actual immutable-storage snapshot (Fortemi archive or ``aiwg index snapshot``)
is stubbed via ``_take_snapshot`` pending issue #848.
"""

from __future__ import annotations

import random
import re
import shutil
import uuid
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal

from aiwg_training.core.fixity import scan_directory, write_manifest as write_fixity_manifest
from aiwg_training.core.log import log_activity, log_to_consumer
from aiwg_training.core.provenance import ProvRecord
from aiwg_training.core.topology import MemoryTopology
from aiwg_training.quality.license_check import (
    IncompatibleLicensesError,
    LicenseChecker,
    LicenseCheckResult,
    compute_effective_license,
)
from aiwg_training.schemas.dataset_manifest import (
    DatasetManifest,
    ReproductionRecipe,
    SourceEntry,
    SplitCounts,
    StorageRef,
    SyntheticRatio,
)
from aiwg_training.schemas.log_event import DatasetVersionEvent

if TYPE_CHECKING:
    from aiwg_training.schemas.example_record import CanonicalRecord


StorageBackend = Literal["fortemi", "aiwg-index"]


_CALVER = re.compile(r"^\d{4}\.\d{1,2}\.\d+$")
_SEMVER = re.compile(r"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$")


def _validate_version_string(version: str) -> None:
    """Reject leading zeros in CalVer and non-numeric strings."""
    if not version:
        raise ValueError("version string is empty")
    if _CALVER.match(version):
        parts = version.split(".")
        if parts[1].startswith("0") and parts[1] != "0":
            raise ValueError(f"CalVer {version!r}: month component must not have leading zeros")
        return
    if _SEMVER.match(version):
        return
    raise ValueError(f"version {version!r}: must be CalVer (YYYY.M.PATCH) or SemVer (MAJOR.MINOR.PATCH)")


class PublicationGateError(RuntimeError):
    """Raised when a blocking gate (license/decontamination) fails without acknowledge."""

    def __init__(self, message: str, blocking: list[LicenseCheckResult]) -> None:
        super().__init__(message)
        self.blocking = blocking


@dataclass
class PublishResult:
    """Artifacts produced by a successful ``DatasetVersioner.publish`` call."""

    manifest: DatasetManifest
    manifest_yaml: Path
    manifest_json: Path
    fixity_manifest: Path
    provenance_record: Path
    snapshot_id: str
    warnings: list[LicenseCheckResult] = field(default_factory=list)


class DatasetVersioner:
    """Orchestrates the 9-step publication operation.

    Storage snapshot is stubbed (``_take_snapshot``) — issue #848 will swap in
    the Fortemi / ``aiwg-index`` integrations.
    """

    def __init__(self, workdir: Path | str, topology: MemoryTopology) -> None:
        self.workdir = Path(workdir)
        self.topology = topology

    # ------------------------------------------------------------------ #
    # Step 2 — splits                                                     #
    # ------------------------------------------------------------------ #

    def compute_split_counts(
        self,
        examples: list["CanonicalRecord"],
        ratios: dict[str, float],
        seed: int,
    ) -> tuple[SplitCounts, dict[str, str]]:
        """Deterministic seed-based split assignment.

        Returns ``(counts, assignments)`` where ``assignments[example.id] = split_name``.

        Ratios must sum to 1.0 (±1e-6). Count allocation uses floor()+remainder
        distribution so the totals always match ``len(examples)``.
        """
        required = {"train", "validation", "test"}
        if set(ratios) != required:
            raise ValueError(f"ratios must have keys {sorted(required)}, got {sorted(ratios)}")
        total = sum(ratios.values())
        if not (0.999999 <= total <= 1.000001):
            raise ValueError(f"ratios must sum to 1.0 (got {total})")

        n = len(examples)
        floor_counts = {k: int(n * v) for k, v in ratios.items()}
        remainder = n - sum(floor_counts.values())
        # Distribute remainder largest-fractional-first, ties broken by fixed order
        frac_order = sorted(
            ratios.items(), key=lambda kv: (-((n * kv[1]) - int(n * kv[1])), kv[0])
        )
        for i in range(remainder):
            floor_counts[frac_order[i % len(frac_order)][0]] += 1

        # Assign examples to splits deterministically: sort by id, shuffle with seed
        sorted_ids = sorted(ex.id for ex in examples)
        rng = random.Random(seed)
        rng.shuffle(sorted_ids)

        assignments: dict[str, str] = {}
        idx = 0
        for split_name in ("train", "validation", "test"):
            for _ in range(floor_counts[split_name]):
                assignments[sorted_ids[idx]] = split_name
                idx += 1

        counts = SplitCounts(
            train=floor_counts["train"],
            validation=floor_counts["validation"],
            test=floor_counts["test"],
        )
        return counts, assignments

    # ------------------------------------------------------------------ #
    # Step 4 — synthetic ratio                                            #
    # ------------------------------------------------------------------ #

    def compute_synthetic_ratio(
        self,
        examples: list["CanonicalRecord"],
        split_assignments: dict[str, str],
    ) -> SyntheticRatio:
        """Fraction of synthetic examples per split (0.0 all-human, 1.0 all-synthetic)."""
        totals = Counter(split_assignments.values())
        synth = Counter()
        by_id = {ex.id: ex for ex in examples}
        for example_id, split in split_assignments.items():
            ex = by_id.get(example_id)
            if ex is None:
                continue
            if ex.metadata.synthetic:
                synth[split] += 1

        def ratio(split: str) -> float:
            if totals[split] == 0:
                return 0.0
            return round(synth[split] / totals[split], 6)

        return SyntheticRatio(
            train=ratio("train"), validation=ratio("validation"), test=ratio("test")
        )

    # ------------------------------------------------------------------ #
    # Step 3 — effective license                                          #
    # ------------------------------------------------------------------ #

    def compute_effective_license(self, sources: list[SourceEntry]) -> str:
        """Delegate to ``quality.license_check.compute_effective_license``."""
        return compute_effective_license([s.license for s in sources])

    # ------------------------------------------------------------------ #
    # Step 6 — provenance                                                 #
    # ------------------------------------------------------------------ #

    def build_provenance(
        self, manifest: DatasetManifest, sources: list[SourceEntry]
    ) -> ProvRecord:
        """Build the dataset-level PROV chain.

        Creates one Entity per source, one Entity for the dataset version, and
        one ``aiwg:Publication`` activity linking them.
        """
        record = ProvRecord()

        source_entities = [
            record.add_entity(
                type="aiwg:Source",
                label=s.ref_id,
                ref_id=s.ref_id,
                license=s.license,
                example_count=s.example_count,
                quality_grade=s.quality_grade,
            )
            for s in sources
        ]
        dataset_entity = record.add_entity(
            type="aiwg:DatasetVersion",
            label=f"{manifest.name}@{manifest.version}",
            version=manifest.version,
            name=manifest.name,
            license=manifest.license,
            seed=manifest.seed,
            total_examples=manifest.split_counts.total,
        )
        activity = record.add_activity(
            type="aiwg:Publication",
            agent="aiwg-training:dataset-version",
            used=source_entities,
            generated=[dataset_entity],
        )
        record.finalize_activity(activity)
        return record

    # ------------------------------------------------------------------ #
    # Step 7 — snapshot stub                                              #
    # ------------------------------------------------------------------ #

    def _take_snapshot(self, version: str, storage_backend: StorageBackend) -> str:
        """Stub for immutable storage — returns a placeholder ID.

        Real integration lands in issue #848 (Fortemi archive + aiwg-index
        snapshot). For now we emit a deterministic-looking UUID the manifest
        can carry; callers must treat this as opaque.
        """
        prefix = "fortemi" if storage_backend == "fortemi" else "aiwg-index"
        return f"{prefix}-snapshot-{version}-{uuid.uuid4()}"

    # ------------------------------------------------------------------ #
    # Main entrypoint                                                     #
    # ------------------------------------------------------------------ #

    def publish(
        self,
        version: str,
        examples: list["CanonicalRecord"],
        sources: list[SourceEntry],
        output_dir: Path | str,
        *,
        name: str | None = None,
        description: str | None = None,
        split_ratios: dict[str, float] | None = None,
        seed: int = 42,
        storage_backend: StorageBackend = "fortemi",
        target_model: str | None = None,
        intended_use: str | None = None,
        out_of_scope: list[str] | None = None,
        ethical_considerations: str | None = None,
        format_exports: list[str] | None = None,
        reproduction_recipe: ReproductionRecipe | None = None,
        acknowledge_contamination: bool = False,
        acknowledge_license_risk: bool = False,
        decontamination_report_id: str | None = None,
        license_override: str | None = None,
        activity_log: Path | str | None = None,
        simulate_failure_after: str | None = None,
    ) -> PublishResult:
        """Nine-step atomic publication per SKILL.md.

        Args:
            version: CalVer or SemVer identifier. Must not collide with an
                existing ``<output_dir>/<version>.yaml``.
            examples: candidate example set (post-filter, post-decontamination).
            sources: contributing sources (carries per-source license + counts).
            output_dir: ``datasets/`` root; final files land here after staging.
            split_ratios: defaults to ``{train:0.8, validation:0.1, test:0.1}``.
            seed: RNG seed controlling split assignment.
            storage_backend: ``fortemi`` or ``aiwg-index``.
            acknowledge_contamination: override decontamination gate (currently
                a pass-through — wired to #843 when that gate lands).
            acknowledge_license_risk: override license C1–C5 ERRORs.
            simulate_failure_after: test-only. If set to a step name
                (``"fixity"``, ``"provenance"``, ``"snapshot"``, ``"manifest"``),
                raises ``RuntimeError`` after that step to exercise rollback.

        Raises:
            PublicationGateError: when a blocking license finding is present
                and ``acknowledge_license_risk=False``.
            FileExistsError: version already published.
            ValueError: invalid inputs (version format, ratio sum, empty sources).

        Returns:
            ``PublishResult`` with the final on-disk paths.
        """
        from aiwg_training.core.provenance import now_iso  # local import, uses tz UTC

        _validate_version_string(version)
        if not sources:
            raise ValueError("publish: at least one source is required")
        if not examples:
            raise ValueError("publish: at least one example is required")

        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        final_manifest_yaml = output_dir / f"{version}.yaml"
        final_manifest_json = output_dir / f"{version}.json"
        final_fixity = output_dir / f"{version}-CHECKSUMS.sha256"
        final_prov = output_dir / "provenance" / f"dataset-{version}.jsonld"
        if any(p.exists() for p in (final_manifest_yaml, final_manifest_json, final_fixity)):
            raise FileExistsError(
                f"version {version!r} already published under {output_dir}; versions are immutable"
            )

        split_ratios = split_ratios or {"train": 0.8, "validation": 0.1, "test": 0.1}
        name = name or f"training-dataset-{version}"
        description = description or f"Training dataset version {version}"

        # Stage all writes in a scratch directory — atomic rename on success.
        staging = output_dir / ".staging" / version
        if staging.exists():
            shutil.rmtree(staging)
        staging.mkdir(parents=True)

        snapshot_id: str | None = None
        warnings: list[LicenseCheckResult] = []

        try:
            # Step 2 — splits (gate step 1 runs after we have the dataset license)
            counts, assignments = self.compute_split_counts(examples, split_ratios, seed)

            # Step 3 — effective license
            try:
                computed_license = self.compute_effective_license(sources)
            except IncompatibleLicensesError as e:
                if not acknowledge_license_risk:
                    result = LicenseCheckResult(
                        check_id="C3",
                        severity="ERROR",
                        passed=False,
                        message=str(e),
                        findings=[str(e)],
                    )
                    raise PublicationGateError(
                        f"License resolution failed: {e}. Pass --acknowledge-license-risk to override.",
                        blocking=[result],
                    ) from e
                computed_license = license_override or sources[0].license

            effective_license = license_override or computed_license

            # Step 4 — synthetic ratio
            synthetic_ratio = self.compute_synthetic_ratio(examples, assignments)

            # Build the candidate manifest early so gate checks have full context.
            candidate_manifest = DatasetManifest(
                version=version,
                name=name,
                description=description,
                seed=seed,
                split_counts=counts,
                sources=sources,
                license=effective_license,
                provenance_record_id="pending",  # patched after step 6
                storage_ref=StorageRef(),  # patched after step 7
                fixity_manifest=str(final_fixity),
                created_at=now_iso(),
                synthetic_ratio=synthetic_ratio,
                decontamination_report_id=decontamination_report_id,
                reproduction_recipe=reproduction_recipe or ReproductionRecipe(),
                format_exports=format_exports or [],
                target_model=target_model,
                intended_use=intended_use,
                out_of_scope=out_of_scope or [],
                ethical_considerations=ethical_considerations,
            )

            # storage_ref must carry exactly one ID — set a placeholder before
            # gate checks so validators don't trip; real IDs land at step 7.
            candidate_manifest.storage_ref = StorageRef(
                fortemi_archive_id="staging" if storage_backend == "fortemi" else None,
                aiwg_index_snapshot_id="staging" if storage_backend == "aiwg-index" else None,
            )

            # Step 1 — license gate (runs now that we can build a full manifest)
            checker = LicenseChecker()
            results = checker.check_all(candidate_manifest, examples)
            blocking = checker.blocking_results(results)
            warnings = [r for r in results if r.severity == "WARNING"]
            if blocking and not acknowledge_license_risk:
                raise PublicationGateError(
                    f"License gate failed ({len(blocking)} ERROR(s)). "
                    "Pass acknowledge_license_risk=True with a recorded reason to override.",
                    blocking=blocking,
                )

            # Step 5 — fixity manifest
            staging_fixity = staging / f"{version}-CHECKSUMS.sha256"
            # Snapshot the staging directory itself (empty so far apart from
            # fixity output — covers the manifest YAML+JSON added after rename).
            # For the fixity manifest covering the *examples*, callers pass
            # example files in; here we scan the output_dir's example payload
            # if any exists. For the Phase-1 stub we hash the staging sandbox.
            entries = scan_directory(staging, relative_to=staging)
            write_fixity_manifest(entries, staging_fixity, title=f"Dataset {version}")
            if simulate_failure_after == "fixity":
                raise RuntimeError("simulate_failure_after=fixity")

            # Step 6 — provenance
            staging_prov = staging / "provenance" / f"dataset-{version}.jsonld"
            prov_record = self.build_provenance(candidate_manifest, sources)
            prov_record.save(staging_prov)
            candidate_manifest.provenance_record_id = prov_record.id
            if simulate_failure_after == "provenance":
                raise RuntimeError("simulate_failure_after=provenance")

            # Step 7 — snapshot (stub)
            snapshot_id = self._take_snapshot(version, storage_backend)
            if storage_backend == "fortemi":
                candidate_manifest.storage_ref = StorageRef(fortemi_archive_id=snapshot_id)
            else:
                candidate_manifest.storage_ref = StorageRef(aiwg_index_snapshot_id=snapshot_id)
            if simulate_failure_after == "snapshot":
                raise RuntimeError("simulate_failure_after=snapshot")

            # Step 8 — write manifest YAML + JSON
            staging_yaml = staging / f"{version}.yaml"
            staging_json = staging / f"{version}.json"
            candidate_manifest.save_yaml(staging_yaml)
            candidate_manifest.save_json(staging_json)
            if simulate_failure_after == "manifest":
                raise RuntimeError("simulate_failure_after=manifest")

            # Atomic move: rename each staged file to its final location.
            final_prov.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(staging_yaml), final_manifest_yaml)
            shutil.move(str(staging_json), final_manifest_json)
            shutil.move(str(staging_fixity), final_fixity)
            shutil.move(str(staging_prov), final_prov)

            # Re-point the manifest's fixity/provenance fields at their final
            # locations and rewrite YAML+JSON in place.
            candidate_manifest.fixity_manifest = str(final_fixity)
            candidate_manifest.save_both(final_manifest_yaml)

            # Step 9 — log event
            event = DatasetVersionEvent(
                consumer=self.topology.namespace,
                version=version,
                split_counts={
                    "train": counts.train,
                    "validation": counts.validation,
                    "test": counts.test,
                },
                storage_ref=snapshot_id,
                manifest_path=str(final_manifest_yaml),
                fixity_manifest=str(final_fixity),
                synthetic_ratio={
                    "train": synthetic_ratio.train,
                    "validation": synthetic_ratio.validation,
                    "test": synthetic_ratio.test,
                },
            )
            log_to_consumer(event, self.topology)
            log_activity(
                f"dataset-version published {name}@{version} "
                f"(license={effective_license}, snapshot={snapshot_id})",
                activity_log=activity_log or ".aiwg/activity.log",
            )

            # Cleanup staging
            shutil.rmtree(staging.parent, ignore_errors=True)

            return PublishResult(
                manifest=candidate_manifest,
                manifest_yaml=final_manifest_yaml,
                manifest_json=final_manifest_json,
                fixity_manifest=final_fixity,
                provenance_record=final_prov,
                snapshot_id=snapshot_id,
                warnings=warnings,
            )

        except Exception:
            # Rollback: drop the staging tree and any partial finals.
            shutil.rmtree(staging.parent, ignore_errors=True)
            for partial in (final_manifest_yaml, final_manifest_json, final_fixity, final_prov):
                if partial.exists():
                    partial.unlink()
            if snapshot_id is not None:
                # In the stubbed world this is a no-op; real impl (#848) will
                # call ``_rollback_snapshot`` on the Fortemi/aiwg-index backend.
                pass
            raise
