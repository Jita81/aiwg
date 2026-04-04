# Memory System Comparison: AIWG #608 vs OpenProse user-memory

**Research issue:** #678
**Parent:** #620 (OpenProse vs AIWG gap analysis)
**Date:** 2026-04-03

---

## Summary

AIWG and OpenProse solve different halves of the same problem:

- **OpenProse user-memory** gives users *explicit, intentional* control over what gets stored and recalled — a personal knowledge base the user actively teaches.
- **AIWG memory (#608 + auto-memory)** is *implicit and automatic* — captured by the AI at session boundaries without user effort, organized by scope (session/project/user).

These are not competing designs. They are complementary: one is pull (user-driven teach/query), the other is push (AI-driven capture). The gap worth addressing is that AIWG has no explicit teach interface, and OpenProse has no confidence tracking or project-scope memory.

---

## Systems Under Comparison

### OpenProse `user-memory`

```yaml
name: user-memory
kind: service
persist: user  # → ~/.prose/agents/user-memory/
```

**Interface:** Three explicit modes (user-invoked):
- `teach` — user gives knowledge; system extracts and categorizes it
- `query` — user asks a question; system synthesizes from taught knowledge with confidence level
- `reflect` — user names a topic; system organizes what is known into confidence tiers

**Guarantees (invariants):**
- Contradictions flagged; user's latest teaching takes precedence
- Query answers distinguish taught facts from inferences
- Periodic self-compaction keeps the file navigable regardless of volume

**Knowledge organization:** Domain categories — technical, architectural, process, domain-specific

**Confidence model:** Three tiers: well-established, emerging, speculative

**Storage:** Single user-scope file at `~/.prose/agents/user-memory/`

---

### AIWG #608 — Cross-session Daemon Memory

**Three scopes:**

| Scope | Lifetime | Storage | Content |
|-------|---------|---------|---------|
| session | Current daemon session | In-memory | Active task state, current context |
| project | Project lifetime | `.aiwg/daemon/memory/` | Phase, active work, decisions |
| user | Persistent | `~/.aiwg/daemon/memory/` | Global preferences, interaction style, recurring patterns |

**Interface:** Implicit — AI captures at session boundaries (significant events, session end). No explicit teach/query interface.

**Session lifecycle:**
1. Load user memory index (`~/.aiwg/daemon/memory/MEMORY.md`)
2. Load project memory index (`.aiwg/daemon/memory/MEMORY.md`)
3. Inject into Concierge session preamble
4. Write updates on significant events and session end

**Management commands:** `aiwg daemon memory show`, `aiwg daemon memory clear [--scope]`

---

### AIWG auto-memory Addon (Complementary)

Bootstraps Claude Code's Automatic Memory (`~/.claude/projects/<project>/memory/`) with AIWG-aware seed templates:
- `MEMORY.md` — central index
- `testing.md`, `debugging.md`, `architecture.md` — topic-organized knowledge

Maintained automatically by Claude Code; updated continuously during development. No explicit teach/query interface.

---

## Dimension-by-Dimension Comparison

| Dimension | OpenProse user-memory | AIWG #608 daemon memory | AIWG auto-memory |
|-----------|----------------------|------------------------|-----------------|
| **Capture mode** | Explicit (user teaches) | Implicit (AI captures) | Implicit (Claude Code captures) |
| **Scoping** | User-only | session / project / user | Project-only (per-machine) |
| **Storage location** | `~/.prose/agents/user-memory/` | `~/.aiwg/daemon/memory/`, `.aiwg/daemon/memory/` | `~/.claude/projects/<p>/memory/` |
| **Retrieval** | Explicit query mode | Loaded at session start, injected | Loaded by Claude Code automatically |
| **Knowledge organization** | Domain categories (tech, arch, process) | Scope-based files (preferences, history, context) | Topic files (testing, debugging, architecture) |
| **Confidence tracking** | Three tiers (established, emerging, speculative) | None | None |
| **Contradiction handling** | Explicit: flagged, latest wins | None | None |
| **Eviction/compaction** | Self-compaction invariant | Manual (`memory clear`) | Manual pruning; aim <500 lines |
| **Reflection** | Explicit reflect mode | None | None |
| **Management commands** | Via teach/query/reflect | `aiwg daemon memory show/clear` | N/A (Claude Code manages) |
| **Format** | Service with contract language | Markdown files | Markdown files |
| **Portability** | Prose-specific | AIWG daemon-specific | Claude Code-specific |

---

## Gaps

### AIWG gaps Prose fills

**1. No explicit teach interface**
AIWG memory is entirely AI-captured. Users cannot say "remember that we prefer async/await over Promise chains" without relying on Claude Code to independently decide to write that to memory. OpenProse's `teach` mode gives users direct control.

**2. No confidence tier tracking**
AIWG stores facts without distinguishing well-established knowledge from emerging patterns or speculative decisions. Prose's reflect mode explicitly surfaces this distinction, which matters when memory files grow large and contain contradictory or outdated entries.

**3. No contradiction resolution protocol**
Prose specifies: "contradictions are flagged and the user's latest teaching takes precedence." AIWG memory files can accumulate contradictions silently if Claude Code writes conflicting entries across sessions.

**4. No self-compaction invariant**
Prose specifies compaction as an invariant. AIWG's auto-memory docs recommend keeping files under 500 lines but don't enforce this. The daemon memory scopes have no compaction guidance at all.

**5. No query interface for memory**
Users can inspect AIWG memory by reading the files directly, but there's no "query my project memory for what I know about authentication" capability. Prose's `query` mode synthesizes across taught knowledge and flags confidence.

### Prose gaps AIWG fills

**1. No project-scope memory in user-memory.md**
`user-memory.md` uses `persist: user` — it's a cross-project personal knowledge base. AIWG has both user-scope and project-scope memory, which is the right separation for "I always use tabs" vs "this project's auth uses JWT RS256."

**2. No topic-file organization**
Prose's user-memory is a single file organized by domain category. AIWG's auto-memory addon separates testing, debugging, and architecture into distinct files, which scales better as knowledge grows.

**3. No bootstrapping/seed mechanism**
Prose starts with a blank memory file. AIWG's auto-memory addon seeds new projects with structured templates so memory is useful from day one rather than requiring manual setup.

**4. No management CLI**
`aiwg daemon memory show/clear --scope` gives users visibility and control. Prose relies on direct file access.

**5. No memory portability across platforms**
Prose memory is Prose-specific. AIWG's auto-memory docs explicitly address how to port content to other platforms (copy to CLAUDE.md or platform-specific equivalent).

---

## Adoption Recommendations

### 1. Teach mode for daemon Concierge — **Adapt** (High priority)

Add a `teach` command to the Concierge interface:

```
Concierge: What can I help you with?
User: teach: we always prefer functional components over class components in this project
Concierge: Got it — I'll remember that across sessions.
```

This doesn't require the full Prose contract apparatus. The Concierge can implement it as: receive teach input → write to project or user scope memory file → confirm. The explicit interface puts users in control of knowledge injection rather than hoping the AI captures it.

**Implementation note:** Add as a Concierge behavior, not a separate skill. Scope: user or project based on content (personal preference → user, project convention → project).

### 2. Confidence annotation convention — **Adapt** (Medium priority)

Add a lightweight confidence annotation convention to AIWG memory files. Rather than implementing Prose's full three-tier reflection, use a simple in-line marker:

```markdown
## Auth Strategy

Use JWT RS256 for all service tokens. [confidence: established — see ADR-012]

Consider Redis session store for web-facing services. [confidence: emerging — evaluated in sprint 4]
```

This is a documentation convention, not a system change. Add to the auto-memory seed templates and the daemon memory write guidance.

### 3. Self-compaction guidance → invariant — **Adopt** (Low priority)

Elevate auto-memory's "<500 lines" recommendation to an invariant with a compaction trigger:

> *When any memory file exceeds 400 lines, the next session should compact: merge redundant entries, archive superseded decisions with a "SUPERSEDED" marker, and summarize patterns into fewer, more general entries.*

Add this to the auto-memory overview doc and the daemon memory write protocol.

### 4. Contradiction detection — **Leave**

AIWG's memory files are markdown, directly readable by both humans and the AI. Contradictions are visible on inspection. Adding explicit contradiction detection would require parsing the memory file on every write — overhead not justified for the current use cases. The Prose approach works because user-memory.md is managed through a single service interface; AIWG memory is written by multiple paths (session end, events, manual edits).

### 5. Query interface — **Leave for now**

`aiwg daemon memory show` covers the basic inspection case. A semantic query interface ("what do I know about authentication?") would be useful but requires embedding or vector search infrastructure. Defer to a future issue when the need is validated by actual usage.

---

## Follow-on Issues

| Recommendation | Priority | Scope |
|---------------|----------|-------|
| Teach mode for Concierge | High | daemon addon, Concierge behavior |
| Confidence annotation convention | Medium | auto-memory seeds, daemon memory docs |
| Self-compaction invariant | Low | auto-memory overview, daemon memory write protocol |

---

## References

- OpenProse: `/tmp/prose/skills/open-prose/lib/user-memory.md`
- AIWG #608: daemon cross-session memory architecture
- AIWG auto-memory addon: `agentic/code/addons/auto-memory/`
- Parent gap analysis: `.aiwg/research/findings/prose-vs-aiwg-contract-comparison.md`
