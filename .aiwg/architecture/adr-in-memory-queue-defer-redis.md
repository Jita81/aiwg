# ADR: In-Memory Priority Queue, Defer Redis to Optional Behavior

## Status

**PROPOSED**

## Date

2026-03-25

## Context

The current `AgentSupervisor` uses an unbounded in-memory array as its task queue. This works for small workloads but provides no backpressure, no priority ordering, and no persistence guarantees.

BullMQ (Redis-backed) would add crash-durable queuing, distributed multi-daemon support, built-in retry/backoff, and rate limiting. However, Redis is an external service dependency that violates AIWG's core design principle: **no external services required for basic operation**. AIWG targets developers who run `npm install -g aiwg` and expect everything to work without provisioning infrastructure.

The `DaemonSupervisor` (see `adr-daemon-as-headend.md`) needs a queue with bounded depth, rejection policy, and priority ordering -- but not distributed coordination.

## Decision

Use a bounded in-memory priority queue for the `DaemonSupervisor`. Defer Redis/BullMQ to a future optional behavior (`redis-queue-backend`).

**In-memory queue specification:**
- **Bounded**: `maxQueueDepth` (default 100, configurable)
- **Rejection policy**: When full, reject new tasks with a clear error (not silent drop)
- **Priority ordering**: Tasks sorted by priority field (0 = highest)
- **Persistence**: `TaskStore` writes queue snapshot to JSON file on graceful shutdown and periodic intervals (configurable, default 60s)
- **Recovery**: On daemon restart, `TaskStore` restores queued tasks from the last snapshot

**Future Redis path**: Once the behavior system exists (see `adr-behaviors-sticky-capabilities.md`), a `redis-queue-backend` behavior can replace the in-memory queue for deployments that need crash durability or multi-daemon coordination. The queue interface is identical; only the backing store changes.

## Alternatives Considered

1. **BullMQ + Redis** -- Powerful feature set (retry, backoff, rate limiting, distributed locks). But adds Redis as an infrastructure dependency. Users would need to install and run Redis before using daemon mode. Incompatible with the zero-dependency design goal.
2. **SQLite-backed queue** -- Durable, single-file, no external service. But introduces write contention under high-throughput task submission. `better-sqlite3` is a native addon requiring compilation, which complicates `npm install` on some platforms.
3. **File-based queue (one file per task)** -- Simple and durable. But directory scanning for priority ordering is slow, and filesystem operations become a bottleneck with frequent enqueue/dequeue cycles.

## Consequences

**Positive:**
- No external dependencies -- consistent with AIWG's zero-infrastructure design philosophy
- Simple implementation, easy to unit test without mocking infrastructure
- TaskStore periodic persistence provides soft durability for graceful shutdowns
- Queue interface abstraction enables future Redis backend without API changes

**Negative:**
- Queue state lost on hard crash between persistence intervals (mitigated by short persist interval and crash-resilient loop state files)
- No distributed multi-daemon support in v1 (acceptable; most users run a single daemon)
- No built-in retry/backoff at the queue level (handled by DaemonSupervisor's restart intensity logic instead)

## References

- Issue #512
- RFC: `.aiwg/planning/rfc-daemon-behaviors.md`, section 7 (Alternative A)
- `adr-daemon-as-headend.md` -- DaemonSupervisor design
- `adr-behaviors-sticky-capabilities.md` -- Behavior system enabling future Redis backend
