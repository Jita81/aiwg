# ADR: Skill and Command Namespace Strategy

## Status

**ACCEPTED** — 2026-04-04

## Date

2026-04-04

## Context

### Trigger

`aiwg sync` collides with the natural language concept of "sync this repo" and with platform built-ins. Issue #694 documented the immediate collision. Issue #695 tracks the design decision.

AIWG deploys ~96 skills and commands to 10 platforms (Claude Code, Cursor, Copilot, Windsurf, OpenCode, Warp, Codex, Factory, OpenClaw, Hermes). Skill names like `sync`, `refresh`, `commit`, `run`, `build`, `list`, `status` can collide with:

- Platform built-in commands (e.g., Claude Code `/help`, `/clear`, `/compact`)
- Skills from other installed packages
- Git/shell commands when AI assistants interpret natural language

### Research Methodology

Platform discovery behavior was verified from source code (not documentation) for all 10 platforms. See §Platform Compatibility Matrix.

### Current State

All AIWG skills deploy flat alongside user-created skills and other package skills:

```
.claude/skills/sync/SKILL.md
.claude/skills/run/SKILL.md
.claude/skills/commit/SKILL.md
```

There is no structural or metadata signal indicating AIWG ownership. A collision on `run` is silently overwritten. `aiwg remove` cannot safely remove only AIWG skills without risking deletion of user-created skills.

### Options Evaluated

**Option A — Dot notation (`aiwg.sync`)**
Declared in frontmatter (`namespace: aiwg`, canonical name `aiwg.sync`). Aligns with MCP SEP-986. Breaks current `/sync` invocation UX; platform support varies today.

**Option B — Directory namespacing (`skills/aiwg/{name}/`)**
Structural isolation via subfolder. Zero invocation UX change on platforms that recurse. Platform discovery behavior varies — Windsurf only recurses 1 level.

**Option C — Slug prefix (`aiwg-{name}`)**
Skill files and invocation slugs are prefixed: `.claude/skills/aiwg-sync/SKILL.md`. Universally discoverable on all platforms today; backward compatible via alias. Verbose; breaks existing user muscle memory.

**Option D — Layered (recommended)**
Combines A + B + C:
- Deploy under `aiwg/` subdirectory (Option B) as canonical layout
- Prefix slug in folder name (Option C) as safe fallback for Windsurf (1-level only)
- Add `namespace: aiwg` to frontmatter (Option A) for registry/MCP alignment
- Support short alias `/sync` only when no conflict exists (opt-in via `--aliases`)

## Decision

**Option D (Layered)** is selected.

### Layer 1: Slug Prefix (load-bearing)

The canonical folder name and invocation slug is `aiwg-{name}`. Slug computation is
**idempotent**: if the skill's folder name already begins with `aiwg-` (e.g., `aiwg-sync`,
`aiwg-status`), no second prefix is added.

```
canonical_slug = name.startsWith("aiwg-") ? name : `aiwg-${name}`
```

This preserves existing `aiwg-*` skills without double-prefixing (`aiwg-aiwg-sync`).

The canonical folder name and invocation slug is `aiwg-{name}` for new/unqualified skills:

```
.claude/skills/aiwg/aiwg-sync/SKILL.md   ← inside aiwg/ subdir
```

The `aiwg-` prefix is the primary collision barrier. It works on all 10 platforms regardless of recursion depth. Invocation: `/aiwg-sync`.

### Layer 2: `aiwg/` Subdirectory (additive scoping)

Skills deploy inside an `aiwg/` subdirectory on platforms that support it:

```
.claude/skills/aiwg/aiwg-sync/SKILL.md    ← Claude Code (unlimited recursion)
.cursor/skills/aiwg/aiwg-sync/SKILL.md    ← Cursor (unlimited recursion)
.agents/skills/aiwg/aiwg-sync/SKILL.md    ← Universal cross-platform path
.windsurf/skills/aiwg-sync/SKILL.md       ← Windsurf (1-level limit; no subdir)
```

Removal: `aiwg remove sdlc` safely targets `rm -rf .claude/skills/aiwg/` without risk of touching user skills.

### Layer 3: `namespace: aiwg` Frontmatter (registry/MCP alignment)

All AIWG SKILL.md files include:

```yaml
name: sync
namespace: aiwg
description: Sync to latest version and re-deploy all frameworks
type: skill
```

The `namespace` field:
- Drives ownership attribution in collision detection (#698)
- Aligns with MCP SEP-986 dot notation direction
- Enables `aiwg doctor` to distinguish AIWG skills from user skills

### Layer 4: Short Alias Opt-In

Short aliases (`/sync`, `/run`) are suppressed by default. Users can opt in:

```bash
aiwg use sdlc --aliases
```

The deploy-time collision detector (#698) suppresses alias creation when a conflict is found. A warning is emitted.

### Universal Cross-Platform Path

Source-code research confirms `.agents/skills/` (project) and `~/.agents/skills/` (user) are scanned by nearly all platforms. Deploying to `.agents/skills/aiwg/{slug}/SKILL.md` provides single-target universal coverage as a complement to per-platform paths.

## Platform Compatibility Matrix

Source-confirmed from each platform's skill discovery implementation.

| Platform | Recursion | Confirmed discovery paths |
|----------|-----------|--------------------------|
| Claude Code | Unlimited | `.claude/skills/`, `.agents/skills/` |
| Cursor | Unlimited | `.cursor/skills/`, `.agents/skills/` |
| Codex CLI | Max depth 6 | `.agents/skills/`, `~/.agents/skills/` |
| OpenCode | Unlimited | `.opencode/skill/`, `.opencode/skills/`, `.agents/skills/` |
| Copilot/VS Code | Unlimited | `.github/skills/`, `.claude/skills/`, `.agents/skills/`, `~/.copilot/skills/` |
| Factory AI | Unlimited | `.factory/skills/`, `.agent/skills/`, `~/.factory/skills/` |
| Warp | Unlimited | `.agents/skills/`, `.warp/skills/`, `.claude/skills/`, all platform dirs |
| Windsurf | **1 level only** | `.windsurf/skills/` |
| OpenClaw | Unlimited | `~/.openclaw/skills/`, `.agents/skills/`, `~/.agents/skills/` |
| Hermes | Unlimited | `~/.hermes/skills/` + external dirs |

**9 of 10 platforms support unlimited recursion.** Windsurf is the sole exception; it receives skills at the flat `.windsurf/skills/aiwg-{name}/SKILL.md` path.

## Decision Drivers

1. **Universal collision safety** — slug prefix works on all 10 platforms today, no platform changes needed
2. **Structural isolation** — `aiwg/` subdir makes removal safe and ownership self-documenting
3. **MCP alignment** — `namespace` field tracks the SEP-986 dot notation direction
4. **Backward compatibility** — short aliases suppressed by default, opt-in preserves existing user experience
5. **`.agents/skills/` convergence** — nearly all platforms already scan this path; single-target deployment is viable

## Decision Matrix

| Option | Universal today | Backward compat | Structural safety | MCP aligned | Score |
|--------|----------------|-----------------|-------------------|-------------|-------|
| **D — Layered (selected)** | ✅ | ✅ | ✅ | ✅ | **4.0** |
| C — Slug prefix only | ✅ | ⚠️ | ❌ | ❌ | 2.5 |
| B — Subdir only | ⚠️ (Windsurf) | ✅ | ✅ | ❌ | 2.75 |
| A — Dot notation only | ⚠️ | ❌ | ❌ | ✅ | 1.75 |

## Consequences

### Positive

- Name collisions with platform built-ins and other packages are structurally impossible
- `aiwg remove` is safe — can target `aiwg/` subdir without risk
- `aiwg doctor` can distinguish AIWG skills from user skills via `namespace` field
- Aligns with MCP SEP-986 direction for future registry compatibility
- Windsurf (1-level limit) is handled without special-casing the entire strategy

### Negative

- New canonical invocation is `/aiwg-sync` — longer than `/sync`
- Existing users must re-deploy (`aiwg use sdlc`) to get new paths
- Slug prefix is verbose; some users may prefer short aliases

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Users don't notice invocation change | Medium | Medium | Migration guide (#701); deprecation notice on old slugs for one release |
| Platform discovery behavior changes | Low | Low | Source-verified; monitoring via #698 validation |
| `--aliases` opt-in too obscure | Low | Low | Document prominently in migration guide |
| **`aiwg-{name}` skill slugs collide with AIWG CLI commands** | **High** | **Medium** | **RESOLVED — CLI blocklist in #698** (see below) |

### Resolved: AIWG CLI Namespace Collision

The `aiwg-{name}` prefix strategy introduces a second-order collision: AIWG's own CLI commands occupy the same prefix (`aiwg sync`, `aiwg doctor`, `aiwg use`, `aiwg list`, `aiwg run`, etc.). A skill deployed as `aiwg-sync` or `aiwg-doctor` may be confused with the CLI command by platforms, AI assistants interpreting natural language, or users.

**Resolution: Option A — CLI blocklist in #698.**

The collision detector (#698) maintains a blocklist of AIWG CLI command names. At deploy time, any skill slug matching a CLI command (e.g., `aiwg-sync`, `aiwg-doctor`, `aiwg-use`) is blocked from alias creation and emits a warning. The full `aiwg-{name}` invocation remains available — only the short alias (`/sync`) is suppressed when it would collide with a CLI command.

The blocklist is derived from `src/extensions/commands/definitions.ts` at build time, ensuring it stays current as CLI commands are added or removed. This avoids maintaining a separate static list.

## Implementation Sequence

1. **#699** — Add `namespace?: string` to `SkillMetadata` in `src/extensions/types.ts` ✅ Done
2. **#700** — Bulk-add `namespace: aiwg` to all SKILL.md frontmatter
3. **#701** — Write migration guide `docs/migration/skill-namespace-migration.md`
4. **#696** — Update registry to index by qualified name (`aiwg.sync`)
5. **#697** — Update `aiwg use` deployment paths to `aiwg/` subdirectory
6. **#698** — Add pre-deployment collision detection to `aiwg use`

## References

- #694 — `aiwg sync` rename (immediate trigger)
- #695 — This ADR's tracking issue
- #696 — Registry qualified-name indexing
- #697 — Directory namespacing deployment changes
- #698 — Collision detection implementation
- #699 — TypeScript type update (`namespace` field)
- #700 — Bulk frontmatter update
- #701 — Migration guide
- MCP SEP-986: tool naming conventions
- `src/extensions/types.ts` — SkillMetadata interface
- `src/smiths/platform-paths.ts` — Provider directory mappings
- `docs/extensions/extension-types.md` — Extension type documentation
