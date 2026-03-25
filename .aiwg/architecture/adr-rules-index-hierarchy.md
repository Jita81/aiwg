# ADR: Two-Level RULES-INDEX Hierarchy

## Status

**ACCEPTED**

## Date

2026-03-24

## Context

### Problem Statement

The current `RULES-INDEX.md` lives in `agentic/code/frameworks/sdlc-complete/rules/` and contains rules from three different components (sdlc-complete, ring-methodology, aiwg-utils) hardcoded in a single file. This creates two problems:

1. **Location implies scope**: The file lives in `sdlc-complete/` but contains rules from addons. New addons with rules have no mechanism to contribute to it without editing a file they don't own.
2. **No extension point**: When a user runs `aiwg use ring`, there is no protocol for ring-methodology to register its rules in the index. The current monolith requires manual editing of the sdlc-complete file.

### Current State

- `sdlc-complete/rules/RULES-INDEX.md` — 43 rules from 3 components in one file (~500 lines)
- `sdlc-complete/rules/manifest.json` — lists only sdlc-complete rules but RULES-INDEX includes others
- `ring-methodology/manifest.json` — lists 7 rules but has no rules index
- `aiwg-utils/manifest.json` — lists 7 rules but has no rules index
- Rules `instruction-comprehension` and `research-before-decision` are duplicated: files exist in both `sdlc-complete/rules/` and `aiwg-utils/rules/`

## Decision

Adopt a two-level hierarchy: **component indexes** owned by each component, and a **global index** that aggregates pointers to installed components.

### Architecture

```
agentic/code/RULES-INDEX.md                          ← Global index (aggregator)
  → frameworks/sdlc-complete/rules/RULES-INDEX.md    ← SDLC component index
  → addons/ring-methodology/rules/RULES-INDEX.md     ← Ring component index
  → addons/aiwg-utils/rules/RULES-INDEX.md           ← Utils component index
  → [future components contribute their own]
```

### Component Index Format

Each component's `rules/RULES-INDEX.md` MUST:

1. Start with a component header: `## <Component Name> Rules (N rules — active with <install-command>)`
2. Group rules by enforcement level: CRITICAL > HIGH > MEDIUM
3. Each rule entry uses this format:
   ```markdown
   #### rule-name
   **Summary**: One-paragraph description of the rule's purpose and key behavior.
   **When to apply**: Comma-separated list of contexts where this rule is relevant.
   **Full rule**: @agentic/code/<component-path>/rules/rule-name.md
   ```
4. End with `---`
5. NOT reference rules from other components
6. Be standalone-deployable (usable without other components installed)

### Global Index Format

The global index (`agentic/code/RULES-INDEX.md`):

1. Has a brief preamble explaining the index
2. Lists each installed component with a pointer and one-line description in an "Installed Components" table
3. Contains the aggregated "Quick Reference by Context" table from all components
4. Does NOT contain rule summaries inline — those live in each component's index
5. Is what gets deployed to `.claude/rules/RULES-INDEX.md` (assembled by CLI)

### Manifest Integration

Each component's `manifest.json` gains a `consolidation` field:

```json
{
  "consolidation": {
    "strategy": "index-with-links",
    "rulesIndex": "rules/RULES-INDEX.md",
    "deployIndexOnly": true
  }
}
```

The CLI reads this field during `aiwg use <component>` to discover the component's rules index.

### Deployment Protocol

When `aiwg use <component>` installs:
1. Copies the component's rules to the target platform directory
2. Reads the component's `consolidation.rulesIndex` from manifest.json
3. Assembles the deployed `RULES-INDEX.md` by combining the global header with all installed component indexes

When building the deployed index:
1. Start with the global header from `agentic/code/RULES-INDEX.md`
2. For each installed component with a rules index: append its content
3. Append the aggregated "Quick Reference by Context" table
4. Write the assembled file to the target platform path

### Ownership Rules

- Each component owns its own `rules/RULES-INDEX.md` — no cross-component editing
- The global `agentic/code/RULES-INDEX.md` is a source template for the aggregator header
- The deployed `.claude/rules/RULES-INDEX.md` is assembled at deploy time — not manually edited
- Rules whose canonical home is in component A must NOT appear in component B's index

## Consequences

### Positive

- **Composable**: New addons contribute rules by adding their own index — no monolith editing
- **Clear ownership**: Each component owns its rules and their summaries
- **Eliminates duplication**: Rules live in one canonical location
- **Scales**: Adding a 4th, 5th, Nth component follows the same protocol
- **Token-efficient**: Global index is ~50 lines of pointers; component indexes load on demand

### Negative

- **Two-step lookup**: Agent must follow pointer from global to component index, then to full rule
- **Assembly complexity**: CLI must read manifests and assemble the deployed file
- **Migration work**: Existing monolith must be split (tracked by #497, #498, #499)

### Neutral

- Backward compatible: if a component has no `rules/RULES-INDEX.md`, fall back to individual file deployment

## Related Issues

- #496 — This ADR (architecture spec)
- #497 — Create ring-methodology/rules/RULES-INDEX.md
- #498 — Create aiwg-utils/rules/RULES-INDEX.md
- #499 — Refactor sdlc-complete RULES-INDEX to sdlc-only + create global index
- #500 — CLI: update deploy to assemble from component indexes
