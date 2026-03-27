# OpenCode Quick Start

> **Archived Project Notice:** `opencode-ai/opencode` was archived in September 2025. The successor project is [`charmbracelet/crush`](https://github.com/charmbracelet/crush). AIWG currently targets OpenCode v0.0.55. See the [platform reference](.aiwg/references/platforms/opencode.md) for full status notes.

---

## Install & Deploy

**1. Install OpenCode**

```bash
# macOS / Linux
brew install opencode-ai/tap/opencode

# Or from source
go install github.com/opencode-ai/opencode@latest
```

**2. Install AIWG**

```bash
npm install -g aiwg
```

**3. Deploy to your project**

```bash
cd /path/to/your/project

# Deploy all artifact types for OpenCode
aiwg use sdlc --provider opencode
```

**4. Configure context loading**

AIWG rules and agents are deployed to `.opencode/rule/` and `.opencode/agent/`. To have OpenCode load them as context, add these paths to `contextPaths` in your `.opencode.json`:

```json
{
  "contextPaths": [
    "OpenCode.md",
    "CLAUDE.md",
    ".opencode/rule/",
    ".opencode/agent/"
  ]
}
```

Without this step, OpenCode only loads `OpenCode.md` and `CLAUDE.md` by default.

**5. Configure MCP (optional)**

```bash
aiwg mcp install opencode
```

See the [OpenCode MCP Sidecar Guide](opencode-mcp-sidecar.md) for the recommended full-access setup.

**6. You're ready.** See the [Intake Guide](#intake-guide) for starting projects.

---

## What Gets Created

```text
.opencode/
├── agent/       # SDLC agent personas (loaded via contextPaths — see step 4)
├── commands/    # Workflow commands (invoked via Ctrl+K palette)
├── skill/       # Skill definitions (AIWG-internal; not natively discovered)
└── rule/        # Context rules (loaded via contextPaths — see step 4)

OpenCode.md      # Project context (auto-loaded by OpenCode)
.aiwg/           # SDLC artifacts
```

> **How OpenCode discovers files:** OpenCode does not auto-discover agents, rules, or skills from `.opencode/` sub-directories. It loads files listed explicitly in `contextPaths` and discovers commands from `.opencode/commands/`. See [Capability Details](#capability-details) below.

---

## Using Commands

AIWG commands are deployed to `.opencode/commands/` and appear in OpenCode's command palette.

**Invoke commands:**

Press `Ctrl+K` inside OpenCode to open the command picker, then search for the command:

```
project:project-status
project:flow-gate-check
project:security-gate
```

> **Note:** OpenCode uses `Ctrl+K` for command invocation, not slash-command syntax. Commands are prefixed with `project:` for project-scoped commands.

---

## Using Agents

OpenCode does not have a first-class agent invocation system equivalent to Claude Code's `@-mention`. AIWG agent definitions in `.opencode/agent/` are loaded as context injections (when configured in `contextPaths`) rather than discrete AI personas.

**Recommended approach:** Use MCP to access AIWG's full agent orchestration capabilities from within OpenCode. See the [MCP Sidecar Guide](opencode-mcp-sidecar.md).

---

## Capability Details

| AIWG Artifact | Path | How OpenCode Uses It |
|---------------|------|---------------------|
| Agent personas | `.opencode/agent/` | Context injection via `contextPaths` |
| Commands | `.opencode/commands/` | Ctrl+K palette (native discovery) |
| Skills | `.opencode/skill/` | AIWG-internal only; not read by OpenCode |
| Rules | `.opencode/rule/` | Context injection via `contextPaths` |
| Project context | `OpenCode.md` | Auto-loaded by OpenCode (default) |

---

## Models

OpenCode supports multiple provider families. Configure via `.opencode.json`:

**Anthropic (recommended for AIWG):**

```json
{
  "agents": {
    "coder": {
      "model": "claude-sonnet-4-5-20250929",
      "maxTokens": 8000
    },
    "task": {
      "model": "claude-haiku-4-5-20251001",
      "maxTokens": 4000
    }
  }
}
```

**Other supported providers:** OpenAI, Gemini, Groq, OpenRouter, Bedrock, Azure, VertexAI, GitHub Copilot.

Run `opencode models` to list available models for your configured providers.

---

## Ralph Iterative Loops

Ralph loops support multi-provider execution through the AIWG CLI:

```bash
# Anthropic tier
aiwg ralph "Fix all tests" --completion "npm test passes" --provider opencode --model anthropic/claude-sonnet-4-5-20250929
```

OpenCode's headless mode (`opencode run --format json`) is used for Ralph loop execution.

See [Ralph Guide](../ralph-guide.md) for full documentation.

---

## Troubleshooting

**Rules/agents not being applied?** Add paths to `contextPaths` in `.opencode.json`:
```json
{
  "contextPaths": ["OpenCode.md", "CLAUDE.md", ".opencode/rule/", ".opencode/agent/"]
}
```

**Commands not appearing in Ctrl+K?** Confirm AIWG deployed to `.opencode/commands/` (plural):
```bash
ls .opencode/commands/
```

**Redeploy if needed:**
```bash
aiwg use sdlc --provider opencode --force
```

**MCP not connecting?** Test directly:
```bash
aiwg mcp serve
```

---

## MCP Sidecar (Recommended for Full Access)

The MCP sidecar is the recommended path for unrestricted AIWG tool access:

```bash
aiwg mcp install opencode
```

See the [OpenCode MCP Sidecar Guide](opencode-mcp-sidecar.md) for complete setup.
