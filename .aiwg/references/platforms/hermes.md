# Hermes Agent Platform Reference

**Status**: Active — AIWG provider support
**Last Updated**: 2026-04-06
**Source**: https://github.com/NousResearch/hermes-agent (full Python)
**Docs**: https://github.com/NousResearch/hermes-agent

---

## Quick Reference

| Resource | Link |
|----------|------|
| Repository | https://github.com/NousResearch/hermes-agent |
| Language | Python |
| Key skill files | `agent/skill_commands.py`, `agent/skill_utils.py`, `tools/skills_tool.py` |
| Install | `pip install hermes-agent` |

---

## 1. Core Architecture

Hermes is a Python-based AI agent framework by NousResearch. AIWG support is in `experimental` status.

Key characteristics:
- File-based skill discovery with unlimited recursion (`rglob("SKILL.md")`)
- User-global skill directory (`~/.hermes/skills/`)
- Skills are NOT MCP-only — file-based discovery is the primary mechanism
- Python runtime; not a terminal TUI like Codex or Claude Code

---

## 2. Skills System

### 2.1 Discovery

**Verified from `agent/skill_commands.py` (source):**

| Scope | Path | Mechanism |
|-------|------|-----------|
| User-global | `~/.hermes/skills/` | `rglob("SKILL.md")` — unlimited depth |
| Project | (not confirmed) | TBD |

**Key finding**: Hermes uses `rglob("SKILL.md")` — this means unlimited subdirectory recursion. Skills can be nested arbitrarily deep under `~/.hermes/skills/`. This mirrors the behavior confirmed in OpenClaw (`local-loader.ts`).

### 2.2 Skill Format

Standard AgentSkills `SKILL.md` format. No Hermes-specific frontmatter extensions confirmed.

```markdown
---
name: "voice-apply"
description: "Apply voice profile to content"
platforms: [hermes]
---

# Skill body
Instructions here.
```

### 2.3 AIWG Deployment

```bash
aiwg use sdlc --provider hermes
# Deploys agents to AGENTS.md (aggregated)
# Deploys skills to ~/.hermes/skills/
```

AIWG deploys skills to `~/.hermes/skills/` — matches confirmed source path.

---

## 3. Agents

**Discovery**: Hermes uses `AGENTS.md` at the project root for agent context. This is an aggregated format — all agents are combined into a single file.

AIWG deploys to `AGENTS.md` for Hermes.

---

## 4. Rules and Commands

| Artifact | Hermes Support | AIWG Behavior |
|----------|---------------|---------------|
| Agents | Via `AGENTS.md` | Aggregated into `AGENTS.md` |
| Skills | `~/.hermes/skills/` native | Deployed to home dir |
| Commands | Not confirmed | Not deployed |
| Rules | Not confirmed | Not deployed |

---

## 5. AIWG Integration Summary

| AIWG Artifact | Deployed Path | Status |
|---------------|--------------|--------|
| Agents | `AGENTS.md` | ✓ aggregated |
| Skills | `~/.hermes/skills/` | ✓ correct path |
| Commands | — | Not supported |
| Rules | — | Not supported |

---

## 6. Changelog

| Date | Change |
|------|--------|
| 2026-04-06 | Created — skill discovery verified from source (`rglob("SKILL.md")`) |
