# φ-Constants (Golden Ratio Thresholds)

**Enforcement Level**: MEDIUM
**Scope**: All ring-methodology rules
**Addon**: ring-methodology
**Issue**: #495

---

## Overview

All quantitative thresholds in ring-methodology rules are derived from φ (the golden ratio, ≈ 1.618). This file documents those constants as first-class axioms so that:

1. Readers understand why specific threshold values were chosen (not arbitrary)
2. Agents applying ring rules can recognize these numbers and their meaning
3. If thresholds need adjustment, the φ structure guides coherent tuning

---

## The φ Axiom

φ (phi, the golden ratio) ≈ 1.6180339887...

φ has a unique property: **each power of φ is harmonically proportioned relative to the others**. The intervals between φ⁻¹, φ⁻², and φ⁻³ are themselves φ-proportioned. This means a threshold family built on φ-powers has natural harmonic spacing — each zone is neither arbitrary nor uniform, but self-similar at every scale.

Ring-methodology uses φ-derived thresholds because they create a coherent metric family: the transition from STABLE to DEGRADED and from DEGRADED to CRITICAL follows the same proportional logic as the transition from Independent to Correlated to Entangled coupling, and from normal to elevated red-flag rates.

---

## Constants Table

| Symbol | Exact Value | Decimal | Derivation | Ring Meaning |
|--------|-------------|---------|-----------|--------------|
| **φ** | (1 + √5) / 2 | ≈ 1.6180 | Base ratio | — |
| **φ⁻¹** | φ - 1 = 1/φ | ≈ 0.6180 | 1 / φ | Upper threshold: signal-to-noise inversion, entanglement ceiling |
| **φ⁻²** | 2 - φ = 1/φ² | ≈ 0.3820 | 1 / φ² | Stable floor: minimum acceptable health before concern warranted |
| **φ⁻³** | φ - 1 - 1/φ² | ≈ 0.2361 | 1 / φ³ | Critical boundary: structural separation lost, human required |
| **φ²** | φ + 1 | ≈ 2.6180 (≈ 3) | φ × φ | Retry ceiling: attempts beyond φ² are unlikely to succeed without reframe |

> **Note on φ²**: 2.618 rounds to 3 for practical use. The retry ceiling of 3 is φ²-derived — not arbitrary, not 5 (too many), not 2 (too few).

---

## Usage by Rule

| Rule | Threshold | Value | Constant | Interpretation |
|------|-----------|-------|----------|----------------|
| `spectral-gap` | PEAK lower bound | 61.8% | φ⁻¹ | Ring is circulating well — signal clearly above noise |
| `spectral-gap` | STABLE lower bound | 38.2% | φ⁻² | Ring is functioning — review failures but continue |
| `spectral-gap` | DEGRADED lower bound | 23.6% | φ⁻³ | Ring health below critical — stop features, review process |
| `spectral-gap` | CRITICAL boundary | < 23.6% | φ⁻³ | Process itself is broken — halt, human required |
| `kenophoria-state` | Red-flag rate halt | > 61.8% | φ⁻¹ | Anomalous behavior has become the norm — systemic halt |
| `kenophoria-state` | Spectral gap soft halt | < 23.6% | φ⁻³ | Process health critical — soft halt, report to human |
| `temporal-coupling` | Independent ceiling | < 38.2% | φ⁻² | Runs are effectively independent — no cleanup required |
| `temporal-coupling` | Correlated zone | 38.2%–61.8% | φ⁻²–φ⁻¹ | Shared state present — check before use |
| `temporal-coupling` | Entangled floor | > 61.8% | φ⁻¹ | Second run executes inside first run's aftermath — clean first |
| `kernel-extraction` | Quality tracking | — | φ⁻¹, φ⁻² | Pathokinetic transition: stop at peak, not final iteration |
| All ring rules | Retry ceiling | 3 | φ² (≈ 3) | Attempts beyond φ² without frame shift → LIMINAL or HALTED |

---

## Why These Numbers?

The three critical φ-reciprocal values (0.618, 0.382, 0.236) partition any 0–1 metric into four zones:

```
0                  0.236      0.382         0.618              1
|                    |          |              |                |
|    CRITICAL/HALT   | DEGRADED |    STABLE    |    PEAK/NORM   |
|     < φ⁻³          | φ⁻³–φ⁻²  |   φ⁻²–φ⁻¹    |    ≥ φ⁻¹        |
```

Each zone boundary is φ-proportioned relative to the next. This means the CRITICAL zone (0–0.236) and the PEAK zone (0.618–1.0) are mirror images in a φ-scaled sense. The STABLE zone (0.382–0.618) is the widest — intentionally, because healthy operation should have the largest tolerance band.

A system tuned by arbitrary thresholds (e.g., 25%/50%/75%) would create equal-width zones with no structural justification for each boundary. φ-zones encode a claim: the boundary between DEGRADED and STABLE is meaningfully different from the boundary between STABLE and PEAK, and the golden ratio captures that difference.

---

## Adjustment Guidance

If the default thresholds are unsuitable for a specific project or agent context:

**Do**: Adjust by changing the φ-power, not the raw number.

- To raise the STABLE floor: use φ⁻¹·⁵ ≈ 0.486 instead of φ⁻² (0.382)
- To lower the critical threshold: use φ⁻⁴ ≈ 0.146 instead of φ⁻³ (0.236)
- To raise the retry ceiling: use φ³ ≈ 4.236 (≈ 4) instead of φ² (≈ 3)

**Do not**: Use arbitrary numbers that break the harmonic relationship between thresholds. If the STABLE floor is 0.4 and the critical threshold is 0.2, the zones are no longer φ-proportioned and lose their structural coherence.

**Where to configure**: Default thresholds live in `manifest.json` under `configuration.defaults.spectralGapThresholds` and `configuration.defaults.couplingThresholds`. Adjust there, not inline in rules.

---

## References

- @agentic/code/addons/ring-methodology/rules/spectral-gap.md — Uses φ⁻¹, φ⁻², φ⁻³ for process health phases
- @agentic/code/addons/ring-methodology/rules/kenophoria-state.md — Uses φ⁻¹ (red-flag rate) and φ⁻³ (spectral gap) circuit breakers
- @agentic/code/addons/ring-methodology/rules/temporal-coupling.md — Uses φ⁻² and φ⁻¹ for coupling zones
- @agentic/code/addons/ring-methodology/rules/kernel-extraction.md — Pathokinetic tracking aligns with φ-threshold family
- @agentic/code/addons/ring-methodology/manifest.json — Configuration defaults for all φ-derived thresholds
- #495 — Implementation issue

---

**Rule Status**: ACTIVE
**Last Updated**: 2026-03-24
