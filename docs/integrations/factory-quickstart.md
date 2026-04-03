# Factory AI Quick Start

> **Important:** Factory requires manual droid import after deployment.
> Quick import: `droid . → /droids → I → A → Enter`

---

## Install & Deploy

**1. Install**

```bash
npm install -g aiwg
```

**2. Deploy to your project**

```bash
cd /path/to/your/project

# Deploy all 4 artifact types (Factory calls agents "droids")
aiwg use sdlc --provider factory
```

**3. Import droids (required)**

```bash
droid .
/droids
# Press 'I' → 'A' → Enter
```

**4. Regenerate for intelligent integration**

```text
/aiwg-regenerate-agents
```

This step is critical - it enables natural language command mapping ("run security review" → workflow). Without it, advanced features won't work correctly. See the [Regenerate Guide](#regenerate-guide) for details.

**5. You're ready.** See the [Intake Guide](#intake-guide) for starting projects.

---

## What Gets Created

```text
.factory/
├── droids/      # SDLC agents (Factory calls them droids)
├── commands/    # Workflow commands (/project-status, /security-gate, etc.)
├── skills/      # Skill directories (voice profiles, project awareness, etc.)
└── rules/       # Context rules (AIWG convention — Factory reads via AGENTS.md)

AGENTS.md        # Project context (cross-platform standard)
.aiwg/           # SDLC artifacts
```

---

## Platform Capabilities

Factory AI provides a rich extensibility model that maps closely to AIWG concepts:

| AIWG Concept | Factory Equivalent | Status |
|---|---|---|
| Agents | Custom Droids (`.factory/droids/`) | Native — auto-discovered |
| Commands | Slash Commands (`.factory/commands/`) | Native — `$ARGUMENTS` expansion |
| Skills | Skills (`.factory/skills/*/SKILL.md`) | Native — auto-discovered |
| Rules | AGENTS.md + settings.json | Conventional — no per-file discovery |
| MCP | MCP (`.factory/mcp.json`) | Native — stdio + HTTP transport |
| Hooks | Hooks (settings.json `hooks` key) | Native — 9 lifecycle events |
| Multi-agent | Missions + Task tool | Native orchestration |

---

## MCP Integration

Factory supports MCP natively with both stdio (local) and HTTP (remote) transport.

### Setup

```bash
# Install AIWG MCP server for Factory
aiwg mcp install factory
```

This generates `~/.factory/mcp.json`:

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

### Project-Level MCP

For team-shared MCP config, create `.factory/mcp.json` in your project root:

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

### Interactive MCP Management

Factory provides a built-in MCP registry browser:

```text
/mcp
```

Browse 40+ pre-configured servers (Sentry, Linear, Notion, Stripe, Figma, etc.), toggle servers, and manage OAuth connections.

For advanced MCP patterns (HTTP transport, tunneling for remote access), see the [Factory MCP Reference](factory-mcp-sidecar.md).

---

## Droid Configuration

### Format

Factory droids use Markdown + YAML frontmatter (same as AIWG agents):

```yaml
---
name: architecture-designer
description: Designs scalable, maintainable system architectures
model: claude-opus-4-6
reasoningEffort: high
tools: ["Read", "LS", "Grep", "Glob", "Edit", "Create", "Execute", "Task", "TodoWrite"]
---

System prompt body here.
```

### Key Fields

| Field | Description |
|---|---|
| `name` | Lowercase, hyphens, digits only |
| `description` | ≤500 chars; used for auto-invocation matching |
| `model` | `inherit` (default) or full model ID |
| `reasoningEffort` | `off`, `low`, `medium`, `high` |
| `tools` | Array of tool IDs or category string (`read-only`, `edit`, `execute`, `web`, `mcp`) |

### Tool Mapping (AIWG → Factory)

| AIWG/Claude Code | Factory | Notes |
|---|---|---|
| `Bash` | `Execute` | Shell command execution |
| `Write` | `Create` + `Edit` | Split to two tools |
| `WebFetch` | `FetchUrl` + `WebSearch` | Split to two tools |
| `MultiEdit` | `MultiEdit` + `ApplyPatch` | Patch application added |
| `Read`, `Grep`, `Glob`, `LS` | Same | Standard Anthropic tool names |

AIWG handles this mapping automatically during `aiwg use sdlc --provider factory`.

### Storage Locations

| Scope | Path | Behavior |
|---|---|---|
| Project | `.factory/droids/` | Shared via git; project overrides personal |
| Personal | `~/.factory/droids/` | Cross-project personal droids |

**Constraint**: Only top-level `.md` files are discovered — subdirectories are ignored.

---

## Mixed Models

Factory supports per-droid model selection and reasoning effort:

```yaml
---
name: deep-reviewer
model: claude-opus-4-6
reasoningEffort: high
tools: ["read-only"]
---
```

This enables quality-tier assignments:
- **High-volume droids** (linters, formatters): Haiku + low reasoning
- **Standard coding droids**: Sonnet + medium reasoning
- **Critical review droids** (security, architecture): Opus + high reasoning

---

## Hooks

Factory provides 9 lifecycle hook events (superset of Claude Code):

| Event | Use Case |
|---|---|
| `PreToolUse` | Block dangerous operations, audit logging |
| `PostToolUse` | Auto-format, validation |
| `UserPromptSubmit` | Input preprocessing |
| `Stop` | Completion notification |
| `SubagentStop` | Post-subagent logging (AIWG trace) |
| `SessionStart` | Pre-flight checks (`aiwg sync --dry-run`) |
| `SessionEnd` | Cleanup |
| `PreCompact` | Context preservation |
| `Notification` | Desktop alerts |

Configure in `~/.factory/settings.json` or `.factory/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "aiwg sync --dry-run"
          }
        ]
      }
    ]
  }
}
```

### Hook Runtime Contract

Each hook invocation receives a **JSON payload via stdin**:

```json
{
  "tool_name": "Write",
  "tool_input": { "file_path": "/absolute/path/to/file" },
  "cwd": "/absolute/path/to/project"
}
```

**Exit code contract** (identical to Claude Code):
- `0` — success, workflow continues
- `2` — block, workflow halted (return JSON body with `reason` on stdout)
- Other — hook error, logged, workflow continues

For the full stdin schema (including Claude Code comparison), cross-platform field table, and bash parsing examples, see `.aiwg/references/platforms/factory-ai.md` sections 6.3.1–6.3.2.

---

## Headless / CI Execution

Factory's `droid exec` enables non-interactive execution for CI/CD:

```bash
# Basic analysis (read-only by default)
droid exec "analyze code quality"

# With write permissions
droid exec --auto low "fix the failing tests"

# Full CI pipeline
droid exec --auto medium -o json "run full test suite and fix failures"
```

### Autonomy Levels

| Level | Permitted Operations |
|---|---|
| Default | Read-only (file inspection, git status) |
| `--auto low` | File creation/editing in project directories |
| `--auto medium` | Development tasks (npm install, git commit, builds) |
| `--auto high` | Production operations (git push, deployments) |

### GitHub Actions

```yaml
- name: AIWG Code Review
  env:
    FACTORY_API_KEY: ${{ secrets.FACTORY_API_KEY }}
  run: droid exec --auto low "Review changes and output findings"
```

---

## Agent Loop

Agent loops support multi-provider execution. While Factory droids are deployed via AIWG, agent task loops run through the CLI:

```bash
aiwg ralph "Fix all tests" --completion "npm test passes"
```

See [Al Guide](../ralph-guide.md) for full documentation including `--provider` options.

---

## Missions (Multi-Agent Orchestration)

Factory's Missions feature enables structured multi-agent projects:

1. Enter mission mode via `/enter-mission`
2. Collaborate to define features and milestones
3. Execute with orchestrated multi-agent coordination
4. Monitor via Mission Control dashboard

Missions inherit all project configuration (MCP, skills, hooks, droids, AGENTS.md). This maps to AIWG's Mission Control (`aiwg mc`) for long-running orchestration.

**Status**: Research preview.

---

## GitHub Integration

Install Factory's GitHub App for automated PR review and issue-driven development:

```text
/install-github-app
```

This enables:
- **@droid mentions** in issues/PRs to trigger agent workflows
- **Automatic PR review** on open/reopen events
- Custom droids for review (AIWG's code-reviewer droid)

Requires `FACTORY_API_KEY` as a GitHub repository secret.

---

## Troubleshooting

**Natural language not working?** Run regenerate:
```text
/aiwg-regenerate-agents
```

**Droids not found?** Redeploy and reimport:
```bash
aiwg use sdlc --provider factory --force
# Then: droid . → /droids → I → A → Enter
```

**MCP not connecting?** Check config:
```text
/mcp
# Verify AIWG server is listed and enabled
```

**Testing automation?** See the dedicated guide:
[Factory Testing Automation Hooks](factory-testing-hooks.md) — covers all 7 testing hook patterns, MD5 caching, coverage enforcement, and AIWG skill integration.

**Hooks not firing?** Verify settings:
```text
/settings
# Check hooksDisabled is false
```

---

## Reference

- [Factory AI Documentation](https://docs.factory.ai)
- [Factory AI Quickstart](factory-quickstart.md)
- [Factory MCP Details](factory-mcp-sidecar.md)
- [Cross-Platform Overview](cross-platform-overview.md)
- [Al Guide](../ralph-guide.md)
