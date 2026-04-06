# aiwg serve — Operator Dashboard

`aiwg serve` starts a local HTTP server that provides a web dashboard for managing agentic sandbox instances, terminal sessions, and human-in-the-loop (HITL) interactions.

## Quick Start

```bash
# Install optional dependencies (first time only)
npm install hono @hono/node-server

# Start the server
aiwg serve

# Start on a custom port
aiwg serve --port 8080

# Start without auto-opening browser
aiwg serve --no-open

# Start in read-only mode (no PTY sessions)
aiwg serve --read-only
```

The dashboard opens at `http://127.0.0.1:7337` by default.

## CLI Options

| Flag | Default | Description |
|------|---------|-------------|
| `--port <n>` | `7337` | Port to listen on |
| `--bind <host>` | `127.0.0.1` | Network interface to bind |
| `--no-open` | (opens by default) | Skip auto-opening browser |
| `--read-only` | `false` | Disable PTY sessions and session creation |

## Web Dashboard

The dashboard is a React SPA with five tabs:

| Tab | Purpose |
|-----|---------|
| **Terminal** | Full xterm.js terminal emulator connected via WebSocket PTY bridge |
| **Missions** | Dispatch, monitor, pause, resume, and abort Mission Control tasks |
| **Sandbox** | Manage registered agentic-sandbox instances — agent grid with lifecycle controls |
| **Telemetry** | Token usage, gate pass/fail rates, iteration counts, scope progress |
| **Memory** | Agent memory inspection |

A persistent **HITL drawer** slides up from the bottom when any agent is blocked on human input. It polls for pending requests and lets operators respond or dismiss them without leaving the current tab.

## Sandbox Registration API

External systems (such as [agentic-sandbox](https://github.com/jmagly/agentic-sandbox)) register with `aiwg serve` to appear in the dashboard and relay events.

### Register a Sandbox

```
POST /api/sandboxes/register
Content-Type: application/json
```

**Request body:**

```json
{
  "name": "my-sandbox",
  "grpc_endpoint": "localhost:50051",
  "ws_endpoint": "ws://localhost:8080/ws",
  "http_endpoint": "http://localhost:8080",
  "capabilities": ["docker", "firecracker"],
  "version": "1.0.0"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Human-readable sandbox name |
| `grpc_endpoint` | Yes | gRPC address for the sandbox |
| `ws_endpoint` | Yes | WebSocket address for the sandbox |
| `http_endpoint` | Yes | HTTP address for the sandbox |
| `capabilities` | No | List of supported runtimes |
| `version` | No | Sandbox software version |

**Response (201):**

```json
{
  "sandbox_id": "sandbox-a1b2c3d4",
  "token": "550e8400-e29b-41d4-a716-446655440000"
}
```

The returned `token` is required for all subsequent authenticated operations (WebSocket connection, deregistration, agent lifecycle).

### Deregister a Sandbox

```
DELETE /api/sandboxes/{id}
Authorization: Bearer <token>
```

Returns `{ "ok": true }` on success. Returns `401` if the token does not match.

### Other Sandbox Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/sandboxes` | List all registered sandboxes |
| `GET` | `/api/sandboxes/:id` | Get a single sandbox summary |
| `GET` | `/api/sandboxes/:id/agents` | List agents for a sandbox |
| `GET` | `/api/agents` | List all agents across all sandboxes |
| `GET` | `/api/sandboxes/:id/loadouts` | Proxy: list available loadouts |
| `POST` | `/api/sandboxes/:id/provision` | Proxy: provision a new agent |
| `POST` | `/api/sandboxes/:id/agents/:aid/{action}` | Proxy: agent lifecycle (`start`, `stop`, `destroy`, `reprovision`) |
| `DELETE` | `/api/sandboxes/:id/agents/:aid` | Proxy: delete an agent |

Proxied endpoints forward requests to the sandbox's own HTTP API.

## WebSocket: Sandbox Event Push

After registration, the sandbox maintains a persistent WebSocket connection to push real-time events:

```
ws://127.0.0.1:7337/ws/sandbox/<sandbox_id>?token=<token>
```

The token (from the registration response) is passed as a query parameter. The server validates it on connection and on every message.

### Event Types

All events conform to the `SandboxEvent` schema:

```json
{
  "type": "agent.connected",
  "sandboxId": "sandbox-a1b2c3d4",
  "agentId": "agent-001",
  "timestamp": "2026-04-06T12:00:00Z",
  "loadout": "sdlc-full",
  "aiwgFrameworks": [
    { "name": "sdlc-complete", "providers": ["claude"] }
  ]
}
```

| Event Type | Description | Key Fields |
|------------|-------------|------------|
| `agent.connected` | Agent has connected to the sandbox | `loadout`, `aiwgFrameworks` |
| `agent.disconnected` | Agent connection lost | — |
| `agent.provisioning` | Agent environment is being set up | `loadout`, `step`, `progress` |
| `agent.ready` | Agent is ready to accept work | — |
| `session.start` | Agent has started a task session | `sessionId`, `task` |
| `session.end` | Agent task session completed | `sessionId` |
| `hitl.input_required` | Agent is blocked waiting for human input | `hitlId`, `prompt`, `context`, `expiresAt` |

### Agent State Machine

Events drive agent status transitions in the registry:

```
  connected ──► ready ──► busy (session.start)
                  ▲          │
                  └──────────┘ (session.end)
                  
  provisioning ──► ready (agent.ready)
  
  any ──► disconnected (agent.disconnected)
```

**Agent statuses:** `starting` | `provisioning` | `ready` | `busy` | `error` | `disconnected`

## WebSocket: PTY Bridge

Terminal sessions use a separate WebSocket endpoint:

```
ws://127.0.0.1:7337/ws/pty/<sessionId>?command=aiwg&args=mc,watch&cwd=/path
```

This bridges the browser's xterm.js terminal to a server-side PTY process. The server buffers up to 64KB of output for replay on reconnection. The client uses exponential backoff (500ms initial, 30s max) for automatic reconnection.

PTY sessions are disabled when `--read-only` is set.

## Human-in-the-Loop (HITL)

When an agent sends a `hitl.input_required` event, the flow is:

1. Sandbox pushes the event over the WebSocket connection
2. The registry stores a `HitlRequest` with `hitlId`, `prompt`, `context`, and `expiresAt`
3. The dashboard polls `GET /api/hitl` every 2 seconds
4. The HITL drawer appears with the agent's prompt
5. The operator types a response and submits via `POST /api/hitl/:id/respond`
6. The server proxies the response to the sandbox's `POST /api/v1/hitl/:id/respond`

Operators can also dismiss requests via `POST /api/hitl/:id/dismiss`.

## Integration with agentic-sandbox

To connect an agentic-sandbox instance to `aiwg serve`:

1. Start the dashboard:
   ```bash
   aiwg serve
   ```

2. Configure the sandbox to point at the dashboard:
   ```bash
   export AIWG_SERVE_ENDPOINT=http://127.0.0.1:7337
   ```

3. Start the sandbox — it will auto-register via `POST /api/sandboxes/register`

4. The sandbox appears in the dashboard's **Sandbox** tab with its agents and lifecycle controls.

## Security

`aiwg serve` is designed for **local operator use**:

- **Loopback binding** — defaults to `127.0.0.1`, not exposed to the network
- **Per-sandbox tokens** — each sandbox receives a unique UUID token at registration; all mutations and WebSocket connections require it
- **No global auth** — the loopback binding is the primary security boundary
- **Same-origin dashboard** — the React SPA is served from the same origin as the API, so no CORS configuration is needed

If you need to expose the server on a network interface (`--bind 0.0.0.0`), place it behind a reverse proxy with authentication.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  aiwg serve                      │
│                                                  │
│  Hono HTTP Server (port 7337)                    │
│  ├── Static files ── React SPA (apps/web/dist/)  │
│  ├── /api/sandboxes/* ── Sandbox Registry        │
│  ├── /api/hitl/* ── HITL Relay                   │
│  ├── /api/sessions/* ── Session Management       │
│  ├── /ws/sandbox/:id ── Event Push (WebSocket)   │
│  └── /ws/pty/:id ── Terminal Bridge (WebSocket)  │
│                                                  │
│  SandboxRegistry ── agent inventory + events     │
│  PTYRegistry ── terminal session lifecycle       │
└──────────┬───────────────────────┬───────────────┘
           │                       │
     WebSocket push          HTTP proxy
           │                       │
┌──────────▼───────────────────────▼───────────────┐
│            agentic-sandbox instance               │
│  gRPC / HTTP / WebSocket endpoints                │
│  Agent provisioning, execution, lifecycle         │
└──────────────────────────────────────────────────┘
```

## Relationship to aiwg daemon

`aiwg serve` and `aiwg daemon` are separate systems:

| | `aiwg serve` | `aiwg daemon` |
|---|---|---|
| **Default port** | 7337 | 7474 |
| **Purpose** | Operator dashboard for sandbox fleet | Background task supervisor |
| **Manages** | Sandbox instances, agents, HITL | Task queue, scheduled jobs, watches |
| **Start command** | `aiwg serve` | `aiwg daemon start` |

They can run simultaneously and serve complementary roles.

## Building the Dashboard

The React dashboard must be built before `aiwg serve` can serve it:

```bash
cd apps/web
pnpm install
pnpm build
```

If the build output (`apps/web/dist/`) is missing, the server returns a 503 text response instead of the dashboard UI.

For development with hot reload:

```bash
cd apps/web
pnpm dev
```

The Vite dev server proxies `/api` and `/ws` to `http://localhost:7337`, so you need `aiwg serve` running alongside it.

## Troubleshooting

**"Cannot find module 'hono'"** — Install the optional dependencies:
```bash
npm install hono @hono/node-server
```

**Dashboard shows 503** — Build the web app first:
```bash
cd apps/web && pnpm build
```

**Sandbox not appearing** — Check that:
1. `AIWG_SERVE_ENDPOINT` points to the correct host and port
2. The sandbox successfully called `POST /api/sandboxes/register` (check sandbox logs)
3. The WebSocket connection was established (check browser DevTools network tab)

**HITL drawer not appearing** — Verify the sandbox is connected (green status in Sandbox tab) and the `hitl.input_required` event includes a valid `hitlId`.
