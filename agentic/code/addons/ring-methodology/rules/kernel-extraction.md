# Kernel Extraction

**Enforcement Level**: HIGH
**Scope**: All agents
**Addon**: ring-methodology
**Issue**: #472

---

## Overview

Kernel extraction is a mandatory failure protocol that preserves the valid insight from every failed attempt before any retry occurs. It implements the **eidoclastic** principle: the approach fails, the kernel of insight survives. Without this rule, each retry starts from zero — failed approaches accumulate no transferable knowledge. With it, failure becomes a fossil record of system learning.

This rule extends `anti-laziness` (which mandates escalation after 3 attempts) by ensuring that the insight from each attempt survives into the next.

---

## Problem Statement

AIWG's `anti-laziness` rule correctly mandates escalation after 3 failed attempts, but it provides no mechanism for insight to survive a failure. The current failure loop is:

```
Attempt 1 → Fail → Attempt 2 → Fail → Attempt 3 → Fail → Escalate
```

Each attempt begins with the same context the previous attempt had — minus confidence. Valid partial insights, correct subcomponents, and accurate diagnoses are discarded along with the failed approach. The system learns nothing from the failures it accumulates.

This is not a deficiency of the `anti-laziness` rule — it is a gap adjacent to it. `anti-laziness` prevents degradation through laziness. `kernel-extraction` prevents degradation through amnesia.

---

## Vocabulary

**Eidoclastics** — Breaking the container, preserving the content. Derived from *eidolon* (image, form) and *klastein* (to break). Applied to failure: the approach that carried an insight fails; the insight itself is extracted before the container is discarded. The kernel is what remains after eidoclastic processing.

**Kernel** — The valid, transferable insight that survives a failed attempt. A kernel is not the failure itself, and it is not the next approach. It is the portion of the failed attempt that was *correct* — the reasoning that held, the subcomponent that worked, the constraint that was accurately identified — extracted from the wreckage of what did not.

**Archetype** — The failure category. Determines which prior kernels are most likely to apply. Defined archetypes: `hallucination`, `context_loss`, `instruction_drift`, `stale_state`, `morpholepsis`, and open extension (any string value is valid for domain-specific archetypes).

**Morpholepsis** — A failure pattern in which an agent cycles through superficially different approaches that share the same flawed underlying assumption. The surface changes; the core failure recurs. A morpholeptic loop is detectable only by examining the kernel library: if multiple kernels share the same reasoning and the same archetype, the agent is looping morpholeptically.

**Pathokinetic transition** — The discrete moment at which output quality shifts from improving to degrading. Quality is non-monotonic across iterations; the pathokinetic transition marks the peak. After this point, additional iterations degrade the best available output.

---

## Mandatory Rules

1. **Extract before retry.** On every failure — without exception — a kernel must be extracted and appended to the kernel library before any retry begins. A retry that begins without kernel extraction is a protocol violation.

2. **Query before planning.** Before planning any retry or decomposition, query the kernel library for matching archetypes and feature domains. Planning that ignores available kernels repeats extractable failures.

3. **Do not repeat captured failures.** If the kernel library contains a prior kernel for this domain and archetype, the captured approach must not be repeated. Adapt using the kernel, or escalate.

4. **Kernels are append-only.** The library grows monotonically. Kernels are never deleted, corrected, or overwritten. If a later kernel contradicts an earlier kernel, both remain. The contradiction is itself informative — record it as a kernel of type `contradiction`.

5. **Quality is non-monotonic.** Track peak output across iterations. If quality drops on two consecutive iterations after a peak, the pathokinetic transition has occurred. Stop. Use the peak output. Do not continue iterating.

6. **Escalate correctly.** `anti-laziness` requires escalation after 3 failed attempts. This rule does not change that threshold. It changes what happens *before* each retry. The escalation path remains: PAUSE > DIAGNOSE > ADAPT > RETRY > ESCALATE.

---

## Kernel Format

Every kernel is a single JSON object appended to `.aiwg/working/ring/kernels.jsonl` (one object per line, append-only).

```json
{
  "feature": "string — what was being built or fixed",
  "timestamp": "ISO 8601 — when the failure occurred",
  "approach": "string — what was tried",
  "reasoning": "string — why the approach seemed correct at the time",
  "kernel": "string — what valid insight survives this failure",
  "archetype": "hallucination | context_loss | instruction_drift | stale_state | morpholepsis | contradiction | <domain-specific>",
  "gate_that_caught": "string — which rule, test, or gate identified the failure, or null if self-detected"
}
```

### Field Guidance

**feature**: Broad enough to match related future work. Use domain terms, not task IDs. "JWT token refresh" not "task-4829-retry-2".

**approach**: Concrete and specific. Future agents must be able to recognize this approach if they are about to repeat it. "Used environment variable CLIENT_SECRET from process.env directly in request headers" is useful. "Tried a different auth approach" is not.

**reasoning**: What made this approach seem correct. This is the most important field for preventing morpholeptic loops — if the same flawed reasoning recurs, it will appear again here and the pattern becomes detectable.

**kernel**: What was *right* about the attempt that failed. This is not a lesson learned and not a next step. It is the extractable valid content. A failed test suite that nonetheless correctly identified the invariant — the invariant is the kernel. A failed implementation that correctly modeled the data contract — the contract model is the kernel.

**archetype**: Choose the closest defined archetype. Use a domain-specific string if none fit. Archetypes enable cross-feature kernel queries.

**gate_that_caught**: The rule, test, CI check, or agent that caught the failure. Enables traceability back to the `executable-feedback` execution log or specific test assertion.

### Example Kernel

```json
{
  "feature": "CLI version command output formatting",
  "timestamp": "2026-03-24T14:22:11Z",
  "approach": "Used chalk.bold() on the version string before passing to ora spinner",
  "reasoning": "chalk.bold() produces styled output in terminal; assumed ora would pass it through",
  "kernel": "ora strips ANSI codes from spinner text in non-TTY environments; chalk styling must be applied after ora resolves, not before",
  "archetype": "stale_state",
  "gate_that_caught": "integration test: test/cli/version.test.ts line 47"
}
```

---

## Library Protocol

### On Failure — Before Any Retry

1. Extract kernel using the format above
2. Append to `.aiwg/working/ring/kernels.jsonl`
3. Query the library: `grep` or `jq` for matching `archetype` and `feature` domain
4. Load matching prior kernels as context for the next attempt
5. If prior kernels are found: confirm the next approach does not repeat any captured failure approach or reasoning
6. Proceed with retry, or escalate if the kernel library indicates a morpholeptic loop

### Query Pattern

```bash
# Query by archetype
jq 'select(.archetype == "instruction_drift")' .aiwg/working/ring/kernels.jsonl

# Query by feature domain keyword
jq 'select(.feature | test("auth"; "i"))' .aiwg/working/ring/kernels.jsonl

# Query for morpholeptic loop detection — find repeated reasoning
jq '.reasoning' .aiwg/working/ring/kernels.jsonl | sort | uniq -d
```

### On Decomposition — Before Planning

1. Query the kernel library for the feature domain before writing any plan
2. Pre-load relevant kernels as planning context
3. Exclude any approach present in a kernel's `approach` field for this domain
4. Note any `kernel` fields that constrain the solution space — treat them as discovered requirements

### Morpholeptic Loop Detection

A morpholeptic loop is active when two or more kernels in the library share:
- The same `feature` domain, AND
- The same or similar `reasoning`, AND
- Different `approach` values (the surface changed but the assumption did not)

When a morpholeptic loop is detected: escalate immediately. Do not attempt a third approach that shares the flawed reasoning. The loop cannot be broken from within the loop.

---

## Lifecycle

The kernel library is a project-scoped fossil record. It is:

- **Append-only**: no deletions, no corrections, no overwrites
- **Session-persistent**: survives across agent sessions for a given project
- **Contradiction-tolerant**: contradicting kernels coexist; both are valid records of what the system believed at a given time
- **Not task-scoped**: unlike Ralph loop state, kernels accumulate across all tasks in a project

### Distinction from Ralph Loop State

| | Ralph State (`.aiwg/ralph/`) | Kernel Library (`.aiwg/working/ring/kernels.jsonl`) |
|---|---|---|
| **Scope** | Single task, current loop | All tasks, all sessions |
| **Lifecycle** | Cleared when task completes | Monotonically growing |
| **Purpose** | Track iteration progress | Accumulate failure insights |
| **Mutability** | Read/write | Append-only |
| **Queries** | Status of current loop | Pattern matching across failures |

Ralph state answers: "where are we in this task?"
Kernel library answers: "what have we learned from failure in this domain?"

---

## Non-Monotonic Quality Tracking

Output quality across iterations is not monotonically improving. It peaks, then degrades. The `best-output-selection` rule establishes this principle; this rule operationalizes it within the failure/retry loop.

### Tracking Protocol

- After each iteration, score the output against the acceptance criteria
- Record the score alongside the iteration number
- Track the highest score seen (`peak_score`, `peak_iteration`)
- If the current score is lower than `peak_score` for two consecutive iterations, the pathokinetic transition has occurred

### On Pathokinetic Transition

1. Stop iterating immediately
2. Extract a kernel capturing the degradation pattern (archetype: `post-peak-degradation`)
3. Return the peak output, not the latest output
4. Log the transition in the kernel library

```json
{
  "feature": "string — the feature being iterated",
  "timestamp": "ISO 8601",
  "approach": "continued iteration past peak",
  "reasoning": "assumed later iterations would continue to improve",
  "kernel": "peak quality was at iteration N with score S; iterations N+1 and N+2 degraded; pathokinetic transition confirmed",
  "archetype": "post-peak-degradation",
  "gate_that_caught": "non-monotonic quality tracker"
}
```

---

## Integration

This rule operates in a defined relationship with adjacent rules:

### `executable-feedback` (existing)
Mandates test execution before returning code results. Provides the failure signal that triggers kernel extraction. When `executable-feedback` detects a test failure, `kernel-extraction` activates. The `gate_that_caught` field should reference the specific test or execution log entry.

### `anti-laziness` (existing)
Mandates escalation after 3 failed attempts and prohibits weakening assertions or deleting tests. `kernel-extraction` does not modify the escalation threshold — it enriches what happens before each retry. The 3-attempt limit still applies. Kernels make each attempt more informed; they do not grant additional attempts.

### `spectral-gap` (new, ring-methodology addon)
Uses kernel library growth rate as a system health signal. Rapid kernel accumulation in a domain indicates a spectral gap — a region where the system repeatedly fails to model reality correctly. `kernel-extraction` provides the data; `spectral-gap` interprets the pattern.

### `morpholepsis-detection` (new, ring-methodology addon)
Queries the kernel library to identify morpholeptic loops before they complete. Uses the `reasoning` field to detect recurrence of the same flawed assumption across different approaches. `kernel-extraction` populates the library; `morpholepsis-detection` reads it for early warning.

### `best-output-selection` (existing)
Non-monotonic output selection — take peak, not final. `kernel-extraction` adds the pathokinetic transition tracking that makes this actionable within the retry loop.

---

## Quick Reference

| Trigger | Action |
|---|---|
| Any failure before retry | Extract kernel, append to library, query library |
| Before planning any retry | Query library for archetype and domain matches |
| Before decomposing a task | Query library for domain, pre-load kernels as constraints |
| Repeated `reasoning` in library | Morpholeptic loop detected — escalate |
| Quality drops 2x after peak | Pathokinetic transition — stop, use peak output |
| Library contradiction | Both kernels stand; record contradiction as its own kernel |
