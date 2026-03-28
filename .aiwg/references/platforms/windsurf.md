# Windsurf Reference

> **AIWG Provider** - Reference for Windsurf (Codeium) features, configuration, and integration patterns.

**Last Updated**: 2026-03-27
**Windsurf Version**: Current (post v1.13.6)
**Coverage**: v1.1.0 through current
**Maintainer**: AIWG Team

---

## Quick Reference

| Resource | Link |
|----------|------|
| Official Docs | https://docs.windsurf.com |
| Website | https://windsurf.com |
| Changelog | https://windsurf.com/changelog |
| MCP Docs | https://docs.windsurf.com/windsurf/mcp |

---

## 1. Core Architecture

### 1.1 Cascade AI Agent

Windsurf's primary AI assistant, accessed via `Cmd/Ctrl+L`.

**Two modes:**

| Mode | Purpose | Capabilities |
|------|---------|-------------|
| **Code Mode** | Full agentic execution | File CRUD, terminal, MCP tools, web search, linter, up to 20 tool calls/prompt |
| **Chat Mode** | Q&A and research | Proposes code but does not apply changes autonomously |

**Context Loading:**
- RAG-based codebase indexing (local or remote for Teams/Enterprise)
- Real-time awareness of open files, recent edits, terminal output
- File pinning for forced context inclusion
- `@filename` and `@conversation` mentions for explicit context
- AGENTS.md and always-on rules enter system prompt automatically

**Planning:**
- Auto-generates todo lists for multi-step tasks
- "Plan Mode" / "Megaplan" for detailed planning before code changes

### 1.2 Context Window

| Tier | Context Size |
|------|-------------|
| Default | 128K tokens |

---

## 2. Artifact Discovery

### 2.1 AGENTS.md (Agent Definitions)

**Status**: Native, auto-discovered

Windsurf scans `AGENTS.md` (case-insensitive) files in the workspace and parent directories up to the git root.

| Location | Behavior |
|----------|----------|
| Project root | Treated as always-on rules, applied every message |
| Subdirectory | Applied via auto-generated glob (`<directory>/**`) — active only when working in that subtree |

**Format**: Plain markdown. No YAML frontmatter required.

**No native `.windsurf/agents/` directory.** Agent definitions are exclusively via `AGENTS.md` files. AIWG's approach of generating a root `AGENTS.md` aggregating all agents is correct and aligned.

### 2.2 Rules (`.windsurf/rules/`)

**Status**: Native (since v1.8.2, May 2025)

**Discovery paths:**

| Scope | Location | Char Limit |
|-------|----------|-----------|
| Global | `~/.codeium/windsurf/memories/global_rules.md` | 6,000 |
| Workspace | `.windsurf/rules/*.md` | 12,000 per file |
| Directory | `AGENTS.md` in any directory | Not specified |
| System (Enterprise) | OS-specific MDM-managed paths | Not specified |

**Format**: Plain markdown with optional YAML frontmatter for trigger control.

**Trigger modes:**

| Trigger | Behavior |
|---------|----------|
| `always_on` | Included in system prompt every message |
| `model_decision` | Only description shown; full content loaded on model's demand |
| `glob` | Activated when files matching a glob pattern are edited |
| `manual` | Activated via `@rule-name` explicit mention |

**Example rule file:**

```markdown
---
trigger: glob
globs: "src/**/*.ts"
---

When editing TypeScript files, enforce strict null checks and prefer
explicit return types on all exported functions.
```

**`.windsurfrules` at project root**: NOT documented in Windsurf's official docs. The platform uses `.windsurf/rules/*.md` exclusively. While `.windsurfrules` may be read as an undocumented legacy feature, it should not be relied upon.

### 2.3 Workflows (`.windsurf/workflows/`)

**Status**: Native (since v1.8.2, May 2025)

**Discovery paths:**

| Scope | Location |
|-------|----------|
| Workspace | `.windsurf/workflows/*.md` |
| Global | `~/.codeium/windsurf/global_workflows/*.md` |
| System (Enterprise) | OS-specific MDM-managed paths |

**Format**: Plain markdown files. No formal YAML schema. 12,000 character limit per file.

**Triggering**: Manual invocation only via `/workflow-name`. Cascade never auto-invokes workflows. Workflow names derived from filename (kebab-case). Workflows can call other workflows via `/other-workflow-name` in instructions.

### 2.4 Skills (`.windsurf/skills/`)

**Status**: Native (since v1.13.6, January 2026)

**Discovery paths:**

| Scope | Location |
|-------|----------|
| Workspace | `.windsurf/skills/` |
| Cross-agent compat | `.agents/skills/` |
| Global | `~/.codeium/windsurf/skills/` |
| System (Enterprise) | OS-specific MDM-managed paths |

**Format**: Each skill is a directory containing a `SKILL.md` file:

```
.windsurf/skills/
  my-skill/
    SKILL.md
    supporting-script.sh
    template.md
```

`SKILL.md` requires YAML frontmatter:

```markdown
---
name: my-skill
description: What this skill does and when to use it
---

## Instructions

Detailed step-by-step content here.
```

**Required fields**: `name` (lowercase, hyphens, numbers) and `description`.

**Triggering**: Two mechanisms:
1. **Automatic** — Cascade evaluates request intent against skill descriptions. Only `name` and `description` are in context by default (progressive disclosure).
2. **Manual** — `@skill-name` explicit invocation.

---

## 3. MCP Support

### 3.1 Configuration

**Config file**: `~/.codeium/windsurf/mcp_config.json` (global, per-machine)

### 3.2 Transport Types

| Transport | Config Key | Notes |
|-----------|-----------|-------|
| Stdio | `command` + `args` + `env` | Local process execution |
| Streamable HTTP | `serverUrl` | Remote, with OAuth support |
| SSE | `url` | Streaming HTTP connections |

Environment variable interpolation supported across `command`, `args`, `env`, `serverUrl`, `url`, and `headers` fields.

### 3.3 Stdio Example

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

### 3.4 Streamable HTTP Example

```json
{
  "mcpServers": {
    "remote-server": {
      "serverUrl": "https://your-server.example.com/mcp",
      "headers": {
        "API_KEY": "${API_KEY}"
      }
    }
  }
}
```

### 3.5 Capabilities

Windsurf supports all three MCP primitives:
- **Tools** — custom functions (invokable by Cascade)
- **Resources** — data access points
- **Prompts** — pre-built instruction templates (since v1.12.31+)

**Limits**: 100 tools maximum across all connected MCP servers.

### 3.6 Enterprise Controls

Team admins can whitelist approved MCP servers using regex pattern matching against Server ID and configuration parameters. Non-whitelisted servers are blocked.

**Recent additions** (v1.12.31+): GitHub and GitLab remote MCP with OAuth, MCP Prompts support, Streamable HTTP transport, 60-second initialization timeout.

---

## 4. Memories

### 4.1 Automatic Memories

**Shipped**: v1.1.0 (December 2024)

Cascade generates memories during conversations when it encounters context it judges reusable. Stored locally at `~/.codeium/windsurf/memories/` (per-machine, per-workspace).

- Memory generation costs no credits
- Users can manually request: "remember that X"
- Retrieved automatically when relevant
- Cannot persist across machines (not committed to repo)

### 4.2 Global Rules File

`~/.codeium/windsurf/memories/global_rules.md` — plain markdown, 6,000 character limit. The closest path to programmatic context injection, though undocumented as an external write target.

### 4.3 External Access

No documented API for external tools to write to the memories store. For team-shareable, version-controlled context, Windsurf recommends using Rules (`.windsurf/rules/`) or `AGENTS.md`.

---

## 5. AIWG Provider Mapping

### 5.1 Artifact Deployment

| AIWG Artifact | Windsurf Location | Support Level |
|---------------|-------------------|---------------|
| Agents | `AGENTS.md` (root) | Aggregated (native discovery) |
| Commands | `.windsurf/workflows/` | Native |
| Skills | `.windsurf/skills/` | Native |
| Rules | `.windsurf/rules/` | Native |

### 5.2 Context File

Primary context file: `.windsurf/rules/aiwg-orchestration.md` with `trigger: always_on`

**Note**: `.windsurfrules` at project root is undocumented by Windsurf. The safe path is to use `.windsurf/rules/*.md` files with explicit trigger frontmatter.

### 5.3 Known Discrepancies

| Item | Current AIWG Behavior | Actual Windsurf Behavior |
|------|----------------------|--------------------------|
| `.windsurfrules` | Generated at project root | Not documented; may be ignored |
| `.windsurf/agents/` mirror | Written as discrete files | Not discovered natively |
| Rules frontmatter | No trigger field added | Platform uses trigger field for activation control |
| Skills support level | Listed as "conventional" in matrix | Native since v1.13.6 |

---

## 6. Limitations and Gaps

### 6.1 No Plugin Marketplace

No third-party AI framework marketplace exists. MCP servers are the practical distribution mechanism for AI capabilities.

### 6.2 No Native Agent Files

No `.windsurf/agents/` directory is documented. Agent definitions are exclusively via `AGENTS.md` files at various directory levels.

### 6.3 Memories Not Externally Writable

No API or documented path for external tools to inject into Windsurf's memory system. Rules files are the recommended alternative.

### 6.4 Workflow Invocation Manual Only

Cascade never auto-invokes workflows — they require explicit `/workflow-name` invocation by the user.

---

## 7. Related Issues

- #505 — MCP sidecar support for Windsurf
- #547 — Audit per-provider skills vs commands support
- #563 — This alignment audit

---

## 8. Changelog Tracking

| Windsurf Version | Date | Relevant Feature |
|-----------------|------|-----------------|
| v1.1.0 | Dec 2024 | Automatic Memories |
| v1.8.2 | May 2025 | File-Based Rules (`.windsurf/rules/`), Workflows |
| v1.12.31+ | Late 2025 | MCP Prompts, Streamable HTTP, OAuth |
| v1.13.6 | Jan 2026 | Native Skills (`.windsurf/skills/`), cross-agent compat `.agents/skills/` |
