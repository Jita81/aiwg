# ADR: Skills as the Canonical Extension Type — Commands as a Deployment Translation Layer

## Status

**PROPOSED**

## Date

2026-03-27

## Context

### Trigger

Claude Code has deprecated `.claude/commands/` in favor of `.claude/skills/`. The skills format (a folder per skill containing `SKILL.md` with YAML frontmatter) is now the recommended standard. Critically, Anthropic released the Agent Skills specification as an open standard in late 2025. OpenAI/Codex CLI, Cursor, and Gemini CLI have all adopted the same SKILL.md format, making it a cross-platform universal.

This changes the calculus from the `adr-universal-provider-deployment.md` ADR, which treated Claude commands as `native` and skills as `native` as two separate equal artifact types. Skills are now the *primary* format; commands are a packaging format that some providers still need.

### Current State

AIWG ships ~50 commands as `.claude/commands/*.md` single markdown files. These are deployed to provider command directories via `aiwg use`. The TypeScript extension system in `src/extensions/types.ts` treats `command` and `skill` as co-equal types with separate metadata interfaces.

The `.claude/skills/` directory already exists and contains ~96+ skills in the correct SKILL.md folder-based format. However, the flow commands, SDLC commands, and all CLI-driven workflows live entirely in the commands format, not skills.

### What Changed

| Dimension | Before | After |
|-----------|--------|-------|
| Claude Code commands support | Native | **Deprecated** (legacy compatibility only) |
| Claude Code skills support | Native | **Primary** (canonical format) |
| Skills as open standard | Claude-specific | **Universal** (Codex, Cursor, Gemini CLI) |
| Skill format | Folder + SKILL.md | **Same** — now an industry standard |
| Command format | Flat .md file | Still used by Factory, OpenCode, Warp, Windsurf |

### Scope Boundary

This ADR does not change the universal deployment strategy from `adr-universal-provider-deployment.md`. All 4 artifact types are still deployed to all providers. What changes is: skills are now the *source format*, and commands are *generated* from skills for providers that need them, rather than both being independently authored.

### Providers That Still Need Commands

Based on current provider documentation:

| Provider | Commands Support | Skills Support | SKILL.md Standard? | Translation Needed? | Notes |
|----------|-----------------|----------------|--------------------|---------------------|-------|
| Claude Code | **Deprecated** | **Native (primary)** | ✅ Originator | No | Skills-only |
| Codex CLI | Native (home dir) | **Native** | ✅ Adopted | Yes | Generate prompts for `~/.codex/prompts/` |
| GitHub Copilot | Via YAML agents | Conventional | ❌ | Yes | Generate YAML agents |
| Factory AI | Native | Conventional | ❌ | Yes | Generate commands |
| Cursor | Conventional | **Native** | ✅ Adopted | No | Skills-only |
| OpenCode | Native (`.opencode/commands/`) | **None** (not read) | ❌ No skills system | Yes | Generate commands. **Archived upstream** |
| Warp | Aggregated (WARP.md) | Conventional | ❌ | Yes | For WARP.md aggregation |
| Windsurf | Via workflows | Conventional | ❌ | Yes | Generate workflows |
| Hermes Agent | N/A (MCP sidecar) | **Native** (SKILL.md) | ✅ Native | No | Skills-only via MCP |
| OpenClaw | Native | **Native** | ✅ | Yes | User gets both |
| Gemini CLI | Native (`.gemini/commands/`, TOML) | Has skill system | ⚠️ Own format | Yes | Uses `.toml` commands, has skills but format TBD |

## Decision

### 1. Skills Are the Canonical Source Format

All AIWG workflows, SDLC flows, and CLI commands are authored as skills (SKILL.md folder structure). The `skill` extension type is the single source of truth.

The skill format:
```
.claude/skills/
└── flow-inception-to-elaboration/
    ├── SKILL.md         # Required: name, description, category, tags, effort in frontmatter
    └── references/      # Optional: supporting docs
```

### 2. Commands Are Generated at Deploy Time

When `aiwg use` deploys to a provider that uses commands natively (Factory, OpenCode, Warp/Windsurf aggregation, legacy Codex), the deployment pipeline generates command files from skill sources using a translation layer.

Translation rules:
- SKILL.md `name:` → command filename (kebab-case)
- SKILL.md `description:` → command header description
- SKILL.md body content → command body (stripped of skill-specific frontmatter)
- SKILL.md `category:` → command category grouping (where supported)

### 3. The `command` Type Is Retained as a Deployment Descriptor

`CommandMetadata` in the extension system is retained but repositioned: it describes how a skill should be packaged as a command for legacy/native-command providers. It is no longer an independently authored artifact type.

Going forward:
- `type: 'skill'` = source format, always authored
- `type: 'command'` = deployment artifact, generated or kept only for providers with no skill support

### 4. Claude Is Still the Superset Reference

Claude Code's provider model (agents, skills, rules, commands-as-legacy) is the reference superset. All other providers are normalized against it. This means:
- Skills coverage defines what gets deployed everywhere
- Providers without native skill support receive skills in conventional directories AND generated commands in their native command directories

### 5. Migration of Existing Commands

All files in `.claude/commands/` and `agentic/code/frameworks/*/commands/` are migrated to SKILL.md format. Migration preserves all content; the folder structure and frontmatter are added.

### 6. `aiwg add-command` Is Deprecated

`aiwg add-command` is replaced by `aiwg add-skill` (which already exists). The command scaffolding workflow is removed to prevent creating new artifacts in the deprecated format.

## Decision Drivers

1. **Ecosystem alignment**: Skills are now an open standard across Claude, Codex, Cursor, Gemini. Staying on commands creates a AIWG-specific artifact type with no ecosystem momentum.
2. **Normalization mandate**: AIWG's primary driver is to normalize across agentic providers. The common format is now skills, not commands.
3. **Richer capabilities**: Skills support progressive disclosure (description at session start, full content on invocation), auto-invocation, scripts, and references — none of which commands support.
4. **Reduce dual maintenance**: Maintaining ~50 commands AND ~96 skills as separate corpora creates drift. One canonical source eliminates this.
5. **Avoid breaking providers**: Providers that need commands still get them — generated from skills at deploy time.

## Decision Matrix

| Alternative | UX Parity | Ecosystem Fit | Maint. Cost | Migration Risk | Score |
|-------------|-----------|---------------|-------------|----------------|-------|
| **Skills canonical, commands generated (SELECTED)** | 5 | 5 | 5 | 3 | **4.5** |
| Keep both as co-equal types | 4 | 3 | 2 | 5 | 3.5 |
| Commands canonical, skills generated | 3 | 1 | 3 | 4 | 2.75 |
| Drop commands entirely | 5 | 5 | 5 | 1 | 4.0 |

## Consequences

### Positive

- AIWG aligns with the cross-industry skills standard
- Single source of truth eliminates commands/skills content drift
- Skills' progressive disclosure improves agent UX across all providers
- Providers get both skills AND generated commands — no capability loss
- `aiwg add-skill` becomes the one workflow creation path

### Negative

- Migration effort: ~50 commands × folder restructure + frontmatter
- Translation layer adds complexity to `aiwg use` deployment pipeline
- Providers without skills support are now second-class (generated commands) rather than equal (native commands)
- `add-command` users must shift to `add-skill`

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Translation produces lower-quality commands than hand-authored | Medium | Medium | Translation layer is tunable; review generated outputs per provider |
| Claude commands legacy support removed before migration completes | Low | High | Prioritize migration; legacy compatibility has been maintained so far |
| Provider skill adoption stalls (Factory, OpenCode, Warp) | Medium | Low | Generated commands continue to work; no regression |

## Implementation Sequence

See linked issues for full scope. High-level sequence:

1. **Audit** — per-provider skills vs commands support verification (#TBD)
2. **ADR acceptance** — review and accept this ADR
3. **Type system** — demote `command` in extension types (#TBD)
4. **Migration** — convert `.claude/commands/` → `.claude/skills/` (#TBD)
5. **Translation layer** — add skill→command generation in `aiwg use` (#TBD)
6. **Framework migration** — convert `agentic/code/frameworks/*/commands/` (#TBD)
7. **Validation** — provider acceptance tests for generated commands (#TBD)
8. **Documentation** — update CLAUDE.md, CLI reference, provider table (#TBD)

## References

- `adr-universal-provider-deployment.md` — Universal deployment strategy (not superseded; this ADR adds a layer above it)
- `src/extensions/types.ts` — Extension type discriminated unions
- `src/extensions/commands/definitions.ts` — All 50 command definitions
- `.claude/skills/` — Existing skill corpus (~96 skills)
- `agentic/code/frameworks/*/commands/` — Framework command sources
- `src/smiths/platform-paths.ts` — Provider directory mappings
- `src/cli/handlers/use.ts` — Deployment handler with PROVIDER_PATHS
- Agent Skills open standard: https://github.com/anthropics/skills
