# OpenCode Platform Reference

**Status**: Active — targeting anomalyco/opencode (opencode.ai)
**Last Updated**: 2026-03-27
**Source**: https://github.com/anomalyco/opencode
**Docs**: https://opencode.ai/docs/

---

## Quick Reference

| Resource | Link |
|----------|------|
| Repository | https://github.com/anomalyco/opencode |
| Documentation | https://opencode.ai/docs/ |
| Config Schema | https://opencode.ai/config.json |
| Language | TypeScript (Bun runtime) |
| Latest Release | v1.3.x (active development, March 2026) |

---

## 1. Core Architecture

OpenCode is a terminal AI coding agent with a client/server architecture. The server runs locally and the TUI is one of multiple possible clients (mobile, web, IDE). Key features:

- Multi-provider LLM support (Anthropic, OpenAI, Gemini, Groq, OpenRouter, Bedrock, Azure, VertexAI)
- Native agent persona support via markdown files
- Native commands via markdown files
- Native skills system (`SKILL.md` discovery)
- MCP server integration
- Context injection via `instructions` array
- SQLite-backed session persistence

---

## 2. Config File

**Project-level:** `.opencode/opencode.json` or `.opencode/opencode.jsonc`
**Global:** `~/.config/opencode/opencode.json`

Config schema: `https://opencode.ai/config.json`

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
    ".opencode/rule/*.md"
  ]
}
```

**Key config fields:**

| Field | Purpose |
|-------|---------|
| `model` | Default model (top-level, not per-agent) |
| `small_model` | Lightweight model for subagent tasks |
| `mcp` | MCP server definitions (key: `mcp`, not `mcpServers`) |
| `instructions` | Array of file paths/globs injected as context |
| `provider` | Custom provider definitions (e.g., Ollama) |
| `skills` | Additional skill folder paths |

Config merge order (lowest → highest priority): system managed → global → project `.opencode/` directories.

---

## 3. Agent System

### 3.1 User-Defined Agents (Native)

OpenCode natively discovers agent persona files from:

| Scope | Paths |
|-------|-------|
| Project | `.opencode/agent/**/*.md` or `.opencode/agents/**/*.md` |
| Global | `~/.config/opencode/agent/**/*.md` |

Both singular (`agent/`) and plural (`agents/`) directory names are accepted. AIWG deploys to `.opencode/agent/` — correctly discovered.

### 3.2 Agent File Format

```markdown
---
name: security-auditor
description: Specialized security review agent
model: anthropic/claude-opus-4-6
---

You are a security auditor. Review code for vulnerabilities...
```

### 3.3 Built-in Agent Roles

OpenCode has two built-in interactive agents selectable via Tab:

| Agent | Role |
|-------|------|
| `build` | Default full-access development agent |
| `plan` | Read-only analysis/exploration agent |

A `general` subagent is available via `@general` in messages.

---

## 4. Commands

### 4.1 Discovery

OpenCode discovers command files from both singular and plural directory names:

| Scope | Paths | Prefix |
|-------|-------|--------|
| Project | `.opencode/command/**/*.md` or `.opencode/commands/**/*.md` | `project:` |
| Global (XDG) | `~/.config/opencode/command/**/*.md` | `user:` |

AIWG deploys to `.opencode/commands/` — correctly discovered.

### 4.2 Command Format

Plain markdown files. Filename (without extension) is the command ID.

```markdown
Review staged changes with `git diff --cached` and write a conventional commit message.
```

Named arguments use `$NAME` syntax — OpenCode prompts for each before sending.

### 4.3 Invocation

Commands appear in the `Ctrl+K` command picker. No slash-command syntax.

Subdirectory nesting maps to colon-separated IDs: `git/commit.md` → `project:git:commit`

---

## 5. Skills System

### 5.1 Discovery

OpenCode has a native skills system. Skills are discovered from:

| Scope | Paths |
|-------|-------|
| Project `.opencode/` | `{skill,skills}/**/SKILL.md` |
| External dirs (`.claude`, `.agents`) | `skills/**/SKILL.md` |
| Global | `~/.config/opencode/skills/**/SKILL.md` |
| Config-specified | `skills.paths` array in config |

AIWG deploys to `.opencode/skill/` — correctly discovered.

**Important:** OpenCode looks for files named exactly `SKILL.md` within the skill directory, not arbitrary `.md` files.

### 5.2 Skill File Format

A skill is a directory containing a `SKILL.md` file:

```
.opencode/skill/
└── my-skill/
    └── SKILL.md
```

Skills are loaded on demand (lazy) via the skill tool when the agent recognizes a matching task.

---

## 6. Rules System

OpenCode has **no dedicated rules directory discovery**. Rules are loaded via the `instructions` array in `opencode.json`.

AIWG deploys rules to `.opencode/rule/`. They are loaded by including the glob in `instructions`:

```json
{
  "instructions": [
    "AGENTS.md",
    ".opencode/rule/*.md"
  ]
}
```

The AIWG `opencode.json.aiwg-template` includes this entry by default.

**Auto-loaded context files** (no config needed):

```
AGENTS.md              (primary project context — same as Claude Code)
CLAUDE.md              (Claude Code compatibility fallback)
.github/copilot-instructions.md
.cursorrules
.cursor/rules/
```

---

## 7. MCP Integration

MCP is first-class. Config key is `mcp` (not `mcpServers`):

```json
{
  "mcp": {
    "aiwg": {
      "type": "local",
      "command": ["npx", "aiwg", "mcp", "serve"]
    },
    "remote": {
      "type": "sse",
      "url": "https://example.com/mcp"
    }
  }
}
```

Transport types: `local` (subprocess), `sse` (remote).

---

## 8. AIWG Integration Summary

| AIWG Artifact | Deployed Path | Discovery Mechanism | Status |
|---------------|--------------|---------------------|--------|
| Agents | `.opencode/agent/` | `{agent,agents}/**/*.md` native scan | ✓ native |
| Commands | `.opencode/commands/` | `{command,commands}/**/*.md` native scan | ✓ native |
| Skills | `.opencode/skill/` | `{skill,skills}/**/SKILL.md` native scan | ✓ native |
| Rules | `.opencode/rule/` | Via `instructions` array in config | ✓ (template required) |
| Context | `AGENTS.md` | Auto-loaded | ✓ native |
| MCP | `opencode.json` | `mcp` key | ✓ native |

---

## 9. Session Model

Sessions stored in SQLite under `.opencode/` data directory.

- Auto-compaction at ~95% context fill
- Session resume via `-s <session-id>`
- Sub-sessions for subagent tasks

---

## 10. Ralph Loop Integration

OpenCode's headless mode for Ralph loop execution:

```bash
aiwg ralph "Fix all tests" --completion "npm test passes" --provider opencode
```

---

## References

- Repository: https://github.com/anomalyco/opencode
- AIWG provider: `tools/agents/providers/opencode.mjs`
- Config templates: `agentic/code/frameworks/sdlc-complete/templates/opencode/`
- Integration guide: `docs/integrations/opencode-quickstart.md`
