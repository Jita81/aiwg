# Cursor Reference

> **AIWG Provider** - Authoritative reference for Cursor IDE features, configuration, and integration patterns.

**Last Updated**: 2026-03-27
**Cursor Version**: 2.x (post 2.4)
**Coverage**: 0.x through 2.4
**Maintainer**: AIWG Team

---

## Quick Reference

| Resource | Link |
|----------|------|
| Official Docs | https://cursor.com/docs |
| Changelog | https://cursor.com/changelog |
| Cloud Agents | https://cursor.com/agents |
| Rules Docs | https://cursor.com/docs/context/rules |
| MCP Docs | https://cursor.com/docs/mcp |
| Plugin Marketplace | https://cursor.com/marketplace |

---

## 1. Rules System

### 1.1 Storage Tiers (Priority: Highest to Lowest)

| Tier | Location | Scope |
|------|----------|-------|
| **Team Rules** | Cursor web dashboard | Organization-wide (Team/Enterprise plans) |
| **Project Rules** | `.cursor/rules/*.mdc` | Project-specific, version-controlled |
| **User Rules** | Cursor Settings > Rules | Global across all projects (Agent/Chat only) |

**User Rules Limitation**: User Rules apply only to Agent/Chat mode — not to Inline Edit (Cmd+K) or Cursor Tab (autocomplete).

### 1.2 File Formats

| Format | Extension | Frontmatter | Notes |
|--------|-----------|-------------|-------|
| MDC (recommended) | `.mdc` | YAML frontmatter supported | Full rule type control |
| Markdown | `.md` | None | Always-on rules only |

### 1.3 MDC Frontmatter Schema

```yaml
---
description: "Human-readable purpose; presented to Agent for relevance decisions"
globs: ["src/components/**/*.tsx", "**/*.ts"]
alwaysApply: false
---
```

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| `description` | string | Required for auto/agent-requested rules | Presented to Agent to decide if rule is relevant |
| `globs` | string[] | Required for file-scoped rules | Gitignore-style path patterns controlling activation |
| `alwaysApply` | boolean | Optional (default: false) | When `true`, rule applies to every session unconditionally |

The schema is intentionally minimal — only these three fields are documented.

### 1.4 Rule Types

| Type | Configuration | How It Activates |
|------|---------------|------------------|
| **Always Apply** | `alwaysApply: true` | Injected into every session unconditionally |
| **Apply Intelligently** | `alwaysApply: false`, description set, no globs | Agent evaluates description to determine relevance |
| **File-Scoped** | `globs` set | Activates when any referenced file matches glob pattern |
| **Manual** | No `alwaysApply`, no `globs` | Only active when user types `@rule-name` in chat |

### 1.5 Nesting

`.cursor/rules/` supports nested subdirectories. Rules in subdirectories are available globally unless scoped by globs. No automatic inheritance by directory placement — inheritance behavior applies specifically to `AGENTS.md` (see Section 5).

### 1.6 .cursorrules vs .cursor/rules/

| File | Status | Notes |
|------|--------|-------|
| `.cursorrules` | **Legacy, functionally deprecated** | Not mentioned in current docs |
| `.cursor/rules/` | **Current, recommended** | Full frontmatter support |
| `AGENTS.md` | **Active alternative** | Simpler, supports directory inheritance |

The `.cursorrules` root-level file predates the `.cursor/rules/` directory system. Current Cursor docs focus entirely on `.cursor/rules/` and `AGENTS.md`. The `/migrate-to-skills` command (Cursor 2.4) further suggests migration away from legacy formats.

**AIWG Implication**: The `aiwg-regenerate-cursorrules` command generates `.cursorrules` for backward compatibility, but the primary deployment target is `.cursor/rules/` with MDC format.

### 1.7 Rule Creation Methods

- `/create-rule` command in Cursor chat
- Cursor Settings panel (`Cursor Settings > Rules, Commands`)
- Manual `.mdc` file creation in `.cursor/rules/`

### 1.8 Best Practices (from Cursor docs)

- Keep rules under 500 lines; split large rules into composable units
- Reference files with `@filename.ts` rather than copying code inline
- Avoid duplicating linter configurations or common tool documentation

---

## 2. Agent Mode

### 2.1 Invocation

| Action | Shortcut |
|--------|----------|
| Open Agent | `Cmd+I` (Mac) / `Ctrl+I` (Windows/Linux) |
| Toggle Plan Mode | `Shift+Tab` |
| Toggle layout | `Cmd+E` |
| Queue follow-up | `Enter` (queued) / `Cmd+Enter` (immediate) |

### 2.2 Available Tools

No limit on tool calls per session. Agent selects tools automatically.

| Tool | Description |
|------|-------------|
| Semantic search | Searches indexed codebase by meaning (vector embeddings) |
| File/folder search | Locates files by name, navigates directory structure |
| Web search | Generates queries and searches the internet |
| Rules retrieval | Fetches relevant rules by type and description |
| File reading | Reads file contents including images (PNG, JPG, GIF, WebP, SVG) and PDFs (2.4+) |
| File editing | Suggests and auto-applies edits |
| Shell commands | Executes terminal commands, monitors output |
| Browser control | Takes screenshots, navigates pages, verifies visual changes |
| Image generation | Generates images from text/reference; saves to `assets/` |
| Clarifying questions | Asks for user input while continuing background work |
| MCP tools | Any tools exposed by configured MCP servers |

### 2.3 Context Sources

Agent context is assembled from:

- Active rules (always-apply and file-matched)
- Explicitly @-mentioned files, folders, code symbols, or docs
- Open editor files and terminal output (automatically included)
- Codebase index (via semantic search tool when invoked)
- Linting errors, recent changes (auto-gathered by agent as needed — no manual @-mentions required since 2.0)
- Conversation history
- Images (dragged/pasted)

### 2.4 Plan Mode

Accessed via `Shift+Tab`. Agent researches the codebase and creates a comprehensive implementation plan for human review before any code is written. Recommended for complex multi-file changes and architectural decisions.

### 2.5 Checkpoints

Agent automatically saves codebase snapshots before significant changes. Users can preview and restore previous states without affecting Git history.

### 2.6 Multi-Agent / Worktrees (2.0+)

Up to 8 agents can run in parallel using Git worktrees. Each agent gets an isolated worktree copy. Configure via `Cursor Settings > Worktrees` or `.cursor/worktrees.json`. Maximum 20 worktrees per workspace. LSP support not yet available in worktrees.

### 2.7 Subagents (2.4+)

Agents can spawn independent subagents for discrete tasks with custom prompts, tool access, and configurable models. An "Explore subagent" is invoked automatically for broad codebase search.

### 2.8 Memories (Beta, 1.0+)

Agent remembers facts from conversations and references them in future sessions. Stored per project at user level. Managed from Settings.

---

## 3. Cloud Agents (formerly Background Agents)

Renamed from "Background Agents" to **Cloud Agents** in Cursor 1.0.

### 3.1 How They Work

Cloud Agents run in isolated cloud-hosted VMs:
- Clone the target repository from GitHub or GitLab
- Work on separate branches
- Push changes back when complete
- Can build, test, and interact within their VM
- Support desktop and browser automation (computer use)
- Run "Max Mode" exclusively (cannot be disabled)

### 3.2 Invocation Methods

| Channel | How to Trigger |
|---------|----------------|
| Cursor Web | cursor.com/agents |
| Cursor Desktop | "Cloud" dropdown in chat |
| Slack | @cursor command |
| GitHub | @cursor comment on PRs or issues |
| Linear | @cursor command |
| API | Direct API integration |

### 3.3 Limitations

- **Repository support**: GitHub and GitLab only (Bitbucket "coming later")
- Max Mode always active; cannot be disabled
- Requires trial or paid plan with on-demand usage
- Users must set spend limits at launch
- Default VM has limited CPU/memory (Enterprise can request increases)

### 3.4 MCP in Cloud Agents

Cloud Agents **fully support MCP servers**. Both HTTP and stdio transports work. OAuth is supported. Configuration managed through MCP dropdown at cursor.com/agents.

### 3.5 Automations (March 2026)

Cloud Agents can be triggered automatically via:
- Slack, Linear, GitHub, PagerDuty, Webhooks

Automation agents include a memory tool for persisting knowledge across executions.

### 3.6 Environment Configuration

- **Repository-level**: `.cursor/environment.json` (Dockerfile-based for custom system dependencies)
- **Secrets**: Managed via cursor.com/dashboard/cloud-agents Secrets tab (encrypted at rest, exposed as env vars)
- **AGENTS.md**: At repo root, should contain cloud-specific setup and testing guidance

---

## 4. MCP Support

### 4.1 Configuration Locations

| Scope | Path | When to Use |
|-------|------|-------------|
| Project-level | `.cursor/mcp.json` | Project-specific, version-controlled |
| Global | `~/.cursor/mcp.json` | Tools available across all workspaces |

Both can coexist.

### 4.2 Configuration Format

**Local (stdio) server:**
```json
{
  "mcpServers": {
    "server-name": {
      "command": "aiwg",
      "args": ["mcp", "serve"],
      "env": {"API_KEY": "${env:API_KEY}"},
      "envFile": ".env"
    }
  }
}
```

**Remote (HTTP) server:**
```json
{
  "mcpServers": {
    "remote-server": {
      "url": "https://api.example.com/mcp",
      "headers": {"Authorization": "Bearer ${env:TOKEN}"},
      "auth": {
        "CLIENT_ID": "your-id",
        "CLIENT_SECRET": "your-secret",
        "scopes": ["read", "write"]
      }
    }
  }
}
```

### 4.3 Transport Types

| Transport | Use Case | Auth |
|-----------|----------|------|
| **stdio** | Local processes (single user) | Manual env vars |
| **SSE** | Local or remote (multi-user) | OAuth |
| **Streamable HTTP** | Local or remote (multi-user) | OAuth |

### 4.4 Supported MCP Capability Types

All six MCP capabilities are supported:

| Type | Description |
|------|-------------|
| **Tools** | Functions the AI model can execute |
| **Prompts** | Templated messages and workflows |
| **Resources** | Structured data sources for reading |
| **Roots** | Server-initiated URI/filesystem boundary inquiries |
| **Elicitation** | Server-initiated requests for user information |
| **Apps** | Interactive UI views returned by MCP tools |

### 4.5 Tool Approval Model

- Default: Agent requests approval before each MCP tool call
- Users can inspect arguments before approving
- Auto-run mode: configurable via settings UI or `~/.cursor/permissions.json`
- Permissions format: `"server:tool"` syntax with wildcard support (e.g., `"github:*"`)

### 4.6 Variable Interpolation

Supported in config values:
- `${env:NAME}` — environment variable
- `${userHome}` — user home directory
- `${workspaceFolder}` — current workspace path
- `${workspaceFolderBasename}` — workspace folder name
- `${pathSeparator}` or `${/}` — OS-specific path separator

### 4.7 OAuth

Fixed redirect URL: `cursor://anysphere.cursor-mcp/oauth/callback`

### 4.8 Cursor 2.4 Change

MCP server definitions now live as JSON files in `.cursor` directories. Agents discover and load MCPs only when needed, reducing token usage and keeping context focused.

### 4.9 Debugging

MCP logs accessible via Output panel (`Cmd+Shift+U`), selecting "MCP Logs." Servers can be toggled on/off through Settings without removal.

---

## 5. AGENTS.md

`AGENTS.md` is a simpler alternative to `.cursor/rules/` that uses plain markdown without frontmatter.

**Key feature**: Files in subdirectories automatically inherit and combine instructions from parent `AGENTS.md` files, with deeper instructions taking precedence. This is ideal for monorepo setups with area-specific instructions.

Both `.cursor/rules/` and `AGENTS.md` are described as "two approaches" rather than competing systems — they are additive.

---

## 6. Skills System (2.4+)

Cursor 2.4 introduced a Skills system (`.cursor/skills/*/SKILL.md`) that enables dynamic on-demand context loading as an alternative to always-on rules. The `/migrate-to-skills` command helps migrate legacy rules.

**AIWG Implication**: AIWG deploys skills to `.cursor/skills/` in the standard directory-based format, which aligns with Cursor's native skills system.

---

## 7. @-Mentions System

### 7.1 Cursor 2.0 Breaking Change

Cursor 2.0 removed multiple explicit @-mention types from the context menu. Agent now self-gathers context automatically.

**Removed in 2.0**: `@Web`, `@Git`, `@Definitions`, `@Linter Errors`, `@Recent Changes`, `@Link`, `@Codebase`

These capabilities still exist — agents gather this context automatically or when asked in natural language.

### 7.2 Currently Supported @-Mentions (2.x)

| @-Mention | What It Does |
|-----------|-------------|
| `@Files` | Includes a specific file by name |
| `@Folders` | Includes an entire folder |
| `@Code` | References a specific function, class, or variable symbol |
| `@Docs` | Searches indexed documentation (built-in and custom) |
| `@Past Chats` | References context from a previous conversation |
| `@rule-name` | Manually invokes a specific rule from `.cursor/rules/` |
| `@skill-name` | Attaches a skill as context |

### 7.3 Input Methods Beyond @-Mentions

- **Images**: Drag-and-drop or paste screenshots
- **Voice**: Microphone icon for speech-to-text
- **Cmd+Shift+L**: Add selected code to chat as context
- **Cmd+V / Shift+V**: Paste clipboard content

---

## 8. Composer

"Composer" as a separate mode no longer exists in Cursor 2.x. The multi-file editing functionality was unified into Agent mode.

In current 2.x, **"Composer" or "Composer 2" refers to Cursor's proprietary model**, not a mode:
- Frontier-level coding performance
- Pricing: Standard ($0.50/M input, $2.50/M output), Fast ($1.50/M input, $7.50/M output)

---

## 9. Plugins (March 2026)

Cursor has a plugin system (`.cursor-plugin/plugin.json`) where plugins can bundle:
- MCP servers
- Rules
- Skills
- Agents
- Commands

Marketplace at cursor.com/marketplace. Over 30 partner plugins (Atlassian, Datadog, GitLab, etc.) with cloud-agent MCP support.

---

## 10. AIWG Integration Points

### 10.1 Deployment Paths

| Artifact | Path | Support Level |
|----------|------|---------------|
| Agents | `.cursor/agents/` | Conventional |
| Commands | `.cursor/commands/` | Conventional |
| Skills | `.cursor/skills/` | Conventional (aligns with native skills) |
| Rules | `.cursor/rules/` | Native (MDC format) |

### 10.2 Key AIWG Files

| Component | Path |
|-----------|------|
| Provider module | `tools/agents/providers/cursor.mjs` |
| Rules deployment | `tools/rules/deploy-rules-cursor.mjs` |
| Regenerate command | `.claude/commands/aiwg-regenerate-cursorrules.md` |
| CLI template | `agentic/code/frameworks/sdlc-complete/templates/cursor/cli.json.aiwg-template` |
| AGENTS template | `agentic/code/frameworks/sdlc-complete/templates/cursor/AGENTS.md.aiwg-template` |
| Integration tests | `test/integration/cursor-deployment.test.ts` |

### 10.3 AIWG Agent Invocation in Cursor

AIWG agents deployed to `.cursor/agents/` can be invoked via `@agent-name` in Cursor chat, provided the agent files are structured as manual rules or the user @-mentions them.

### 10.4 Cloud Agent Opportunities

Cloud Agents support MCP and external tools. AIWG workflows could potentially run via:
- AIWG MCP server configured in Cloud Agent environment
- `AGENTS.md` at repo root with AIWG instructions for Cloud Agents
- `.cursor/environment.json` for custom dependencies

---

## 11. Unverified / Requires Testing

1. **Notepads**: No current documentation found. Memories (Beta) may be the replacement feature.
2. **.cursorrules precedence**: Exact runtime behavior when both `.cursorrules` and `.cursor/rules/` exist is undocumented.
3. **AGENTS.md vs .cursor/rules/ precedence**: Whether additive or one takes priority when both exist.
4. **Full frontmatter schema**: Only 3 fields documented; undocumented fields may exist.

---

## References

- cursor.com/docs/context/rules — Rules system
- cursor.com/docs/mcp — MCP configuration
- cursor.com/docs/agent/overview — Agent mode
- cursor.com/docs/agent/tools — Agent tools
- cursor.com/docs/cloud-agent — Cloud agent
- cursor.com/docs/skills — Skills system
- cursor.com/docs/agent/prompting — @-mentions and prompting
- cursor.com/docs/configuration/worktrees — Worktrees
- cursor.com/docs/reference/permissions — permissions.json
- cursor.com/docs/reference/plugins — Plugin system
- cursor.com/changelog — Changelog (through 2.4)
