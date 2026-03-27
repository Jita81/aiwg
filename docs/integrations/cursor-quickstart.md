# Cursor Quick Start

---

## Install & Deploy

**1. Install**

```bash
npm install -g aiwg
```

**2. Deploy to your project**

```bash
cd /path/to/your/project

# Deploy all 4 artifact types for Cursor
aiwg use sdlc --provider cursor
```

**3. Configure MCP (optional)**

```bash
aiwg mcp install cursor
```

**4. Open in Cursor**

```bash
cursor .
```

**5. Regenerate for intelligent integration**

```text
/aiwg-regenerate-cursorrules
```

This step is critical - it enables natural language command mapping ("run security review" → workflow). Without it, advanced features won't work correctly. See the [Regenerate Guide](#regenerate-guide) for details.

**6. You're ready.** See the [Intake Guide](#intake-guide) for starting projects.

---

## What Gets Created

```text
.cursor/
├── agents/      # SDLC agents (Requirements Analyst, Architecture Designer, etc.)
├── commands/    # Slash commands (/project-status, /security-gate, etc.)
├── skills/      # Skill directories (voice profiles, project awareness, etc.)
├── rules/       # Context rules (token security, citation policy, etc.) — MDC format
└── mcp.json     # MCP config (if enabled)

AGENTS.md        # Project context
.aiwg/           # SDLC artifacts
```

> **Note:** Cursor uses `.mdc` extension for rules (Cursor's MDC format for context rules).

---

## Using Agents

Invoke via @-mention in Cursor:

```text
@security-architect Review the authentication implementation
@test-engineer Generate unit tests for the user service
```

---

## Ralph Iterative Loops

Ralph loops support multi-provider execution. While Cursor agents are deployed via AIWG, Ralph task loops run through the CLI:

```bash
aiwg ralph "Fix all tests" --completion "npm test passes"
```

See [Ralph Guide](../ralph-guide.md) for full documentation including `--provider` options.

---

## Troubleshooting

**Natural language not working?** Run regenerate:
```text
/aiwg-regenerate-cursorrules
```

**Rules not loading?** Check file extension is `.mdc` and restart Cursor.

**Redeploy if needed:**
```bash
aiwg use sdlc --provider cursor --force
```

---

## Cursor Cloud Agents

Cursor Cloud Agents run in isolated cloud VMs and can be triggered from GitHub, Slack, Linear, and webhooks. AIWG works in Cloud Agent environments via the `install` step in `.cursor/environment.json`.

**Create `.cursor/environment.json`:**

```json
{
  "install": "npm install -g aiwg && aiwg use sdlc --provider cursor",
  "terminal": {
    "env": {
      "AIWG_PROVIDER": "cursor",
      "AIWG_CONTEXT_WINDOW": "200000"
    }
  }
}
```

This tells the Cloud Agent VM to install AIWG and deploy the SDLC framework before starting work. A pre-configured template is available at:

```text
agentic/code/frameworks/sdlc-complete/templates/cursor/environment.json.aiwg-template
```

**MCP server in Cloud Agents:**

The AIWG MCP server can also run inside the Cloud Agent VM. Add it to `.cursor/mcp.json`:

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

**Automation triggers:**

Cloud Agents can be triggered by commenting `@cursor` on GitHub issues or PRs, or via Slack/Linear. AIWG Ralph loops pair well with this: trigger a Cloud Agent on an issue, and Ralph handles the iterative fix cycle automatically.

> **Note:** Test `npm install -g aiwg` in your target environment first — Cloud Agent VMs may have npm available but require `--prefix` or `--location=global` flags depending on the base image.

---

## MCP Sidecar (Unrestricted AIWG Access)

For full unrestricted AIWG tool access (artifact management, workflow execution, template rendering), connect the AIWG MCP server as a sidecar:

```bash
aiwg mcp install cursor
```

See the [Cursor MCP Sidecar Guide](cursor-mcp-sidecar.md) for complete setup including tool whitelisting and context optimization.
