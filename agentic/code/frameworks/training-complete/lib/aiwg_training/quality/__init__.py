"""Quality gates and lint rules for training-complete datasets.

Modules:

- ``license_check``: SPDX inheritance + C1–C5 checks per ``rules/license-check.md``.
- ``example_quality``: GRADE adaptation for per-example assessment
  (``example-quality-assess`` skill).
"""

from aiwg_training.quality.example_quality import (
    DOWNGRADE_FACTORS,
    UPGRADE_FACTORS,
    QualityAssessment,
    QualityAssessor,
    QualityReport,
)
from aiwg_training.quality.license_check import (
    INCOMPATIBLE_COMBINATIONS,
    NON_COMMERCIAL_IDENTIFIERS,
    SHARE_ALIKE_IDENTIFIERS,
    SPDX_PRECEDENCE,
    IncompatibleLicensesError,
    LicenseChecker,
    LicenseCheckResult,
    LicenseLevel,
    compute_effective_license,
    validate_inheritance,
)

__all__ = [
    "DOWNGRADE_FACTORS",
    "INCOMPATIBLE_COMBINATIONS",
    "IncompatibleLicensesError",
    "LicenseChecker",
    "LicenseCheckResult",
    "LicenseLevel",
    "NON_COMMERCIAL_IDENTIFIERS",
    "QualityAssessment",
    "QualityAssessor",
    "QualityReport",
    "SHARE_ALIKE_IDENTIFIERS",
    "SPDX_PRECEDENCE",
    "UPGRADE_FACTORS",
    "compute_effective_license",
    "validate_inheritance",
]
