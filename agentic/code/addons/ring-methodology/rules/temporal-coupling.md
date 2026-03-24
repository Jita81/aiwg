# Temporal Coupling

**Enforcement Level**: HIGH
**Scope**: All code-generating agents
**Addon**: ring-methodology
**Issue**: #471

---

## Overview

Temporal coupling is the hidden dependency between what a prior run of code left behind and what a subsequent run assumes it will find. It is not a bug in the code. It is a bug in the relationship between runs.

This rule defines the coupling model, the idempotency gate that enforces it, and the STEWARD THE GROUND protocol that every resource-binding operation must follow.

Temporal coupling violations are among the most misleading failures an agent can encounter: the code is correct; the environment is not. Without this rule, agents diagnose the code when they should be diagnosing the ground.

---

## Problem Statement

Most code is written and tested as if each execution begins from a clean slate. It does not. Every run inherits its environment from its prior self: open ports, lock files, PID files, temp files, cached state, partially written outputs. When that inheritance is unexamined, code that passes on first run fails on second — not because anything changed in the code, but because something changed in the ground.

Temporal coupling is distinct from spatial coupling (agents sharing files simultaneously). Spatial coupling is a concurrency problem. Temporal coupling is a sequencing problem. Two runs of the same agent, separated by any amount of time, may interfere — not because they overlap, but because one assumed away what the other left behind.

Agents are especially susceptible. They run in loop structures (Ralph, iterative test execution, multi-stage pipelines) where prior-run residue accumulates invisibly. An agent that succeeds on iteration 1 may fail on iteration 2 for no reason it can see in the code. Without this rule, that failure is misdiagnosed.

---

## Vocabulary

| Term | Definition |
|------|------------|
| **Temporal coupling** | The dependency between run N residue and run N+1 assumptions. Code that succeeds on first run but fails on second due to prior-run state is temporally coupled. |
| **Residue** | Any resource, file, lock, socket, PID, or cached value left in the environment by a completed run. |
| **Assumptions** | The set of preconditions a run treats as given without verification — a port is free, a lock does not exist, a temp file is fresh. |
| **Coupling score** | The proportion of run N+1 assumptions that intersect with run N residue. Computed as: `run(N).residual ∩ run(N+1).assumptions`. |
| **Idempotency** | The property of an operation that produces the same outcome whether executed once or many times in succession without manual cleanup between runs. |
| **Ground** | The environment a run inherits. Not a constant. Not given. Maintained. |
| **STEWARD THE GROUND** | The five-step protocol for safe resource acquisition: Verify, Clean, Bind, Register, On Exit. |

---

## Coupling Model

The coupling score measures how much of run N+1's assumed environment was actually shaped by run N.

```
run(N).residual ∩ run(N+1).assumptions → coupling score
```

| Score | Classification | Required Action |
|-------|---------------|-----------------|
| < 38.2% (= φ⁻²) | Independent | Clean slate between runs. No action required. |
| 38.2% – 61.8% (= φ⁻² – φ⁻¹) | Correlated | Code must check shared state before use (ports, locks, temp files). |
| > 61.8% (= φ⁻¹) | Entangled | Code must clean prior-run state before executing. Assume nothing. |

The thresholds derive from φ (the golden ratio) and are not arbitrary. See @agentic/code/addons/ring-methodology/rules/phi-constants.md for the full derivation. φ⁻² (≈ 0.382) and φ⁻¹ (≈ 0.618) partition coupling space into three zones that reflect natural break points between negligible, significant, and dominant state inheritance. A coupling score below φ⁻² means the runs are effectively independent. A score above φ⁻¹ means the second run is substantially executing inside the first run's aftermath.

### Computing the Score

Agents are not expected to compute this numerically in all cases. The model is a reasoning frame. Apply it by asking:

1. What resources does this operation acquire or create?
2. Which of those resources persist after the operation completes?
3. What does the next run of this operation assume about those resources?
4. What proportion of those assumptions are potentially false after a prior run?

If the answer to (4) is "most of them," the code is Entangled and STEWARD THE GROUND is mandatory.

---

## Gate 15: Idempotency

Every resource-binding operation must pass Gate 15 before it can be considered complete.

Gate 15 is satisfied when an operation survives two consecutive executions without manual cleanup between them. Both runs must succeed.

### Gate 15 Procedure

1. Execute the operation
2. Execute it again immediately, without manual cleanup
3. Both runs must succeed
4. The second run must clean or re-bind any resources the first run acquired

A single passing run does not satisfy Gate 15. First-run success is the minimum. Gate 15 requires second-run success from an unclean ground.

### Common Gate 15 Failures

These are the resource categories most frequently responsible for Gate 15 failures. Check them specifically before declaring an operation idempotent.

| Resource | Prior-Run Residue | Assumption Violated |
|----------|-------------------|---------------------|
| TCP port | Socket in TIME_WAIT or still bound | Port is free |
| Lock file | File exists at expected path | Lock is uncontested |
| PID file | File exists; process is dead | Process is live |
| Temp file | File exists from prior run | File is fresh input |
| Build cache | Cache reflects prior source state | Cache reflects current source state |
| Database migration | Migration already applied | Migration has not run |
| Named pipe or socket | File exists from crashed prior run | Pipe is new |
| Environment variable | Variable set by prior run's export | Variable is unset or default |

This list is not exhaustive. The principle applies to any resource that persists after a run completes.

---

## STEWARD THE GROUND Protocol

Every resource-binding operation MUST follow this five-step protocol. The steps are not optional and are not reorderable.

```
VERIFY   → Check resource availability before acquiring
CLEAN    → Release or clear prior-run residue if present
BIND     → Acquire the resource
REGISTER → Record acquisition for cleanup on exit
ON EXIT  → Always release, even on error (try/finally)
```

### Step 1: VERIFY

Before acquiring any resource, check whether it is actually available. Do not assume. Do not skip to BIND.

```
Is the port free? → check, do not assume
Does the lock file exist? → check, do not assume
Is the temp file from this run? → check, do not assume
```

Verification is not error handling. It is pre-acquisition reconnaissance. The purpose is to surface stale state before it causes a failure that looks like a code bug.

### Step 2: CLEAN

If verification reveals prior-run residue, clean it before proceeding. The correct response to a stale lock file is not an error. It is to verify the lock is genuinely stale (the process is dead, the port is unreachable), then remove it.

```
Lock file exists, process is dead → remove the lock file, proceed
Port bound, prior process is gone → release or wait for TIME_WAIT, proceed
Temp file exists from prior run → delete or rename, proceed
```

CLEAN does not mean "ignore." Verify that the residue is genuinely stale before removing it. A lock file belonging to a live process is not residue — it is a live lock.

### Step 3: BIND

Acquire the resource only after VERIFY and CLEAN are complete. BIND is the step most agents attempt first. Under this protocol, it is the third step.

### Step 4: REGISTER

Immediately after acquisition, register the resource for cleanup. The registration must be sufficient to release the resource without the agent needing to remember it explicitly. Use a cleanup registry, a context manager, or an equivalent mechanism.

```python
# Example: register immediately after acquire
lock_file = acquire_lock(path)
cleanup_registry.register(lambda: release_lock(lock_file))
```

If the registration step is skipped, ON EXIT has nothing to act on.

### Step 5: ON EXIT

Always release acquired resources on process exit, including on error. The release must be in a `finally` block or equivalent guaranteed-execution context. An exception does not waive resource release.

```python
# Required pattern
resource = None
try:
    resource = acquire(path)
    do_work(resource)
finally:
    if resource is not None:
        release(resource)
```

An operation that holds resources through an exception and leaves them for the next run has created temporal coupling. STEWARD THE GROUND closes that path.

---

## Failure Archetype: Stale State

**Signal**: A resource is assumed clean; the second run fails.

**Pattern**:
1. Run 1 acquires a resource (port, lock, file, socket)
2. Run 1 completes — normally or abnormally
3. Resource persists in environment (not released, or released too late)
4. Run 2 begins, assumes the resource is available
5. Run 2 fails at acquisition
6. Agent diagnoses the code — the wrong target

**Stale State is misdiagnosed as a code bug more often than any other temporal coupling failure.** The code is correct. The ground is wrong. The diagnostic effort is wasted because the agent is looking at the wrong layer.

**Recovery**:

```
VERIFY  → Confirm resource state matches assumption
BREAK   → If it does not, identify and remove the stale residue
REBIND  → Re-acquire with a clean ground
```

**Log in debug memory** under `temporal_coupling_failures` with: resource type, residue description, recovery action taken, Gate 15 result after recovery.

---

## Layer D Integration

Layer D in the ring-methodology default gate definitions covers linting and type checks. Under this rule, Layer D is extended to include environment assumption validation.

The Layer D question is: **"Does the code assume exclusive access to any shared resource?"**

If yes, STEWARD THE GROUND compliance is required before Layer D can be marked complete.

The `environment_assumptions_found` field in the Layer D result captures temporal coupling discoveries:

```yaml
layer_d:
  linting: pass
  type_checks: pass
  environment_assumptions_found:
    - resource: port 8080
      assumption: free on entry
      verification: present
      steward_the_ground: compliant
    - resource: /tmp/app.lock
      assumption: absent on entry
      verification: present
      steward_the_ground: compliant
```

If `environment_assumptions_found` contains entries and any is marked `steward_the_ground: non-compliant`, Layer D has not passed. Gate 15 must be satisfied before the gate clears.

---

## Spatial vs Temporal

These are two distinct coupling dimensions. Both are in scope for the ring-methodology addon. Neither subsumes the other.

| Dimension | Measures | Threshold | Gate |
|-----------|----------|-----------|------|
| Spatial | Agents sharing files simultaneously | shared/total < 38.2% before merge | Pre-merge file overlap check |
| Temporal | Run N residue meeting run N+1 assumptions | Coupling score by zone | Gate 15 idempotency |

Spatial coupling is a concurrency property. Temporal coupling is a sequencing property. A system can be spatially clean and temporally entangled, or spatially coupled and temporally independent. Evaluate both axes independently.

---

## Integration

### With morpholepsis-detection

Temporal coupling produces a specific morpholepsis failure mode: an agent stuck diagnosing code that is actually correct, because the environment is wrong. When stale state is the root cause, `morpholepsis-detection` signals should fire before the retry ceiling is reached.

The Layer D extension defined here provides the layer-check that prevents layer confusion. If an agent is fixing code to address a ground problem, that is layer confusion. The correct response is: "Is this a code problem or a ground problem?"

Temporal coupling root cause → apply STEWARD THE GROUND, not a code change.

### With executable-feedback

Gate 15 is a mandatory pre-return check for operations that bind resources. The executable-feedback loop must include Gate 15 execution for resource-binding code:

```
GENERATE code → VERIFY Gate 15 applicable → EXECUTE Gate 15 → PASS? → return
                                                             → FAIL? → apply STEWARD THE GROUND → retry
```

Gate 15 failure is a test failure for purposes of the executable-feedback retry budget.

### With anti-laziness

Removing a Gate 15 requirement to make a test pass is an anti-laziness violation. The gate exists to catch temporal coupling. Deleting the gate eliminates the detection, not the problem.

If Gate 15 cannot be made to pass, escalate. Do not remove the gate.

### With the Success Arrest checklist

The morpholepsis-detection Success Arrest checklist requires all four layers plus `ring_check` to be verified before a completion declaration. Layer D now includes environment assumption validation. A completion declaration is not valid if `environment_assumptions_found` contains non-compliant entries, even if linting and type checks pass.

---

## Enforcement

Agents MUST:

1. Apply the coupling model to any operation that acquires or creates a persistent resource
2. Follow STEWARD THE GROUND (all five steps, in order) for Correlated and Entangled operations
3. Execute Gate 15 (two consecutive runs without manual cleanup) before declaring a resource-binding operation complete
4. Extend Layer D review to include environment assumption validation
5. Log temporal coupling failures in debug memory under `temporal_coupling_failures`
6. Diagnose the ground before diagnosing the code when second-run failures occur

Agents MUST NOT:

1. Assume a resource is available without verification (skip VERIFY)
2. Acquire a resource without registering it for cleanup (skip REGISTER)
3. Release resources conditionally on success — release is unconditional (violates ON EXIT)
4. Declare Gate 15 satisfied after a single successful run
5. Remove Gate 15 requirements to make tests pass
6. Apply code-layer fixes to ground-layer problems without first verifying that the problem is not stale state
