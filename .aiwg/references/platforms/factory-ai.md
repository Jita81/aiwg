# Factory AI Reference

> **AIWG Integration Platform** - Authoritative reference for Factory AI (Droid) features, configuration, and integration patterns.

**Last Updated**: 2026-03-27
**Coverage**: Factory CLI current (as of March 2026)
**Source**: https://docs.factory.ai
**Maintainer**: AIWG Team

---

## Quick Reference

| Resource | Link |
|----------|------|
| Official Docs | https://docs.factory.ai |
| CLI Install | `curl -fsSL https://app.factory.ai/cli | sh` |
| GitHub App | https://docs.factory.ai/integrations/github-app |
| MCP Config | https://docs.factory.ai/cli/configuration/mcp |
| Custom Droids | https://docs.factory.ai/cli/configuration/custom-droids |
| Droid Exec | https://docs.factory.ai/cli/droid-exec/overview |

---

## 1. Platform Overview

Factory AI is a model-agnostic AI coding platform built around the concept of "Droids" — configurable AI agents that execute development tasks. Key characteristics:

- **Primary interface**: `droid` CLI + web app
- **Model support**: Anthropic Claude family, OpenAI GPT-5 variants, Google Gemini 3.x, GLM 4.7+, Kimi K2.5, MiniMax M2.5
- **Execution modes**: Interactive session, headless/CI via `droid exec`, multi-agent Missions
- **Configuration model**: Project-scoped (`.factory/`) + user-scoped (`~/.factory/`)
- **Plugin ecosystem**: Shareable bundles of droids + skills + commands + hooks + MCP servers

### Terminology Mapping to AIWG

| AIWG Concept | Factory AI Equivalent | Notes |
|---|---|---|
| Agent (`.claude/agents/`) | Custom Droid (`.factory/droids/`) | Near-identical Markdown + YAML frontmatter format |
| Command (`.claude/commands/`) | Custom Slash Command (`.factory/commands/`) | Same `$ARGUMENTS` pattern |
| Skill (`.claude/skills/`) | Skill (`.factory/skills/`) | Both use YAML frontmatter + Markdown body |
| Rule (`.claude/rules/`) | AGENTS.md + settings | Factory has no direct rule file mechanism |
| Hook | Hook | Near-identical event-driven shell execution |
| Task tool / subagent | Task tool / droid subagent | Same delegation pattern |
| MCP | MCP | Same protocol, different config paths |
| Plugin (`.claude/`) | Plugin (`.factory-plugin/`) | Factory has explicit plugin manifest format |

---

## 2. Custom Droids (Agents)

### 2.1 Overview

Custom Droids are reusable subagents defined as Markdown files with YAML frontmatter. They are the Factory equivalent of Claude Code agents. They enable task delegation to specialized agents with isolated context windows and restricted tool sets.

### 2.2 Storage Locations

| Scope | Path | Behavior |
|-------|------|----------|
| Project | `.factory/droids/` | Shared via git with teammates |
| Personal | `~/.factory/droids/` | Follows user across all workspaces |

Project definitions override personal ones when names collide.

**Constraint**: Top-level files only — subdirectories inside `.factory/droids/` are ignored.

### 2.3 File Format

```markdown
---
name: droid-identifier
description: What this droid does and when to invoke it (≤500 chars)
model: inherit
reasoningEffort: medium
tools: ["Read", "Grep", "Glob"]
---

System prompt body text here. This defines the droid's behavior,
persona, and task focus.
```

### 2.4 YAML Schema Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | String | Yes | Lowercase letters, digits, `-`, `_` only |
| `description` | String | No | ≤500 characters; shown in UI; used for auto-invocation matching |
| `model` | String | No | `inherit` (default) or model identifier (e.g., `claude-sonnet-4-5-20250929`); use `custom:` prefix for BYOK models |
| `reasoningEffort` | String | No | `low`, `medium`, or `high`; ignored when `model: inherit` |
| `tools` | String or Array | No | Category string or explicit array of tool IDs |

### 2.5 Tool Categories

| Category String | Included Tools |
|-----------------|----------------|
| `read-only` | Read, LS, Grep, Glob |
| `edit` | Create, Edit, ApplyPatch |
| `execute` | Execute |
| `web` | WebSearch, FetchUrl |
| `mcp` | Dynamic (all active MCP tools) |

`TodoWrite` is automatically included for all droids regardless of tools setting.

### 2.6 Invocation Methods

1. **UI**: `/droids` command opens management modal
2. **Task tool**: Set `subagent_type` to the droid name — identical to Claude Code's Task tool
3. **Natural language**: "Use the subagent `droid-name` on [context]"

### 2.7 Importing from Claude Code

Factory supports importing `.claude/agents/` definitions as droids with automatic:
- Model family conversion (e.g., sonnet → corresponding Sonnet model)
- Tool name translation (with warnings for unmapped tools)
- Output to `~/.factory/droids/` (personal scope)

### 2.8 AIWG Integration Assessment

**Compatibility**: High. AIWG agent format (Markdown + YAML frontmatter) is structurally identical to Factory droids. The AIWG `aiwg use sdlc --provider factory` deployment path writes to `.factory/droids/`.

**Gap**: Factory droids do not support `allowed-tools` with the same granularity as Claude Code (e.g., no `Bash(git log:*)` pattern matching). Use the `tools` array or category strings instead.

**Gap**: Factory has no `color` or `icon` fields in frontmatter.

---

## 3. Custom Slash Commands

### 3.1 Overview

Custom commands are user-defined shortcuts that trigger agent workflows. They are equivalent to Claude Code's `.claude/commands/` in both location pattern and `$ARGUMENTS` expansion behavior.

### 3.2 Storage Locations

| Scope | Path | Behavior |
|-------|------|----------|
| Project | `.factory/commands/` | Shared via git; overrides personal |
| Personal | `~/.factory/commands/` | Cross-project personal workflows |

**Discovery**: Only `*.md` files and files with shebangs (`#!`) register. Filenames are slugged (lowercase, spaces → `-`, non-URL-safe characters dropped). Nested folders are ignored.

### 3.3 Markdown Command Format

```markdown
---
description: Override autocomplete summary shown in /commands menu
argument-hint: <branch-name>
---

Instructions for the agent. Use $ARGUMENTS to reference
everything the user typed after the command name.
```

`$ARGUMENTS` expands to everything typed after the command name.

### 3.4 Executable Command Format

Scripts with a shebang line are treated as executable commands:

```bash
#!/usr/bin/env bash
# Arguments passed as $1, $2, etc.
echo "Running on: $1"
npm run lint "$1"
npm test "$1"
```

Executable commands run from the current working directory and inherit the shell environment.

### 3.5 Invocation

- Trigger: `/command-name optional arguments`
- Browse: `/commands` opens the Custom Commands manager UI (reload, import, browse)

### 3.6 AIWG Integration Assessment

**Compatibility**: High. The `$ARGUMENTS` pattern is identical to Claude Code. AIWG command Markdown files deploy cleanly to `.factory/commands/`.

**Difference**: Factory commands support both Markdown (agent-seeding) and executable (shell script) formats. Claude Code commands are Markdown only. AIWG can leverage executable commands for shell-heavy workflows.

**Difference**: Factory uses `argument-hint` frontmatter key instead of Claude Code's `argument-hint` — same field name, same purpose. No behavioral difference.

---

## 4. Skills

### 4.1 Overview

Skills are reusable capabilities that extend what a Droid can do. They function as both droid-invoked tools (auto-selected by the model based on description match) and user-triggered commands via `/skill-name` syntax.

### 4.2 Storage Locations

| Scope | Path | Notes |
|-------|------|-------|
| Project | `.factory/skills/<skill-name>/` | Shared via git |
| Personal | `~/.factory/skills/<skill-name>/` | Cross-project |
| Legacy | `.agent/skills/<skill-name>/` | Backward compatibility only |

Skills are **directories**, not flat files. Each skill directory contains `SKILL.md` (or `skill.mdx`) plus optional supporting files (schemas, checklists, reference docs, scripts).

### 4.3 SKILL.md Format

```yaml
---
name: skill-identifier
description: What it does and when to use it (used for auto-invocation matching)
user-invocable: true
disable-model-invocation: false
---

Skill instructions and behavior definition here.
```

### 4.4 Frontmatter Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | String | — | Lowercase, hyphens, numbers |
| `description` | String | — | Critical for auto-invocation — model uses this to decide when to apply the skill |
| `user-invocable` | Boolean | `true` | Set `false` to hide from `/skill-name` slash menu |
| `disable-model-invocation` | Boolean | `false` | Set `true` to prevent automatic droid usage; user-only |

### 4.5 Invocation Control Matrix

| `user-invocable` | `disable-model-invocation` | Result |
|------------------|---------------------------|--------|
| `true` | `false` | Both user and droid can invoke (default) |
| `false` | `false` | Droid-only; hidden from slash menu |
| `true` | `true` | User-only; droid will not auto-invoke |
| `false` | `true` | Effectively disabled |

### 4.6 Supporting Files

Skills can include co-located resources (schemas, checklists, reference documents, scripts) that provide context to the skill instructions without duplicating production code.

### 4.7 AIWG Integration Assessment

**Compatibility**: High. AIWG SKILL.md format is compatible with Factory's expected structure. The directory-based layout matches AIWG's skill conventions.

**Difference**: Factory skills use a directory structure (`skill-name/SKILL.md`) rather than a flat file. AIWG deployment must create the directory wrapper.

**Opportunity**: The `disable-model-invocation` flag enables AIWG to ship user-only skills (e.g., `/writing-validator`) that the model will not auto-trigger.

---

## 5. MCP Support

### 5.1 Overview

Factory supports the Model Context Protocol (MCP) for extending droid capabilities with external tools and services. Both stdio (local process) and HTTP (remote endpoint) transport types are supported.

### 5.2 Configuration Locations

| Level | Path | Priority |
|-------|------|----------|
| User | `~/.factory/mcp.json` | Higher — personal overrides |
| Project | `.factory/mcp.json` | Lower — team-shared, commit to git |

### 5.3 Configuration Schema

```json
{
  "mcpServers": {
    "server-name": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-example"],
      "env": {
        "API_KEY": "${MY_API_KEY}"
      },
      "disabled": false,
      "disabledTools": ["tool-to-exclude"]
    }
  }
}
```

**HTTP server variant:**
```json
{
  "mcpServers": {
    "remote-service": {
      "type": "http",
      "url": "https://mcp.example.com",
      "headers": {
        "Authorization": "Bearer ${API_TOKEN}"
      },
      "disabled": false
    }
  }
}
```

### 5.4 Schema Fields

| Field | Applies To | Description |
|-------|-----------|-------------|
| `type` | Both | `"stdio"` or `"http"` |
| `disabled` | Both | Boolean toggle; default `false` |
| `disabledTools` | Both | Array of specific tool names to exclude |
| `command` | stdio | Executable to run |
| `args` | stdio | Array of arguments |
| `env` | stdio | Environment variable map |
| `url` | http | Remote endpoint URL |
| `headers` | http | HTTP headers (e.g., auth tokens) |

### 5.5 Management

- Interactive: `/mcp` command — browse, add from registry, toggle, configure
- Registry: 40+ pre-configured servers available via "Add from Registry"
- OAuth: Browser-prompt flow; tokens stored in system keyring globally
- Reload: Automatic on file change

### 5.6 Notable Pre-configured Servers

| Category | Servers |
|----------|---------|
| Dev Tools | Sentry, Hugging Face, Socket, Playwright |
| Project Mgmt | Notion, Linear, Intercom, Monday, ClickUp |
| Payments | Stripe, PayPal |
| Design | Figma, Canva |
| Infrastructure | Netlify, Vercel |
| Data | Airtable, HubSpot, MongoDB |

### 5.7 AIWG Integration Assessment

**Compatibility**: High. MCP config format is structurally identical to Claude Code (`~/.claude/mcp.json`). Field names and transport types match.

**Difference**: Config path is `~/.factory/mcp.json` vs Claude Code's `~/.claude/mcp.json`. AIWG must write to the Factory-specific path.

**Difference**: Factory uses a project-level `.factory/mcp.json` rather than Claude Code's project-level `.mcp.json`. Same concept, different path.

---

## 6. Hooks

### 6.1 Overview

Hooks are user-defined shell commands that execute at defined points in the Droid lifecycle. They provide deterministic side-effect control independent of the LLM — equivalent to Claude Code hooks in purpose and structure.

### 6.2 Supported Hook Events

| Event | Trigger |
|-------|---------|
| `PreToolUse` | Before any tool call; can block execution |
| `PostToolUse` | After tool call completes |
| `UserPromptSubmit` | When user submits a prompt, before processing |
| `Notification` | When Droid sends a notification |
| `Stop` | When Droid finishes responding |
| `SubagentStop` | When a sub-droid task completes |
| `PreCompact` | Before context compaction |
| `SessionStart` | On new session creation or resume |
| `SessionEnd` | When session terminates |

### 6.3 Configuration Format

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Create",
        "hooks": [
          {
            "type": "command",
            "command": "prettier --write $FACTORY_PROJECT_DIR/src"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "/usr/local/bin/audit-log.sh"
          }
        ]
      }
    ]
  }
}
```

### 6.4 Matcher Syntax

| Matcher | Behavior |
|---------|----------|
| `"ToolName"` | Matches specific tool |
| `"Edit\|Create"` | Pipe-separated OR match |
| `"*"` | Matches all tools |

### 6.5 Environment Variables in Hooks

| Variable | Value |
|----------|-------|
| `$FACTORY_PROJECT_DIR` | Absolute path to project root |

**Critical**: Always use absolute paths in hook commands. Hooks execute from Droid's working directory, not the project root.

### 6.6 Storage

Hooks can be stored in:
- User settings (`~/.factory/settings.json` → `hooks` key) — global across all projects
- Project settings (`.factory/settings.json` → `hooks` key) — project-specific

### 6.7 Common Use Cases

- Automatic code formatting after edits (`prettier`, `gofmt`, `black`)
- Command logging and compliance audit trails
- Desktop notifications when awaiting input
- File protection (blocking writes to sensitive paths)
- Convention enforcement via automated feedback
- Markdown post-processing with language detection

### 6.8 AIWG Integration Assessment

**Compatibility**: High. Hook event names and JSON structure are near-identical to Claude Code hooks. Core logic can be shared.

**Difference**: Claude Code uses `$CLAUDE_PROJECT_DIR`; Factory uses `$FACTORY_PROJECT_DIR`.

**Difference**: Factory has `SubagentStop` and `PreCompact` events; Claude Code equivalents may differ. Map `SubagentStop` to post-Task events.

**Opportunity**: Factory's `SessionStart` hook is well-suited for AIWG pre-flight checks (sync, doctor).

---

## 7. Settings

### 7.1 File Locations

| Platform | User-Level | Project-Level |
|----------|-----------|---------------|
| macOS/Linux | `~/.factory/settings.json` | `.factory/settings.json` |
| Windows | `%USERPROFILE%\.factory\settings.json` | `.factory/settings.json` |

Local overrides: `settings.local.json` at either level (suitable for `.gitignore`).

### 7.2 Core Settings Fields

| Setting | Type | Description |
|---------|------|-------------|
| `model` | String | Default AI model |
| `reasoningEffort` | String | `off`, `low`, `medium`, `high` |
| `autonomyMode` | String | Command execution authorization level |
| `cloudSessionSync` | Boolean | Mirror CLI sessions to web app |
| `diffMode` | String | `github` or `unified` |
| `completionSound` | Boolean | Audio on task completion |
| `awaitingInputSound` | Boolean | Audio when input needed |
| `soundFocusMode` | String | `always`, `focused`, `unfocused` |
| `commandAllowlist` | Array | Pre-authorized safe commands |
| `commandDenylist` | Array | Commands requiring confirmation |
| `enableDroidShield` | Boolean | Secret scanning + git guardrails |
| `hooksDisabled` | Boolean | Global hook execution kill switch |
| `ideAutoConnect` | Boolean | IDE auto-connection from external terminals |
| `todoDisplayMode` | String | `inline` or `pinned` |
| `showThinkingInMainView` | Boolean | Display reasoning blocks |
| `customModels` | Object | BYOK (Bring Your Own Key) model configs |

Settings take effect immediately after modification via `/settings` menu.

---

## 8. Mixed Models (Per-Droid Model Selection)

### 8.1 Overview

Factory supports model mixing at two levels:
1. **Per-droid**: Set `model` field in droid frontmatter
2. **Spec Mode**: Configure a separate planning model for Specification Mode

### 8.2 Per-Droid Configuration

Set the `model` field in any droid's YAML frontmatter:

```yaml
---
name: deep-reviewer
model: claude-opus-4-5-20251201
reasoningEffort: high
tools: ["read-only"]
---
```

Use `custom:` prefix for BYOK models:
```yaml
model: custom:my-fine-tuned-model
```

### 8.3 Reasoning Effort Levels

| Level | Behavior | Best For |
|-------|----------|----------|
| `off` | No extended thinking | Fast, simple tasks |
| `low` | Brief consideration | Balanced speed/depth |
| `medium` | Moderate analysis | Complex decisions |
| `high` | Deep analysis | Critical architectural choices |

`reasoningEffort` is ignored when `model: inherit`.

### 8.4 Model Compatibility Constraints

| Default Model | Compatible Spec Mode Models |
|---------------|----------------------------|
| OpenAI model | OpenAI models only (encrypted reasoning format) |
| Anthropic with reasoning | Anthropic models only (reasoning trace compatibility) |
| Anthropic without reasoning | Any non-OpenAI model |

### 8.5 Spec Mode Configuration

Access via: `droid` → `/model` → "Configure Spec Mode Model"

Recommended pattern:
- **Default**: Claude Haiku or Sonnet (fast iteration)
- **Spec Mode**: Claude Opus with `high` reasoning (thorough planning)

### 8.6 AIWG Integration Assessment

**Opportunity**: AIWG can use per-droid model selection to assign lightweight models to high-volume droids (e.g., linters, formatters) and heavyweight models to critical review droids (e.g., security auditor, architecture reviewer).

**Opportunity**: The `reasoningEffort` field maps directly to AIWG's quality tiers — High for Elaboration artifacts, Low for Construction iteration tasks.

---

## 9. AGENTS.md (Project Context File)

### 9.1 Overview

AGENTS.md is a Markdown briefing file for AI coding agents. It serves as a "briefing packet" providing project context that complements README.md. This is a cross-platform standard — README is for humans, AGENTS.md is for agents.

### 9.2 Discovery Hierarchy

Factory searches for AGENTS.md in this order:
1. Current working directory
2. Parent directories up to repo root
3. Subdirectory-specific files (for monorepos)
4. Personal override at `~/.factory/AGENTS.md`

Multiple files can coexist; closest file takes precedence.

### 9.3 Standard Content Sections

```markdown
# Project Context

## Build & Test
\`\`\`bash
npm install
npm test
npm run build
\`\`\`

## Architecture Overview
[Module descriptions, data flow]

## Security
[Auth flows, API key handling, sensitive paths]

## Git Workflows
[Branching strategy, commit conventions]

## Conventions & Patterns
[Folder structure, naming rules, code style]
```

### 9.4 Best Practices

- Keep under 150 lines
- Use concrete copy-paste commands in backticks
- Update alongside code changes
- Include objective verification criteria before merging

### 9.5 Cross-Platform Compatibility

AGENTS.md is supported across: Factory AI, Cursor, Aider, Gemini CLI, Jules, and emerging platforms. It is intentionally non-proprietary.

### 9.6 AIWG Integration Assessment

**Compatibility**: High. AIWG can generate AGENTS.md as part of project setup, populated from `.aiwg/` artifact content (architecture, conventions, security posture).

**Opportunity**: AIWG's Elaboration phase artifacts (SAD, ADRs, conventions) are the ideal source for auto-generating AGENTS.md content. This creates a maintained, agent-readable project brief derived from SDLC artifacts.

---

## 10. Plugins

### 10.1 Overview

Plugins bundle multiple Factory components into a single distributable package. They are Factory's equivalent of AIWG's framework packages — sharable collections of droids + skills + commands + hooks + MCP servers.

### 10.2 Plugin vs. Standalone Configuration

| Use Case | Recommendation |
|----------|---------------|
| Personal workflow | Standalone `.factory/` files |
| Project-specific customization | Standalone `.factory/` files |
| Team sharing | Plugin |
| Community distribution | Plugin |
| Reuse across multiple projects | Plugin |

### 10.3 Directory Structure

```
my-plugin/
├── .factory-plugin/
│   └── plugin.json          ← Required manifest
├── commands/                ← Slash commands
├── skills/                  ← Skill definitions
├── droids/                  ← Custom droids
├── mcp.json                 ← MCP server configs
└── hooks/                   ← Hook definitions
```

### 10.4 Plugin Manifest (`plugin.json`)

```json
{
  "name": "my-plugin",
  "description": "What this plugin does",
  "version": "abc1234",
  "author": "team-name"
}
```

Versions track by Git commit hash. Semantic versioning is not supported — updates always fetch latest commit.

### 10.5 Installation Scopes

| Scope | Location | Sharing |
|-------|----------|---------|
| User | `~/.factory/` | Personal, all projects |
| Project | `.factory/` | Team-shared via git |
| Organization | Managed settings | Auto-installed org-wide |

### 10.6 AIWG Integration Assessment

**Opportunity**: AIWG frameworks could ship as Factory plugins. An `aiwg use sdlc --provider factory` command could install the AIWG SDLC framework as a Factory plugin rather than individual files.

**Gap**: Factory plugin versions are Git commit hashes — no semver. AIWG's CalVer release discipline cannot be surfaced in the plugin manifest.

**Gap**: Factory plugins do not support the `behaviors` artifact type (OpenClaw-specific).

---

## 11. Droid Exec (Headless / CI Execution)

### 11.1 Overview

`droid exec` is Factory's one-shot task runner for non-interactive, automated execution. It is designed for CI/CD pipelines, shell scripts, and batch processing. Equivalent to running Claude Code non-interactively in a pipeline context.

### 11.2 Installation and Authentication

```bash
# Install CLI
curl -fsSL https://app.factory.ai/cli | sh

# Authenticate
export FACTORY_API_KEY=fk-...
```

API key sourced from Factory Settings Page.

### 11.3 Command Structure

```bash
droid exec [options] [prompt]
```

### 11.4 Flags and Options

| Flag | Short | Description |
|------|-------|-------------|
| `--output-format <fmt>` | `-o` | `text`, `json`, `stream-json`, `stream-jsonrpc` |
| `--auto <level>` | — | Autonomy: `low`, `medium`, `high` (default: read-only) |
| `--file <path>` | `-f` | Read prompt from file instead of argument |
| `--session-id <id>` | `-s` | Continue an existing session |
| `--model <id>` | `-m` | Override model for this execution |
| `--cwd <path>` | — | Set working directory (useful for monorepos) |
| `--list-tools` | — | Display available tools and exit |
| `--skip-permissions-unsafe` | — | Bypass all permission checks (dangerous; isolated envs only) |

### 11.5 Autonomy Levels

| Level | Permitted Operations |
|-------|---------------------|
| Default (read-only) | File inspection, git status, directory listing |
| `--auto low` | File creation/editing in project directories; no system modifications |
| `--auto medium` | Development tasks: `npm install`, `git commit`, builds |
| `--auto high` | Production operations: `git push`, deployments |
| `--skip-permissions-unsafe` | All operations; use only in sandboxed environments |

### 11.6 Output Formats

| Format | Use Case |
|--------|----------|
| `text` | Human-readable; default |
| `json` | Structured; script parsing |
| `stream-json` | Real-time JSONL events showing execution progress |
| `stream-jsonrpc` | Multi-turn conversation protocol |

### 11.7 Usage Examples

```bash
# Basic execution
droid exec "analyze code quality"

# With autonomy and file output
droid exec --auto low "fix the bug in src/main.js"

# Prompt from file
droid exec -f prompt.md

# Piped input
echo "summarize repo structure" | droid exec

# Session continuation
droid exec --session-id abc123 "continue with next steps"

# Monorepo scoping
droid exec --cwd packages/api --auto low "run analysis"
```

### 11.8 GitHub Actions / CI Integration

```yaml
name: Code Analysis
on: [push]
jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Factory CLI
        run: curl -fsSL https://app.factory.ai/cli | sh
      - name: Run Droid Analysis
        env:
          FACTORY_API_KEY: ${{ secrets.FACTORY_API_KEY }}
        run: droid exec --auto low "analyze codebase and write report.md"
```

### 11.9 Parallel Execution Patterns

```bash
# GNU xargs parallelization across files
find src -name "*.ts" -print0 | xargs -0 -P 4 -I {} \
  droid exec --auto low "Refactor {}"

# Background processing across packages
for path in packages/*; do
  (cd "$path" && droid exec --auto low "Run analysis") &
done
wait
```

### 11.10 Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| Non-zero | Failure (permission violation, tool error, timeout) |

### 11.11 AIWG Integration Assessment

**Opportunity**: AIWG's `aiwg ralph` and `aiwg mc` patterns map naturally to `droid exec`. AIWG could add a `--provider factory` mode that translates Ralph tasks to `droid exec` calls.

**Opportunity**: The `--auto` level system provides finer-grained control than Claude Code's permission model. AIWG SDLC phase gates could map to autonomy levels (Elaboration → `low`, Construction → `medium`, Transition → `high`).

**Difference**: `droid exec` defaults to read-only with explicit opt-in for mutations. Claude Code is permissive by default. AIWG templates should specify `--auto` level explicitly in any CI patterns.

---

## 12. GitHub Integration

### 12.1 Overview

Factory's GitHub App enables automated PR review and issue-driven development directly from GitHub. Installation is guided via `/install-github-app` in an interactive session.

### 12.2 Installation Process

1. Run `/install-github-app` in interactive Droid session
2. Verify GitHub CLI prerequisites and authentication
3. Select target repository
4. Authorize the Factory Droid GitHub App
5. Choose which workflows to enable
6. Review and merge the generated PR containing workflow files

Post-install: Add `FACTORY_API_KEY` secret to GitHub repository settings.

### 12.3 Workflow Types

**@Droid Workflow** — Triggered by mention:

```
Mention "@droid" in:
- Issue comments
- PR comments
- PR reviews
- Issue descriptions
```

Triggers: `issue_comment`, `pull_request_review_comment`, `pull_request_review`, `issues`

Use case: Request feature implementation or code changes directly through GitHub comments.

**Droid Review Workflow** — Automatic PR review:

- Triggers: `pull_request` (opened, reopened, ready for review)
- No manual trigger required
- Provides first-pass AI review on all new PRs

### 12.4 Required GitHub App Permissions

| Permission | Level |
|-----------|-------|
| Contents | Read + Write |
| Pull Requests | Read + Write |
| Issues | Read + Write |
| Actions | Read |

### 12.5 AIWG Integration Assessment

**Opportunity**: AIWG security gates and quality checks can run as GitHub Actions via `droid exec` post-PR-open. The `@droid` mention pattern enables on-demand AIWG workflow triggers from GitHub.

**Opportunity**: The Droid Review Workflow can be configured to use an AIWG-provided code review droid (`.factory/droids/code-reviewer.md`) for consistent SDLC-aligned reviews.

---

## 13. Missions (Multi-Agent Orchestration)

### 13.1 Overview

Missions are Factory's structured approach for large, multi-feature projects. They enable collaborative planning followed by orchestrated multi-agent execution. This is the Factory equivalent of AIWG's Mission Control (`aiwg mc`).

### 13.2 Core Workflow

1. Enter mission mode via `/enter-mission`
2. Collaborate with Droid to define features, milestones, and success criteria
3. Build structured feature list organized into milestones
4. Develop/leverage skills for project-specific needs
5. Enter Mission Control for orchestrated execution monitoring

### 13.3 Planning Emphasis

Factory's documentation: "The biggest value we have found in Missions is in the planning phase." Thorough scoping prevents execution failures. Cost estimation heuristic:

```
total runs ≈ #features + 2 * #milestones
```

(One run per feature + ~two validator runs per milestone)

### 13.4 Configuration Inheritance

Missions inherit the complete Droid configuration:
- MCP integrations (Linear, Sentry, Notion, etc.)
- Custom skills (existing + newly developed during mission)
- Lifecycle hooks
- Custom droids/subagents
- Project standards from AGENTS.md

### 13.5 Human-in-the-Loop Controls

During execution, users act as project managers:

| Action | When to Use |
|--------|-------------|
| Pause frozen mission | When execution stalls |
| Mark items complete | When workers stall; force forward |
| Re-plan mid-mission | Adjust direction, drop/add features |
| Unblock milestones | Have orchestrator re-assess blockers |

### 13.6 Ideal Use Cases

- Full-stack application development
- Research requiring multiple synthesis approaches
- Brownfield migrations and codebase modernization
- Functional prototypes

Common thread: work benefiting from upfront planning + structured decomposition.

### 13.7 Status

Research preview — actively seeking feedback on parallelization, correctness, and cost-quality tradeoffs.

### 13.8 AIWG Integration Assessment

**Alignment**: Missions map closely to AIWG's SDLC phase orchestration. The Mission planning phase corresponds to Elaboration; execution corresponds to Construction.

**Opportunity**: AIWG flow commands (e.g., `/flow-inception-to-elaboration`) could be implemented as Mission templates — pre-defined feature/milestone structures that users instantiate per project.

**Difference**: Factory Missions are interactive and user-driven during planning. AIWG orchestration is more template-driven. Hybrid approach: use AIWG templates to seed Factory Mission planning prompts.

---

## 14. Code Review

### 14.1 Overview

The `/review` command provides interactive AI-powered code review with multiple review modes.

### 14.2 Review Modes

| Mode | Scope | Best For |
|------|-------|----------|
| Base Branch Review | Current branch vs target (e.g., `origin/main`) | Pre-PR review |
| Uncommitted Changes | Staged + unstaged + untracked | Pre-commit sanity check |
| Commit Review | Specific historical commit | Post-hoc audit |
| Custom Instructions | User-defined focus | Security, performance, domain reviews |

### 14.3 Severity Classification

| Severity | Priority | Action |
|----------|----------|--------|
| `[P0]` | Critical | Release-blocking; must fix |
| `[P1]` | Urgent | Next cycle |
| `[P2]` | Normal | Scheduled fix |
| `[P3]` | Low | Nice to have |

Each finding includes file paths, line numbers, explanations, and suggested fixes.

### 14.4 CI/CD Automation

For automated review workflows, use `droid exec` rather than the interactive `/review` command:

```bash
droid exec --auto low "Review the changes in this PR and output findings to review-report.md"
```

### 14.5 AIWG Integration Assessment

**Opportunity**: AIWG's security gate and code review SDLC flows can invoke `droid exec` with review prompts. The P0-P3 severity schema aligns well with AIWG risk register severity levels.

**Opportunity**: The GitHub App's Droid Review Workflow can use a custom droid configured with AIWG's review criteria and quality gates.

---

## 15. Readiness Reports (Codebase Analysis)

### 15.1 Overview

The `/readiness-report` command evaluates repository maturity against the Autonomy Maturity Model. This is Factory's codebase indexing / analysis capability — not a traditional knowledge graph but a structured maturity assessment.

### 15.2 Maturity Levels

| Level | Name | Criteria |
|-------|------|----------|
| 1 | Functional | Basic tooling present |
| 2 | Documented | Processes established |
| 3 | Standardized | Security and observability configured |
| 4 | Optimized | Fast feedback loops and measurement |
| 5 | Autonomous | Self-improving systems |

### 15.3 Analysis Scope

- Language detection: JavaScript/TypeScript, Python, Rust, Go, Java, Ruby
- Sub-application discovery: Monorepo vs single service, independently deployable units
- Scoring: Numerator/denominator per criterion (e.g., "Linter: 2/2 — ESLint in both apps")
- Recommendations: 2-3 highest-impact actions to advance one maturity level

### 15.4 Output and Persistence

- Displayed in CLI with structured criteria results
- Automatically persisted to web dashboard for historical tracking
- Enables maturity progression monitoring across team

### 15.5 AIWG Integration Assessment

**Alignment**: Readiness Reports align with AIWG's project health checks and Elaboration phase gate criteria. Level 3+ corresponds to AIWG's Construction-ready gate.

**Opportunity**: AIWG could generate `/readiness-report` as part of `flow-gate-check` for Factory AI environments — surfacing maturity score as a gate criterion.

---

## 16. Specification Mode

### 16.1 Overview

Specification Mode is a planning layer where Droid helps define detailed implementation plans before writing code. It uses a separately configured model (often higher-capability with higher reasoning effort) for the planning phase.

### 16.2 Configuration

Via `/model` → "Configure Spec Mode Model". The Spec Mode model is independent of the default execution model.

### 16.3 Recommended Patterns

| Default Model | Spec Mode Model | Use Case |
|---------------|-----------------|----------|
| Claude Haiku/Sonnet | Claude Opus (high reasoning) | Anthropic-primary workflow |
| GPT-5-Codex | GPT-5 (high reasoning) | OpenAI-primary workflow |

### 16.4 AIWG Integration Assessment

**Alignment**: Specification Mode maps to AIWG's Elaboration phase — thorough upfront design before Construction coding begins. AIWG's architecture and requirements agents should run in Spec Mode contexts.

---

## 17. Directory Structure Reference

Complete `.factory/` project layout:

```
.factory/
├── settings.json          ← Project settings (overrides user settings)
├── settings.local.json    ← Machine-local overrides (gitignore this)
├── mcp.json               ← MCP server config (team-shared)
├── droids/                ← Custom droid definitions (*.md)
│   ├── code-reviewer.md
│   ├── security-auditor.md
│   └── test-engineer.md
├── commands/              ← Custom slash commands (*.md or shebang scripts)
│   ├── review.md
│   └── deploy-check.sh
├── skills/                ← Skill directories
│   ├── typescript-patterns/
│   │   ├── SKILL.md
│   │   └── examples/
│   └── security-review/
│       ├── SKILL.md
│       └── checklist.md
└── AGENTS.md              ← (optional; usually at repo root)
```

Personal configuration at `~/.factory/`:

```
~/.factory/
├── settings.json          ← User-global defaults
├── mcp.json               ← Personal MCP servers
├── droids/                ← Personal droids
├── commands/              ← Personal commands
├── skills/                ← Personal skills
└── AGENTS.md              ← Personal project context override
```

---

## 18. AIWG Deployment Mapping

How AIWG artifacts map to Factory AI paths:

| AIWG Source | Factory Target | Notes |
|-------------|---------------|-------|
| `agentic/code/frameworks/sdlc-complete/agents/*.md` | `.factory/droids/` | Rename `tools` field values to Factory tool IDs |
| `.claude/commands/*.md` | `.factory/commands/` | `$ARGUMENTS` works identically |
| `.claude/skills/*/SKILL.md` | `.factory/skills/*/SKILL.md` | Directory structure preserved |
| `.claude/rules/*.md` | `.factory/AGENTS.md` + settings | Rules become context or constraints |
| `~/.claude/mcp.json` | `~/.factory/mcp.json` or `.factory/mcp.json` | Path change only |
| Hooks config | `.factory/settings.json` → `hooks` | Event names differ slightly |

### Known Gaps

1. **Rules system**: Factory has no direct equivalent to Claude Code's `.factory/rules/` path-scoped rules. AIWG rules must be flattened into AGENTS.md context or droid system prompts.

2. **Tool name differences**: Factory tool IDs (e.g., `FetchUrl`, `Execute`) differ from Claude Code tool names (`WebFetch`, `Bash`). AIWG agent deployment must translate.

3. **No behaviors type**: Factory does not support the `behaviors` artifact type (OpenClaw-specific).

4. **Subdirectory restriction**: `.factory/droids/` only discovers top-level files. AIWG agents organized in subdirectories must be flattened on deploy.

5. **Plugin versioning**: Factory plugins version by Git commit hash, not CalVer. AIWG version information cannot surface directly in the plugin manifest.

6. **Skill directory vs flat file**: Factory skills require a directory wrapper (`skill-name/SKILL.md`). AIWG deployment must create this structure.

---

## 19. Key Behavioral Differences vs Claude Code

| Behavior | Claude Code | Factory AI |
|----------|-------------|------------|
| Default execution mode | Permissive (asks for dangerous ops) | Read-only (explicit opt-in via `--auto`) |
| Subagent discovery | `.claude/agents/` (auto-discovery) | `.factory/droids/` (top-level only) |
| Rules scoping | Path-scoped per `CLAUDE.md` | No path-scoping; AGENTS.md is global |
| MCP config location | `~/.claude/mcp.json` | `~/.factory/mcp.json` |
| Hook env var | `$CLAUDE_PROJECT_DIR` | `$FACTORY_PROJECT_DIR` |
| CI execution | `claude -p "..."` | `droid exec "..."` |
| Multi-agent orchestration | Task tool + agent system prompts | Task tool + droids + Missions |
| Skill format | Flat file `SKILL.md` | Directory `skill-name/SKILL.md` |
| Plugin system | None (AIWG-level) | Native `.factory-plugin/` format |
| Model mixing | System prompt only | Per-droid `model` + `reasoningEffort` frontmatter |

---

*Sources: docs.factory.ai (fetched 2026-03-27). All configuration schemas and feature descriptions reflect the current Factory AI CLI as of that date.*
