# OpenClaw Reference

> **AIWG Provider** - Authoritative reference for OpenClaw features, configuration, and integration patterns.

**Last Updated**: 2026-03-27
**OpenClaw Version**: Current
**Coverage**: General availability release
**Maintainer**: AIWG Team

---

## Quick Reference

| Resource | Link |
|----------|------|
| Official Docs | https://docs.openclaw.ai |
| ClawHub (Skill Registry) | https://docs.openclaw.ai/tools/clawhub |
| Skills Docs | https://docs.openclaw.ai/tools/skills |
| GitHub | https://github.com/openclaw-ai/openclaw |

---

## 1. Platform Overview

OpenClaw is a personal AI assistant runtime designed for terminal-based interaction. Key differentiators from other AIWG providers:

- **Home directory deployment**: All artifacts deploy to `~/.openclaw/` (user-global, not project-scoped)
- **Behaviors support**: Only provider supporting reactive behaviors with event hooks
- **ClawHub registry**: Package registry for publishing and installing skill packages
- **Messaging integration**: Supports WhatsApp, Telegram, Discord, Slack, Signal, and other chat platforms
- **MCP support**: Full MCP server integration for external tool access

### OpenClaw vs OpenCode

These are **distinct tools** and should not be confused:
- **OpenClaw**: Personal AI assistant runtime with behaviors, ClawHub, messaging integration
- **OpenCode**: Terminal-based AI coding assistant (similar to Claude Code)

AIWG supports both as separate providers (`--provider openclaw` and `--provider opencode`).

---

## 2. Directory Structure

```
~/.openclaw/
├── agents/          # Agent definitions (markdown files)
├── commands/        # Slash command definitions
├── skills/          # Skill directories (SKILL.md + assets)
│   └── <skill-name>/
│       └── SKILL.md
├── rules/           # Context rules (markdown files)
├── behaviors/       # Reactive behaviors (OpenClaw-exclusive)
│   └── <behavior-name>/
│       ├── BEHAVIOR.md
│       └── scripts/
│           ├── main.sh
│           └── <hook-scripts>.sh
└── config.yaml      # OpenClaw configuration
```

All directories are auto-discovered by OpenClaw at startup. No registration step needed after deployment.

---

## 3. Skills System

### 3.1 Skill Format

Skills use the AgentSkills `SKILL.md` format:

```yaml
---
name: sdlc-accelerate
description: End-to-end SDLC ramp-up from idea to construction-ready
platforms: [claude-code, hermes, openclaw]
metadata:
  openclaw:
    primaryEnv: terminal
---

# Skill content...
```

### 3.2 Skill Discovery

OpenClaw discovers skills from multiple locations with precedence:

| Priority | Location | Scope |
|----------|----------|-------|
| 1 (highest) | `workspace/skills/` | Project-specific |
| 2 | `~/.openclaw/skills/` | User-global (AIWG deploys here) |
| 3 | Bundled skills | Built-in |
| 4 | `extraDirs` config | Additional directories |

### 3.3 OpenClaw-Specific Gating

Skills can declare platform-specific requirements:

| Field | Purpose | Example |
|---|---|---|
| `metadata.openclaw.requires.bins` | Required binaries | `["curl", "docker"]` |
| `metadata.openclaw.requires.env` | Required env vars | `["AIWG_TOKEN"]` |
| `metadata.openclaw.os` | OS filter | `["linux", "macos"]` |
| `metadata.openclaw.primaryEnv` | Preferred environment | `"terminal"` |
| `metadata.openclaw.always` | Load unconditionally | `true` |

Most AIWG skills require no gating.

---

## 4. Behaviors System (OpenClaw-Exclusive)

### 4.1 Overview

Behaviors are reactive capabilities that fire on system events. Unlike skills (invoked by user), behaviors respond automatically to:
- File writes
- Deployments
- Scheduled intervals (cron)
- Tool completions
- Commits and PR events

### 4.2 BEHAVIOR.md Schema

```yaml
---
name: security-sentinel
version: 1.0.0
description: Reactive security scanning on file changes and deployments
platforms: [openclaw, claude-code]

triggers:
  - "run security scan"
  - "check for vulnerabilities"

inputs:
  - name: target
    type: path
    required: false
    description: File or directory to scan
    default: "."

hooks:
  on_file_write:
    - filter: "**/*.{ts,js,mjs,py,go,rs}"
      action: run_script
      script: scripts/scan-changed-file.sh
  on_deploy:
    - action: run_script
      script: scripts/post-deploy-scan.sh
  on_schedule:
    - cron: "0 */6 * * *"
      action: run_script
      script: scripts/periodic-audit.sh

scripts:
  main: scripts/main.sh
  scan-changed-file: scripts/scan-changed-file.sh
  post-deploy-scan: scripts/post-deploy-scan.sh

manifest:
  category: security
  requires:
    bins: [node]
  outputs:
    - type: report
      path: .aiwg/reports/security/
  composable_with: [quality-gate-watcher]
---
```

### 4.3 Hook Types

| Hook | When It Fires |
|------|---------------|
| `on_file_write` | A file matching the filter is saved |
| `on_deploy` | A deployment completes |
| `on_schedule` | Cron expression matches |
| `on_tool_complete` | A tool invocation finishes |
| `on_commit` | A git commit is made |
| `on_pr_open` | A pull request is opened |

### 4.4 AIWG Behaviors Shipped

| Behavior | Source | Hooks |
|----------|--------|-------|
| `security-sentinel` | `agentic/code/behaviors/` | on_file_write, on_deploy, on_schedule |
| `test-watcher` | `agentic/code/behaviors/` | on_file_write, on_schedule |
| `build-monitor` | `agentic/code/behaviors/` | on_tool_complete, on_schedule |
| `quality-gate-watcher` | `agentic/code/frameworks/sdlc-complete/behaviors/` | on_commit, on_pr_open |
| `artifact-sync` | `agentic/code/frameworks/sdlc-complete/behaviors/` | on_file_write |

---

## 5. Agents

Agent definitions deploy to `~/.openclaw/agents/` as markdown files. OpenClaw discovers them at startup and makes them available via `@agent-name` invocation in chat.

---

## 6. Commands

Command definitions deploy to `~/.openclaw/commands/`. Invocable via `/command-name` syntax in OpenClaw chat.

---

## 7. Rules

Rules deploy to `~/.openclaw/rules/` as markdown files. OpenClaw loads relevant rules based on context.

---

## 8. MCP Support

### 8.1 Configuration

MCP servers are configured in `~/.openclaw/config.yaml`:

```yaml
mcp_servers:
  aiwg:
    command: "aiwg"
    args: ["mcp", "serve"]
    tools:
      include:
        - workflow-run
        - artifact-read
        - artifact-write
        - template-render
        - agent-list
```

### 8.2 Transport

OpenClaw supports stdio transport for local MCP servers. The AIWG MCP server runs as a local process with minimal latency overhead.

---

## 9. ClawHub (Package Registry)

ClawHub is OpenClaw's package registry for publishing and installing skill packages.

### 9.1 Installing from ClawHub

```bash
clawhub install aiwg-sdlc
clawhub install aiwg-forensics aiwg-media aiwg-research
clawhub update --all
```

### 9.2 Publishing to ClawHub

AIWG frameworks can be packaged for ClawHub distribution. See issue #538 for the publishing workflow.

---

## 10. AIWG Integration Points

### 10.1 Deployment Paths

| Artifact | Path | Support Level |
|----------|------|---------------|
| Agents | `~/.openclaw/agents/` | Native |
| Commands | `~/.openclaw/commands/` | Native |
| Skills | `~/.openclaw/skills/` | Native |
| Rules | `~/.openclaw/rules/` | Native |
| Behaviors | `~/.openclaw/behaviors/` | Native (exclusive) |

### 10.2 Key AIWG Files

| Component | Path |
|-----------|------|
| Provider module | `tools/agents/providers/openclaw.mjs` |
| Integration guide | `docs/openclaw-guide.md` |
| Quickstart | `docs/integrations/openclaw-quickstart.md` |
| MCP sidecar guide | `docs/integrations/openclaw-mcp-sidecar.md` |
| Behaviors guide | `docs/behaviors-guide.md` |

### 10.3 Deploy Command

```bash
# Deploy SDLC framework
aiwg use sdlc --provider openclaw

# Deploy all frameworks
aiwg use all --provider openclaw
```

### 10.4 Capabilities Object

From `tools/agents/providers/openclaw.mjs`:

```javascript
capabilities: {
  skills: true,
  rules: true,
  behaviors: true,
  aggregatedOutput: false,
  yamlFormat: false,
  homeDirectoryDeploy: true
}
```

---

## 11. Known Gaps / Requires Investigation

1. **Context file model**: Does OpenClaw load a project-level context file (like `AGENTS.md` or `OPENCLAW.md`)? Undocumented.
2. **Model support**: Which LLM providers does OpenClaw support for model routing?
3. **Behavior composition**: How do `composable_with` declarations work in practice?
4. **ClawHub publishing workflow**: Full packaging and publish pipeline for AIWG frameworks.

---

## References

- https://docs.openclaw.ai - Official OpenClaw documentation
- https://docs.openclaw.ai/tools/skills - Skills system
- https://docs.openclaw.ai/tools/clawhub - ClawHub package registry
- `tools/agents/providers/openclaw.mjs` - AIWG provider implementation
- `docs/openclaw-guide.md` - AIWG integration guide
- `docs/behaviors-guide.md` - Behaviors format specification
