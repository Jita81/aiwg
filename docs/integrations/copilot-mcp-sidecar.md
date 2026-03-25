# GitHub Copilot MCP Sidecar — Feasibility Assessment

Status: **Research Phase** — MCP support for Copilot Chat is not yet confirmed.

---

## Current State

GitHub Copilot integrates via:
- `.github/agents/` — YAML agent definitions (fully supported by AIWG)
- `.github/copilot-instructions.md` — workspace-level instructions
- VS Code extensions — VS Code has native MCP client support as of 2025

### What Works Today

| Feature | Status |
|---|---|
| AIWG agents via `.github/agents/` | Supported |
| AIWG rules via `.github/copilot-rules/` | Supported |
| MCP tools in Copilot Chat | **Unconfirmed** |

### Open Questions

1. Does VS Code's MCP extension support allow Copilot Chat to call MCP tools?
2. What is the config format? (`settings.json`? `.vscode/mcp.json`?)
3. Does Copilot Chat surface MCP tools to the user?
4. Is there a tool whitelist mechanism?

---

## If MCP Is Viable

When Copilot Chat gains MCP tool support, setup would look like:

### VS Code MCP Configuration

Add to `.vscode/settings.json` or `.vscode/mcp.json`:

```json
{
  "mcpServers": {
    "aiwg": {
      "command": "aiwg",
      "args": ["mcp", "serve"]
    }
  }
}
```

### Expected Workflow

1. Start the sidecar: `aiwg mcp serve`
2. VS Code connects to the MCP server
3. Copilot Chat can call AIWG tools: `workflow-run`, `artifact-read`, etc.
4. Artifacts appear in `.aiwg/`

---

## Current Alternatives

Until MCP support is confirmed for Copilot Chat, use these approaches:

### Option 1: Native AIWG Integration (Recommended)

```bash
# Deploy AIWG agents and rules to Copilot format
aiwg use sdlc --provider copilot
```

This gives Copilot access to AIWG agents and rules, but NOT the MCP tool surface.

### Option 2: Use a Spawnable Provider for AIWG Workflows

For workflows requiring full AIWG tool access, use Claude Code or Codex:

```bash
# Claude Code with full access
aiwg sdlc-accelerate "My project" --provider claude --dangerous

# Codex with full access
aiwg sdlc-accelerate "My project" --provider codex --dangerous
```

### Option 3: VS Code Terminal + Claude Code

Run Claude Code in the VS Code terminal alongside Copilot:

```bash
# In VS Code terminal
claude --dangerously-skip-permissions
```

Both Copilot (IDE) and Claude Code (terminal) can edit the same project simultaneously.

---

## Tracking

This issue will be updated when:
- VS Code MCP support is confirmed for Copilot Chat
- A viable configuration format is identified
- Testing confirms tool calls work end-to-end

See [Copilot Quick Start](copilot-quickstart.md) for the current (non-MCP) integration.

---

## Related Resources

- [Copilot Quick Start](copilot-quickstart.md) — Current AIWG + Copilot integration
- [Hermes MCP Sidecar](hermes-quickstart.md) — Reference sidecar implementation
- [Claude MCP Sidecar](claude-mcp-sidecar.md) — Alternative with full MCP support
