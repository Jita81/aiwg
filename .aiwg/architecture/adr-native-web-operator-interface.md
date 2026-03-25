# ADR: Native Web UI as Primary Operator Interface

## Status

**PROPOSED**

## Date

2026-03-25

## Context

Currently users must be in the same terminal session to interact with running ralph-external loops. There is no remote monitoring, no steering from a second machine, and no way to observe multiple concurrent loops at a glance.

Adding messaging integrations (Discord, Telegram, Slack) today requires forking the daemon -- there is no pluggable adapter interface for delivery channels.

A web UI served on localhost is universally accessible from any browser, requires no external accounts or third-party services, and works without network exposure. For users who want chat-platform delivery, the `MessageRouter` architecture decouples the daemon's command/event model from the transport layer, enabling channel adapters as optional plugins.

## Decision

The daemon exposes a native web UI on localhost (default port 7474) as the primary operator interface. Channel adapters (Discord, Telegram, Slack) are optional plugins, not required.

**Architecture:**
- **Web server**: Lightweight HTTP server (Node built-in `http` or `fastify`) serving static files + API routes
- **Live streaming**: Server-Sent Events (SSE) for real-time loop output -- simpler than WebSocket, sufficient for unidirectional streaming
- **MessageRouter**: Decouples daemon internals from delivery channels. Web UI is the default channel; adapters for Discord/Telegram/Slack register as additional channels
- **Auth**: Bearer token for API access (generated on first start, stored in `~/.config/aiwg/daemon-token`). Acceptable for localhost; remote access requires TLS (documented, not enforced)

**UI capabilities:**
- Dashboard: All running loops with status, elapsed time, iteration count
- Live output: SSE stream per loop with ANSI rendering
- Controls: Pause, resume, abort, adjust budget per loop
- History: Completed loop summaries with cost rollup

## Alternatives Considered

1. **Chat-platform-only (Discord/Telegram)** -- Requires external accounts and network exposure. Introduces third-party dependencies for a core operator workflow. Not accessible offline or in air-gapped environments.
2. **Terminal UI (blessed/ink)** -- Limited to the terminal where it runs. Cannot be accessed from another machine or tab. Fragile in tmux/screen. No persistent dashboard.
3. **External dashboard (Grafana or custom app)** -- Adds infrastructure (separate process, database, deployment). Overkill for a single-daemon operator view.

## Consequences

**Positive:**
- Zero external dependencies -- works on localhost with no accounts or services
- Channel adapters are additive; users opt in to Discord/Telegram/Slack
- MessageRouter enables future channels without modifying the daemon
- SSE is simple to implement and debug compared to WebSocket

**Negative:**
- Must implement a basic web server and static file serving within the daemon
- Auth model (bearer token) is minimal; remote access security is the operator's responsibility
- Web UI development and maintenance is an ongoing cost

## References

- Issue #512
- RFC: `.aiwg/planning/rfc-daemon-behaviors.md`, section 5b
