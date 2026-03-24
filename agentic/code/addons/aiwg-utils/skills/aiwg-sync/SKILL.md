---
platforms:
  - claude-code
  - hermes
---

# AIWG Sync

You ensure the current session's AIWG installation is up-to-date and correctly deployed to the active provider.

## Trigger Patterns

| Pattern | Example | Action |
|---------|---------|--------|
| Sync request | "make sure AIWG is current" | Run `aiwg sync` |
| Version check | "is AIWG up to date?" | Run `aiwg sync --dry-run` |
| Update request | "update AIWG" | Run `aiwg sync` |
| Refresh request | "refresh the framework" | Run `aiwg sync` |
| Provider deploy | "deploy latest to copilot" | Run `aiwg sync --provider copilot` |
| Dry run | "check if AIWG needs updating" | Run `aiwg sync --dry-run` |

## Behavior

When triggered:

1. **Extract intent**:
   - Is this a check only (dry-run) or should changes be applied?
   - Is a specific provider mentioned?
   - Are specific frameworks mentioned?

2. **Run the appropriate command**:

   ```bash
   # Default: full sync
   aiwg sync

   # Check only (no changes)
   aiwg sync --dry-run

   # Provider-specific
   aiwg sync --provider copilot

   # Specific frameworks only
   aiwg sync --frameworks sdlc,rlm

   # Machine-readable (for orchestration)
   aiwg sync --quiet
   ```

3. **Report the result** inline — summarize what changed or what would change.

## Examples

### Example 1: Simple check

**User**: "Is AIWG up to date?"

**Extraction**: Check-only request, no provider specified

**Action**:
```bash
aiwg sync --dry-run
```

**Response**: "AIWG is current (v2026.3.15). All 2 frameworks are deployed to claude-code. No changes needed."

### Example 2: Full sync

**User**: "Make sure we're running the latest AIWG"

**Extraction**: Full sync requested

**Action**:
```bash
aiwg sync
```

**Response**: "Updated AIWG 2026.3.12 -> 2026.3.15 and re-deployed sdlc-complete + ring-methodology to claude-code. Health check passed."

### Example 3: Provider-specific

**User**: "Deploy the latest AIWG to GitHub Copilot"

**Extraction**: Sync to copilot provider

**Action**:
```bash
aiwg sync --provider copilot
```

**Response**: "Synced AIWG to copilot. SDLC framework deployed to .github/agents/ and .github/copilot-instructions.md."

## Clarification Prompts

If the user's intent is ambiguous:

- "Would you like me to check what needs updating (dry run), or go ahead and sync?"
- "Which provider should I sync to? (detected: claude-code)"

## References

- @src/cli/handlers/sync.ts — Sync command handler
- @docs/cli-reference.md — CLI reference
- @agentic/code/frameworks/sdlc-complete/rules/self-maintenance.md — Self-maintenance rule
