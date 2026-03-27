# OpenCode Quick Start

OpenCode is an open-source terminal AI coding agent by Anomaly (opencode.ai). AIWG deploys agents, commands, skills, and rules natively to OpenCode's discovery paths.

---

## Install & Deploy

**1. Install OpenCode**

```bash
# macOS / Linux
brew install opencode

# npm
npm install -g opencode

# Or see https://opencode.ai/docs/ for all install options
```

**2. Install AIWG**

```bash
npm install -g aiwg
```

**3. Deploy to your project**

```bash
cd /path/to/your/project
aiwg use sdlc --provider opencode
```

**4. Initialize config**

Copy the AIWG config template to your project:

```bash
cp "$(aiwg runtime-info --aiwg-root)/agentic/code/frameworks/sdlc-complete/templates/opencode/opencode.json.aiwg-template" .opencode/opencode.json
```

Or create `.opencode/opencode.json` manually:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-sonnet-4-6",
  "mcp": {
    "aiwg": {
      "type": "local",
      "command": ["npx", "aiwg", "mcp", "serve"]
    }
  },
  "instructions": [
    "AGENTS.md",
    ".aiwg/instructions.md",
    ".opencode/rule/*.md"
  ]
}
```

The `instructions` array is how OpenCode loads rules — the `.opencode/rule/*.md` entry is required for AIWG rules to take effect.

**5. You're ready.** Run `opencode` in your project directory.

---

## What Gets Created

```text
.opencode/
├── agent/       # SDLC agent personas (natively discovered)
├── commands/    # Workflow commands (Ctrl+K palette)
├── skill/       # Skill definitions (natively discovered via SKILL.md)
└── rule/        # Context rules (loaded via instructions in opencode.json)

AGENTS.md        # Project context (auto-loaded by OpenCode)
.aiwg/           # SDLC artifacts
```

---

## Capability Details

| AIWG Artifact | Path | How OpenCode Uses It |
|---------------|------|---------------------|
| Agent personas | `.opencode/agent/` | Natively discovered — `{agent,agents}/**/*.md` |
| Commands | `.opencode/commands/` | Ctrl+K palette — `{command,commands}/**/*.md` |
| Skills | `.opencode/skill/` | Natively discovered — `{skill,skills}/**/SKILL.md` |
| Rules | `.opencode/rule/` | Loaded via `instructions` array in `opencode.json` |
| Project context | `AGENTS.md` | Auto-loaded (same file as Claude Code) |

---

## Using Commands

AIWG commands deploy to `.opencode/commands/` and appear in the command palette.

Press `Ctrl+K` to open the picker, then search:

```
project:project-status
project:flow-gate-check
project:security-gate
```

Commands use `project:` prefix. Subdirectory nesting maps to colon-separated IDs.

---

## Using Agents

AIWG agent personas are natively discovered from `.opencode/agent/`. OpenCode loads them as selectable agent personas.

To switch agents, use the agent list keybinding (`<leader>a` by default).

---

## Using Skills

Skills in `.opencode/skill/` are discovered when they contain a `SKILL.md` file. OpenCode loads them on demand when the agent recognizes a matching task.

---

## Models

Configure via `.opencode/opencode.json`:

**Anthropic (recommended for AIWG):**

```json
{
  "model": "anthropic/claude-sonnet-4-6",
  "small_model": "anthropic/claude-haiku-4-5-20251001"
}
```

**Other supported providers:** OpenAI, Gemini, Groq, OpenRouter, Bedrock, Azure, VertexAI, Ollama (via custom provider).

Run `opencode models` to list available models.

---

## Ralph Iterative Loops

```bash
aiwg ralph "Fix all tests" --completion "npm test passes" --provider opencode --model anthropic/claude-sonnet-4-6
```

See [Ralph Guide](../ralph-guide.md) for full documentation.

---

## Troubleshooting

**Rules not being applied?** Verify `instructions` in `.opencode/opencode.json` includes `.opencode/rule/*.md`.

**Commands not appearing in Ctrl+K?** Confirm deployment:
```bash
ls .opencode/commands/
```

**Agents not available?** Confirm deployment:
```bash
ls .opencode/agent/
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

```bash
aiwg mcp install opencode
```

See the [OpenCode MCP Sidecar Guide](opencode-mcp-sidecar.md) for complete setup.
