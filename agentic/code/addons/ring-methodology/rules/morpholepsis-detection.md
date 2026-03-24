# Morpholepsis Detection

**Enforcement Level**: HIGH
**Scope**: All agents
**Addon**: ring-methodology
**Issue**: #469

---

## Overview

Morpholepsis detection identifies when an agent has become frame-locked — captured by its own tool, paradigm, or approach — and intervenes before the retry ceiling is reached. The intervention is a reframe, not a retry.

This rule fires **during execution**, complementing `anti-laziness` (which catches destructive end-states) by catching the pattern that leads there.

---

## Problem Statement

AIWG's `anti-laziness` rule prevents destructive resolution: deleting tests to make them pass, removing features instead of fixing them, weakening assertions. It catches the **end-state** of a failing execution loop.

Morpholepsis detection catches what `anti-laziness` does not: the **pattern leading there**.

An agent stuck in a morpholeptic loop is not lazy. It is trying. It is applying effort, generating output, iterating — and getting nowhere, because the frame itself is wrong. Trying harder is the problem. The tool, the layer, the error category, the abstraction — one of these has become invisible to the agent executing inside it.

**Morpholepsis** (from Greek *morphe* + *lepsis*, form-capture): When the tool, frame, or paradigm becomes invisible to its user. When trying harder IS the problem.

Without this detection, agents exhaust their retry budget on cosmetically varied repetitions of the same broken approach, then escalate a problem that was reframeable from the second or third attempt.

---

## Vocabulary

| Term | Definition |
|------|------------|
| **Morpholepsis** | Form-capture. The state in which a tool, frame, or paradigm has become invisible to its user. The agent cannot see the frame it is inside. |
| **Morpholeptic loop** | A retry sequence in which each attempt differs only cosmetically from the previous. No new information is introduced. |
| **Ω-Occlusion** | The occlusion of observable output by accumulated abstraction layers. The real signal is hidden behind the model of the signal. |
| **Pleromatic collapse** | When adding fullness (more code, more abstraction, more complexity) produces regression. The system collapses under its own elaboration. |
| **Success arrest** | Stopping verification at the first passing gate, treating partial validation as completion. The most common and highest-value signal. |
| **Layer confusion** | Addressing a problem at the wrong layer — fixing a spec ambiguity in code, or a logic error in configuration. |
| **Category lock** | Applying the same recovery strategy to structurally different error types. All errors look the same from inside the frame. |

---

## Mandatory Rules

### Rule 1: Check Before Retry

Before any retry, scan for active morpholepsis signals. If one or more signals are present, **intervene** rather than retry. Do not consume a retry slot on a morpholeptic loop.

### Rule 2: Intervention Is Reframe, Not Retry

When a signal fires, the mandatory response is the intervention phrase for that signal. Deliver it. Then reframe the problem before any further action. A reframe means stating the problem differently — not restating the same problem with different words.

### Rule 3: Signal Independence

Each of the seven signals is independent. Multiple signals may fire simultaneously. Address the highest-specificity signal first (success arrest > morpholeptic loop > tool fixation).

### Rule 4: Reframe Before Escalation

If a morpholepsis signal fires within the retry window, a reframe attempt is mandatory before escalation. Escalating a reframeable problem is a protocol violation.

### Rule 5: Log Signal Activations

Record each signal activation in the debug memory session under `morpholepsis_signals`. Include: signal name, step, iteration count, intervention delivered, reframe applied.

---

## Signal Table

| Signal | Name | Trigger Condition | Intervention |
|--------|------|-------------------|--------------|
| Same tool used after 2 or more failures | Tool fixation | Tool used 3+ times on the same failing step | "What tool have you NOT tried?" |
| Fixing spec or design at code level | Layer confusion | Code changes address a requirement ambiguity | "Is this a code problem or a spec problem?" |
| All errors treated identically | Category lock | Same recovery applied to different error types | "Classify: syntax, logic, design, or spec?" |
| Abstraction growing without progress | Ω-Occlusion rise | New layers added, observable output unchanged | "Drop one layer. Show raw output." |
| Adding complexity to achieve simplicity | Pleromatic collapse | File grows, behavior regresses | "Remove code. Minimum viable." |
| Same approach, minor variations, 3+ times | Morpholeptic loop | Retry with cosmetic changes only | "STOP. Restate problem from scratch." |
| Layer A passes, verification stops | Success arrest | Gate A cleared, gates B/C/D not run | "Passing A is a signal to START verification, not STOP it." |

### Signal Detection Notes

**Tool fixation** is counted per failing step, not per session. Switching to the same tool on a different step resets the counter.

**Layer confusion** is identified by the presence of requirement language (the spec says, should behave as, expected to) inside a code change commit message or inline comment. That language belongs in the spec, not the implementation.

**Category lock** fires when the recovery strategy is identical across two or more structurally distinct error types. Structural distinctness is assessed by error class: syntax errors, logic errors, design errors, and spec errors require different recovery strategies. Applying one strategy across two classes is category lock.

**Ω-Occlusion rise** fires when: (a) new abstraction layers have been added since the last iteration, AND (b) the observable output — logs, test results, terminal output — is unchanged or degraded. The growth of the model is not the same as the growth of the output.

**Pleromatic collapse** fires when file line count has increased between iterations AND behavioral test coverage has decreased or regressed. More code, less behavior.

**Morpholeptic loop** fires when diff analysis across the last three iterations shows structural similarity above 80% with no new test passage, no new observable output, and no change in error type. Cosmetic variation — variable renames, comment additions, whitespace changes — does not break the loop.

**Success arrest** is the highest-value signal. It fires on any declaration of "done", "complete", "fixed", or "passing" that is not accompanied by full gate execution. See the Success Arrest section below.

---

## Integration with Failure Recovery

Morpholepsis detection is inserted into the failure recovery sequence before the retry ceiling is consumed.

```
FAILURE DETECTED
      |
      v
CHECK MORPHOLEPSIS SIGNALS
      |
      +---> Signal fires? ---> YES ---> INTERVENE (reframe, not retry)
      |                                       |
      |                                       v
      |                               Apply reframe.
      |                               Re-enter execution.
      |
      +---> No signal -----> PAUSE
                                |
                                v
                           DIAGNOSE
                                |
                                v
                      EXTRACT KERNEL (minimum reproducible case)
                                |
                                v
                           ADAPT (change at least one structural element)
                                |
                                v
                          RETRY (count: ≤ 3)
                                |
                           Retries exhausted?
                                |
                                v
                           ESCALATE
```

**Key constraint**: A reframe triggered by morpholepsis detection does not consume a retry slot. Retries are counted only on PAUSE > DIAGNOSE > ADAPT > RETRY cycles. This preserves the retry budget for genuine novel attempts.

---

## Distinction from anti-laziness

These two rules are complementary. They are not redundant.

| Rule | Catches | When it fires | Mechanism |
|------|---------|---------------|-----------|
| `anti-laziness` | Destructive resolution | At or after the point of violation | Prevents deletion, weakening, removal |
| `morpholepsis-detection` | Frame-locked execution | During execution, before retry ceiling | Intervenes with reframe |

An agent that deletes a test to make it pass has violated `anti-laziness`.

An agent that tries five variations of the same broken test without deleting anything has violated `morpholepsis-detection`.

Both rules can fire in the same session. `morpholepsis-detection` should fire first, preventing the conditions that lead to `anti-laziness` violations.

---

## Success Arrest

Success arrest is the highest-value signal in this table and the most common failure mode in multi-gate verification workflows.

The error: Gate A passes. The agent reports success. Gates B, C, and D are not run.

The correct interpretation: Passing gate A is a signal to **start** verification, not to **stop** it. A single gate passing in isolation means the system is partially verified. Partial verification is not verification.

### Checklist

This checklist is triggered on any declaration of completion, success, passing, or "feature complete":

```
Success Arrest Prevention Checklist
------------------------------------
[ ] Layer A verified
[ ] Layer B verified
[ ] Layer C verified
[ ] Layer D verified
[ ] ring_check executed
```

All five items must be checked before a completion declaration is valid. If any item is unchecked, success arrest has occurred. Apply the intervention: "Passing A is a signal to START verification, not STOP it."

### Gate Definitions

Gates A through D are defined by the specific workflow. In the absence of workflow-specific definitions, use these defaults:

| Gate | Default Verification |
|------|----------------------|
| A | Unit tests pass |
| B | Integration tests pass |
| C | Coverage threshold met |
| D | Linting and type checks pass |
| ring_check | Full test suite, no regressions, all gates confirmed |

Workflow-specific gate definitions override these defaults and must be documented in the task description or phase plan.

---

## Enforcement

Agents MUST:

1. Scan for morpholepsis signals before each retry
2. Deliver the signal-specific intervention phrase verbatim when a signal fires
3. Apply a genuine reframe — not a restatement — before continuing
4. Log all signal activations to debug memory
5. Execute the Success Arrest checklist on every completion declaration
6. Not escalate a problem for which a morpholepsis signal has fired but no reframe has been attempted

Agents MUST NOT:

1. Consume a retry slot on a detected morpholeptic loop
2. Treat signal detection as optional in any execution context
3. Declare completion without full gate execution
4. Apply the same intervention phrase twice without changing the approach
