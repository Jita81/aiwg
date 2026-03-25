# ADR: Behaviors as a New AIWG Primitive

## Status

**PROPOSED**

## Date

2026-03-25

## Context

Long-running agents (daemons, ralph loops) need capabilities that cannot be optional: process governance, resource monitoring, circuit breaking. These capabilities must run unconditionally -- the LLM should not choose whether to invoke them.

Current AIWG primitives do not fit this requirement:

- **Tools**: LLM chooses whether to invoke them. A budget limiter that the LLM can ignore is not a budget limiter.
- **Hooks**: Event-driven (fire on start/stop/write events). Cannot express continuous capabilities like "monitor memory usage every 30 seconds."
- **Extensions**: Deployable artifacts for platforms. Behaviors are runtime-only and never deployed to external providers.

AutoGen's `register_reply()` pattern (REF-022) demonstrates runtime capability composition: capabilities registered at construction time run on every message regardless of agent reasoning. This is the execution model behaviors need.

## Decision

Introduce "Behaviors" as a new AIWG primitive: named, versioned sets of directives and tools that attach to long-running agents at initialization and remain active for the agent's entire lifetime.

**Key characteristics:**
- **Sticky**: Attached at agent construction, active for full lifetime
- **Unconditional**: Directives execute regardless of LLM reasoning
- **Composable**: Multiple behaviors merge cleanly (directive union, toolset union)
- **Declarative**: YAML-defined with a standard schema

**Discovery locations (priority order):**
1. `agentic/code/behaviors/` -- Framework-provided (ships with AIWG)
2. `.aiwg/behaviors/` -- Project-specific
3. `~/.config/aiwg/behaviors/` -- User-level

**Conflict resolution**: When multiple behaviors define the same directive, the more specific scope wins (project > framework > user). Explicit `priority` field breaks ties within the same scope.

## Alternatives Considered

1. **Extend existing hooks system** -- Hooks are event-driven (start, stop, write). Continuous capabilities like periodic monitoring or per-message budget checks do not map to discrete events. Forcing them into hooks distorts the hook model.
2. **Add a new extension type** -- Extensions are deployable artifacts for external platforms (Claude, Copilot, Cursor). Behaviors are runtime-only and never leave the AIWG process. Mixing deployment semantics with runtime semantics creates confusion.
3. **Subclass agents per capability set** -- Creates combinatorial explosion (DaemonAgent, MonitoredDaemonAgent, BudgetLimitedDaemonAgent, MonitoredBudgetLimitedDaemonAgent...). Not composable.

## Consequences

**Positive:**
- Composable capability system without agent subclass proliferation
- Declarative YAML schema enables CLI discovery (`aiwg catalog list --type behavior`)
- Reusable across agent types: daemon, ralph loop, any long-running agent
- Clean separation from tools/hooks/extensions avoids semantic overloading

**Negative:**
- New primitive to learn, document, and maintain
- Directive conflict resolution adds complexity (mitigated by explicit priority field)
- Behavior lifecycle (attach, detach, hot-reload) needs careful implementation

## References

- Issue #512
- RFC: `.aiwg/planning/rfc-daemon-behaviors.md`
- REF-022 (AutoGen) -- `register_reply()` runtime capability composition
- REF-083 (Event-Driven Multi-Agent Systems) -- Agent capability patterns
