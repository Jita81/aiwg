"""Quality gates and lint rules for training-complete datasets.

Modules:
- ``license_check``: SPDX inheritance + C1–C5 checks per ``rules/license-check.md``.
"""

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
    "INCOMPATIBLE_COMBINATIONS",
    "IncompatibleLicensesError",
    "LicenseChecker",
    "LicenseCheckResult",
    "LicenseLevel",
    "NON_COMMERCIAL_IDENTIFIERS",
    "SHARE_ALIKE_IDENTIFIERS",
    "SPDX_PRECEDENCE",
    "compute_effective_license",
    "validate_inheritance",
]
