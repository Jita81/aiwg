# Kenophoria State

**Enforcement Level**: HIGH
**Scope**: All agents
**Addon**: ring-methodology
**Issue**: #470

## Overview

This rule defines the three-state execution model for ring-methodology agents and specifies the protocols governing transitions between those states. The central concept — kenophoria — names the productive void that occurs when an agent is blocked on an external dependency. Kenophoria is not failure. It is the system's capacity to hold space for an answer that has not yet arrived, without collapsing that space by filling it prematurely.

Agents operating under this rule maintain disciplined state boundaries, produce structured records when blocked, and escalate via circuit breakers only when the situation warrants human involvement.

## Problem Statement

Autonomous agents face three fundamentally different operational conditions:

1. Normal execution — the agent is working.
2. Blocked execution — the agent cannot proceed because something outside its control has not resolved.
3. Halted execution — the agent has encountered a condition that requires human decision.

Most systems collapse conditions 2 and 3 into a single failure state, producing one of two bad outcomes: the agent halts unnecessarily (treating external dependencies as errors), or the agent continues blindly (ignoring real failure conditions). This rule separates the two, giving each condition its own protocol.

The term **kenophoria** — from the Greek *kenos* (empty) and *phoria* (bearing, carrying) — captures the discipline required in state 2: the agent bears the emptiness of an unresolved dependency without filling it with fabricated progress, forced workarounds, or premature termination.

## Vocabulary

**Kenophoria** — Bearing emptiness without filling it. The productive void between executing and halted. The system's capacity to hold space for an answer that has not arrived, without manufacturing a false resolution.

**Circuit breaker** — A threshold-based transition from EXECUTING to HALTED. Once tripped, the agent does not resume autonomously. Human intervention is required.

**Soft halt** — A circuit breaker variant that pauses execution and asks the human a specific question before continuing. Distinct from full HALTED, which requires explicit human decision to resume.

**Spectral gap** — A process health metric measuring the separation between normal and anomalous signal in the agent's execution trace. A gap below 23.6% indicates the agent is operating near a boundary where normal and failure behaviors are indistinguishable.

**Red-flag pattern** — Any execution pattern classified as an anomaly indicator by the ring-methodology pattern catalog. The ratio of red-flag patterns to total actions within a session window is the red-flag rate.

**Mean feature completion time** — The rolling mean of wall-clock time required to complete individual features during the current session. Used as the baseline for the kenophoria duration gate.

**Unblocking condition** — The specific, observable change in external state that would allow the agent to exit KENOPHORIA and resume EXECUTING. Must be stated precisely in the state document.

**Checkpoint** — A serialized snapshot of all agent context written to `.aiwg/working/ring/checkpoints/{id}` upon entering KENOPHORIA. Enables resume without context loss.

## State Machine

The ring-methodology execution model contains exactly three states.

```
  +-------------+
  |  EXECUTING  |<--------------------------------------------+
  +-------------+                                             |
        |                                                     |
        | External dependency                 Unblocking      |
        | encountered                         condition met   |
        v                                                     |
  +-------------+   Duration gate             +---> Reload checkpoint
  | KENOPHORIA  |   exceeded (3x mean)        |     Perinoetic check
  +-------------+---> Soft halt ------------> |     Resume
        |
        | Circuit breaker
        | tripped
        v
  +----------+
  |  HALTED  |  <-- Human required. Do not resume autonomously.
  +----------+
```

**ASCII state diagram (detailed)**:

```
                    +-----------+
                    |           |
         +--------->  EXECUTING <---------+
         |          |           |         |
         |          +-----+-----+         |
         |                |               |
         |  Unblocking    | External      |
         |  condition     | dependency    |
         |  met + check   | encountered   |
         |  passes        |               |
         |          +-----v-----+         |
         |          |           |         |
         +----------| KENOPHORIA|         |
                    |           |         |
                    +-----+-----+         |
                          |               |
              +-----------+-----------+   |
              |                       |   |
   Duration   |             Circuit   |   |
   gate       |             breaker   |   |
   exceeded   |             tripped   |   |
   (3x mean)  |                       |   |
              v                       v   |
         Soft halt              +---------+-+
              |                 |           |
              | Human           |  HALTED   |
              | answers         |           |
              |                 +-----------+
              +-----------------------------> (resume or abort)
```

### EXECUTING

Normal operation. The agent is making progress on its assigned work. No special protocol applies beyond the ring-methodology's standard execution rules.

**Transitions out**:
- To KENOPHORIA: an external dependency is encountered that the agent cannot resolve autonomously.
- To HALTED: a circuit breaker condition is detected (see Circuit Breakers section).

### KENOPHORIA

Blocked on an external dependency. This is not a failure state. The agent has determined that it cannot proceed until something outside its control changes. The appropriate response is to document the block, checkpoint all context, and wait — not to fabricate progress, not to skip the dependency, not to treat the block as an error.

**Entry protocol** (all four steps are mandatory):

1. **Produce state document** — Write a structured JSON record (see State Document Format) declaring what has been completed, what is blocked, why, and what the unblocking condition is.
2. **Checkpoint all context** — Serialize all in-flight state to `.aiwg/working/ring/checkpoints/{id}`. The checkpoint must be sufficient to resume work without reconstructing context from scratch.
3. **Monitor for resolution** — Establish a watch on the unblocking condition. Do not poll blindly. If no event-driven monitoring is available, record the condition and defer to the next session start.
4. **On resolution** — Reload the checkpoint, re-run the perinoetic check (to verify the agent's reasoning remains sound after the gap), then resume EXECUTING.

**Transitions out**:
- To EXECUTING: unblocking condition is met, checkpoint is reloaded, perinoetic check passes.
- To HALTED (soft): duration gate is exceeded (kenophoria duration exceeds 3× the session's mean feature completion time).
- To HALTED: a circuit breaker condition is detected while in KENOPHORIA.

### HALTED

A circuit breaker has tripped. Human involvement is required. The agent does not resume autonomously under any circumstances. All state is preserved. The agent records the halt reason and the full context needed for a human to make an informed decision.

**Exit**: Only via explicit human decision to resume or abort. The `session-health-check.py` hook (SessionStart) detects prior HALTED state and surfaces it to the human at the start of the next session.

## Circuit Breakers

Circuit breakers are conditions that trigger an immediate or soft transition from EXECUTING or KENOPHORIA to HALTED. They are checked continuously during execution and on entry to KENOPHORIA.

| Condition | Threshold | Halt Type | Action |
|-----------|-----------|-----------|--------|
| Consecutive failures on the same issue | >= 2 | Immediate halt | Stop, preserve state, notify human |
| Red-flag pattern rate in session window | > 61.8% | Immediate halt | Stop, preserve state, notify human |
| Security operation without prior approval | Any occurrence | Immediate halt | Stop, do not proceed, notify human |
| Ambiguous or conflicting requirements | Any occurrence | Soft halt | Pause, ask human for clarification |
| Process health (spectral gap) | < 23.6% | Soft halt | Pause, report health metric, ask human |
| External dependency encountered | Any occurrence | KENOPHORIA (not halt) | Follow KENOPHORIA entry protocol |

**Notes on thresholds**:

The 61.8% red-flag rate threshold is derived from the golden ratio complement (1 - 0.618). When more than 61.8% of recent actions are flagged, the signal-to-noise ratio has inverted: anomalous behavior has become the norm. This is a systemic condition, not an isolated failure, and requires human assessment.

The 23.6% spectral gap threshold corresponds to the square of the golden ratio reciprocal (0.618^2 ≈ 0.382, complement ≈ 0.618, second complement ≈ 0.236). Below this threshold the agent's execution trace no longer shows a clean separation between healthy and unhealthy patterns.

The consecutive-failure threshold of 2 is intentionally low. A single failure on an issue may be an isolated event. Two consecutive failures on the same issue indicate a structural problem that the agent is not resolving through its own iteration. Further autonomous attempts are unlikely to succeed and risk worsening the situation.

## Duration Gate

The duration gate is the only time-based threshold in the kenophoria state model.

**Rule**: If the wall-clock duration of a KENOPHORIA episode exceeds 3× the session's mean feature completion time, escalate to soft halt.

**Rationale**: An external dependency that takes longer than 3× the typical feature delivery time to resolve is no longer a brief pause — it is a session-spanning block. At this point, holding KENOPHORIA silently is counterproductive. The human should be informed so they can decide whether to resolve the dependency, change the task order, or abort the blocked work.

**Calculation**:

```
mean_feature_time = total_feature_time_in_session / features_completed_in_session

duration_gate = 3 * mean_feature_time
```

If no features have been completed in the session (the agent is blocked before completing any work), the duration gate falls back to a fixed threshold of 30 minutes.

**On gate breach**: Write the state document, ensure the checkpoint is current, then issue a soft halt with the gate breach as the stated reason. Do not terminate. Wait for human input.

## Autonomous Mode Behavior

When no human is present (the agent is running in a fully autonomous loop with no interactive channel available):

1. Follow all KENOPHORIA entry protocols as specified.
2. Checkpoint all state to `.aiwg/working/ring/checkpoints/{id}`.
3. Write the state document to the checkpoint directory.
4. Suspend the session. Do not spin-wait. Do not fabricate progress.
5. On the next session start, `session-health-check.py` detects the prior KENOPHORIA state and surfaces the state document to the human before any new work begins.

The agent does not make autonomous decisions to resume from KENOPHORIA across session boundaries. Resolution requires at minimum a session start where the human is given the opportunity to review the state document.

## State Document Format

The state document is a required artifact produced on KENOPHORIA entry. It is written as a JSON file to the checkpoint directory.

```json
{
  "state": "kenophoria",
  "timestamp": "ISO 8601",
  "completed": [
    "list of completed work items in this session"
  ],
  "blocked_on": "exact description of the external dependency — be specific, not vague",
  "unblocking_condition": "the precise observable change that would allow resumption",
  "checkpoint_path": ".aiwg/working/ring/checkpoints/{id}",
  "session_mean_feature_time_seconds": 0,
  "kenophoria_duration_seconds": 0,
  "duration_gate_threshold_seconds": 0,
  "circuit_breakers_evaluated": [
    {
      "condition": "consecutive_failures",
      "value": 0,
      "threshold": 2,
      "tripped": false
    },
    {
      "condition": "red_flag_rate",
      "value": 0.0,
      "threshold": 0.618,
      "tripped": false
    },
    {
      "condition": "spectral_gap",
      "value": 0.0,
      "threshold": 0.236,
      "tripped": false
    }
  ]
}
```

**Field requirements**:
- `blocked_on`: Must name the specific external system, service, person, or artifact that is unavailable. "Waiting for API" is not acceptable. "Waiting for `auth-service` staging endpoint to become reachable at `https://auth.staging.internal/v2/token`" is acceptable.
- `unblocking_condition`: Must be a condition that a human could verify independently. "When the API is ready" is not acceptable. "When `curl https://auth.staging.internal/v2/token` returns HTTP 200" is acceptable.
- `circuit_breakers_evaluated`: Must reflect the actual values at the time of KENOPHORIA entry, not placeholders.

## Integration

### Hook Integration

**`circuit-breaker.py` (Stop event hook)**

Implements all circuit breaker checks on the Stop event. Evaluates:
- Consecutive failure count on the current issue
- Red-flag pattern rate over the session window
- Presence of unapproved security operations
- Requirement ambiguity or conflict markers

Triggers HALTED (immediate or soft) when thresholds are breached. Does not trigger KENOPHORIA — that transition originates from the agent's own detection of an external dependency.

**`session-health-check.py` (SessionStart hook)**

On session start, scans `.aiwg/working/ring/checkpoints/` for state documents with `"state": "kenophoria"` or `"state": "halted"`. If found, surfaces the state document to the human before any other work begins. The human must explicitly acknowledge the prior state before the agent proceeds.

This hook is the primary mechanism for resuming from KENOPHORIA across session boundaries in autonomous mode.

### Distinction from `failure-mitigation`

The `failure-mitigation` rule (sdlc-complete) addresses agent-internal failures: hallucination, context loss, instruction drift, technical errors, consistency failures. Those are conditions the agent can potentially recover from through its own corrective action.

Kenophoria addresses a structurally different situation: the agent is functioning correctly, but the external world has not supplied something the agent needs. There is nothing for the agent to fix. The appropriate response is to wait with discipline, not to attempt self-correction.

| Dimension | `failure-mitigation` | `kenophoria-state` |
|-----------|----------------------|-------------------|
| Root cause | Agent-internal failure | External dependency |
| Agent can fix autonomously? | Often yes | No |
| Appropriate response | Detect, classify, auto-fix, escalate | Document, checkpoint, monitor, wait |
| Recovery trigger | Agent's own corrective action | External condition change |
| State name | N/A (failure modes, not states) | KENOPHORIA |

Both rules may be active simultaneously. An agent in KENOPHORIA continues to apply failure-mitigation checks. If a circuit breaker trips while in KENOPHORIA, the agent transitions to HALTED per this rule.

### Relationship to `anti-laziness`

Kenophoria must not be used to avoid difficult work. The distinction:

- **Legitimate kenophoria**: The agent needs a service that is down, a credential that has not been provisioned, a decision that only a human can make.
- **Illegitimate use**: The agent enters KENOPHORIA because a task is difficult or a test is failing. These are not external dependencies — they are conditions the agent is expected to work through per `anti-laziness`.

The `circuit-breaker.py` hook evaluates whether KENOPHORIA entries are backed by genuine external dependencies. Repeated KENOPHORIA entries without verifiable external blocking conditions will increment the consecutive-failure counter and may trip the circuit breaker.

## References

- @agentic/code/addons/ring-methodology/hooks/circuit-breaker.py — Circuit breaker hook implementation
- @agentic/code/addons/ring-methodology/hooks/session-health-check.py — Session start health check
- @agentic/code/frameworks/sdlc-complete/rules/failure-mitigation.md — Agent-internal failure archetypes (distinct from external blocking)
- @agentic/code/frameworks/sdlc-complete/rules/anti-laziness.md — Prevents misuse of KENOPHORIA to avoid difficult work
- @agentic/code/frameworks/sdlc-complete/rules/hitl-gates.md — Human-in-the-loop gate protocol for soft halt resolution
- #470 — Implementation issue

---

**Rule Status**: ACTIVE
**Last Updated**: 2026-03-24
