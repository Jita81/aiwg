# RFC: Daemon-as-Headend and the Behaviors Concept

**RFC Number**: RFC-001
**Status**: Draft
**Date**: 2026-03-25
**Author**: AIWG Core Team
**Related Issues**: TBD (filed alongside this RFC)
**Research References**: REF-022, REF-127, REF-128, REF-149, REF-153, REF-154, REF-089

---

## 1. Problem Statement

The External Ralph Loop (`tools/ralph-external/`) enables crash-resilient iterative agent execution. When multiple loops are needed for a large project — parallel feature work, concurrent test fixing, independent subsystem improvements — users currently must manage each loop manually: spawn, monitor, recover, and clean up themselves.

Two fundamental problems emerge at scale:

### 1.1 No Headend Process

Without a supervisor, there is nothing preventing the system from:
- Launching more loops than the system can handle (API rate limits, memory, token budget exhaustion)
- Leaving zombie processes when a loop parent crashes and the child claude/codex session keeps running
- Losing orchestration context when the terminal session that launched a loop disconnects
- Missing cleanup of stale `.aiwg/ralph-external/` state directories and orphaned PID files

The main process (whether the user's terminal or the AIWG daemon) is consumed by direct loop management rather than remaining free for monitoring, diagnostics, and new requests.

### 1.2 No Composable Long-Running Agent Capabilities

Long-running agents — daemons and loops alike — have fundamentally different capability needs than short-lived CLI sessions. They require:
- **Process governance**: PID tracking, zombie cleanup, restart intensity limits, concurrency caps
- **Resource monitoring**: CPU/memory guards, API rate limit awareness, budget tracking
- **Recovery automation**: Crash detection, idempotent retry, state restoration
- **Observability**: Structured event streams, heartbeats, health probes

Currently there is no way to attach these capabilities to a long-running agent in a reusable, declarative way. Each component implements its own ad hoc version: the daemon has heartbeats, the orchestrator has PID control, the overseer has behavior detection — but these are not composable, not discoverable, and not applicable to new agent types without reimplementation.

---

## 2. Proposed Architecture: Daemon as Headend

### 2.1 Topology

```
┌──────────────────────────────────────────────────────────┐
│                   AIWG Daemon (Headend)                  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  DaemonSupervisor (new)                            │  │
│  │  - Concurrency limit (configurable, default: 4)   │  │
│  │  - Priority queue with overflow rejection         │  │
│  │  - Per-loop restart intensity limits              │  │
│  │  - Circuit breaker (N consecutive failures → open)│  │
│  │  - Process group kill (-pid)                      │  │
│  └──────────┬─────────────────────────────────────────┘  │
│             │ spawns and monitors                        │
│    ┌────────┼────────┐                                   │
│    ▼        ▼        ▼                                   │
│  Loop-1  Loop-2  Loop-3  (ExternalRalphLoop instances)  │
│  claude  codex   opencode                                │
└──────────────────────────────────────────────────────────┘
         │ IPC (JSON-RPC 2.0 over Unix socket)
         ▼
  CLI clients / aiwg ralph-status
```

### 2.2 Daemon Responsibilities

When the AIWG daemon acts as headend, it owns the full loop lifecycle:

| Responsibility | Current State | Proposed |
|----------------|--------------|----------|
| Spawn limits | `AgentSupervisor.maxConcurrency=3` | `DaemonSupervisor` enforces across all loops |
| Zombie cleanup | None | On SIGCHLD: reap children, update state, trigger queue |
| Process group kill | `proc.kill('SIGTERM')` (child only) | `process.kill(-pid, 'SIGTERM')` (entire process group) |
| Restart intensity | None | Per-loop: N restarts in M seconds → mark failed permanently |
| Circuit breaker | None | Daemon-level: consecutive failures → open circuit, cooldown |
| Budget aggregation | Per-loop only | Daemon tracks aggregate spend across all loops |
| Queue overflow | Unbounded queue | Configurable `maxQueueDepth` + rejection policy |

### 2.3 Headend Lifecycle Protocol

A loop lifecycle under daemon supervision follows:

```
SUBMIT(objective, criteria, config)
  → DaemonSupervisor validates (concurrency? budget? queue depth?)
  → Assign loopId, persist to TaskStore
  → Queue with priority

SCHEDULE
  → When slot available: dequeue, spawn ExternalRalphLoop process
  → Register in process group, begin heartbeat monitoring

MONITOR (continuous)
  → Heartbeat check every 30s
  → Budget check every iteration
  → BehaviorDetector: stuck / oscillation / resource burn

COMPLETE / FAIL / LIMIT_REACHED
  → Archive loop state (.aiwg/ralph-external/{loopId}/)
  → Release slot, process next in queue
  → Aggregate metrics update

CRASH DETECTED (heartbeat stale + PID dead)
  → RecoveryEngine: inspect prior state
  → If resumable: re-queue with same loopId and resume=true
  → If not resumable: mark failed, release slot
```

---

## 3. The Behaviors Concept

### 3.1 What Is a Behavior?

A **Behavior** is a named, versioned set of:
1. **Directives** — Operating rules the long-running agent enforces unconditionally, regardless of what its tasks request
2. **Toolset** — A curated set of capabilities attached to the agent at initialization

Behaviors are **sticky**: unlike one-shot tools (which the LLM chooses to invoke), behaviors are active for the entire lifetime of the agent. They cannot be skipped by the agent's task, overridden by a prompt, or disabled per-iteration.

This contrasts with the three existing capability patterns in the ecosystem:

| Pattern | Trigger | LLM-optional | Examples |
|---------|---------|--------------|---------|
| **One-shot tool** | LLM function call decision | Yes | Web search, file read, shell command |
| **Lifecycle hook** | Agent start/stop events | No | Session transcript copy, cost rollup |
| **Behavior (proposed)** | Every iteration + every event | No | Process governance, resource monitoring, circuit breaking |

The closest analog in other frameworks is AutoGen's `register_reply()` chain (REF-022), where capabilities added at construction time are invoked on every message, not at the LLM's discretion. Behaviors extend this concept to process-level and daemon-level concerns.

### 3.2 Behavior Schema

```yaml
# .aiwg/behaviors/{name}.yaml
name: ops-toolset
version: 1.0.0
description: >
  Provides long-running agents with a rich ops toolset for managing
  their own environment: process governance, resource monitoring,
  circuit breaking, and structured observability.

applies-to:
  - daemon
  - ralph-loop
  - long-running-agent

directives:
  - id: process-group-kill
    rule: "Always use process.kill(-pid, signal) to kill spawned sessions, not proc.kill(signal). This ensures grandchild processes (shells, subprocesses spawned by claude/codex) are also terminated."
  - id: restart-intensity
    rule: "Track restart count per task. If a task restarts more than {max_restarts} times in {restart_window_seconds} seconds, mark it permanently failed and do not retry."
  - id: concurrency-cap
    rule: "Never exceed {max_concurrent} simultaneous spawned sessions. Queue excess submissions with priority ordering."
  - id: budget-gate
    rule: "Before spawning each new session, check aggregate spend against {daily_budget_usd}. If within 10% of limit, emit warning. If at limit, block spawning and notify operator."
  - id: zombie-reap
    rule: "On any child exit event, verify the process has been fully reaped. Call waitpid or equivalent. Remove stale PID files and heartbeat entries."

toolset:
  - tool: process-list
    description: "List all spawned child processes with PID, status, resource usage, and elapsed time"
    schema: { type: object, properties: { filter: { type: string } } }
  - tool: process-kill
    description: "Terminate a spawned session by loopId or PID using process group kill"
    schema: { type: object, required: [target], properties: { target: { type: string }, signal: { type: string, default: SIGTERM } } }
  - tool: resource-snapshot
    description: "Capture current CPU, memory, and queue depth metrics for the daemon and all children"
  - tool: circuit-status
    description: "Report circuit breaker state (closed/open/half-open) and failure counts"
  - tool: queue-inspect
    description: "Inspect the pending queue: depth, oldest entry age, priority distribution"
  - tool: loop-history
    description: "Retrieve completed loop records with cost, duration, iterations, and outcome"
```

### 3.3 Behavior Composition

Multiple behaviors can be applied to a single agent. Directives merge (no duplicates); toolsets union (no conflicts on tool name, error on collision):

```javascript
// Pseudocode: behavior attachment at daemon init
const daemon = new AiwgDaemon(projectRoot);

daemon.applyBehavior('ops-toolset');      // process governance + resource monitoring
daemon.applyBehavior('crash-recovery');   // crash detection + idempotent retry
daemon.applyBehavior('budget-watchdog');  // aggregate spend enforcement

// Resulting directive set is the union of all three behaviors
// Resulting toolset is merged — tools available to all agents supervised by this daemon
```

### 3.4 Behavior Registry

Behaviors are discovered from:
1. `agentic/code/behaviors/` — framework-provided behaviors (shipped with AIWG)
2. `.aiwg/behaviors/` — project-local behaviors (custom to a specific deployment)
3. `~/.config/aiwg/behaviors/` — user-level behaviors (available across all projects)

The CLI integrates with behaviors:

```bash
# List available behaviors
aiwg behavior list

# Show what a behavior provides
aiwg behavior info ops-toolset

# Apply behavior to daemon config
aiwg behavior apply ops-toolset --to daemon

# Remove behavior
aiwg behavior remove ops-toolset --from daemon
```

---

## 4. The ops-toolset Behavior: First Implementation

The first concrete behavior, `ops-toolset`, gives daemons and long-running loops the operational tooling they need to manage their own environment.

### 4.1 Process Governance Directives

Derived from analysis of production gaps in the current codebase:

| Gap | Directive |
|----|-----------|
| Grandchildren survive kill | Use `process.kill(-pid, signal)` (process group) |
| No restart intensity limits | `max_restarts=3`, `restart_window=300s` (Erlang/OTP-inspired) |
| Unbounded queue | `max_queue_depth=20`, reject policy: return error to caller |
| No circuit breaker | Open after 5 consecutive failures; half-open after 120s cooldown |
| No structured logging | Emit NDJSON to `{stateDir}/daemon.log` with standardized fields |

### 4.2 Ops Toolset Tools

The ops toolset exposes these tools to the agent's LLM layer — meaning the daemon's analysis calls (e.g., when the Overseer or StrategyPlanner is reasoning about what to do next) can call these tools to inspect and manage the process environment:

```
process-list     → ps-like view of all child sessions with resource usage
process-kill     → terminate a session (group kill), with reason logging
resource-snapshot → CPU/memory snapshot for throttle decisions
circuit-status   → is the provider's circuit breaker open?
queue-inspect    → how deep is the queue, what's the oldest pending item?
loop-history     → completed loop records for cross-task learning input
budget-remaining → aggregate spend vs. configured limits
```

This closes the gap identified in the internal survey: the daemon's LLM reasoning layer has no self-inspection tools. The `Overseer` and `StrategyPlanner` currently operate blind to process-level state.

### 4.3 Relationship to Existing Components

The `ops-toolset` behavior does not replace existing components — it wraps and exposes them:

```
ops-toolset behavior
├── process-list tool → wraps ProcessMonitor.getRunningLoops()
├── process-kill tool → wraps AgentSupervisor.killTask() with -pid fix
├── resource-snapshot → wraps MetricsCollector.getSystemMetrics()
├── circuit-status → new: DaemonCircuitBreaker (to be implemented)
├── queue-inspect → wraps AgentSupervisor.queueDepth + queue peek
├── loop-history → wraps ExternalMultiLoopStateManager.getCompletedLoops()
└── budget-remaining → wraps iteration cost tracker vs. configured limit
```

---

## 5. Research Grounding

### 5.1 Long-Running Agent Failure Patterns (REF-127)

Zylos (2026) establishes empirically that task failure rate increases quadratically with duration — doubling duration quadruples failure. The 35-minute threshold marks where degradation accelerates. The **Planner-Worker architecture** is empirically dominant: a supervisor agent (Planner) that decomposes tasks and monitors Workers is more reliable than a single long-running agent.

The daemon-as-headend architecture directly implements the Planner-Worker split at the process level: the daemon is the Planner (monitors, queues, recovers), Ralph loops are the Workers (execute tasks). This is the architectural foundation for the `DaemonSupervisor`.

### 5.2 Multi-Agent Memory Hierarchy (REF-149)

Yu et al. (2026) propose a three-layer I/O-cache-memory hierarchy for multi-agent systems:
- **I/O layer**: Live process state (heartbeats, running PIDs)
- **Cache layer**: Recent loop outputs, iteration history (`.aiwg/ralph-external/`)
- **Memory layer**: Long-term cross-task learnings (`CrossTaskLearner`)

The daemon headend maps exactly onto this hierarchy: it manages the I/O layer directly, orchestrates writes to the cache layer, and feeds the memory layer as loops complete. Behaviors are the mechanism by which this three-layer management is attached to the daemon's operating logic.

### 5.3 Conversational Multi-Agent Coordination (REF-022)

AutoGen's `ConversableAgent.register_reply()` demonstrates that **runtime capability composition** is more maintainable than inheritance. A behavior registry follows the same principle: instead of subclassing the daemon for every combination of capabilities, behaviors are composed declaratively at initialization. The directive system is analogous to AutoGen's `is_termination_msg` — unconditional checks that run on every message regardless of the agent's reasoning.

### 5.4 OS-Inspired Agent Architecture (REF-154)

MemGPT (Packer et al., 2023) applies OS concepts (virtual memory paging, interrupt handling) to LLM context management. The daemon-as-headend proposal extends this analogy further: the daemon is the **process scheduler**, each Ralph loop is a **process**, behaviors are **kernel modules** that extend the scheduler's capabilities. Just as kernel modules provide filesystem drivers, network drivers, and device drivers without requiring a kernel recompile, behaviors provide process governance, observability, and recovery without requiring daemon code changes.

---

## 5b. Operator Interface Layer

### 5b.1 Native Web Interface (Primary)

The daemon headend must expose a **native web interface** so operators can interact with running loops, inspect state, and issue commands without depending on a third-party chat platform. This interface is the canonical, always-available control surface.

```
┌──────────────────────────────────────────────────────────┐
│              Operator Interface Layer (new)              │
│                                                          │
│  ┌──────────────────────┐  ┌───────────────────────────┐ │
│  │  Native Web UI       │  │  Channel Adapters (opt.)  │ │
│  │  (primary interface) │  │  - Discord                │ │
│  │  localhost:7474      │  │  - Telegram               │ │
│  │  - Loop dashboard    │  │  - Slack                  │ │
│  │  - Live output tail  │  │  - Webhook                │ │
│  │  - Submit / cancel   │  │  (pluggable, disabled by  │ │
│  │  - Resource graph    │  │   default)                │ │
│  └──────────┬───────────┘  └──────────┬────────────────┘ │
│             └──────────────┬──────────┘                  │
│                            ▼                             │
│              MessageRouter (new)                         │
│              - Normalizes inbound commands               │
│              - Fans out status events to all channels    │
│              - Auth: token-per-channel, scope-limited    │
└──────────────────────────┬───────────────────────────────┘
                           │ JSON-RPC 2.0 (existing IPC)
                           ▼
                  DaemonSupervisor
```

The **MessageRouter** is the key abstraction: it decouples the daemon's command/event model from how operators consume it. Adding a new channel (Discord, Telegram) requires only a new `ChannelAdapter` — no changes to the daemon or supervisor.

### 5b.2 Native Web UI Specification

The native web UI is a lightweight HTTP server started by the daemon (default port `7474`, configurable). It serves a single-page dashboard with:

| View | Content |
|------|---------|
| **Loops** | Running and queued loops with status, iteration count, provider, elapsed time |
| **Output** | Live-streamed stdout from the selected loop (SSE or WebSocket) |
| **Submit** | Form to submit a new loop objective and completion criteria |
| **Resources** | CPU, memory, queue depth, budget remaining (polling or SSE) |
| **History** | Completed loops with cost, duration, iterations, outcome |

Authentication: shared token (set in daemon config, passed as `?token=` or `Authorization: Bearer`). No external identity provider required.

Implementation: the web UI is served from `tools/daemon/web-ui/` as static files (no build step). The server side is a minimal HTTP handler added to `daemon-main.mjs`. The SSE endpoint for live output subscribes to the existing `EventEmitter` events emitted by `AgentSupervisor`.

### 5b.3 Channel Adapter Interface

All channel adapters (Discord, Telegram, Slack, webhook) implement a single interface:

```javascript
class ChannelAdapter {
  // Inbound: receive operator commands from the channel
  onCommand(handler) { /* handler({ source, command, args, replyTo }) */ }

  // Outbound: send a message to the channel
  async send(message, options = {}) { /* { text, loopId, type: 'status'|'alert'|'output' } */ }

  // Start/stop lifecycle
  async start() {}
  async stop() {}
}
```

The `MessageRouter` normalizes commands from any adapter into the same internal format before routing to `DaemonSupervisor`. Status events from the supervisor fan out to all registered adapters.

Example adapters (to be implemented as behaviors or plugins):
- `discord-adapter`: Uses Discord.js to receive slash commands, post embeds
- `telegram-adapter`: Uses Telegram Bot API, receives `/submit`, `/status`, `/abort`
- `webhook-adapter`: Sends POST to a configured URL on each loop event

### 5b.4 Modularity Principle

The operator interface is **additive, not required**. The daemon runs without any interface active; the web UI and channel adapters are opted into via daemon config:

```yaml
# .aiwg/daemon/config.yaml
interface:
  web:
    enabled: true
    port: 7474
    token: "${AIWG_WEB_TOKEN}"   # required if enabled
  channels:
    - type: discord
      enabled: false              # opt-in only
      token: "${DISCORD_BOT_TOKEN}"
      guild: "${DISCORD_GUILD_ID}"
    - type: telegram
      enabled: false
      token: "${TELEGRAM_BOT_TOKEN}"
```

No external services are required for the daemon to function. The web interface is local-first, and channel adapters are explicitly opt-in.

---

## 6. Implementation Plan

### Phase 1: DaemonSupervisor (Foundation)

New file: `tools/ralph-external/daemon-supervisor.mjs`

```
DaemonSupervisor
├── Priority queue with bounded depth (max_queue_depth)
├── Concurrency cap (max_concurrent, default: 4)
├── Process group kill (-pid) fix
├── Restart intensity tracking per loopId
├── Circuit breaker (ConsecutiveFailureCircuitBreaker)
└── EventEmitter interface (loop:started, loop:completed, loop:failed, loop:recovered)
```

Key behaviors on `DaemonSupervisor`:
- `.submit(loopConfig)` → returns `{loopId, queued: boolean, position: number}`
- `.cancel(loopId)` → cancels queued or running loop
- `.status()` → `{running, queued, circuitState, concurrencyUsed, queueDepth}`

### Phase 2: BehaviorRegistry

New files:
- `tools/ralph-external/lib/behavior-registry.mjs` — discovery, load, validate
- `agentic/code/behaviors/ops-toolset.yaml` — first behavior definition
- `src/extensions/commands/definitions.ts` additions — `behavior` command family

The `BehaviorRegistry` loads behavior YAML files, validates against JSON Schema, merges directives and toolsets, and exposes `.getDirectives(agentType)` and `.getToolset(agentType)`.

### Phase 3: ops-toolset Tools as MCP/IPC Methods

Expose the ops toolset tools as IPC methods on the daemon's JSON-RPC server:

```
daemon.process.list
daemon.process.kill
daemon.resource.snapshot
daemon.circuit.status
daemon.queue.inspect
daemon.loop.history
daemon.budget.remaining
```

These become available to the Overseer's analysis calls and to CLI operators via `aiwg mc` and `aiwg ralph-status --verbose`.

### Phase 3b: Operator Interface Layer

New files:
- `tools/daemon/web-server.mjs` — HTTP + SSE server, serves `web-ui/` static files
- `tools/daemon/web-ui/index.html` — single-page dashboard (no build step, vanilla JS)
- `tools/daemon/message-router.mjs` — normalizes inbound commands, fans out events
- `tools/daemon/adapters/` — channel adapter implementations (discord, telegram, webhook)

The web server is added to `daemon-main.mjs` alongside the existing IPC server — both run in the same event loop. The `MessageRouter` subscribes to `AgentSupervisor` events and broadcasts to all registered adapters.

### Phase 4: Integration with Existing Components

Wire `DaemonSupervisor` into `daemon-main.mjs`:
- Replace direct `AgentSupervisor` usage with `DaemonSupervisor`
- Load configured behaviors from `.aiwg/behaviors/` + `agentic/code/behaviors/`
- Apply directives as runtime assertions in supervisor loop

Wire `DaemonSupervisor` into the `ralph-external` multi-loop commands:
- `aiwg ralph-external` with multiple `--objective` flags routes through daemon headend
- `aiwg mc dispatch` targets the daemon headend, not a raw `AgentSupervisor`

---

## 7. Alternatives Considered

### Alt A: BullMQ for Queue Management

BullMQ (Redis-backed Node.js job queue) would replace the in-memory `AgentSupervisor` queue with a crash-durable, feature-rich alternative. Advantages: persistence across daemon restarts, distributed multi-daemon support, built-in retry/backoff, rate limiting.

**Decision**: Not included in initial scope. Adds a Redis dependency that violates AIWG's "no external services required" design principle. Can be added as an optional behavior (`redis-queue-backend`) once the behavior system exists.

### Alt B: Container-per-Loop Isolation

Run each Ralph loop in a separate Docker container for process isolation. This matches what Codex CLI's sandbox mode does.

**Decision**: Out of scope. Container startup cost (100-500ms) is acceptable for long-running loops but adds significant complexity. The `ops-toolset` behavior can include an optional `container-sandbox` directive for deployments that need it.

### Alt C: Daemon Process Becomes the Orchestrator LLM

The daemon itself calls Claude to make scheduling decisions ("which loop should run next, given current system state?").

**Decision**: Premature. The `DaemonSupervisor` uses deterministic scheduling (priority queue + concurrency cap). LLM-based scheduling can be introduced as an optional behavior after the deterministic foundation is solid.

---

## 8. Open Questions

1. **Behavior versioning**: How do behavior schema upgrades affect running daemons? Recommend: behaviors are reloaded only on daemon restart (not hot-reloaded), similar to Linux kernel modules.

2. **Directive conflict resolution**: When two behaviors specify conflicting directives (e.g., different `max_concurrent` values), which wins? Recommend: last-applied wins; explicit `priority` field in behavior YAML for deterministic ordering.

3. **Cross-provider behaviors**: Some directives are provider-specific (process group kill applies to local spawned processes; it's irrelevant for a cloud-API provider). Recommend: `applies-when: provider.isLocal == true` conditions in directive schema.

4. **Behavior distribution**: Should behaviors be distributable as npm packages (like AIWG plugins)? The plugin system already handles agent/command/skill packaging. Behaviors could be a new artifact type in the plugin manifest.

---

## 9. Success Criteria

This RFC is complete when:

- [ ] `DaemonSupervisor` passes unit tests covering: concurrency cap, queue overflow, restart intensity, circuit breaker, process group kill
- [ ] `BehaviorRegistry` loads and validates `ops-toolset.yaml`; `.getDirectives('daemon')` returns all 5 directives
- [ ] `ops-toolset` tools are exposed as IPC methods and callable via `aiwg` CLI
- [ ] Daemon integration: `daemon-main.mjs` routes multi-loop submissions through `DaemonSupervisor`
- [ ] UAT: `npm run uat:daemon` passes with stub supervisor (no real spawning)
- [ ] Documentation: `docs/daemon-guide.md` updated with headend topology diagram and behavior usage

---

## Appendix: Glossary

| Term | Definition |
|------|-----------|
| **Headend** | The supervising process that controls the lifecycle of downstream loops and agents |
| **Behavior** | A named, versioned set of directives and tools that is applied to a long-running agent at initialization |
| **Directive** | An unconditional operating rule enforced by the agent regardless of task content |
| **Toolset** | A set of tools attached to an agent that can be invoked by the agent's LLM reasoning layer |
| **DaemonSupervisor** | The new component that implements the headend role within the AIWG daemon |
| **Process Group Kill** | Sending a signal to `-pid` (negative PID) to terminate the entire process group, including grandchildren |
| **Restart Intensity** | The rate of restarts per unit time; exceeding the threshold causes a task to be marked permanently failed |
| **Circuit Breaker** | A state machine that stops spawning new sessions when the failure rate exceeds a threshold, preventing cascade failures |
