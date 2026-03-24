# ADR-017: SOUL.md as First-Class Agent Identity File

**Status**: Accepted
**Date**: 2026-03-23
**Deciders**: Architecture Designer, Project Owner
**Context**: AIWG Agent Identity System

---

## Context and Problem Statement

AIWG agents are defined by capability manifests (what they can do) and system prompts (how they behave in a task). Neither of these persists personality across sessions or projects. Agents reset to a generic persona on every invocation. For long-running projects, this creates inconsistency — the "Security Architect" in week 1 behaves differently from week 8, not because it learned anything but because it has no memory of who it is.

A dedicated identity file format is needed that:
- Travels with a project or agent definition
- Defines character, values, reasoning style, and communication preferences
- Supports a lifecycle (create, validate, enhance, apply, blend for role hybrids)

Options considered:
1. **Embed identity in system prompt** — current approach; no persistence, resets each session
2. **SOUL.md file format** — dedicated Markdown file per agent with YAML frontmatter for structured fields
3. **Database record** — structured identity in a database; requires infrastructure
4. **CLAUDE.md extension** — add identity fields to existing CLAUDE.md convention

## Decision Drivers

- **Persistence**: Identity must survive session boundaries
- **Portability**: Identity file must be diffable, committable, shareable
- **Human-readable**: Team members should be able to read and edit identity definitions
- **Lifecycle support**: Identity should be creatable, validatable, and evolvable tooling
- **Convention alignment**: Should follow Markdown-file conventions already established in AIWG

## Decision

Adopt **SOUL.md** as a first-class agent identity file format with a defined lifecycle: `soul-create` → `soul-validate` → `soul-enhance` → `soul-apply` → `soul-blend`.

## Rationale

1. **Follows existing CLAUDE.md precedent**: AIWG already uses Markdown files for context injection; SOUL.md is consistent with this pattern
2. **Human-readable and diffable**: Plain Markdown with YAML frontmatter; reviewable in PRs, committable to version control
3. **Lifecycle tooling maps cleanly to CLI commands**: Each lifecycle stage becomes an `aiwg` subcommand
4. **Blend operation enables role hybrids**: Two SOUL.md files can be blended to create composite agent identities (e.g., Security Architect + Technical Writer)
5. **No infrastructure required**: File system only; works offline and in CI

## Consequences

### Positive

- Consistent agent personality across sessions and contributors
- Identity changes are auditable via git history
- `soul-blend` enables specialized hybrid agents without duplicating full definitions
- Agents can self-reference their SOUL.md to re-anchor after context drift

### Negative

- Another file type to maintain per agent
- Blend operation may produce identity conflicts requiring manual resolution
- Requires discipline to keep SOUL.md current as agent roles evolve

### Risks

**Risk: SOUL.md files become stale** (MEDIUM)
- **Mitigation**: `soul-validate` command checks for schema compliance and flags fields not updated in >90 days
- **Acceptance**: Stale identity is better than no identity; validation prevents corruption

## SOUL.md Structure

```markdown
---
agent-id: security-architect
version: 1.0
created: 2026-03-23
soul-schema: 1.0
---

# Character
[Personality narrative]

# Values
[Ranked list of guiding values]

# Reasoning Style
[How this agent approaches problems]

# Communication Preferences
[Tone, verbosity, format preferences]

# Domain Identity
[Core domain knowledge and perspective]
```

## Lifecycle Commands

| Command | Action |
|---------|--------|
| `aiwg soul-create <agent-id>` | Scaffold new SOUL.md from template |
| `aiwg soul-validate <file>` | Validate schema compliance |
| `aiwg soul-enhance <file>` | Suggest improvements based on agent history |
| `aiwg soul-apply <file> <session>` | Inject identity into active session |
| `aiwg soul-blend <file-a> <file-b>` | Merge two identities into composite |

## Alternatives Considered

### Alternative 1: Embed in system prompt
Rejected: No persistence. Identity resets each session. Cannot be reviewed or versioned independently.

### Alternative 2: Database record
Rejected: Requires infrastructure not present in AIWG's file-based architecture. Breaks offline and CI use cases.

### Alternative 3: CLAUDE.md extension
Rejected: CLAUDE.md is project-scoped instruction context, not agent identity. Mixing the two conflates distinct concerns and bloats an already-loaded file.

## References

- **ADR-018** (@.aiwg/architecture/decisions/ADR-018-hook-file-architecture.md): Hook file architecture (SOUL.md loads as part of hook injection)
- @agentic/code/frameworks/sdlc-complete/agents/ (agent definitions that will adopt SOUL.md)
- @.aiwg/requirements/use-cases/UC-013-agent-constraint-learning.md (learned constraints complement soul identity)

---

**Last Updated**: 2026-03-23
