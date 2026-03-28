# GitHub Copilot Reference

> **AIWG Provider** — Authoritative reference for GitHub Copilot extensibility features, configuration, and integration patterns.

**Last Updated**: 2026-03-27
**Coverage**: VS Code Copilot Chat, Agent Mode, Coding Agent, Extensions
**Maintainer**: AIWG Team

---

## Quick Reference

| Resource | Link |
|----------|------|
| Official Docs | https://docs.github.com/en/copilot |
| VS Code Copilot Docs | https://code.visualstudio.com/docs/copilot |
| Custom Agents | https://code.visualstudio.com/docs/copilot/customization/custom-agents |
| Custom Instructions | https://docs.github.com/en/copilot/customizing-copilot/adding-repository-custom-instructions-for-github-copilot |
| Prompt Files | https://code.visualstudio.com/docs/copilot/customization/prompt-files |
| MCP Configuration | https://code.visualstudio.com/docs/copilot/reference/mcp-configuration |
| Coding Agent | https://docs.github.com/en/copilot/using-github-copilot/coding-agent |
| Copilot Extensions | https://docs.github.com/en/copilot/building-copilot-extensions |

---

## 1. Product Landscape

GitHub Copilot spans several distinct products:

| Product | Where It Runs | How It Works |
|---------|--------------|--------------|
| **Copilot Chat** | VS Code, JetBrains, GitHub.com | Interactive chat with code context |
| **Agent Mode** | VS Code | Autonomous local coding — plans, edits, runs commands, iterates |
| **Coding Agent** | GitHub Actions (cloud) | Assigns to issues/PRs, creates PRs autonomously |
| **Copilot Workspace** | github.com | Separate task-centric dev environment |
| **Copilot Extensions** | Marketplace | GitHub App-based integrations |

### Agent Mode vs. Coding Agent

These share branding but are architecturally different:

- **Agent Mode** runs locally in VS Code, edits files directly, calls MCP tools, requires user approval for changes
- **Coding Agent** runs in a cloud sandbox (GitHub Actions), triggered by `@copilot` mentions in issues/PRs, always creates a PR for human review

---

## 2. Custom Agents

### File Format

Location: `.github/agents/*.agent.md`

Format: Markdown with YAML frontmatter. The body is the system prompt.

```markdown
---
name: Security Reviewer
description: Performs security audits on code changes
tools: ['search/codebase', 'search/usages', 'web/fetch', 'edit']
agents: ['*']
model: ['claude-opus-4-5', 'gpt-4o']
argument-hint: "Describe the code to review"
user-invocable: true
disable-model-invocation: false
target: vscode
mcp-servers:
  - type: stdio
    command: npx
    args: ['-y', '@company/security-mcp']
hooks:
  PostToolUse:
    - type: command
      command: "./scripts/lint.sh"
handoffs:
  - label: Create Fix PR
    agent: implementer
    prompt: "Now implement the fixes outlined above."
    send: false
    model: "gpt-4o (copilot)"
---

You are a security reviewer. For each review:
1. Check for injection vulnerabilities
2. Verify authentication patterns
3. Report findings with severity ratings
```

### Field Reference

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `name` | No | string | Defaults to filename; shown in agents dropdown |
| `description` | No | string | Placeholder text in chat input |
| `tools` | No | string[] | Built-in tools or `server-name/*` for MCP |
| `agents` | No | string[] | `['*']` = all, `[]` = none |
| `model` | No | string or string[] | Array = prioritized fallback list |
| `argument-hint` | No | string | Guidance shown in chat input |
| `user-invocable` | No | boolean | Default: `true` |
| `disable-model-invocation` | No | boolean | Prevents other agents calling this one |
| `target` | No | string | `vscode` or `github-copilot` |
| `mcp-servers` | No | array | MCP config scoped to this agent |
| `hooks` | No | object | Lifecycle hooks (Preview) |
| `handoffs` | No | array | Suggested next-agent transitions |

No fields are strictly required. Unavailable tools are silently ignored.

### Built-in Tool Names

| Tool | Purpose |
|------|---------|
| `search/codebase` | Semantic codebase search (read-only) |
| `search/usages` | Find symbol usage patterns |
| `web/fetch` | HTTP requests |
| `edit` | Code editing |
| `read/terminalLastCommand` | Terminal output access |
| `agent` | Subagent invocation |

### Target Field

- `target: vscode` — agent appears in VS Code agent mode only (default)
- `target: github-copilot` — agent surfaces through the cloud coding agent

---

## 3. Custom Instructions

### Repository-Wide (Always Active)

**Path**: `.github/copilot-instructions.md`

Applied automatically to all Copilot Chat requests in the repo context. No frontmatter needed. Supported in VS Code and on GitHub.com.

### Path-Scoped (Conditional)

**Path**: `.github/instructions/*.instructions.md`

Applied only when the active file matches the `applyTo` glob pattern:

```yaml
---
name: TypeScript Rules
description: Style rules for TypeScript files
applyTo: '**/*.ts,**/*.tsx'
---

Use strict TypeScript. Prefer interfaces over types. Always use explicit return types.
```

If `applyTo` is omitted, the file is not auto-applied but can be manually attached.

User-level instructions: `~/.copilot/instructions/`

### Organization-Level

Configured via GitHub.com organization settings (not a committed file).

### Priority Order

All applicable instruction sets are **combined** (not overridden):

1. Personal/user-level instructions (highest)
2. Repository instructions (`.github/copilot-instructions.md`)
3. Organization instructions

### Character Limits

No specific character limit documented for manually-authored files. The "no longer than 2 pages" guidance applies only to agent-generated instruction files.

### Cross-Platform Compatibility

VS Code also reads:
- `AGENTS.md` — recognized by Copilot (experimental nested-folder support)
- `CLAUDE.md` — recognized by Copilot
- `chat.instructionsFilesLocations` setting defaults include `.github/instructions` and `~/.claude/rules`

---

## 4. Prompt Files (Custom Slash Commands)

**Path**: `.github/prompts/*.prompt.md` (workspace) or `prompts/` (user-level)

Prompt files act as custom slash commands invoked by typing `/name` in Copilot Chat.

```markdown
---
name: create-react-component
description: Scaffold a new React component with tests
agent: agent
model: gpt-4o
tools: ['edit', 'search/codebase']
argument-hint: "Component name and props"
---

Create a React component named `${input:componentName}`.

Follow the project conventions in [conventions.md](../docs/conventions.md).

Include:
1. The component file
2. A co-located test file
3. A Storybook story
```

### Field Reference

| Field | Notes |
|-------|-------|
| `name` | Slash command name |
| `description` | Shown in command palette |
| `agent` | Which agent processes this prompt |
| `model` | Model to use |
| `tools` | Available tools |
| `argument-hint` | Input guidance |

### Variables

- `${selection}` — currently selected code
- `${input:varName}` — user input prompt
- `#tool:<tool-name>` — inline tool invocation

---

## 5. MCP Support

### VS Code (Agent Mode and Copilot Chat)

**Status**: GA

**Configuration**: `.vscode/mcp.json` (workspace-scoped, team-shareable)

```json
{
  "servers": {
    "aiwg": {
      "type": "stdio",
      "command": "aiwg",
      "args": ["mcp", "serve"]
    },
    "remote-server": {
      "type": "http",
      "url": "https://mcp.example.com/mcp"
    },
    "auth-server": {
      "type": "http",
      "url": "https://api.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${input:api-key}"
      }
    }
  },
  "inputs": [
    {
      "type": "promptString",
      "id": "api-key",
      "description": "Your API Key",
      "password": true
    }
  ]
}
```

**Supported types**: `stdio`, `http`, `sse`

**Capabilities**: Tools are auto-invoked in agent mode. MCP servers also deliver prompts (invokable as `/mcp.servername.promptname`) and resources.

**Sandbox**: Available on macOS/Linux with filesystem and network access rules.

### Coding Agent (GitHub.com)

**Status**: GA

**Configuration**: GitHub.com > Settings > Copilot > Coding agent (JSON in UI, NOT a committed file)

```json
{
  "mcpServers": {
    "sentry": {
      "type": "http",
      "url": "https://mcp.sentry.io",
      "tools": ["get_issue_details", "get_issue_summary"]
    },
    "local-tool": {
      "type": "local",
      "command": "npx",
      "args": ["-y", "@company/tool"],
      "tools": "*"
    }
  }
}
```

The coding agent supports MCP tools only (not resources or prompts). Tools are used autonomously without approval prompts.

---

## 6. Built-in Slash Commands

VS Code Copilot Chat provides:

| Command | Purpose |
|---------|---------|
| `/explain` | Explain code or concepts |
| `/fix` | Fix errors or quality issues |
| `/tests` | Generate tests |
| `/doc` | Generate documentation comments |
| `/plan` | Create implementation plans |
| `/new` | Scaffold new workspace or file |
| `/newNotebook` | Scaffold Jupyter notebook |
| `/agents` | List available agents |
| `/instructions` | List active instructions |
| `/prompts` | List available prompt files |

---

## 7. Copilot Extensions

Copilot Extensions are a distinct model from custom agents — they predate `.github/agents/` and require GitHub App infrastructure.

| Type | Distribution | Requirements |
|------|-------------|-------------|
| Public | GitHub Marketplace | GitHub App registration + webhook handler |
| Private | Org-internal | GitHub App + internal API |

Invoked via `@extension-name` in Copilot Chat. Extensions receive the conversation via webhook and return streaming SSE responses.

Partners include DataStax, Docker, MongoDB, Stripe, Sentry, Azure.

---

## 8. Copilot Workspace

Copilot Workspace is a **separate product** — a task-centric development environment on github.com.

- Initiated from GitHub Issues, PRs, or repositories
- Generates step-by-step plans in natural language
- All proposals are editable before application
- Includes integrated terminal for testing
- Shareable collaboration links

**Does NOT use** `.github/agents/` or the VS Code extensibility model. AIWG's deployment model does not apply to Copilot Workspace.

---

## 9. Vision and Multimodal

Copilot supports image input:
- Agent mode in VS Code: image attachments as context
- Coding agent: images can be added to agent sessions
- Model-dependent (available when selected model supports vision)
- No explicit YAML field to enable/disable per agent

---

## 10. Coding Agent Details

### How It Works

1. Mention `@copilot` in a GitHub Issue, PR, or security alert
2. Agent explores the codebase in a GitHub Actions sandbox
3. Makes changes, runs tests and linters
4. Opens a pull request for human review

### Configuration

- Custom instructions: reads `.github/copilot-instructions.md`
- Custom agents: `target: github-copilot` agents available (in development)
- MCP servers: configured via GitHub.com Settings UI
- Validation tools: configurable per repository
- Firewall settings: network access control

### Recent Improvements (Early 2026)

- 50% faster session startup
- Semantic code search
- Traceable session logs
- Jira integration (public preview)
- Image input support

---

## 11. AIWG Integration Mapping

### Current AIWG Deployment (via `aiwg use sdlc --provider copilot`)

| AIWG Artifact | Deployed To | Copilot Discovery |
|--------------|-------------|-------------------|
| Agents | `.github/agents/` | Native (but format needs `.agent.md`) |
| Commands | `.github/agents/` (as YAML agents) | Should use `.github/prompts/` |
| Skills | `.github/skills/` | Not natively discovered |
| Rules | `.github/copilot-rules/` | Not natively discovered |
| Instructions | `.github/copilot-instructions.md` | Native |

### Recommended Alignment

| AIWG Artifact | Recommended Target | Rationale |
|--------------|-------------------|-----------|
| Agents | `.github/agents/*.agent.md` | Official format with YAML frontmatter + markdown body |
| Commands | `.github/prompts/*.prompt.md` | Official custom slash command mechanism |
| Rules | `.github/instructions/*.instructions.md` | Path-scoped with `applyTo` globs |
| Skills | `.github/prompts/*.prompt.md` | Closest official equivalent |
| Instructions | `.github/copilot-instructions.md` | Already correct |
| MCP config | `.vscode/mcp.json` | Official VS Code MCP configuration |

### Tool Mapping (AIWG to Copilot)

| AIWG Tool | Copilot Tool | Notes |
|-----------|-------------|-------|
| Read | `search/codebase` | Read-only codebase access |
| Write | `createFile` | File creation |
| Edit, MultiEdit | `edit` | Code editing |
| Bash | `runInTerminal` | Shell execution |
| WebFetch | `web/fetch` | HTTP requests |
| Glob, Grep | `search/codebase` | File and content search |
| Task | `agent` | Subagent invocation |

---

## 12. Directory Structure Summary

```
.github/
├── agents/                          # Custom agent definitions
│   ├── architecture-designer.agent.md
│   ├── security-reviewer.agent.md
│   └── ...
├── prompts/                         # Custom slash commands (prompt files)
│   ├── security-review.prompt.md
│   ├── generate-tests.prompt.md
│   └── ...
├── instructions/                    # Path-scoped conditional rules
│   ├── typescript.instructions.md
│   ├── security.instructions.md
│   └── ...
├── copilot-instructions.md          # Repository-wide instructions
└── workflows/                       # GitHub Actions (CI/CD)

.vscode/
└── mcp.json                         # MCP server configuration
```

---

## Changelog

| Date | Change |
|------|--------|
| 2026-03-27 | Initial creation — full capability audit |
