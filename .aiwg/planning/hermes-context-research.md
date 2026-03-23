# Hermes Agent Context Architecture Research

**Date**: 2026-03-23
**Sources**: NousResearch/hermes-agent GitHub, deepwiki.com/NousResearch/hermes-agent, hermes-agent.nousresearch.com/docs

---

## Memory Layers

| Layer | Cognitive analog | Implementation | Size limit |
|---|---|---|---|
| Persistent memory | Declarative/semantic | `~/.hermes/memories/MEMORY.md` | ~2,200 chars (~800 tokens) |
| User model | User profile | `~/.hermes/memories/USER.md` | ~1,375 chars (~500 tokens) |
| Procedural memory | Skills | `~/.hermes/skills/*/SKILL.md` | On-demand |
| Session history | Episodic | `~/.hermes/state.db` + JSONL | Full history, FTS5 searchable |
| Working memory | — | Context window | Model-dependent |

Optional 4th layer: **Honcho Memory** — cross-session user modeling as external service.

---

## Context Management

### ContextCompressor (`agent/context_compressor.py`)

- Triggers when usage hits `compression.threshold` (default: **50%** of context window)
- Protects first 3 turns and last 4 turns (hardcoded defaults)
- Summarizes middle section via auxiliary LLM (`summary_model` config key)
- Sanitizes orphaned tool-call/result pairs during compression
- Creates `parent_session_id` lineage chain in `state.db` for each compression split
- Falls back to truncation (no summary) if auxiliary model call fails

### AGENTS.md Loading (`agent/prompt_builder.py`)

- Loaded **in full on every turn** — injected into system prompt via `build_context_files_prompt()`
- Walks directory tree from working directory upward, loads all AGENTS.md files by depth
- Truncates files >20,000 characters: 70% head / 20% tail with marker in middle
- Scanned for prompt injection patterns before injection
- Also loads `.cursorrules` and `.cursor/rules/*.mdc` if present
- **No lazy loading, no selective loading** — every character = token cost every turn

### MCP Tool Result Handling

- Tool results stored **verbatim** in conversation context
- No built-in summarization before results enter the context window
- `max_tool_rounds: 10` caps consecutive tool-use rounds
- MCP sampling requests capped at `max_tokens_cap` (default: 4096)
- Schema debt: GitHub MCP alone = ~26,250 tokens overhead at connection

---

## state.db SQLite Schema

```sql
-- WAL mode, FTS5 enabled
CREATE TABLE sessions (
  id, source, user_id, model, title,
  created_at, updated_at, token_count,
  parent_session_id  -- lineage across compression splits
);
CREATE TABLE messages (
  role, content, tool_calls, tool_name, token_count,
  session_id  -- FK to sessions
);
CREATE VIRTUAL TABLE messages_fts USING fts5(content);
```

---

## delegate_task Isolation

Key mechanism for keeping parent context clean:

```python
delegate_task(
    task="...",
    context="...",
    skip_context_files=True,  # Excludes SOUL.md, AGENTS.md from child
    skip_memory=True,         # Excludes MEMORY.md, USER.md from child
    model=None                # Optional: faster/smaller model for child
)
```

Parent only sees: delegation call + result summary (~200 tokens).
Child context (tool traces, MCP outputs, intermediate reasoning): discarded after task.
Batch mode: up to 3 parallel subagents via `ThreadPoolExecutor`.

**Context cost comparison per AIWG workflow**:
- Direct MCP calls: 3,000–8,000 tokens in parent context
- delegate_task: ~150–250 tokens in parent context (~95% reduction)

---

## Memory File Security

MEMORY.md and USER.md are scanned before write for:
- Prompt injection patterns
- Credential exfiltration attempts
- SSH backdoor instructions
- Invisible Unicode characters

Deduplication: exact duplicate entries automatically rejected.
Contents are frozen at session start — disk writes during a session appear at next session start.

---

## Skills System

Format: agentskills.io open standard (shared with Claude Code, Codex per frontmatter `platforms` field)

```yaml
---
name: skill-name
description: ...
version: 1.0.0
platforms: [hermes, claude-code, codex]  # cross-platform compatibility
metadata:
  tags: [...]
---
## When to Use
## Procedure
## Pitfalls
## Verification
```

Skills managed via `skill_manage` tool (autonomous create/update/delete).
Skills do not have their own context budgets — isolated via delegate_task.

---

## Recommended Config for Local Hardware (12GB VRAM)

```yaml
compression:
  enabled: true
  threshold: 0.30              # Lower than default 0.50 to avoid abrupt cliffs
  summary_model: "ollama/qwen3.5:9b"  # Use efficiency tier for summarization
  summary_provider: "custom"
  summary_base_url: "http://localhost:11434/v1"

model:
  context_length: 32768        # Or auto-detected from /models endpoint

max_tool_rounds: 10
```

---

## Context Budget (12GB VRAM, qwen2.5-coder:14b, 32K context)

### With lean AGENTS.md + 5-tool MCP whitelist

| Component | Tokens |
|---|---|
| Hermes system prompt | ~1,500 |
| AGENTS.md (lean, <1,000 chars) | ~250 |
| MEMORY.md | ~800 |
| USER.md | ~500 |
| AIWG MCP schema (5 tools) | ~3,000 |
| **Total overhead** | **~6,050** |
| **Available for conversation** | **~26,700 (81%)** |
| Compression fires at | ~16,384 tokens of conversation |

### Without lean approach (full AGENTS.md + full MCP surface)

| Component | Tokens |
|---|---|
| Hermes system prompt | ~1,500 |
| AGENTS.md (standard, ~5,000 chars) | ~1,500 |
| MEMORY.md | ~800 |
| USER.md | ~500 |
| AIWG MCP schema (20+ tools + prompts + resources) | ~12,000 |
| **Total overhead** | **~16,300** |
| **Available for conversation** | **~16,468 (50%)** |
| Compression fires at | ~9,200 tokens — very early |

---

## Issues Created

- #449 — Hermes Agent integration (MCP sidecar architecture)
- #450 — Token-optimized AGENTS.md template for Hermes
- #451 — Minimal AIWG MCP tool surface (schema debt reduction)
- #452 — delegate_task pattern for AIWG workflows (zero-cost child contexts)
