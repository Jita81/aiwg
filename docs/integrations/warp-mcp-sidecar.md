# Warp Terminal MCP Sidecar Guide

Connect AIWG to Warp Terminal AI as an MCP sidecar for structured workflow access.

> **This is not a standard provider deployment.** Warp Terminal is a terminal application with integrated AI features; it cannot be spawned programmatically from the CLI, so it has no dangerous mode flag. The MCP sidecar is the only viable path to unrestricted AIWG tool access from within Warp. The architecture is `Warp Terminal AI → MCP → AIWG Server`.

---

## Architecture

```
Warp Terminal AI (host)
  ├── AI Command Palette and natural language
  ├── WARP.md (aggregated agents + commands)
  ├── .warp/ (agents, commands, skills, rules)
  └── MCP connection
        └── AIWG MCP Server (sidecar)
              └── .aiwg/ artifacts, workflows, templates
```

**Warp owns**: AI Command Palette, WARP.md aggregation, `.warp/` directory, terminal session context.

**AIWG owns**: workflow execution, artifact output in `.aiwg/`, template rendering, agent role definitions.

**MCP is the seam.** Warp already receives AIWG agent and command definitions via `aiwg use sdlc --provider warp`. The MCP sidecar adds structured, callable AIWG tooling on top of that foundation — without replacing it.

---

## Prerequisites

- Warp Terminal installed and running ([warp.dev](https://warp.dev))
- AIWG installed: `npm install -g aiwg`
- A project with AIWG deployed for Warp:

```bash
cd /path/to/your/project
aiwg use sdlc --provider warp
```

If you have not done the base deployment yet, complete the [Warp Terminal Quick Start](warp-terminal-quickstart.md) first, then return here.

---

## Install MCP Configuration

Run the AIWG install command to write the MCP configuration for Warp:

```bash
aiwg mcp install warp
```

This writes (or updates) `~/.warp/mcp.json` with the AIWG server entry.

**Verify the config was written:**

```bash
cat ~/.warp/mcp.json
```

You should see:

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

After writing the config, restart Warp Terminal to pick up the new MCP server.

---

## Configure Tool Whitelist

The default config connects to the full AIWG MCP surface. Restrict to the five core tools to keep Warp AI's context budget manageable:

**Edit `~/.warp/mcp.json`:**

```json
{
  "mcpServers": {
    "aiwg": {
      "command": "aiwg",
      "args": ["mcp", "serve"],
      "tools": {
        "include": [
          "workflow-run",
          "artifact-read",
          "artifact-write",
          "template-render",
          "agent-list"
        ],
        "prompts": false,
        "resources": false
      }
    }
  }
}
```

**Why this whitelist:** Each MCP server exposes its tool schemas into the Warp AI context window before any tool is called. The full AIWG surface adds roughly 12,000 tokens of schema overhead. A 5-tool whitelist reduces that to approximately 3,000 tokens — keeping most of the context window available for actual work. See the [Context Budget](#context-budget) section for the full breakdown.

A ready-to-use minimal config template is available at `agentic/code/frameworks/sdlc-complete/templates/warp/warp-mcp-minimal.json`.

---

## Verify the Connection

After restarting Warp, ask the Warp AI to confirm the tools are available:

```text
What AIWG MCP tools are available?
```

Warp AI should list the five whitelisted tools: `workflow-run`, `artifact-read`, `artifact-write`, `template-render`, `agent-list`.

**Verify AIWG MCP server runs independently:**

```bash
aiwg mcp info    # Show capabilities
aiwg version     # Confirm CLI is in PATH
```

If Warp AI cannot see the tools, check that `aiwg` is accessible from the PATH that Warp uses when launching processes.

---

## Run Your First Workflow

Ask Warp AI to create a structured artifact that routes through the AIWG MCP server:

```text
Create an architecture decision record for choosing PostgreSQL over MongoDB
for our user service. Save it as a persistent AIWG artifact.
```

**What should happen:**

1. Warp AI recognizes this as a structured artifact request
2. Warp AI calls `workflow-run` or `artifact-write` via MCP
3. AIWG creates the artifact in `.aiwg/architecture/`
4. Warp AI reports the result

**Verify the artifact was written:**

```bash
ls .aiwg/architecture/
```

You should see the new ADR file.

---

## Context Budget

Understanding the token footprint helps you configure the whitelist for your needs.

### With 5-tool whitelist (recommended)

| Component | Tokens |
|---|---|
| Warp AI system context | ~1,500 |
| WARP.md (aggregated agents + commands) | ~4,000 |
| AIWG MCP schema (5 tools) | ~3,000 |
| **Total overhead** | **~8,500** |
| **Available for work** (32K context) | **~23,500 (73%)** |

### Without whitelist (full surface)

| Component | Tokens |
|---|---|
| Warp AI system context | ~1,500 |
| WARP.md (aggregated agents + commands) | ~4,000 |
| AIWG MCP schema (20+ tools) | ~12,000 |
| **Total overhead** | **~17,500** |
| **Available for work** (32K context) | **~14,500 (45%)** |

Warp's context window is smaller than cloud IDE assistants. The whitelist has a significant impact here: without it, fewer than half the context tokens are available before any conversation begins. With a 5-tool whitelist, you recover roughly 28 percentage points of usable context.

---

## Advanced — Enable Prompts

After the basic integration is stable, you can enable AIWG prompt exposure for richer workflow access.

**Update `~/.warp/mcp.json`:**

```json
{
  "mcpServers": {
    "aiwg": {
      "command": "aiwg",
      "args": ["mcp", "serve"],
      "tools": {
        "include": [
          "workflow-run",
          "artifact-read",
          "artifact-write",
          "template-render",
          "agent-list"
        ],
        "prompts": true,
        "resources": false
      }
    }
  }
}
```

This adds AIWG workflow prompts as callable templates from within Warp AI. Only enable after the base integration in the previous sections is working reliably.

A ready-to-use full config template is available at `agentic/code/frameworks/sdlc-complete/templates/warp/warp-mcp-full.json`.

---

## Validation Checklist

Run these checks to confirm the integration is working:

| Check | Action | Expected |
|---|---|---|
| Connectivity | Ask "What AIWG tools are available?" | 5 tools listed |
| Routing (direct) | Ask a one-off terminal question | Warp answers directly (no MCP call) |
| Routing (artifact) | Ask for a requirements document | Routes to AIWG via MCP |
| Artifact write | Check `.aiwg/` after workflow | New artifact file exists |
| Artifact read | Ask Warp AI to read an existing artifact | Uses `artifact-read` |
| Failure mode | Run `aiwg mcp serve` in isolation, confirm it starts | No errors |

---

## Troubleshooting

**AIWG tools not visible in Warp AI:**

- Verify `aiwg mcp serve` runs successfully on its own
- Confirm `~/.warp/mcp.json` is valid JSON (use `jq . ~/.warp/mcp.json`)
- Ensure `aiwg` is in your PATH (check `which aiwg`)
- Restart Warp Terminal after any config change

**Artifacts not appearing in `.aiwg/`:**

- Confirm AIWG is initialized in the project (`aiwg use sdlc --provider warp`)
- Check that `artifact-write` is in the tool whitelist
- Verify Warp's working directory matches the project root

**Context growing too fast:**

- Confirm `prompts: false` and `resources: false` in the MCP config
- Keep WARP.md lean — avoid adding large blocks of project context to the aggregated file
- Keep the whitelist to 5 tools unless you have a specific reason to add more

**Config location not found:**

- The config path is `~/.warp/mcp.json`
- Create the directory if it does not exist: `mkdir -p ~/.warp`
- Re-run `aiwg mcp install warp` after creating the directory

---

## Related Resources

- [Warp Terminal Quick Start](warp-terminal-quickstart.md) — base provider deployment (prerequisite)
- [Hermes MCP Sidecar Guide](hermes-quickstart.md) — reference architecture this guide follows
- [AIWG MCP server reference](../cli-reference.md#mcp)
- [Warp Terminal Documentation](https://docs.warp.dev)
