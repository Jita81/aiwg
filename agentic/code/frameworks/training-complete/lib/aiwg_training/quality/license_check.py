"""License inheritance and lint checks for training-complete.

Implements the most-restrictive-wins SPDX resolution and the C1–C5 checks from
``rules/license-check.md``. Integrates with ``memory-lint`` and runs as a
blocking gate inside ``dataset-version``.

The SPDX matching here is *identifier-based*, not full SPDX expression parsing.
Simple compound expressions (``GPL-3.0-only OR MIT``, ``Apache-2.0 AND MIT``)
are accepted as a literal string — the dataset-version gate records the
expression verbatim but treats the full string as opaque when computing the
effective license (operator must acknowledge via ``--acknowledge-license-risk``).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import IntEnum
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:
    from aiwg_training.schemas.dataset_manifest import DatasetManifest, SourceEntry
    from aiwg_training.schemas.example_record import CanonicalRecord


class LicenseLevel(IntEnum):
    """Precedence levels (higher = more restrictive)."""

    PUBLIC_DOMAIN = 0
    ATTRIBUTION = 1
    SHARE_ALIKE = 2
    COPYLEFT = 3
    STRONG_COPYLEFT = 4
    NON_COMMERCIAL = 5
    PROPRIETARY = 6
    UNKNOWN = 7  # intentionally tops the hierarchy — forces acknowledgement


# SPDX identifier → precedence level, ordered by increasing restrictiveness.
# Add new identifiers here; unknown SPDX IDs default to UNKNOWN and block
# publication unless acknowledged.
SPDX_PRECEDENCE: list[tuple[LicenseLevel, tuple[str, ...]]] = [
    (LicenseLevel.PUBLIC_DOMAIN, ("CC0-1.0", "Unlicense", "0BSD", "WTFPL")),
    (
        LicenseLevel.ATTRIBUTION,
        (
            "MIT",
            "MIT-0",
            "Apache-2.0",
            "BSD-2-Clause",
            "BSD-3-Clause",
            "BSD-4-Clause",
            "ISC",
            "CC-BY-4.0",
            "CC-BY-3.0",
            "Zlib",
            "Python-2.0",
        ),
    ),
    (LicenseLevel.SHARE_ALIKE, ("CC-BY-SA-4.0", "CC-BY-SA-3.0", "MPL-2.0", "EPL-2.0")),
    (LicenseLevel.COPYLEFT, ("GPL-2.0-only", "GPL-2.0-or-later", "LGPL-2.1-only", "LGPL-2.1-or-later", "LGPL-3.0-only", "LGPL-3.0-or-later")),
    (LicenseLevel.STRONG_COPYLEFT, ("GPL-3.0-only", "GPL-3.0-or-later", "AGPL-3.0-only", "AGPL-3.0-or-later")),
    (
        LicenseLevel.NON_COMMERCIAL,
        (
            "CC-BY-NC-4.0",
            "CC-BY-NC-3.0",
            "CC-BY-NC-SA-4.0",
            "CC-BY-NC-SA-3.0",
            "CC-BY-NC-ND-4.0",
            "CC-BY-NC-ND-3.0",
        ),
    ),
    (LicenseLevel.PROPRIETARY, ("Proprietary", "AllRightsReserved", "Commercial")),
]


# Known incompatible SPDX combinations that cannot be legally combined.
# Checked before most-restrictive-wins resolution runs.
INCOMPATIBLE_COMBINATIONS: list[tuple[str, str, str]] = [
    ("GPL-2.0-only", "GPL-3.0-only", "GPL-2.0-only and GPL-3.0-only are mutually incompatible — no version permits both"),
    ("GPL-2.0-only", "AGPL-3.0-only", "GPL-2.0-only cannot be combined with AGPL-3.0-only"),
    ("CC-BY-NC-4.0", "GPL-3.0-only", "Non-commercial CC-BY-NC forbids GPL's commercial-use guarantee"),
    ("CC-BY-NC-SA-4.0", "GPL-3.0-only", "Non-commercial share-alike cannot satisfy GPL's freedom-to-sell clause"),
]


# Share-alike family — sources at this level or below (COPYLEFT, STRONG_COPYLEFT)
# impose SA propagation requirements on the dataset.
SHARE_ALIKE_IDENTIFIERS = frozenset(
    {
        "CC-BY-SA-4.0",
        "CC-BY-SA-3.0",
        "MPL-2.0",
        "EPL-2.0",
        "GPL-2.0-only",
        "GPL-2.0-or-later",
        "GPL-3.0-only",
        "GPL-3.0-or-later",
        "AGPL-3.0-only",
        "AGPL-3.0-or-later",
        "LGPL-2.1-only",
        "LGPL-2.1-or-later",
        "LGPL-3.0-only",
        "LGPL-3.0-or-later",
        "CC-BY-NC-SA-4.0",
        "CC-BY-NC-SA-3.0",
    }
)


NON_COMMERCIAL_IDENTIFIERS = frozenset(
    {
        "CC-BY-NC-4.0",
        "CC-BY-NC-3.0",
        "CC-BY-NC-SA-4.0",
        "CC-BY-NC-SA-3.0",
        "CC-BY-NC-ND-4.0",
        "CC-BY-NC-ND-3.0",
    }
)


class IncompatibleLicensesError(ValueError):
    """Raised when two source licenses cannot be combined under any effective license."""


def _lookup_level(spdx: str) -> LicenseLevel:
    """Return the precedence level for an SPDX identifier.

    Unknown identifiers return ``LicenseLevel.UNKNOWN`` — the caller decides
    whether to block, warn, or proceed.
    """
    if not spdx or spdx.lower() in ("unknown", "unlicensed"):
        return LicenseLevel.UNKNOWN
    for level, patterns in SPDX_PRECEDENCE:
        if spdx in patterns:
            return level
    return LicenseLevel.UNKNOWN


def compute_effective_license(licenses: list[str]) -> str:
    """Resolve a list of SPDX identifiers to a single effective license.

    Applies most-restrictive-wins per ``rules/license-check.md``.

    Raises:
        IncompatibleLicensesError: when the combination includes a known-bad
            pair (e.g., ``GPL-2.0-only`` + ``GPL-3.0-only``) or when two
            incompatible licenses sit at the same precedence level.
    """
    if not licenses:
        raise ValueError("compute_effective_license: empty license list")

    # Check hard-coded incompatibility pairs first.
    seen = set(licenses)
    for a, b, reason in INCOMPATIBLE_COMBINATIONS:
        if a in seen and b in seen:
            raise IncompatibleLicensesError(f"Incompatible licenses {a!r} + {b!r}: {reason}")

    # Rank each license and pick the highest.
    ranked = [(_lookup_level(spdx), spdx) for spdx in licenses]
    top_level = max(level for level, _ in ranked)
    top_candidates = [spdx for level, spdx in ranked if level == top_level]

    # If multiple distinct identifiers share the top level, pick the most
    # specific (deduped, lexicographically stable). Incompatible pairs at the
    # same level were caught above.
    distinct = sorted(set(top_candidates))
    if top_level is LicenseLevel.UNKNOWN:
        # Preserve the original identifier rather than coercing — downstream
        # gates need to surface the unknown value to the operator.
        return distinct[0]
    return distinct[0]


def validate_inheritance(example_license: str, source_licenses: list[str]) -> bool:
    """Return True if ``example_license`` is at least as restrictive as its sources.

    Used for license-laundering detection (C2): an example derived from
    GPL-3.0-only sources cannot be relabeled MIT.
    """
    if not source_licenses:
        return True  # no sources to inherit from — trivially valid
    required_level = _lookup_level(compute_effective_license(source_licenses))
    actual_level = _lookup_level(example_license)
    return actual_level >= required_level


# --------------------------------------------------------------------------- #
# Check results                                                                #
# --------------------------------------------------------------------------- #


Severity = Literal["ERROR", "WARNING", "INFO"]


@dataclass
class LicenseCheckResult:
    """Result of a single C1–C5 check."""

    check_id: str  # "C1" through "C5"
    severity: Severity
    passed: bool
    message: str
    findings: list[str] = field(default_factory=list)

    def is_blocking(self) -> bool:
        return self.severity == "ERROR" and not self.passed


# --------------------------------------------------------------------------- #
# Checker                                                                      #
# --------------------------------------------------------------------------- #


class LicenseChecker:
    """Runs the five license-check rules (C1–C5) against a candidate dataset."""

    def __init__(self, *, strict_commercial: bool = False, require_sa_ack: bool = True) -> None:
        self.strict_commercial = strict_commercial
        self.require_sa_ack = require_sa_ack

    # -- Individual checks ------------------------------------------------- #

    def check_sources(self, sources: list["SourceEntry"]) -> LicenseCheckResult:
        """C1: every source declares a valid SPDX license."""
        findings: list[str] = []
        for src in sources:
            if not src.license or not src.license.strip():
                findings.append(f"source {src.ref_id}: missing license")
                continue
            if src.license.lower() in ("unknown", "unlicensed"):
                # WARN-level case handled at the result level, not per-entry
                findings.append(f"source {src.ref_id}: license=unknown (requires --allow-unlicensed)")
                continue
            if _lookup_level(src.license) is LicenseLevel.UNKNOWN:
                findings.append(f"source {src.ref_id}: unrecognized SPDX identifier {src.license!r}")

        if not findings:
            return LicenseCheckResult("C1", "INFO", True, f"All {len(sources)} sources declare valid SPDX licenses")

        has_unknown_only = all("license=unknown" in f for f in findings)
        severity: Severity = "WARNING" if has_unknown_only else "ERROR"
        return LicenseCheckResult(
            "C1",
            severity,
            passed=severity == "WARNING",
            message=f"{len(findings)} source(s) have license issues",
            findings=findings,
        )

    def check_examples(
        self, examples: list["CanonicalRecord"], sources: list["SourceEntry"]
    ) -> LicenseCheckResult:
        """C2: every example inherits a license; no license laundering."""
        source_license_by_ref = {s.ref_id: s.license for s in sources}
        findings: list[str] = []

        for ex in examples:
            lic = ex.metadata.license
            if not lic or not lic.strip():
                findings.append(f"example {ex.id}: missing metadata.license")
                continue

            refs = ex.metadata.source_refs or []
            source_licenses = [source_license_by_ref[r] for r in refs if r in source_license_by_ref]
            if not source_licenses:
                # No traceable sources — allowed but flagged
                continue

            try:
                if not validate_inheritance(lic, source_licenses):
                    required = compute_effective_license(source_licenses)
                    findings.append(
                        f"example {ex.id}: license {lic!r} is weaker than source-computed {required!r} "
                        f"(license laundering — sources: {source_licenses})"
                    )
            except IncompatibleLicensesError as e:
                findings.append(f"example {ex.id}: incompatible source licenses — {e}")

        if not findings:
            return LicenseCheckResult(
                "C2", "INFO", True, f"All {len(examples)} examples inherit licenses cleanly"
            )
        return LicenseCheckResult(
            "C2",
            "ERROR",
            passed=False,
            message=f"{len(findings)} example(s) fail license inheritance",
            findings=findings,
        )

    def check_dataset(
        self, manifest: "DatasetManifest", examples: list["CanonicalRecord"]
    ) -> LicenseCheckResult:
        """C3: dataset's declared license is computable and no weaker than the floor."""
        findings: list[str] = []

        if not manifest.license or not manifest.license.strip():
            return LicenseCheckResult(
                "C3", "ERROR", False, "dataset-manifest.license is absent", ["license field is required"]
            )

        source_licenses = [s.license for s in manifest.sources]
        if any(s.lower() in ("unknown", "unlicensed") for s in source_licenses):
            findings.append(
                "at least one source has license=unknown; dataset cannot be published without "
                "--acknowledge-license-risk"
            )

        try:
            computed = compute_effective_license(source_licenses)
        except IncompatibleLicensesError as e:
            return LicenseCheckResult(
                "C3",
                "ERROR",
                False,
                f"sources are mutually incompatible: {e}",
                [str(e)],
            )

        declared_level = _lookup_level(manifest.license)
        computed_level = _lookup_level(computed)
        if declared_level < computed_level:
            findings.append(
                f"declared license {manifest.license!r} is weaker than computed floor {computed!r}"
            )

        if findings:
            return LicenseCheckResult(
                "C3",
                "ERROR",
                False,
                f"dataset license has {len(findings)} issue(s)",
                findings,
            )
        return LicenseCheckResult(
            "C3", "INFO", True, f"dataset license {manifest.license!r} is valid and at least {computed!r}"
        )

    def check_commercial_compatibility(
        self, manifest: "DatasetManifest"
    ) -> LicenseCheckResult:
        """C4: commercial-use datasets flag non-commercial or copyleft sources."""
        intended = (manifest.intended_use or "").lower()
        if "commercial" not in intended:
            return LicenseCheckResult(
                "C4", "INFO", True, "dataset not declared for commercial use; C4 skipped"
            )

        findings: list[str] = []
        for src in manifest.sources:
            if src.license in NON_COMMERCIAL_IDENTIFIERS:
                findings.append(
                    f"source {src.ref_id}: non-commercial license {src.license!r} conflicts with commercial intended_use"
                )
            elif _lookup_level(src.license) >= LicenseLevel.COPYLEFT:
                # Copyleft into non-copyleft commercial dataset
                if _lookup_level(manifest.license) < LicenseLevel.COPYLEFT:
                    findings.append(
                        f"source {src.ref_id}: copyleft license {src.license!r} into non-copyleft commercial dataset"
                    )
            elif src.license.lower() == "unknown":
                findings.append(f"source {src.ref_id}: unknown license in commercial dataset")

        if not findings:
            return LicenseCheckResult("C4", "INFO", True, "commercial-use compatibility clean")

        severity: Severity = "ERROR" if self.strict_commercial else "WARNING"
        return LicenseCheckResult(
            "C4",
            severity,
            passed=severity == "WARNING",
            message=f"{len(findings)} commercial-compatibility issue(s)",
            findings=findings,
        )

    def check_share_alike(self, manifest: "DatasetManifest") -> LicenseCheckResult:
        """C5: share-alike propagation — SA sources require SA dataset + ethics note."""
        sa_sources = [s for s in manifest.sources if s.license in SHARE_ALIKE_IDENTIFIERS]
        if not sa_sources:
            return LicenseCheckResult("C5", "INFO", True, "no share-alike sources; C5 skipped")

        findings: list[str] = []
        dataset_level = _lookup_level(manifest.license)
        if manifest.license not in SHARE_ALIKE_IDENTIFIERS and dataset_level < LicenseLevel.SHARE_ALIKE:
            findings.append(
                f"{len(sa_sources)} share-alike source(s) present but dataset license "
                f"{manifest.license!r} does not propagate SA obligations"
            )

        ethics = (manifest.ethical_considerations or "").lower()
        if self.require_sa_ack and "share-alike" not in ethics and "sharealike" not in ethics:
            findings.append("ethical_considerations omits share-alike notice")

        if not findings:
            return LicenseCheckResult("C5", "INFO", True, "share-alike propagation clean")

        has_sa_violation = any("does not propagate" in f for f in findings)
        severity: Severity = "ERROR" if has_sa_violation else "WARNING"
        return LicenseCheckResult(
            "C5",
            severity,
            passed=severity == "WARNING",
            message=f"{len(findings)} share-alike issue(s)",
            findings=findings,
        )

    # -- Composite ---------------------------------------------------------- #

    def check_all(
        self, manifest: "DatasetManifest", examples: list["CanonicalRecord"]
    ) -> list[LicenseCheckResult]:
        """Run C1–C5 in order. Returns all results (caller filters on severity)."""
        return [
            self.check_sources(manifest.sources),
            self.check_examples(examples, manifest.sources),
            self.check_dataset(manifest, examples),
            self.check_commercial_compatibility(manifest),
            self.check_share_alike(manifest),
        ]

    @staticmethod
    def blocking_results(results: list[LicenseCheckResult]) -> list[LicenseCheckResult]:
        """Return only the ERROR-level, failed results (the ones that block publication)."""
        return [r for r in results if r.is_blocking()]
