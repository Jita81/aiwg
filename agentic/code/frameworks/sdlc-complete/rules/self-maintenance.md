# Self-Maintenance Rule

**Enforcement**: HIGH
**Tier**: SDLC
**Issue**: #484

## Summary

Agents MUST use AIWG CLI commands — not manual file writes — for all installation, deployment, and framework management tasks. The CLI is the authoritative interface for maintaining AIWG; bypassing it creates drift between the registry and the filesystem.

## Rule

### 1. CLI-First Principle

For any AIWG maintenance operation, prefer the CLI command over direct file manipulation:

| Operation | CLI Command | Never Do |
|-----------|-------------|----------|
| Deploy framework | `aiwg use <framework>` | Manually copy files to `.claude/` |
| Remove framework | `aiwg remove <framework>` | Delete framework files manually |
| Check health | `aiwg doctor` | Manually inspect file presence |
| Update AIWG | `aiwg update` | `npm install -g aiwg` directly |
| Sync deployment | `aiwg sync` | Run `use` for each framework individually |
| Add extension | `aiwg add-agent/add-command/add-skill` | Write directly to `.claude/agents/` |
| Check version | `aiwg version` | Read `package.json` manually |
| Detect provider | `aiwg runtime-info` | Guess from directory structure |

### 2. Pre-Flight Check (Long Sessions)

Before starting any orchestration session expected to exceed 30 minutes:

1. `aiwg sync --dry-run` — check if deployment is current
2. `aiwg doctor` — establish baseline health
3. If issues found: run `aiwg sync` or delegate to AIWG Steward agent
4. `aiwg runtime-info` — confirm active provider

This ensures agents work against current templates, agent definitions, and rules.

### 3. Proactive Maintenance Triggers

Agents should initiate self-maintenance when:

| Trigger | Action |
|---------|--------|
| Start of long orchestration session | Pre-flight check (above) |
| User asks about AIWG currency | `aiwg sync --dry-run` → report + offer sync |
| `aiwg doctor` reports errors | `aiwg sync` or invoke AIWG Steward |
| Deploying to a new provider | `aiwg use <framework> --provider <p>` |
| User adds/removes a framework | `aiwg use` / `aiwg remove` |
| Multiple background tasks needed | `aiwg mc start` + `aiwg mc dispatch` |

### 4. Delegation Pattern

For complex maintenance tasks, delegate to the **AIWG Steward** agent rather than attempting ad-hoc repairs:

- Health check + repair: `@aiwg-steward`
- Version sync across providers: `@aiwg-steward`
- Provider migration: `@aiwg-steward`

### 5. Background Orchestration

For multi-task orchestrations exceeding a single session:

- Start a Mission Control session: `aiwg mc start`
- Dispatch long-running tasks: `aiwg mc dispatch <id> "<task>"`
- Monitor progress: `aiwg mc watch` or `aiwg mc status`

## Why

Without this rule, agents bypass the CLI and write files directly, causing:

1. **Registry drift** — `.aiwg/frameworks/registry.json` falls out of sync with actual files
2. **Provider mismatch** — files deploy to the wrong provider directory
3. **Version confusion** — agents work against stale templates/rules
4. **Silent failures** — no health check catches the inconsistency

The CLI encapsulates all the logic for provider detection, registry updates, file placement, and post-deployment verification. Bypassing it discards that logic.

## Detection

An agent is violating this rule when it:

- Writes directly to `.claude/agents/`, `.claude/commands/`, `.claude/skills/`, or `.claude/rules/` for deployment purposes
- Copies framework files without going through `aiwg use`
- Edits `.aiwg/frameworks/registry.json` directly
- Runs `npm install -g aiwg` instead of `aiwg update`
- Skips the pre-flight check before a long orchestration

## Exceptions

- **Development context**: When working on AIWG source code itself (this repo), direct file manipulation is expected
- **No CLI available**: If AIWG CLI is not installed, fall back to manual operations with a note to install
- **Emergency repair**: If `aiwg doctor` itself is broken, manual intervention is acceptable

## Examples

### Good: Using CLI for framework deployment

```
User: "Deploy SDLC to Copilot"
Agent: Running `aiwg use sdlc --provider copilot`...
       ✓ SDLC framework deployed to .github/agents/
       ✓ Registry updated
       ✓ Doctor check passed
```

### Bad: Manual file copy

```
User: "Deploy SDLC to Copilot"
Agent: I'll copy the agent files to .github/agents/...
       [writes files directly without registry update]
```

### Good: Pre-flight check

```
Agent: Starting phase transition orchestration.
       Pre-flight: aiwg sync --dry-run → all current
       Pre-flight: aiwg doctor → healthy
       Proceeding with orchestration...
```

## References

- @docs/cli-reference.md — Complete CLI command reference
- @agentic/code/agents/aiwg-steward.md — Steward agent definition
- @agentic/code/skills/mission-control/SKILL.md — Mission Control skill
