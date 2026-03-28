# Warp Terminal Reference

> **AIWG Provider** - Reference for Warp Terminal features, configuration, and integration patterns.

**Last Updated**: 2026-03-27
**Warp Version**: Current (post-2025 "Oz" agent platform era)
**Coverage**: Agent platform through current
**Maintainer**: AIWG Team

---

## Quick Reference

| Resource | Link |
|----------|------|
| Official Docs | https://docs.warp.dev |
| Agent Platform | https://docs.warp.dev/agent-platform/local-agents/overview |
| Rules | https://docs.warp.dev/agent-platform/capabilities/rules |
| MCP | https://docs.warp.dev/agent-platform/capabilities/mcp |
| Skills | https://docs.warp.dev/agent-platform/capabilities/skills |
| Warp Drive | https://docs.warp.dev/knowledge-and-collaboration/warp-drive |

---

## 1. Core Architecture

### 1.1 Agent Modes

Warp provides two modes for AI interaction:

| Mode | Interface | Context |
|------|-----------|---------|
| **Terminal Mode** | Default; agent controls hidden until needed | Commands run here can be manually attached to conversations |
| **Agent Mode** | Dedicated conversation view; richer controls (model select, voice, images) | Commands executed within a conversation are automatically included as context |

**Entering Agent Mode:**
- `Cmd+Enter` (macOS) / `Ctrl+Shift+Enter` (Windows/Linux)
- Slash command: `/agent` or `/new`
- Auto-detection: natural language typed in terminal mode auto-routes to a "quicksend" conversation
- Cloud: `Option+Cmd+Enter` launches cloud-based agent conversation

**Context isolation:** Terminal blocks and agent conversation blocks are separate scopes. Terminal blocks must be manually attached to conversations via the `@` context selector menu.

### 1.2 Oz Platform (Local vs. Cloud Agents)

Warp distinguishes **local agents** (run in your terminal, same machine) from **cloud agents** (run on Warp's Oz infrastructure).

**Local agents** are what most users interact with — the standard Agent Mode conversation. They support:
- Full terminal use (agent drives interactive terminal apps)
- Computer use capability
- MCP server tool access
- Rules, skills, agent profiles

**Cloud agents** (Oz Platform) are background workers triggered by events (webhooks, schedules, Slack messages). They require credits and Build/Max/Business plan tiers. Not relevant to AIWG's current per-project deployment model.

### 1.3 Third-Party CLI Agent Support

Warp provides a utility bar that automatically appears when it detects sessions from supported CLI agents:
- Claude Code, OpenAI Codex (CLI), Amp, Gemini CLI, Droid, OpenCode

This adds voice transcription, image attachment, code editor, and code review panel to those external agent sessions. This is passive integration — Warp detects, does not configure.

---

## 2. Artifact Discovery

### 2.1 Rules — WARP.md and AGENTS.md (Native, Auto-Discovered)

**Status**: Native. Warp auto-discovers and loads these files.

**File format**: Plain Markdown. No YAML frontmatter documented. All-caps filename required.

**Discovery paths:**

| Priority | Location | Scope |
|----------|----------|-------|
| 1 (highest) | Subdirectory `WARP.md` or `AGENTS.md` | Active when working in that subdirectory |
| 2 | Root directory `WARP.md` or `AGENTS.md` | Project-wide baseline |
| 3 | Global Rules (via Warp Drive) | Workspace-wide across all projects |

**File priority:** When both `WARP.md` and `AGENTS.md` exist in the same directory, `WARP.md` takes priority.

**`AGENTS.md` is the preferred filename** — Warp documentation treats it as the primary name and `WARP.md` as legacy.

**External links:** Rules files can link to `.cursorrules` and `.clinerules` files (Warp will load them).

**Slash commands for rules management:**
- `/init` — generate an `AGENTS.md` file
- `/add-rule` — add a rule interactively
- `/open-project-rules` — open current rules file

**Size limits**: Not documented. No character limit found in official docs.

**AIWG implication**: WARP.md is the correct aggregation target for Warp. The platform auto-discovers it and treats it as the project rules context. This is the primary mechanism for injecting AIWG orchestration context into Warp agents.

### 2.2 Skills (`.warp/skills/` and `.agents/skills/`)

**Status**: Native. Warp auto-discovers skills from multiple paths.

**Discovery paths (project-level):**

| Path | Notes |
|------|-------|
| `.agents/skills/` | Cross-agent recommended path |
| `.warp/skills/` | Warp-specific path |
| `.claude/skills/`, `.codex/skills/`, `.cursor/skills/`, `.gemini/skills/`, `.copilot/skills/`, `.factory/skills/`, `.github/skills/`, `.opencode/skills/` | All recognized by Warp |

**Discovery paths (global):**

| Path | Notes |
|------|-------|
| `~/.agents/skills/` | Cross-agent recommended path |
| `~/.warp/skills/` | Warp-specific global path |

**Scope resolution**: For Git repositories, Warp includes all skills from the current directory up through the repository root.

**File format**: Each skill is a directory with a `SKILL.md` file:

```
.warp/skills/
  my-skill/
    SKILL.md
    supporting-script.sh   (optional)
    template.md            (optional)
```

**SKILL.md schema** (Markdown with YAML frontmatter):

```markdown
---
name: skill-identifier
description: Brief explanation of purpose and when to invoke it
---

# Skill Title

Detailed step-by-step instructions here.

## Parameters

Use $ARGUMENTS for the full argument string, $ARGUMENTS[N] for positional args, or $N shorthand.
```

**Required fields**: `name` (kebab-case) and `description`.

**Invocation:**
1. **Automatic** — Warp evaluates request intent against skill descriptions; only `name` and `description` are in context by default (progressive disclosure — full content loaded on demand).
2. **Slash command** — `/{skill-name}` explicit invocation.

**Skills vs. Rules**: Skills encapsulate reusable task workflows. Rules provide persistent guidelines and constraints. They serve different purposes and are not interchangeable.

**AIWG implication**: `.warp/skills/` is native. AIWG's current mapping (`supportsSkills: false` with `alternativeStrategy: 'command'`) is **incorrect** — Warp natively supports skills at `.warp/skills/` with the SKILL.md format. This should be updated to `supportsSkills: true`.

### 2.3 Commands (`.warp/commands/`)

**Status**: AIWG convention only. NOT natively discovered by Warp.

Warp does not have a `.warp/commands/` native discovery path. The native equivalents are:
- **Skills** (`.warp/skills/`) for reusable task workflows
- **Warp Drive workflows** for parameterized command sequences
- **Saved prompts** in Warp Drive for reusable agent prompts

**AIWG implication**: Files written to `.warp/commands/` by AIWG are not auto-discovered by Warp. They exist on disk but Warp never reads them. Commands should be mapped to skills instead.

### 2.4 Agents (`.warp/agents/`)

**Status**: AIWG convention only. NOT natively discovered by Warp.

Warp does not have a `.warp/agents/` directory concept. Agent behavior is configured through:
- **Agent Profiles** (Settings > AI > Agents > Profiles) — UI-configured, not file-based
- **WARP.md / AGENTS.md** — project rules that inform agent behavior
- **Skills** — task-specific behavior packages

There is no documented file format for placing agent definitions in a directory that Warp auto-discovers.

**AIWG implication**: Files written to `.warp/agents/` are not read by Warp. Agent definitions should be aggregated into `WARP.md` (the existing AIWG approach for the root context file) — but the per-agent discrete files in `.warp/agents/` serve no purpose from Warp's perspective.

### 2.5 Rules (`.warp/rules/`)

**Status**: AIWG convention only. NOT natively discovered by Warp.

Warp's rules system is file-based via `WARP.md` / `AGENTS.md` only. There is no `.warp/rules/` directory concept in Warp's native discovery. (This contrasts with Windsurf's `.windsurf/rules/*.md` system.)

**AIWG implication**: Files written to `.warp/rules/` by AIWG are not read by Warp. Rules content must be included in `WARP.md` to have any effect.

---

## 3. Agent Profiles (UI-Only, Not File-Based)

**Status**: Native, but UI-configured. No file format or directory discovery.

Agent Profiles are created and managed exclusively in Settings > AI > Agents > Profiles. There is no documented project-level file format for distributing agent profiles.

**Profile fields:**
- Name (custom identifier)
- Base model (from the available model list)
- Planning model (defaults to base model, configurable separately)
- Autonomy levels per action type (Agent Decides / Always Ask / Always Allow / Never)

**Controllable actions:**
- Applying code diffs
- Reading files
- Creating plans
- Executing commands
- Terminal interaction (Full Terminal Use)

**Command allowlist/denylist:**
- Allowlist: patterns auto-executing without approval (e.g., `ls`, `grep`)
- Denylist: safety overrides (defaults include `curl`, `wget`, `rm`, `eval`). Denylist takes precedence over allowlist and "Agent Decides."
- "Run until completion" (`Cmd/Ctrl+Shift+I`) bypasses denylist for the current task

**MCP permissions**: Allow/deny lists or Agent-Decides autonomy per MCP server.

---

## 4. MCP Support

**Status**: Native.

### 4.1 Configuration

MCP configuration is UI-driven via Settings. The documentation references internal MCP state but **does not document a `~/.warp/mcp.json` file** as a manually-editable config path. Configuration is added via:
- `/add-mcp` slash command
- Settings > AI > MCP Servers panel

### 4.2 Transport Types

| Transport | Config | Notes |
|-----------|--------|-------|
| Stdio (command) | `command`, `args`, `env`, `working_directory` | Local process execution |
| Streamable HTTP | `url`, `headers` | Remote with OAuth support |

### 4.3 Example Config Structure

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem"],
      "env": {
        "API_TOKEN": "${API_TOKEN}"
      }
    }
  }
}
```

### 4.4 Session Persistence

MCP servers persist across restarts: if Warp closes with a server running, it restarts on next launch. Stopped servers remain inactive.

### 4.5 Authentication

- Environment variables for API keys
- OAuth (browser-based, one-click installation)
- Custom headers for Bearer tokens
- Reset: `rm -rf ~/.mcp-auth`

### 4.6 Log Paths

| Platform | Path |
|----------|------|
| macOS | `~/Library/Group Containers/2BBY89MBSN.dev.warp/Library/Application Support/dev.warp.Warp-Stable/mcp` |
| Windows | `%LOCALAPPDATA%\warp\Warp\data\logs\mcp` |
| Linux | `${XDG_STATE_HOME:-$HOME/.local/state}/warp-terminal/mcp` |

### 4.7 Supported Servers (Featured)

Engineering: GitHub, Sentry, Grafana, Linear, Chroma
Design/Collaboration: Figma, Slack, Atlassian, Notion

---

## 5. Warp Drive (Team Sharing)

**Status**: Native cloud sync platform.

### 5.1 Shareable Object Types

| Object | Format | Shareable via Drive |
|--------|--------|-------------------|
| Workflows | YAML | Yes |
| Prompts | YAML export | Yes |
| Notebooks | Markdown (`.md` export) | Yes |
| Environment Variables | DOTENV export | Yes |
| Rules | N/A | Global rules via Drive panel |
| Agents | N/A | Not documented |
| Skills | N/A | Not documented |

**Important**: Agent definitions and skills are NOT documented as Warp Drive shareable objects. Distribution happens through version-controlled project files (WARP.md, `.warp/skills/`).

### 5.2 Distribution Mechanisms

1. **Team workspace**: All team members have full access to objects in team Drive
2. **Direct sharing**: Share individual objects by email
3. **Link sharing**: Public links for anyone with the URL

### 5.3 Permission Levels

View or Edit. Folder-level permissions cascade to all objects inside. Real-time sync — changes propagate immediately to all team members.

### 5.4 Workflows in Warp Drive

Warp Drive workflows are the platform-native workflow system (superseding legacy YAML workflows). Key details:

- **Parameter syntax**: `{{argument_name}}` (double curly braces)
- **Parameter types**: text and enum
- **Parameter name rules**: `A-Za-z0-9`, hyphens, underscores; first character non-numeric
- **Enum parameters**: support static values or dynamic shell command output
- **Embedded workflows**: Notebooks can embed Drive workflows as executable blocks

**Legacy YAML workflows** (`.warp/workflows/*.yaml`) are still supported indefinitely per Warp's commitment, but new creation focuses on Drive workflows.

---

## 6. Workflows System (`.warp/workflows/`)

**Status**: Legacy YAML format still supported. File-based, but the primary workflow system has moved to Warp Drive.

**Directory**: `.warp/workflows/`

**Format**: YAML files. The complete schema is not fully documented in official docs; the canonical reference is the open-source community workflows repository.

**Known fields** (from community schema):

```yaml
---
name: "Workflow Name"
command: "the-command --flag {{argument}}"
description: "What this workflow does"
tags: ["tag1", "tag2"]
arguments:
  - name: argument
    description: "Description of what to provide"
    default_value: ""
---
```

**Parameter syntax**: `{{argument_name}}` — same syntax as Warp Drive workflows.

**AIWG implication**: `.warp/workflows/` maps to AIWG's "commands" artifact type for Warp. However, `.warp/workflows/` is the legacy format; Warp Drive is the current primary path. The file-based workflows are preserved for backward compatibility and version-controlled sharing.

---

## 7. Codebase Context

**Status**: Native, automatic for Git repos.

Warp automatically indexes Git repositories for codebase-aware completions and agent context. Indexing triggers:
- Initial enablement
- Periodic auto-sync
- New agent conversation start
- Manual sync button

**Ignore files respected:**
- `.gitignore`
- `.warpindexingignore`
- `.cursorignore`, `.cursorindexingignore`, `.codeiumignore`

**Limitation**: Does not work in SSH or WSL sessions.

Codebase Context does NOT automatically load `WARP.md` or `AGENTS.md` — those are loaded by the Rules system (separate feature).

---

## 8. Model Selection

**Status**: Native, user-selectable per conversation.

**Available models** (as of research date, subject to change):

| Provider | Models |
|----------|--------|
| Anthropic | Claude Opus 4.6, Claude Sonnet 4.6 (default/max effort), Claude Opus 4.5, Claude Sonnet 4.5 (with thinking modes), Claude Sonnet 4, Claude Haiku 4.5 |
| OpenAI | GPT-5.4 through GPT-5 (low/medium/high/extra-high reasoning levels) |
| Google | Gemini 3 Pro, Gemini 2.5 Pro |
| z.ai | GLM 4.7 |

**Auto-selection modes**: Cost-efficient, Responsive (fastest), Genius-level (most capable).

**Context window sizes**: Not published in official documentation. Unknown — treat as UNKNOWN.

**Data protection**: Zero Data Retention (ZDR) agreements with all LLM providers.

---

## 9. AI Notebooks

**Status**: Native. Part of Warp Drive.

Notebooks are "runnable documentation" — a mix of Markdown text, code blocks, and executable shell commands, accessible via the Command Palette without leaving the terminal.

**Format**: Rich document with:
- Markdown text and list elements
- Code blocks (syntax-highlighted, multiple languages)
- Shell command blocks (executable directly into active terminal session)

**Parameter syntax**: `{{double_curly_brackets}}` — same as Workflows and Drive workflows.

**Export**: `.md` format

**Collaboration**: Real-time sync via Warp Drive. Only one editor at a time; others get view mode.

**Workflow integration**: Can embed Warp Drive workflows as executable command blocks.

**Agent integration**: Not documented. Notebooks are primarily documentation + execution, not AI-conversation contexts.

---

## 10. Slash Commands

**Status**: Native built-in commands. No user-defined slash command file format.

40+ native slash commands in Agent Mode. Key ones for AIWG context:

| Command | Purpose |
|---------|---------|
| `/agent`, `/new` | Start new agent conversation |
| `/init` | Generate AGENTS.md for the project |
| `/add-rule` | Add a rule interactively |
| `/open-project-rules` | Open current WARP.md/AGENTS.md |
| `/add-mcp` | Add MCP server |
| `/open-skill` | Open/manage skills |
| `/plan` | Create a task plan |
| `/orchestrate` | Break task into parallel subtasks |
| `/compact` | Summarize conversation to free context |
| `/model` | Switch active model |
| `/export-to-file` | Save conversation as Markdown |

**Custom slash commands**: Not supported via file format. Custom prompts created in Warp Drive appear in the slash command menu alongside native commands.

---

## 11. AIWG Provider Mapping

### 11.1 Current vs. Corrected Artifact Mapping

| AIWG Artifact | AIWG Deploys To | Warp Native Discovery | Support Level (Correct) |
|---------------|----------------|----------------------|------------------------|
| Agents | `.warp/agents/` + `WARP.md` (aggregated) | `WARP.md` only | Aggregated (via WARP.md) |
| Commands | `.warp/commands/` | None (not discovered) | Convention only — not read |
| Skills | `.warp/skills/` | `.warp/skills/` and `.agents/skills/` | **Native** (currently misclassified) |
| Rules | `.warp/rules/` | None (not discovered) | Convention only — not read |
| Context file | `WARP.md` | `WARP.md` (auto-discovered) | Native |

### 11.2 Known Discrepancies

| Item | Current AIWG Behavior | Actual Warp Behavior | Severity |
|------|----------------------|---------------------|---------|
| `.warp/agents/` | Written as discrete files | Not discovered natively | High — files written but never read |
| `.warp/commands/` | Written as command files | Not discovered natively | High — files written but never read |
| `.warp/rules/` | Written as rule files | Not discovered natively | High — files written but never read |
| `.warp/skills/` | `supportsSkills: false` in `platform-resolver.ts` | **Natively discovered** at `.warp/skills/` and `.agents/skills/` | High — native capability unused |
| `WARP.md` config file | Correctly set in `platform-paths.ts` | Auto-discovered, takes priority over AGENTS.md | Correct |
| WARP.md is legacy | Not known | Warp documentation calls AGENTS.md preferred; WARP.md is "legacy" | Medium — functionally equivalent but AGENTS.md is current preferred name |

### 11.3 Recommended Corrections

1. **Skills**: Update `platform-resolver.ts` to set `supportsSkills: true` for Warp. Deploy skills to `.warp/skills/` with proper `SKILL.md` format (YAML frontmatter `name` + `description` required). Warp will natively auto-invoke them.

2. **Commands**: Remove `.warp/commands/` deployment or map commands to skills instead. Commands written to `.warp/commands/` are ignored by Warp.

3. **Rules**: Remove `.warp/rules/` deployment. All rules content must be included in `WARP.md` to have effect.

4. **Agents**: The `.warp/agents/` discrete files serve no purpose. Only the aggregated `WARP.md` content reaches Warp. Continue the WARP.md aggregation approach; remove discrete agent file generation for Warp.

5. **Config file name**: Consider whether to keep `WARP.md` or switch to `AGENTS.md` as the aggregation target. Both work; AGENTS.md is the current preferred name per Warp docs, but WARP.md takes priority if both exist.

---

## 12. Limitations and Gaps

### 12.1 No File-Based Agent Profiles

Agent profiles are UI-only (Settings panel). No documented path for distributing agent profile configurations via project files.

### 12.2 Skills Not Shareable via Warp Drive

Skills and agent definitions are not listed as Warp Drive shareable objects. Team distribution requires version-controlling `.warp/skills/` or `.agents/skills/` in the repository.

### 12.3 MCP Config Not File-Based

Warp does not document a user-editable `~/.warp/mcp.json`. MCP servers are configured via UI or `/add-mcp`. There is no known path for programmatically deploying MCP config like Windsurf's `~/.codeium/windsurf/mcp_config.json`.

### 12.4 Context Window Unknown

Warp does not publish context window sizes for any model. Actual limits depend on the selected underlying model.

### 12.5 SSH/WSL Limitation

Codebase Context (semantic code indexing) does not work in SSH or WSL sessions.

### 12.6 No Native `.warp/rules/` Directory

Unlike Windsurf's per-file rule system with trigger modes, Warp uses a single-file rules approach (WARP.md/AGENTS.md). No glob-triggered or manually-triggered rules. All rules are always-on.

---

## 13. Related Issues

- #547 — Audit per-provider skills vs commands support
- Warp skills correction needed in `platform-resolver.ts`
- Warp commands/rules/agents discrete file deployment should be audited

---

## 14. Changelog Tracking

| Date Researched | Relevant Feature |
|----------------|-----------------|
| 2026-03-27 | Initial research: Agent Mode, Rules (WARP.md/AGENTS.md), Skills, MCP, Warp Drive, Profiles, Slash Commands |
