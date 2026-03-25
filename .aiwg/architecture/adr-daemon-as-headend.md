# ADR: Daemon as Headend Supervisor for External Ralph Loops

## Status

**PROPOSED**

## Date

2026-03-25

## Context

Currently there is no supervisor for concurrent ralph-external loops. Each loop is independently spawned and managed with no centralized lifecycle governance.

The existing `AgentSupervisor` in `tools/daemon/agent-supervisor.mjs` (~297 lines) handles a basic task queue and subprocess spawning with `maxConcurrency=3`, but lacks: process group kill, restart intensity tracking, circuit breaker logic, budget aggregation, and zombie cleanup.

REF-127 (Zylos 2026) demonstrates that task failure rate quadruples when duration doubles, and that a Planner-Worker architecture is empirically dominant for long-running agent orchestration. The `ExternalMultiLoopStateManager` provides file-based state persistence but no process-level supervision.

## Decision

The AIWG daemon becomes the headend (supervisor) for all External Ralph Loop lifecycles via a new `DaemonSupervisor` component that wraps the existing `AgentSupervisor`.

`DaemonSupervisor` adds process governance on top of `AgentSupervisor`:

- **Process group management**: Kill entire process trees, not just PIDs
- **Restart intensity**: Track restart frequency per loop; trip circuit breaker on repeated failures
- **Circuit breaker**: Per-loop and global breakers with configurable thresholds
- **Budget aggregation**: Roll up token/cost metrics across all supervised loops
- **Zombie cleanup**: Periodic sweep for orphaned processes via PID file reconciliation

The wrapper pattern preserves backward compatibility: existing `AgentSupervisor` consumers are unaffected.

## Alternatives Considered

1. **Keep current AgentSupervisor as-is** -- Lacks process governance needed at scale. No circuit breaking or zombie cleanup means operator intervention required for common failure modes.
2. **Use systemd or PM2** -- Adds an external dependency. Cannot integrate with the AIWG behavior system or access loop-level metrics. Process restart policies are coarse-grained compared to per-loop supervision.
3. **Container-per-loop isolation** -- High startup cost (~2-5s per container), adds Docker as a hard dependency. Overkill for the typical single-machine daemon deployment.

## Consequences

**Positive:**
- Single point of control for all loop lifecycles, reducing operator burden
- Zombie cleanup, restart intensity, and circuit breaking are built in
- Wraps (does not replace) existing AgentSupervisor, preserving backward compatibility
- Crash-resilient state files survive daemon restarts

**Negative:**
- More complex daemon startup path (supervisor initialization before loop spawning)
- Single point of failure if the daemon process itself crashes (mitigated by crash-resilient state files and systemd/launchd service management)

## References

- Issue #512
- RFC: `.aiwg/planning/rfc-daemon-behaviors.md`
- REF-127 (Zylos 2026) -- Task failure rate scaling and Planner-Worker architecture
- REF-154 (MemGPT) -- Long-running agent lifecycle patterns
