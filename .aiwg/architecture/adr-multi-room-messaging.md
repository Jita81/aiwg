# ADR: Multi-Room Messaging via RoomManager

## Status

**PROPOSED**

## Date

2026-03-25

## Context

The daemon's messaging layer currently maps one adapter instance to one channel. As operators add Slack, Discord, and Telegram integrations, the need to route different signal types (interactive commands, status notifications, raw logs) to separate rooms becomes unavoidable. A single-channel model forces operators to mix concerns or run multiple daemon instances.

Messaging adapters are implemented against a common interface but have no room-awareness concept. Adding rooms as a first-class construct requires extending that interface without breaking existing single-channel consumers.

## Decision

A `RoomManager` class coordinates room-to-task binding across all platform adapters. Adapters are extended — not replaced — with four new methods:

- `addRoom(roomId, purpose)` — register a room with a declared purpose
- `removeRoom(roomId)` — deregister and clean up bindings
- `sendToRoom(roomId, message)` — route a message to a specific room
- `broadcastToRooms(purposes, message)` — fan out to all rooms matching one or more purposes

Room purpose classification uses three canonical values:

| Purpose | Description |
|---------|-------------|
| `interactive` | Accepts operator commands; daemon listens for input |
| `notifications` | Receives task completion, error, and budget alerts |
| `logs` | Receives streaming loop output and debug events |

A room may carry multiple purposes. `RoomManager` maintains the mapping and dispatches accordingly. Adapters that do not implement the new methods fall back to single-channel behavior (backward compatible).

## Alternatives Considered

1. **Separate router per platform** -- Each adapter would own its own room routing logic. Rejected because it duplicates binding, dispatch, and error-handling code across every platform adapter. Centralizing in `RoomManager` means routing improvements and bug fixes apply everywhere.

2. **Single-channel only** -- Simplest implementation. Rejected because it does not meet the stated multi-room requirement and forces operators to route all signal types through one channel, reducing signal-to-noise in high-traffic rooms.

3. **Webhook-only fan-out** -- Route everything through outbound webhooks rather than extending adapters. Rejected because it loses bidirectional capability (the `interactive` purpose requires inbound listening, not just outbound posting).

## Consequences

**Positive:**
- Operators can isolate noisy log output from actionable notifications
- Interactive rooms remain quiet enough for command-driven workflows
- Existing single-channel adapters continue to work without modification
- `RoomManager` is a single place to audit routing decisions for debugging

**Negative:**
- Adds a new abstraction layer; operators must understand room purpose classification
- Platform adapters that support threads or sub-channels may need adapter-specific `addRoom` implementations to map AIWG rooms to native constructs (e.g., Slack channels vs. threads)

## References

- Issue #512
- RFC: `.aiwg/planning/rfc-daemon-behaviors.md`
- Existing adapter interface: `tools/daemon/messaging/`
