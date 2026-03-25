# Daemon-as-Headend Implementation Plan

**Parent Issue**: #512 — Daemon-as-Headend RFC
**Status**: DRAFT
**Created**: 2026-03-25
**Phase**: Pre-Construction Planning

## Related ADRs

| ADR | Decision |
|-----|----------|
| `adr-daemon-as-headend` | Elevate daemon from passive task runner to active orchestration headend with supervisor, queue governance, and operator interface |
| `adr-behaviors-sticky-capabilities` | Introduce behavior YAML bundles that bind directives + toolsets to agent types; loaded from 3-tier discovery path |
| `adr-native-web-operator-interface` | Ship a built-in HTTP/SSE web UI (port 7474) using vanilla JS; no external framework; Bearer token auth |
| `adr-in-memory-queue-defer-redis` | Use in-memory priority queue for now; defer BullMQ/Redis integration to a later phase when multi-host need is demonstrated |

---

## Phase Summary

| Phase | Name | Sub-Issues | Depends On | Key Deliverable |
|-------|------|-----------|------------|-----------------|
| 1 | DaemonSupervisor Core | ~3 | None | Supervised loop governance with circuit breaker |
| 2 | BehaviorRegistry + ops-toolset | ~3 | Phase 1 | YAML behavior discovery, ops-toolset definition |
| 3 | ops-toolset IPC Methods | ~2 | Phases 1, 2 | 7 callable IPC methods on daemon |
| 4 | Operator Interface Layer | ~4 | Phase 3 | Web UI at port 7474 + MessageRouter + webhook adapter |
| 5 | Integration + Wiring | ~2 | Phases 1–4 | daemon-main.mjs fully wired; behavior CLI commands |
| 6 | UAT + Documentation | ~2 | Phase 5 | UAT suite passes; daemon-guide + behaviors-guide updated |
| **Total** | | **~16** | | |

---

## Dependency Graph

```
Phase 1 (DaemonSupervisor) ──┬──→ Phase 2 (BehaviorRegistry)
                              │         │
                              └──→ Phase 3 (IPC Methods) ←──┘
                                        │
                                        ▼
                              Phase 4 (Operator Interface)
                                        │
                                        ▼
                              Phase 5 (Integration + Wiring)
                                        │
                                        ▼
                              Phase 6 (UAT + Documentation)
```

Phases 1 and 2 can be worked in parallel after Phase 1 reaches a stub-stable state (DaemonSupervisor instantiable). Phase 3 has a hard dependency on both. Phases 4 and 5 gate on Phase 3. Phase 6 is a pure downstream gate.

---

## Phase 1: DaemonSupervisor Core (Foundation)

**Depends on**: None
**Estimated sub-issues**: ~3
**Sub-issue breakdown**:
- `#512.1` — DaemonSupervisor class + bounded priority queue
- `#512.2` — ConsecutiveFailureCircuitBreaker (standalone)
- `#512.3` — Unit test suite for all 5 governance concerns

### New Files

| File | Purpose |
|------|---------|
| `tools/ralph-external/daemon-supervisor.mjs` | Wraps AgentSupervisor with bounded priority queue (maxQueueDepth), configurable concurrency cap, process group kill (-pid), per-loop restart intensity tracking, SIGCHLD handler for zombie reaping |
| `tools/ralph-external/lib/consecutive-failure-circuit-breaker.mjs` | Standalone circuit breaker: closed / open / half-open states, consecutive failure threshold, configurable cooldown period |
| `test/unit/daemon-supervisor.test.mjs` | Unit tests covering all 5 governance concerns: concurrency limit, queue overflow rejection, restart intensity threshold, circuit breaker state transitions, process group kill |

### Acceptance Criteria

- Unit tests pass for all 5 governance concerns.
- DaemonSupervisor can be instantiated with a stub AgentSupervisor (no live process required).
- Bounded queue rejects enqueue when at capacity and returns a structured error.
- Circuit breaker transitions correctly: closed → open after N consecutive failures, open → half-open after cooldown, half-open → closed on success.
- Process group kill sends signal to `-pid` (entire group), not just the process.
- No changes to existing `daemon-main.mjs` in this phase.

---

## Phase 2: BehaviorRegistry + ops-toolset Definition

**Depends on**: Phase 1 (DaemonSupervisor must exist for behaviors to target)
**Estimated sub-issues**: ~3
**Sub-issue breakdown**:
- `#512.4` — BehaviorRegistry: 3-tier discovery, YAML load, schema validation
- `#512.5` — `ops-toolset.yaml` behavior definition (5 directives, 7 tools)
- `#512.6` — `behavior` command family in `definitions.ts` (list, info, apply, remove)

### New Files

| File | Purpose |
|------|---------|
| `tools/ralph-external/lib/behavior-registry.mjs` | Discovers behavior YAML files from 3 locations (see below). Loads, validates schema, merges directives + toolsets. Exposes `.getDirectives(agentType)` and `.getToolset(agentType)`. |
| `agentic/code/behaviors/ops-toolset.yaml` | First behavior bundle: 5 directives (process-group-kill, restart-intensity, concurrency-cap, budget-gate, zombie-reap) + 7 tools (process-list, process-kill, resource-snapshot, circuit-status, queue-inspect, loop-history, budget-remaining) |
| `test/unit/behavior-registry.test.mjs` | Unit tests for discovery, load, validation, directive and toolset resolution |

### Discovery Path (3-tier)

BehaviorRegistry searches in priority order (later tiers override earlier):

1. `agentic/code/behaviors/` — framework-shipped behaviors (read-only reference)
2. `.aiwg/behaviors/` — project-local overrides (committed with project)
3. `~/.config/aiwg/behaviors/` — user-level overrides (machine-local, not committed)

### Acceptance Criteria

- `BehaviorRegistry.load()` discovers `ops-toolset.yaml` from the framework tier without any explicit path configuration.
- `.getDirectives('daemon')` returns the 5 ops directives.
- `.getToolset('daemon')` returns the 7 ops tools.
- Schema validation rejects YAML missing required `name`, `agentTypes`, `directives`, or `tools` fields and throws a descriptive error.
- Registry correctly merges a project-level override on top of a framework-level behavior (project wins on conflict).
- `aiwg behavior list` command is wired in `definitions.ts` (implementation deferred to Phase 5).

---

## Phase 3: ops-toolset IPC Methods

**Depends on**: Phase 1 (DaemonSupervisor), Phase 2 (BehaviorRegistry and ops-toolset definition)
**Estimated sub-issues**: ~2
**Sub-issue breakdown**:
- `#512.7` — Implement all 7 IPC method handlers
- `#512.8` — Integration tests (IPCClient calls each method; verifies structured JSON response)

### New IPC Methods

All methods are registered in `daemon-main.mjs._registerIPCMethods()`.

| IPC Method | Implementation | Returns |
|------------|---------------|---------|
| `daemon.process.list` | Wraps `ProcessMonitor.getRunningLoops()` | Array of loop descriptors (id, status, pid, started) |
| `daemon.process.kill` | Wraps `AgentSupervisor.killTask()` with process-group kill (-pid) fix | `{ killed: boolean, pid: number }` |
| `daemon.resource.snapshot` | Wraps `MetricsCollector.getSystemMetrics()` | CPU %, memory MB, uptime |
| `daemon.circuit.status` | Reads DaemonSupervisor circuit breaker state | `{ state: 'closed'|'open'|'half-open', failures: number, cooldownRemaining: number }` |
| `daemon.queue.inspect` | Queue depth, oldest entry timestamp, priority distribution | `{ depth: number, oldest: string|null, byPriority: Record<string, number> }` |
| `daemon.loop.history` | Wraps `ExternalMultiLoopStateManager.getCompletedLoops()` | Array of completed loop summaries |
| `daemon.budget.remaining` | Aggregate spend vs configured daily limit | `{ spent: number, limit: number, remaining: number, currency: 'USD' }` |

### Acceptance Criteria

- All 7 IPC methods callable via `IPCClient` while daemon is running.
- Every method returns structured JSON (no plain strings, no raw errors in response body).
- Methods degrade gracefully when the underlying component is unavailable (return `{ error: string, available: false }` rather than throwing across the IPC boundary).
- Integration tests invoke each method against a running daemon instance using a stub supervisor.

---

## Phase 4: Operator Interface Layer

**Depends on**: Phase 3 (IPC methods must exist for the web UI to call)
**Estimated sub-issues**: ~4
**Sub-issue breakdown**:
- `#512.9` — `web-server.mjs`: HTTP server + SSE endpoint + static file serving + Bearer token auth
- `#512.10` — `web-ui/`: single-page dashboard (loop table, live output pane, submit form, resource view, history)
- `#512.11` — `message-router.mjs`: inbound command normalization, status event fan-out
- `#512.12` — `webhook-adapter.mjs` + `base-adapter.mjs`

### New Files

| File | Purpose |
|------|---------|
| `tools/daemon/web-server.mjs` | HTTP server on configurable port (default 7474). SSE endpoint at `/events` for live loop output. Bearer token auth on all endpoints. Serves static files from `web-ui/`. |
| `tools/daemon/web-ui/index.html` | Single-page dashboard: loop table, live output pane, submit form for new loops, resource view, history table. Vanilla JS, no build step required. |
| `tools/daemon/web-ui/styles.css` | Minimal, functional styling. No external CSS dependencies. |
| `tools/daemon/message-router.mjs` | Normalizes inbound commands from any registered adapter into a canonical command envelope. Fans status events out to all registered channel adapters. |
| `tools/daemon/adapters/base-adapter.mjs` | Abstract `ChannelAdapter` base class defining `onCommand(handler)`, `send(event)`, `start()`, `stop()` interface. |
| `tools/daemon/adapters/webhook-adapter.mjs` | Concrete adapter: POSTs structured event JSON to a configured webhook URL on status changes. Configurable via daemon config. |

### Acceptance Criteria

- Web UI accessible at `http://localhost:7474` when daemon is running.
- Loop dashboard reflects running and queued loops in real time via SSE.
- Live output pane streams log lines from the active loop without polling.
- Submit form creates a new loop task; task appears in the loop table within 2 seconds.
- Bearer token auth rejects requests without a valid token (HTTP 401).
- MessageRouter correctly dispatches a command from the webhook adapter to the daemon.
- No npm build step required to serve the web UI (vanilla JS).

---

## Phase 5: Integration + Wiring

**Depends on**: Phases 1–4 all complete
**Estimated sub-issues**: ~2
**Sub-issue breakdown**:
- `#512.13` — `daemon-main.mjs` rewire: DaemonSupervisor, behavior loading, web server startup
- `#512.14` — CLI `behavior` command family implementation in `tools/daemon/index.mjs` + `definitions.ts`

### Modified Files

| File | Change |
|------|--------|
| `tools/daemon/daemon-main.mjs` | Replace direct `AgentSupervisor` usage with `DaemonSupervisor`. Load behaviors via `BehaviorRegistry` on startup. Start `web-server.mjs` alongside IPC server. Register all 7 IPC methods. |
| `src/extensions/commands/definitions.ts` | Add `behavior` command family: `aiwg behavior list`, `aiwg behavior info <name>`, `aiwg behavior apply <name>`, `aiwg behavior remove <name>`. |
| `tools/daemon/index.mjs` | Wire `behavior` subcommands through to BehaviorRegistry. |

### Acceptance Criteria

- `daemon-main.mjs` boots without error with DaemonSupervisor as the active supervisor.
- `aiwg behavior list` returns the available behaviors from all 3 discovery tiers.
- `aiwg behavior info ops-toolset` returns the directives and tools defined in `ops-toolset.yaml`.
- `aiwg mc dispatch` routes task submission through DaemonSupervisor (queue, concurrency cap apply).
- Web UI (port 7474) and IPC socket both accept connections simultaneously after daemon start.
- Existing `ralph-external` tests remain green (no regression from supervisor swap).

---

## Phase 6: UAT + Documentation

**Depends on**: Phase 5 complete
**Estimated sub-issues**: ~2
**Sub-issue breakdown**:
- `#512.15` — `test/uat/daemon-supervisor.test.mjs` UAT suite
- `#512.16` — `docs/daemon-guide.md` update + `docs/behaviors-guide.md` (new)

### New / Modified Files

| File | Change |
|------|--------|
| `test/uat/daemon-supervisor.test.mjs` | End-to-end UAT using stub supervisor. Covers: DaemonSupervisor boots, queue governance under load, circuit breaker trips and recovers, all 7 IPC methods respond, web UI serves dashboard, behavior list returns ops-toolset. |
| `docs/daemon-guide.md` | Add sections: headend topology diagram, behavior application walkthrough, web UI usage, IPC method reference, configuring port and auth token. |
| `docs/behaviors-guide.md` | New document: behavior concept overview, YAML schema reference with annotated example, 3-tier discovery path explanation, how to create a custom behavior, how to override a framework behavior per-project. |

### Acceptance Criteria

- `npm run uat:daemon` passes all tests with zero failures.
- `docs/daemon-guide.md` covers headend topology, behavior application, web UI usage, and IPC method reference — all verifiable by a reader who has not read the RFC.
- `docs/behaviors-guide.md` covers the full behavior lifecycle: concept, schema, discovery, creation, override.
- No manual setup steps required beyond `aiwg use sdlc` for docs to be accurate.

---

## Out of Scope (Future Work)

The following items were explicitly deferred and should be tracked as separate issues referencing #512:

| Item | Rationale for Deferral |
|------|------------------------|
| Discord / Telegram / Slack channel adapters | Requires credentials management and external service dependencies; Phase 7 |
| BullMQ / Redis queue backend | In-memory queue is sufficient until multi-host orchestration is demonstrated; per `adr-in-memory-queue-defer-redis` |
| Container-per-loop process isolation | Significant infrastructure dependency; evaluate after headend topology stabilizes |
| LLM-based dynamic scheduling | Research-phase feature; no concrete use case driving it yet |

---

## Risk Register (Planning-Phase)

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `daemon-main.mjs` wiring in Phase 5 breaks existing ralph-external flows | Medium | High | Keep AgentSupervisor interface unchanged; DaemonSupervisor wraps it, does not replace the interface |
| SSE streaming introduces memory leak for long-lived daemon sessions | Low | Medium | Cap SSE connection backlog; test with 1000-line output in UAT |
| BehaviorRegistry 3-tier merge produces confusing precedence bugs | Medium | Low | Document merge order explicitly; add a `behavior info --show-source` flag that reports which tier each directive came from |
| Web UI Bearer token stored in daemon config in plaintext | Medium | Medium | Document that token should be set via env var `AIWG_DAEMON_TOKEN`; config file fallback with warning |

---

## References

- Parent issue: #512
- RFC: `.aiwg/planning/rfc-daemon-behaviors.md`
- ADR: `adr-daemon-as-headend`
- ADR: `adr-behaviors-sticky-capabilities`
- ADR: `adr-native-web-operator-interface`
- ADR: `adr-in-memory-queue-defer-redis`
- Related implementation: `tools/ralph-external/`, `tools/daemon/`
- Existing supervisor: `tools/ralph-external/agent-supervisor.mjs`
