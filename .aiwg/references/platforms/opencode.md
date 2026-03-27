# OpenCode Platform Reference

**Status**: Archived upstream — targeting v0.0.55
**Last Updated**: 2026-03-27
**Source**: `opencode-ai/opencode` (archived 2025-09-18)
**Successor**: `charmbracelet/crush`

---

## Quick Reference

| Resource | Link |
|----------|------|
| Archived Repo | https://github.com/opencode-ai/opencode |
| Successor (Crush) | https://github.com/charmbracelet/crush |
| License | MIT |
| Language | Go + Bubble Tea TUI |
| Last Release | v0.0.55 (2025-06-27) |

---

## Archived Project Status

`opencode-ai/opencode` was archived by its author on 2025-09-18. The README states:

> *"This project is no longer maintained and has been archived for provenance. The project has continued under the name Crush, developed by the original author and the Charm team."*

AIWG currently targets the archived v0.0.55. Future AIWG versions should evaluate `charmbracelet/crush` as the successor provider.

---

## 1. Core Architecture

OpenCode is a terminal UI (TUI) AI coding assistant built in Go using the Bubble Tea framework. It provides:

- Multi-provider LLM support (Anthropic, OpenAI, Gemini, Groq, OpenRouter, Bedrock, Azure, VertexAI, Copilot)
- Four fixed internal agent roles
- Custom commands via Markdown files
- MCP server integration
- Context injection via `contextPaths`
- SQLite-backed session persistence with auto-compaction

---

## 2. Agent System

### 2.1 Internal Agents (Fixed)

OpenCode has four hard-coded internal agent roles. **There is no user-defined agent file format.**

| Agent | Role | Notes |
|-------|------|-------|
| `coder` | Primary interactive assistant (full tool set) | Configurable model |
| `task` | Subagent spawned by `agent` tool (read-only tools) | Configurable model |
| `title` | Auto-generates session titles (80 token limit) | Internal |
| `summarizer` | Compacts sessions when context fills | Internal |

### 2.2 Agent Configuration

Agents are configured by model assignment only. There is no schema for custom agent persona files.

```json
{
  "agents": {
    "coder": {
      "model": "claude-sonnet-4-5-20250929",
      "maxTokens": 8000,
      "reasoningEffort": "medium"
    },
    "task": {
      "model": "claude-haiku-4-5-20251001",
      "maxTokens": 4000
    }
  }
}
```

### 2.3 AIWG Agent Deployment

AIWG deploys agent persona files to `.opencode/agent/`. These files are **not natively discovered** by OpenCode. To have agent content injected into the system prompt, add `.opencode/agent/` to `contextPaths`:

```json
{
  "contextPaths": [
    "OpenCode.md",
    ".opencode/agent/"
  ]
}
```

This injects all agent files as raw context, not as discrete invocable personas.

---

## 3. Custom Commands

### 3.1 Discovery

OpenCode discovers command files from:

| Scope | Path | Prefix |
|-------|------|--------|
| Project | `<project>/.opencode/commands/` | `project:` |
| User (XDG) | `$XDG_CONFIG_HOME/opencode/commands/` | `user:` |
| User (home) | `~/.opencode/commands/` | `user:` |

**Important:** The project commands path is `.opencode/commands/` (plural). AIWG currently deploys to `.opencode/command/` (singular) — this is a known path mismatch. See child issue filed from #564.

### 3.2 Command Format

Commands are plain `.md` files. The filename (without extension) is the command ID.

```markdown
Review staged changes with `git diff --cached`, write a conventional commit message, and run `git commit`.
```

Named arguments use `$NAME` syntax (uppercase, must start with letter):

```markdown
Analyze issue $ISSUE_NUMBER and create a fix on a new branch.
```

When named args are present, OpenCode prompts for each value interactively before sending.

### 3.3 Invocation

Commands are invoked via the `Ctrl+K` command picker. There is **no slash-command syntax** in OpenCode.

Subdirectory nesting maps to colon-separated IDs: `git/commit.md` → `project:git:commit`

---

## 4. Rules System

OpenCode has **no dedicated rules system**. There is no MDC format, no `.opencode/rule/` discovery, and no scoping mechanism for rules files.

Rules content is injected via `contextPaths`. AIWG deploys rules to `.opencode/rule/` and users must add this path to `contextPaths` to use them:

```json
{
  "contextPaths": [
    "OpenCode.md",
    "CLAUDE.md",
    ".opencode/rule/"
  ]
}
```

---

## 5. Skills System

OpenCode has **no skills system**. There is no `.opencode/skill/` discovery, no NL trigger patterns, and no skill invocation mechanism.

AIWG skill files deployed to `.opencode/skill/` are ignored by OpenCode. They are AIWG-internal artifacts only.

---

## 6. Context Files (`contextPaths`)

OpenCode's primary context mechanism is `contextPaths` — a list of files/directories injected into the coder and task agent system prompts.

### 6.1 Default `contextPaths`

The following paths are loaded automatically (hardcoded defaults):

```go
var defaultContextPaths = []string{
    ".github/copilot-instructions.md",
    ".cursorrules",
    ".cursor/rules/",
    "CLAUDE.md",
    "CLAUDE.local.md",
    "opencode.md",
    "opencode.local.md",
    "OpenCode.md",
    "OpenCode.local.md",
    "OPENCODE.md",
    "OPENCODE.local.md",
}
```

**Note:** `.opencode/rule/` and `.opencode/agent/` are **not** in the defaults.

### 6.2 Custom `contextPaths`

Override defaults in `.opencode.json`:

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

### 6.3 Directory Loading

Paths ending in `/` are directory walks — all files in that directory are loaded. Files are concatenated in the system prompt as:

```
# From: .opencode/rule/token-security.md
<file content>
```

### 6.4 Implementation Notes

- Context paths are loaded once at startup (`sync.Once`) — restart required after config changes
- Files are loaded in parallel goroutines; concatenation order is non-deterministic
- Case-insensitive deduplication prevents loading the same file twice
- `OpenCode.md` is documented as the native "memory file" for storing preferences and codebase notes

---

## 7. MCP Integration

MCP is a first-class feature in OpenCode. Configuration in `.opencode.json`:

```json
{
  "mcpServers": {
    "aiwg": {
      "type": "stdio",
      "command": "aiwg",
      "args": ["mcp", "serve"]
    },
    "remote-tool": {
      "type": "sse",
      "url": "https://example.com/mcp",
      "headers": {
        "Authorization": "Bearer token"
      }
    }
  }
}
```

**Transport types:**
- `stdio` — subprocess via `command` + `args`
- `sse` — remote server via `url` + optional `headers`

**Tool discovery:**
- MCP tools are discovered at startup via `ListTools`
- Tool names are namespaced: `{serverName}_{toolName}` (e.g., `aiwg_workflow-run`)
- Tools are available to the `coder` agent only, not the `task` subagent
- Restart required after adding/removing MCP servers (tools cached after first load)

**Permission model:**
- Each MCP tool call shows a user permission prompt before execution

---

## 8. Session Model

Sessions are stored in a SQLite database under `.opencode/` (data directory).

| Feature | Behavior |
|---------|----------|
| Persistence | SQLite; survives restarts |
| Auto-compact | Enabled by default; triggers at ~95% context fill |
| Summarization | `summarizer` agent compresses history |
| Sub-sessions | `task` agent runs create isolated sub-sessions |
| Session resume | Supported via `-s <session-id>` |

---

## 9. Model Configuration

### 9.1 Supported Providers

| Provider | Auth |
|----------|------|
| `anthropic` | `ANTHROPIC_API_KEY` |
| `openai` | `OPENAI_API_KEY` |
| `gemini` | `GEMINI_API_KEY` |
| `groq` | `GROQ_API_KEY` |
| `openrouter` | `OPENROUTER_API_KEY` |
| `bedrock` | AWS env vars |
| `azure` | `AZURE_OPENAI_ENDPOINT` |
| `vertexai` | `VERTEXAI_PROJECT` + `VERTEXAI_LOCATION` |
| `copilot` | `GITHUB_TOKEN` or token file |
| `local` | `LOCAL_ENDPOINT` (OpenAI-compatible) |

### 9.2 Provider Auto-Detection

OpenCode detects providers from environment variables. Priority order: Copilot → Anthropic → OpenAI → Gemini → Groq → OpenRouter → XAI → Bedrock → Azure → VertexAI.

### 9.3 Reasoning Effort

Supported for OpenAI and Anthropic models with reasoning capabilities. Configure per agent: `"low"`, `"medium"`, `"high"`.

---

## 10. AIWG Integration Summary

| AIWG Feature | Mechanism | Notes |
|--------------|-----------|-------|
| Agent personas | `contextPaths` | Requires manual config; injected as raw text |
| Commands | `.opencode/commands/` | Ctrl+K picker; **path fix needed in AIWG provider** |
| Rules | `contextPaths` | Requires manual config |
| Skills | None | Not read by OpenCode |
| MCP workflows | `mcpServers` in `.opencode.json` | Recommended integration path |
| Context file | `OpenCode.md` | Auto-loaded; AIWG writes here |
| Ralph loops | `opencode run --format json` | Headless mode supported |

---

## 11. Known Issues

### 11.1 Command Path Mismatch

AIWG deploys commands to `.opencode/command/` (singular) but OpenCode reads from `.opencode/commands/` (plural). Commands are not discovered until this is fixed in the provider deployment code.

**Tracking:** Child issue filed from #564.

### 11.2 No Native Agent or Skills Support

AIWG's capability matrix lists OpenCode agents as "native" — this is inaccurate. OpenCode has no user-defined agent file format. AIWG agent files require `contextPaths` configuration to have any effect.

### 11.3 Upstream Archived

The `opencode-ai/opencode` project is archived. No further updates will be released. AIWG should evaluate `charmbracelet/crush` as a successor provider.

---

## References

- Upstream source: `opencode-ai/opencode` (archived)
- AIWG provider code: `tools/agents/providers/opencode.mjs`
- AIWG Ralph adapter: `tools/ralph-external/lib/opencode-adapter.mjs`
- Config templates: `agentic/code/frameworks/sdlc-complete/templates/opencode/`
- Integration guide: `docs/integrations/opencode-quickstart.md`
- MCP guide: `docs/integrations/opencode-mcp-sidecar.md`
