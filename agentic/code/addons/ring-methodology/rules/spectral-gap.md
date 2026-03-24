# Spectral Gap

**Enforcement Level**: HIGH
**Scope**: All agents using ring-methodology
**Addon**: ring-methodology
**Issue**: #473

---

## Overview

The Spectral Gap is a process health metric for ring-methodology workflows. It measures whether the ring itself is functioning well — not whether the product produced by the ring is correct. A project can achieve high test coverage and passing gate outcomes while the process producing those results degrades: Layer C failures accumulating, the same failure archetypes recurring, kernels ignored on retry. The Spectral Gap makes that degradation visible before it produces failures that standard quality metrics cannot explain.

---

## Problem Statement

AIWG measures product quality: test pass rates, Layer C outcomes, gate results. It does not measure process quality — the health of the ring as a generative mechanism.

A project can appear healthy by product metrics while its process degrades:

- Layer C failures increasing session over session, but each one resolved eventually
- The same failure archetype appearing repeatedly, never extracted as a kernel
- Retries starting from zero rather than consulting accumulated kernel knowledge
- Layer D perinoesis reviews producing no `actions_taken` — rubber-stamping, not reflecting
- Morpholepsis signals accumulating with no reframe

These patterns do not show up as test failures. They show up as process entropy: more retries per feature, higher escalation rates, loss of compounding improvement across the session. The ring stops circulating.

The Spectral Gap makes this visible. It is a single number — first-attempt Layer C pass rate — that encodes whether the ring is learning and circulating, or grinding.

---

## Metric Definition

```
spectral_gap = (features passing Layer C on first attempt) / (total features this session)
```

Layer C is chosen as the basis because it is the hardest layer to fake. Layer A failures can be resolved by fixing syntax. Layer B failures can be resolved by fixing logic. Layer C failures require that the assembled product, running in a real environment with a real user surface, produces the correct result. An agent cannot substitute effort for Layer C correctness. A rising first-attempt pass rate at Layer C means the process is learning. A falling rate means it is not.

Session scope: the metric resets each session. It is not a cumulative project metric. It measures ring health now, not ring health historically.

---

## Health Phases

Health phases are discrete, not gradient. Below a threshold, the state is zero — not "low". Transitions are pathokinetic: the same process that produces STABLE can produce DEGRADED; the only question is which threshold was last crossed.

```
spectral_gap ≥ 61.8%  (= φ⁻¹)  PEAK       Continue. Ring circulating well.
spectral_gap ≥ 38.2%  (= φ⁻²)  STABLE     Review Layer C failures. Look for pattern.
spectral_gap ≥ 23.6%  (= φ⁻³)  DEGRADED   Stop features. Fix process. Perinoetic review NOW.
spectral_gap <  23.6% (= φ⁻³)  CRITICAL   Halt. Human required. Process itself is broken.
BLOCKED                          KENOPHORIA  Hold. State doc. Monitor. Resume when unblocked.
```

All thresholds are φ-derived. See @agentic/code/addons/ring-methodology/rules/phi-constants.md for the full constants table and derivation.

**PEAK**: The ring is functioning. Layer C first-attempt pass rate is above φ⁻¹ (the golden ratio complement). Continue. Perinoetic reviews run on schedule.

**STABLE**: Layer C failures are occurring at a rate that warrants examination but does not require stopping. Review the most recent Layer C failures. Is there a pattern? If the same archetype appears twice — stop and treat as DEGRADED. If failures are heterogeneous and unrelated, continue with heightened attention.

**DEGRADED**: Do not start new features. The process is consuming more than it is producing. Conduct a perinoetic review immediately regardless of interval. Identify the recurring archetype. Consult the kernel library. Take a concrete action before resuming.

**CRITICAL**: Halt all feature work. The process itself is broken — not a feature, not a test, the process. Human review is required. Do not attempt recovery without human input. Document current state before halting.

**KENOPHORIA**: Blocked state. Feature progress is impossible due to an external blocker (environment, dependency, access). This is not a process failure — it is a hold condition. Document the blocking state, monitor for resolution, resume when unblocked. Spectral gap calculation pauses during KENOPHORIA.

Phase transitions are always logged to `perinoesis.jsonl` regardless of interval schedule. A PEAK→STABLE transition is a signal. It is not alarming; it is information. Log it and examine the cause.

---

## Feature Tracking

Every feature produces one record in `.aiwg/working/ring/features.jsonl`. One record per feature. Append-only. Never overwrite.

```json
{
  "feature": "string",
  "timestamp": "ISO 8601",
  "layer_a": true,
  "layer_b": true,
  "layer_c_first": false,
  "layer_c_retries": 2,
  "layer_d": { "...structured artifact..." },
  "kernels_extracted": [],
  "morpholepsis_signals": [],
  "ring_complete": false
}
```

Field semantics:

- `layer_c_first`: `true` only if Layer C passed on the first attempt, before any retry. This is the numerator input for the spectral gap calculation.
- `layer_c_retries`: number of retry attempts after first failure. Zero means first attempt passed.
- `kernels_extracted`: array of kernel IDs written to `kernels.jsonl` during Layer D for this feature.
- `morpholepsis_signals`: array of signal types that fired during this feature's ring traversal.
- `ring_complete`: `true` only when all four layers complete and Layer D produces a non-empty artifact. A feature with `layer_c_first: false` can still have `ring_complete: true` — it passed eventually. The spectral gap records both.

The spectral gap is computed from this file at any point:

```
spectral_gap = count(layer_c_first == true) / count(ring_complete == true)
```

Only completed features (ring_complete true) enter the denominator. In-progress features are excluded.

---

## Perinoetic Review

A perinoetic review is a structured examination of the ring's operation, not the product's quality. It asks whether the process is learning.

### Triggers

Two trigger types. Phase transitions take priority over interval triggers.

1. **Phase transition**: Any threshold boundary crossing triggers an immediate review. PEAK→STABLE, STABLE→DEGRADED, DEGRADED→CRITICAL — all require a review before the next feature begins. STABLE→PEAK (recovery) also triggers a review to understand what changed.

2. **Interval**: Every 3 completed features, regardless of phase, triggers a review.

### Review Protocol

Seven questions. All seven are asked. Unanswered questions are recorded as unanswered — not skipped.

1. Which verification layer fails most frequently in this session?
2. Which failure archetype recurs? (Is the same root cause appearing under different surface symptoms?)
3. Are retries consulting the kernel library, or restarting from zero?
4. Which morpholepsis signals have fired? Is any signal firing repeatedly?
5. Are temporal coupling failures increasing? (Features that pass individually but fail in sequence.)
6. Is the kernel library being actively consulted before retry, or only written to after Layer D?
7. Is Layer D producing genuine insight — new constraints, new failure patterns, new kernel candidates — or confirming what was already known?

### Review Record

Answers are written to `.aiwg/working/ring/perinoesis.jsonl`. One record per review. Append-only.

```json
{
  "ring_position": "action|verification|reflection|identity",
  "trigger": "interval|phase_transition",
  "timestamp": "ISO 8601",
  "questions_asked": [],
  "answers": [],
  "actions_taken": [],
  "document_updated": false
}
```

Field semantics:

- `ring_position`: Which phase of the ring this review most concerns. A Layer C pattern is `verification`. A Layer D rubber-stamping concern is `reflection`. A recurring archetype with no kernel extraction is `identity` (the ring is not integrating learning).
- `trigger`: What caused this review — interval schedule or phase transition.
- `actions_taken`: Concrete changes made as a result of this review. Examples: "Added kernel K-014 for zsh autocorrect path failure", "Rewrote Layer C test to simulate login shell environment", "Identified morpholepsis: agent is retrying with syntax variations, reframe to environment variables". Empty is a finding, not a valid answer.
- `document_updated`: Whether the ring methodology working document was updated to reflect the review's findings.

### Rubber-Stamp Detection

If `actions_taken` is empty for two consecutive reviews, the perinoetic review process itself is rubber-stamping. The ring is going through the motions of reflection without reflecting.

When this condition is detected: escalate immediately. Do not continue with a third empty review. Log the escalation in the current review record and halt until a human reviews the perinoesis log.

---

## Integration

The Spectral Gap is a coordination point between ring-methodology components. It does not operate in isolation.

**Feeds into `kenophoria-state`**: When the spectral gap reaches CRITICAL, it produces a halt condition that `kenophoria-state` records and monitors. The Spectral Gap identifies the halt; `kenophoria-state` manages the hold.

**Consumes `features.jsonl` from `verification-ring`**: The `verification-ring` rule produces the feature records that the spectral gap calculation requires. `layer_c_first` and `ring_complete` fields in `features.jsonl` are the primary inputs.

**Consumes `kernels.jsonl` from `kernel-extraction`**: Review question 3 (are retries consulting the kernel library?) and question 6 (is the kernel library actively consulted before retry?) require knowing what kernels exist and whether they were consulted. `kernels.jsonl` provides this.

**Triggers `morpholepsis-detection` when STABLE or DEGRADED**: When the spectral gap transitions to STABLE or DEGRADED, `morpholepsis-detection` should be explicitly invoked on the session's Layer C failure sequence. A falling spectral gap and a morpholepsis pattern are frequently co-occurring. STABLE may produce one without the other; DEGRADED should be assumed to involve both until the perinoetic review determines otherwise.

**Does not replace `anti-laziness`**: The spectral gap measures process entropy over a session. `anti-laziness` catches destructive resolution within a single feature. Both rules are active simultaneously. A project can be in PEAK phase with a single feature attempting a laziness resolution — both conditions require response.
