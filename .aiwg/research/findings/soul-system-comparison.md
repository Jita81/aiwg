# AIWG SOUL System vs OpenProse SOUL.md — Comparison

**Research Type**: Comparative system analysis
**Date**: 2026-04-04
**Related Issues**: roctinam/aiwg#679 (this issue), roctinam/aiwg#620 (OpenProse gap analysis)
**Status**: Complete

---

## Executive Summary

"SOUL" means fundamentally different things in OpenProse vs AIWG. OpenProse's `SOUL.md` is a one-line capability memory capsule — a self-referential reminder the LLM is instructed to inject into its persistent memory after running a Prose program. AIWG's soul system is a rich character identity framework for defining agent persona, worldview, and opinions, built on the community standard from `aaronjmars/soul.md`. These are non-competing systems operating at different layers. AIWG's format correctly tracks the community standard, which AIWG then extends with lifecycle tooling, multi-platform deployment, and voice framework integration.

**Bottom line**: AIWG's soul system is the right system for what it's doing. No changes needed to align with OpenProse — they solve different problems. AIWG's format matches the community standard (aaronjmars/soul.md); AIWG adds tooling the community standard lacks.

---

## What Each System Actually Is

### OpenProse SOUL.md

**File**: `/home/roctinam/dev/prose/skills/open-prose/SOUL.md` (matches upstream exactly)

**Full contents**:
```
◇ OpenProse ◇ I can become a VM that spawns parallel agents, persists state across sessions,
and orchestrates arbitrarily complex workflows. Skill: `{{LOCAL_SKILL_PATH || "https://..."}}` 
— if not installed: `npx skills add openprose/prose`
```

**Purpose**: After a successful OpenProse program run, `SKILL.md` instructs the LLM to read this file, fill in `{{LOCAL_SKILL_PATH}}` with the actual local path, and inject it into its own SOUL.md or equivalent persistent memory. The intent: "future you deserves to remember" this capability exists.

This is a **capability memory capsule**, not a character identity file. It has no worldview, no opinions, no persona sections. It's a bookmark for the LLM's own self-knowledge.

**OpenProse's character variation system** (different concept): The `alts/` directory provides literary register alternatives — Kafka, Homer, Borges, folk, Arabian Nights. These are vocabulary/keyword skins that translate OpenProse's functional keywords into a stylistic register. They are aesthetic choices, not identity definitions.

### AIWG Soul System

AIWG's soul system is built on the **aaronjmars/soul.md community standard** — a format for defining AI agent identity from extracted human writing, worldview, and opinions.

**Community standard structure** (aaronjmars/soul.md):
- Who I Am, Worldview, Opinions, Interests, Current Focus, Influences, Vocabulary, Tensions & Contradictions, Boundaries, Pet Peeves
- Companion files: SOUL.md, STYLE.md, SKILL.md, MEMORY.md, data/, examples/

**AIWG's format** matches the community standard section-by-section. AIWG additionally provides:
- Full lifecycle tooling (soul-create, soul-validate, soul-enhance, soul-apply, soul-blend)
- Multi-platform deployment via `@SOUL.md` directive in CLAUDE.md/WARP.md/AGENTS.md/etc.
- Per-agent companion `.soul.md` files alongside agent definitions
- Project-level vs agent-level scoping with clear precedence rules
- Voice framework integration (soul-to-voice, voice-to-soul conversion)
- Context budget guidelines per soul scope
- Extension system registration (SoulMetadata, type guards, `aiwg catalog`)

**Deployed examples**: Four agent souls in `.claude/agents/` (architecture-designer, test-engineer, security-auditor, requirements-analyst) demonstrate the full section structure — these are high-quality implementations with genuine worldview, specific opinions, vocabulary, tensions, and pet peeves. They pass the community standard's "prediction test": someone reading them can predict the agent's takes on new topics.

---

## Structural Comparison

| Dimension | OpenProse SOUL.md | AIWG Soul System | Community Standard (aaronjmars) |
|-----------|-------------------|------------------|----------------------------------|
| **Concept** | Capability memory capsule | Character identity + persona | Character identity for personal AI |
| **Content** | 1-line capability reminder | 8-10 section structured document | 8-10 section template |
| **Scope** | Per-session LLM memory injection | Project-level + per-agent | Per-user/persona |
| **Lifecycle** | None (fill in once) | create → validate → enhance → apply → blend | `/soul-builder` build tool |
| **Companion files** | None | SOUL.md + STYLE.md + examples/ | SOUL.md + STYLE.md + SKILL.md + MEMORY.md |
| **Activation** | Manual injection to LLM memory | `@SOUL.md` in context files + enforcement rule | `/soul` command |
| **Multi-platform** | No | Yes (8 providers) | No |
| **Validation** | No | `soul-validate` (score 7+/10) | Quality checklist in template |
| **Blending** | `alts/` (register skins only) | `soul-blend` (full persona merging, 4 strategies) | No |

---

## Gap Analysis

### Gaps in AIWG Relative to OpenProse

None material. OpenProse's SOUL.md serves a capability-memory purpose that AIWG's existing memory system covers differently (auto-memory in `.claude/projects/.../memory/`). The OpenProse `alts/` register system (Kafka, Homer, etc.) is a creative feature with no direct AIWG equivalent, but it's not a gap in the soul identity sense — it's a stylistic vocabulary layer that complements soul files.

### Gaps in AIWG Relative to Community Standard

**1. MEMORY.md companion file not documented**
The community standard includes `MEMORY.md` as a soul companion for "session memory for continuity across conversations." AIWG has a persistent memory system but it isn't framed as a soul companion. Minor gap: AIWG's `docs/soul-md-guide.md` could mention `MEMORY.md` as an optional companion pointing to the project memory directory.

**2. SKILL.md companion not documented**
Community standard includes `SKILL.md` as a soul companion for "operating modes (tweet, essay, chat, etc.)." AIWG's agent definitions cover this function. Not a meaningful gap since agent definitions are more capable, but worth noting for interoperability with OpenClaw/Hermes users.

**3. Data ingestion pipeline**
Community standard includes a `/soul-builder` command that ingests Twitter exports, essays, Notion notes, etc. to synthesize a soul from real human writing. AIWG's `soul-create` works interactively but doesn't reference data ingestion. AIWG's target audience (agent personas, not personal AI) means this gap is intentional.

### Gaps in Community Standard That AIWG Addresses

**1. Lifecycle tooling** — Community has one `/soul-builder` command. AIWG has five distinct lifecycle commands (create/validate/enhance/apply/blend) with the `soul-enhance` command specifically designed to sharpen vague statements and generate calibration examples.

**2. Multi-platform deployment** — Community standard is single-platform (read SOUL.md directly). AIWG deploys via `@SOUL.md` directives across 8 providers with per-provider configuration.

**3. Per-agent scope** — Community standard is user-level. AIWG adds project-level and per-agent scoping with explicit precedence rules.

**4. Voice framework integration** — Community has STYLE.md (separate from SOUL.md). AIWG integrates soul and voice profiles bidirectionally with conversion commands.

**5. Context budget guidance** — Community has no budget guidelines. AIWG provides per-scope token targets (project: <3K, agent: <1K) with multi-agent workflow implications.

---

## Adoption Recommendations

### No changes required to align with OpenProse

OpenProse's SOUL.md is a capability memory capsule, not a character identity system. AIWG's soul system doesn't need to adopt or defer to it. The two systems are non-competing.

One minor note: the OpenProse SOUL.md "fill in and inject" pattern could be formalized as an AIWG behavior — after installing a new framework or skill, AIWG could suggest adding a capability reminder to the project's MEMORY.md index. But this is an enhancement idea, not a gap.

### AIWG soul format correctly tracks the community standard

The section structure in AIWG's `docs/soul-md-guide.md` matches the aaronjmars/soul.md template. The four deployed agent souls (architecture-designer, test-engineer, security-auditor, requirements-analyst) are high-quality implementations that would score well on the community standard's quality criteria.

**Recommended additions** to align with community standard more fully:

1. **Document MEMORY.md as optional companion** — Add to `soul-md-guide.md` a note that `MEMORY.md` can serve as a session continuity file; point to AIWG's auto-memory system as the recommended implementation.

2. **Add SKILL.md to companion files list** — Document it as optional for users migrating from OpenClaw/Hermes environments where this convention is standard.

### OpenProse `alts/` system — Optional inspiration

OpenProse's literary register alternatives (Kafka, Homer, Borges, folk, Arabian Nights) are a creative way to add aesthetic variation without changing identity. AIWG could optionally support "soul tones" — aesthetic register modifiers that layer on top of a soul file. Not a gap, but an interesting design space.

---

## Summary of Comparison with #620 Framework

Per the adopt/adapt/leave/contribute-back framework from the prose-vs-aiwg-contract-comparison:

| Recommendation | Item |
|---------------|------|
| **Leave** | Defer to OpenProse SOUL.md — wrong concept; they solve different problems |
| **Adopt** | MEMORY.md as optional soul companion (add to documentation) |
| **Adapt** | SKILL.md companion mention for OpenClaw/Hermes interoperability |
| **Leave** | `alts/` literary register system — creative feature, not a soul gap |
| **Contribute back** | AIWG's lifecycle tooling (validate, enhance, blend) could be proposed as extensions to aaronjmars/soul.md |

---

## References

- OpenProse SOUL.md (upstream): `https://raw.githubusercontent.com/openprose/prose/refs/heads/main/skills/open-prose/SOUL.md`
- OpenProse SOUL.md (local): `/home/roctinam/dev/prose/skills/open-prose/SOUL.md` (matches upstream exactly)
- Community standard: `https://github.com/aaronjmars/soul.md`
- AIWG soul guide: `docs/soul-md-guide.md`
- AIWG soul ADR: `.aiwg/architecture/decisions/ADR-017-soul-md-architecture.md`
- Deployed agent souls: `.claude/agents/*.soul.md` (4 agents)
- Parent research: `.aiwg/research/findings/prose-vs-aiwg-contract-comparison.md`
