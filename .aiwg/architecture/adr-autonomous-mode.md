# ADR: Autonomous Thinking Engine Off by Default

## Status

**PROPOSED**

## Date

2026-03-25

## Context

The manager daemon profile introduces an autonomous thinking engine: a background loop that generates and schedules tasks without direct operator input. This is a key differentiator for the manager use case — the daemon can proactively identify and queue work rather than waiting passively for commands.

Autonomous operation carries real cost and risk. An always-on engine running unchecked can exhaust provider budgets, generate unwanted side effects, or conflict with interactive work the operator is actively doing. The default posture must be conservative.

## Decision

The autonomous thinking engine is **OFF by default**. Operators opt in explicitly via `daemon.yaml` or CLI flag.

When enabled, the following constraints apply unconditionally:

| Constraint | Default | Configurable |
|------------|---------|--------------|
| Action allowlist | defined in `daemon.yaml` | Yes |
| Daily budget cap | $5.00 | Yes |
| Daily task limit | 10 tasks | Yes |
| Human approval gate | disabled | Yes |
| Scheduling priority | 1 (lowest) | No |

**Priority 1 is not configurable.** Autonomous tasks always yield to interactive work. The scheduler assigns priority based on task source, and interactive commands receive higher priority regardless of operator configuration.

The allowlist controls which action types the engine may initiate (e.g., `run-tests`, `summarize-logs`). Actions not on the allowlist are queued for human review rather than executed autonomously.

When the human approval gate is enabled, the engine proposes tasks to the `interactive` room and waits for operator confirmation before execution. This is the recommended setting for new operators.

Budget and task-count resets occur at UTC midnight. The engine suspends autonomously when either cap is reached and resumes after reset.

## Alternatives Considered

1. **Always-on with blocklist** -- The engine runs continuously and operators specify what it may not do. Rejected because the failure mode is uncontrolled action: anything not explicitly blocked is permitted. Allowlist-only is the safer default for a new capability class.

2. **No autonomous mode** -- Eliminate the feature entirely and keep the daemon purely reactive. Rejected because autonomous task generation is a primary differentiator of the manager daemon profile and a stated requirement for the headend RFC.

3. **Always-on with hard caps only, no allowlist** -- Simpler configuration; engine can attempt any action type but is rate-limited. Rejected because cost and count limits do not bound action scope — an engine that can initiate any action type poses unacceptable risk even within a budget.

## Consequences

**Positive:**
- Off-by-default eliminates surprise costs for operators who do not read documentation
- Allowlist-only scope makes autonomous behavior auditable and predictable
- Fixed priority 1 guarantees interactive responsiveness is never degraded
- Budget and task caps provide hard stops without requiring operator intervention

**Negative:**
- Allowlist maintenance adds configuration overhead; operators must explicitly enable each action type
- Opt-in requirement means the feature goes unused by operators who do not discover it
- Daily reset at UTC midnight may feel arbitrary; time-zone-aware resets would require additional complexity

## References

- Issue #512
- RFC: `.aiwg/planning/rfc-daemon-behaviors.md`
- ADR: `adr-daemon-as-headend.md` — supervisor and circuit breaker context
