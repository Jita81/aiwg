---
description: Contextual AIWG help — explains current version features, answers how-to questions, routes live queries to the steward
commandHint:
  argumentHint: "[topic-or-question]"
  allowedTools: Bash, Read, Glob, Grep
  model: sonnet
  category: help
platforms: [claude-code, codex, copilot, factory, cursor, opencode, warp, windsurf, openclaw]
---

# aiwg-guide

Contextual help interface for AIWG users. Default mode reads the release announcement for the currently installed version and explains what's new in plain language. Given a topic or question, answers from prioritized documentation sources. Routes live-state queries to the steward.

## Triggers

Alternate expressions and non-obvious activations (primary phrases are matched automatically from the skill description):

- "what's new" / "what changed" -> default whats-new mode
- "how do I [action]" -> contextual help
- "explain [feature]" -> feature explanation
- "what is [aiwg-concept]" -> concept lookup
- "help with aiwg" -> general help
- "aiwg guide" -> explicit invocation
- "what does [command] do" -> command reference
- "what providers support [feature]" -> capability matrix lookup

## Default Mode: What's New

When invoked with no arguments (or "what's new", "what changed"):

1. **Read installed version**:
   ```bash
   aiwg version
   ```
   Extract the version number (e.g., `2026.3.3`).

2. **Locate release announcement**:
   ```bash
   # Primary: exact version match
   docs/releases/v{version}-announcement.md

   # Fallback: latest announcement in docs/releases/
   ls -t docs/releases/v*-announcement.md | head -1
   ```

3. **Read and summarize** the announcement:
   - Lead with the most impactful changes
   - Use conversational tone, not raw markdown dump
   - Group changes by theme (features, fixes, improvements)
   - Mention specific commands or workflows the user can try

4. **Offer to go deeper**:
   - "Want me to walk through any of these in detail?"
   - If the user asks about a specific feature, switch to contextual help mode

**Example output style**:

> Version 2026.3.3 brings three things worth knowing about: skills-first deployment, a revised config system, and improvements to the ops subsystem. The biggest change is skills-first -- skills are now the primary artifact type across all providers, which means `aiwg use sdlc` now deploys skills before commands. Want me to walk through any of these in detail?

**Fallback** (announcement file not found):

If no release announcement exists for the installed version:
1. Read `CHANGELOG.md` for the version section
2. If that also fails, summarize from `docs/cli-reference.md`
3. Note: "No release announcement found for v{version}. Here's what I can tell from the changelog..."

## Contextual Help Mode

When given a topic or question, answer from documentation sources in this priority order:

| Priority | Source | Best For |
|----------|--------|----------|
| 1 | `docs/releases/v{version}-announcement.md` | What's new, recent changes |
| 2 | `docs/cli-reference.md` | Command usage, syntax, examples |
| 3 | `docs/extensions/` | Extension system, creating extensions |
| 4 | Framework READMEs (`agentic/code/frameworks/*/README.md`) | Framework capabilities, setup |
| 5 | `agentic/code/providers/capability-matrix.yaml` | Provider features, platform support |
| 6 | `CLAUDE.md` and `AIWG.md` | Quick-start, overview, project structure |
| 7 | Addon READMEs (`agentic/code/addons/*/README.md`) | Addon features, voice profiles |

### Search Strategy

1. **Keyword match**: Grep the question terms across documentation sources
2. **Section extraction**: Read the relevant section, not the whole file
3. **Synthesize**: Combine information from multiple sources if needed
4. **Cite sources**: Tell the user where the information came from so they can read further

### Example Interactions

**User**: "how do I schedule a task"

**Action**:
1. Grep `docs/cli-reference.md` for "schedule"
2. Read the schedule command section
3. Check if `/schedule` skill exists for additional context

**Response**: "You can schedule recurring tasks with the `/schedule` skill or `aiwg ralph-external` for one-off loops. The schedule skill supports cron expressions..."

---

**User**: "what providers support agent teams"

**Action**:
1. Read `agentic/code/providers/capability-matrix.yaml`
2. Filter for `agent_teams` feature across all providers

**Response**: "Agent teams are natively supported by Claude Code and Codex. Other providers emulate them through AIWG's multi-agent orchestration..."

---

**User**: "what is a behavior"

**Action**:
1. Grep capability matrix for "behaviors"
2. Read extension types docs for behavior definition

**Response**: "Behaviors are a new artifact type currently exclusive to OpenClaw. They define persistent behavioral modifications..."

## Steward Handoff

Some questions require live system state rather than documentation. The guide detects these and delegates to the steward.

| Question Type | Detection Pattern | Handler |
|--------------|-------------------|---------|
| Installation status | "what's installed", "what frameworks" | Steward: `aiwg list` |
| Health check | "is everything healthy", "any issues" | Steward: `aiwg doctor` |
| Version info | "what version am I on" | Steward: `aiwg version` |
| Deployment state | "what's deployed to [provider]" | Steward: `aiwg status` |
| Feature explanation | "how do I use X", "what does X do" | Guide (docs) |
| Change history | "what changed in X" | Guide (release announcement) |
| Provider features | "what providers support X" | Guide (capability matrix) |

### Handoff Protocol

When a steward handoff is needed:

1. **Detect**: Classify the question as requiring live state
2. **Invoke**: Run the appropriate CLI command via Bash
   ```bash
   aiwg list        # for installation queries
   aiwg doctor      # for health queries
   aiwg version     # for version queries
   aiwg status      # for deployment queries
   ```
3. **Incorporate**: Weave the command output into a natural language response
4. **Attribute**: Note that the information comes from live system state

The handoff is transparent to the user -- they see a unified response.

## Trigger Phrase Mappings

| Pattern | Example | Action |
|---------|---------|--------|
| No arguments | `/aiwg-guide` | Default: what's new |
| What's new | "what's new in AIWG" | Read release announcement |
| How-to | "how do I deploy to copilot" | Contextual help from docs |
| What-is | "what is a soul file" | Concept lookup from docs |
| Command help | "what does aiwg sync do" | CLI reference lookup |
| Provider query | "does cursor support MCP" | Capability matrix lookup |
| Status query | "is AIWG healthy" | Steward handoff |
| Version query | "what version of AIWG" | Steward handoff |

## Clarification Prompts

If the user's intent is ambiguous:

- "Are you asking about [feature] in general, or how it's configured in your project?"
- "Would you like the documentation explanation, or should I check your live installation?"
- "I can explain the concept, or show you the current state in your project. Which would help?"

## Context Budget

- Default mode (what's new): ~2,000 tokens (read announcement, summarize)
- Contextual help: ~1,500 tokens per source consulted (max 3 sources)
- Steward handoff: ~500 tokens (CLI command + response)

## References

- @docs/releases/ -- Release announcements (primary data source for default mode)
- @docs/cli-reference.md -- Command reference
- @docs/extensions/overview.md -- Extension system
- @agentic/code/providers/capability-matrix.yaml -- Provider features
- @agentic/code/agents/personas/aiwg-steward.md -- Steward agent (handoff target)
- Issue #616 -- Feature request
- Issue #599 / #600 -- Steward expansion (guide hands off to steward)
- Issue #604 -- Capability matrix (guide reads for provider queries)
- Issue #612 -- Documentation (guide surfaces to users)
