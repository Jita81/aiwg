# Factory AI MCP Sidecar — Feasibility Assessment

Status: **Research Phase** — Factory AI's MCP client support and network topology need investigation.

---

## Challenge: Cloud-Based Architecture

Factory AI runs droids in the cloud. Unlike IDE-integrated providers (Cursor, Windsurf) where the MCP server runs on localhost, Factory would need to reach the MCP server over the network.

### Network Topology Options

| Option | Complexity | Security |
|---|---|---|
| ngrok tunnel | Low | Moderate (public URL) |
| Cloudflare Tunnel | Medium | High (authenticated) |
| Self-hosted MCP server | High | High (your infrastructure) |

---

## If MCP Is Supported

### Setup with Tunnel

```bash
# 1. Start AIWG MCP server with HTTP transport
aiwg mcp serve --transport http --port 3100

# 2. Expose via tunnel
ngrok http 3100
# or
cloudflared tunnel --url http://localhost:3100

# 3. Configure Factory with the tunnel URL
# (in Factory AI dashboard or .factory/config)
```

### Local Configuration

`aiwg mcp install factory` already generates `~/.factory/mcp.json`:

```json
{
  "mcpServers": {
    "aiwg": {
      "type": "stdio",
      "command": "aiwg",
      "args": ["mcp", "serve"],
      "disabled": false
    }
  }
}
```

This works if Factory's droids can execute local commands. If they run in the cloud, the HTTP transport + tunnel approach is needed.

---

## Current Alternatives

### Option 1: Native AIWG Integration

```bash
aiwg use sdlc --provider factory
```

Deploys `.factory/droids/` configurations with AIWG agent definitions.

### Option 2: Use a Spawnable Provider

For workflows requiring full AIWG tool access:

```bash
aiwg sdlc-accelerate "My project" --provider claude --dangerous
```

---

## Open Questions

1. Does Factory AI support MCP tool connections from droids?
2. Can Factory droids execute local commands (stdio transport) or only HTTP?
3. Does Factory support authenticated MCP endpoints?
4. Can MCP tools be registered in `.factory/droids/` config files?

---

## Tracking

This issue will be updated when Factory AI's MCP capabilities are confirmed.

See [Factory Quick Start](factory-quickstart.md) for the current integration.

---

## Related Resources

- [Factory Quick Start](factory-quickstart.md) — Current AIWG + Factory integration
- [Hermes MCP Sidecar](hermes-quickstart.md) — Reference sidecar implementation
