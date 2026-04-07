# OpenAI Codex Platform Reference

**Status**: Active — full AIWG provider support
**Last Updated**: 2026-04-06
**Source**: https://github.com/openai/codex (full Rust + TypeScript)
**Docs**: https://github.com/openai/codex/tree/main/docs

---

## Quick Reference

| Resource | Link |
|----------|------|
| Repository | https://github.com/openai/codex |
| CLI npm package | `npm install -g @openai/codex` |
| SDK | `npm install @openai/codex-sdk` |
| Config | `~/.codex/config.toml` |
| Language | Rust (core) + TypeScript (CLI wrapper) |

---

## 1. Core Architecture

Codex CLI is a terminal-based AI coding agent by OpenAI. Key characteristics:

- Multi-model support (GPT-5.3-Codex, codex-mini-latest, GPT-5-Codex-Mini)
- AGENTS.md project context injection
- Native skills system with user-global and project-local discovery
- Custom prompt slash commands (`~/.codex/prompts/`)
- MCP server integration via `config.toml`
- Sandbox modes: `read-only`, `workspace-write`, `full-auto`
- `codex exec` for non-interactive CI/CD use

---

## 2. Config File

**Global**: `~/.codex/config.toml`

```toml
# Model configuration
model = "codex-mini-latest"
model_reasoning_effort = "medium"
approval_policy = "on-request"
sandbox_mode = "workspace-write"

# Context file fallback chain
project_doc_max_bytes = 32768
project_doc_fallback_filenames = ["CLAUDE.md", "WARP.md"]

# MCP server integration
[mcp_servers.aiwg]
command = "node"
args = ["/path/to/aiwg/src/mcp/server.mjs"]
startup_timeout_sec = 10.0
tool_timeout_sec = 60.0

# Profiles
[profiles.aiwg-sdlc]
model = "gpt-5.3-codex"
model_reasoning_effort = "high"
approval_policy = "on-request"
sandbox_mode = "workspace-write"

[profiles.aiwg-readonly]
model = "codex-mini-latest"
model_reasoning_effort = "medium"
sandbox_mode = "read-only"
```

**Key config fields:**

| Field | Purpose |
|-------|---------|
| `model` | Default model |
| `model_reasoning_effort` | `low`, `medium`, `high` |
| `approval_policy` | `auto`, `on-request`, `never` |
| `sandbox_mode` | `read-only`, `workspace-write`, `full-auto` |
| `project_doc_max_bytes` | Max AGENTS.md size (default 32768) |
| `project_doc_fallback_filenames` | Fallback context files if no AGENTS.md |

---

## 3. Context Files

Codex reads project context from the repository root, scanning upward to cwd:

| File | Priority | Notes |
|------|----------|-------|
| `AGENTS.md` | Primary | Standard across OpenAI tools |
| `CLAUDE.md` | Fallback | Add to `project_doc_fallback_filenames` |
| `CODEX.md` | Fallback | Legacy; use AGENTS.md for new projects |

AIWG deploys `AGENTS.md` via `--create-agents-md` flag.

---

## 4. Agent Definitions

**Location**: `.codex/agents/` (project-local)

Same Markdown + YAML frontmatter format as Claude Code:

```markdown
---
name: security-auditor
description: Performs security reviews
model: gpt-5.3-codex
tools:
  - read
  - shell
---

You are a security auditor. Review code for vulnerabilities...
```

AIWG deploys 176 agents to `.codex/agents/`.

---

## 5. Skills System

> **Bug open**: #766 — current AIWG deployment uses deprecated `~/.codex/skills/` path. Fix pending.

### 5.1 Discovery Paths

Verified from `codex-rs/core-skills/src/loader.rs` (Codex source):

| Scope | Path | Status |
|-------|------|--------|
| Project | `.agents/skills/` | **Primary — use this** |
| User-global | `~/.agents/skills/` | **Primary — use this** |
| User-global | `~/.codex/skills/` | Legacy/deprecated — avoid |

The `.agents/skills/` path is also the universal cross-platform path scanned by Warp, OpenClaw, and Copilot/VS Code.

### 5.2 Skill Format

Each skill is a directory containing `SKILL.md`:

```
.agents/skills/
└── voice-apply/
    └── SKILL.md
```

`SKILL.md` format:
```markdown
---
name: "voice-apply"
description: "Apply voice profile to content. Use when writing in a specific voice or transforming content style."
platforms: [codex]
---

# Skill body (kept on disk, loaded on demand)
Instructions, examples, etc.
```

**Constraints:**
- `name`: ≤ 100 characters
- `description`: ≤ 500 characters (only name + description injected into context by default)
- Body stays on disk, read on demand when skill is invoked

### 5.3 AIWG Deployment (Current/Broken)

```bash
aiwg use sdlc --provider codex
# Deploys agents to .codex/agents/ ✓
# Deploys skills to ~/.codex/skills/ ✗ (deprecated path, fix in #766)
# Records skills: 0 in aiwg.config ✗ (counter looks in wrong dir)
```

### 5.4 Correct Deployment (Post-#766)

```bash
# Should deploy to:
# .agents/skills/         ← project-local (git-tracked)
# ~/.agents/skills/       ← user-global (cross-project)
```

---

## 6. Custom Prompts (Slash Commands)

**Location**: `~/.codex/prompts/` (user-global)

Custom slash commands invoked by `/command-name` in Codex Chat.

```markdown
---
description: Conduct comprehensive PR review
argument-hint: PR_NUMBER=<number>
---

Review PR #$PR_NUMBER from multiple perspectives:

## Code Quality
Check for clean code, error handling, potential bugs.

## Security
Check for injection vulnerabilities, input validation.

## Testing
Verify test coverage and edge cases.
```

**Placeholder syntax:**
- `$1`–`$9`, `$ARGUMENTS` — positional
- `$NAMED` — named parameter
- Filename (sans `.md`) becomes command name

AIWG deploys commands as prompts via `deploy-prompts-codex.mjs` to `~/.codex/prompts/`.

---

## 7. MCP Integration

**Config**: `~/.codex/config.toml` (TOML, not JSON)

```toml
[mcp_servers.aiwg]
command = "node"
args = ["/path/to/aiwg/src/mcp/server.mjs"]
startup_timeout_sec = 10.0
tool_timeout_sec = 60.0
```

Transport: subprocess (`command` + `args`). No SSE/HTTP support in CLI MCP config.

Install via: `aiwg mcp install codex` (outputs TOML snippet to add to config.toml).

---

## 8. Built-in Tools

| Tool | Description | Sandbox Requirement |
|------|-------------|---------------------|
| `shell` | Execute shell commands | `workspace-write` |
| `read` | Read file contents | `read-only` |
| `write` | Write/create files | `workspace-write` |
| `apply_patch` | Apply unified diffs | `workspace-write` |
| `view_image` | View local images | `read-only` |
| `web_search` | Web search | Feature flag required |

---

## 9. `codex exec` (Non-Interactive / CI)

```bash
codex exec "Review this PR for security issues" \
  --full-auto \
  --output-schema schema.json \
  -o result.json
```

**Flags:**
- `--full-auto` — auto-approve all workspace writes
- `--json` — JSONL event stream output
- `--output-schema` — constrain output to JSON schema
- `resume --last` — continue previous session

**AIWG CI/CD usage:**
```bash
codex exec "Run AIWG security review workflow" --full-auto
```

---

## 10. Models

| Model | AIWG Alias | Use Case |
|-------|-----------|----------|
| `gpt-5.3-codex` | `opus` | Most capable, high-stakes tasks |
| `codex-mini-latest` | `sonnet` | Default CLI, balanced |
| `gpt-5-codex-mini` | `haiku` | Cost-effective, light tasks |

---

## 11. Sandbox Modes

| Mode | Write Access | Use Case |
|------|-------------|----------|
| `read-only` | None | Code review, analysis |
| `workspace-write` | Current directory only | Normal development |
| `full-auto` | Unrestricted | CI/CD automation |

---

## 12. AIWG Integration Summary

| AIWG Artifact | Current Deployed Path | Should Deploy To | Status |
|---------------|----------------------|-----------------|--------|
| Agents | `.codex/agents/` | `.codex/agents/` | ✓ correct |
| Commands | `~/.codex/prompts/` | `~/.codex/prompts/` | ✓ correct |
| Skills | `~/.codex/skills/` | `.agents/skills/` + `~/.agents/skills/` | ✗ bug #766 |
| Rules | `.codex/rules/` | `.codex/rules/` | ✓ correct |
| Context | `AGENTS.md` | `AGENTS.md` | ✓ correct |
| MCP | `~/.codex/config.toml` | `~/.codex/config.toml` | ✓ correct |
| Skills count | `skills: 0` | accurate count | ✗ bug #766 |

---

## 13. Changelog

| Date | Change |
|------|--------|
| 2026-04-06 | Created — consolidated from codex-integration-plan.md + #766 research |
