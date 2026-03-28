# ADR: BEHAVIOR.md Cross-Platform Format Specification and Lifecycle Contract

## Status

**ACCEPTED**

## Date

2026-03-27

## Context

ADR `adr-behaviors-deployable-artifact.md` established behaviors as a new AIWG artifact type distinct from skills. This ADR formalizes the `BEHAVIOR.md` file format specification and defines the lifecycle contract that all platforms must implement (or gracefully degrade from).

The specification must satisfy three constraints:

1. **Cross-platform portability** — the same `BEHAVIOR.md` must work on OpenClaw (full support), Claude Code (partial hooks), and all other platforms (NLP-only degradation)
2. **Backward compatibility** — existing behaviors (build-monitor, security-sentinel, test-watcher) already use this format in production
3. **Forward compatibility** — the Concierge behavior (#602) requires additional fields (scope, tone, routing, memory) that the format must accommodate without breaking existing behaviors

## Decision

### BEHAVIOR.md Canonical Schema

The `BEHAVIOR.md` file uses YAML frontmatter for structured metadata and a markdown body for LLM instructions.

#### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Unique identifier, kebab-case |
| `version` | string | CalVer (YYYY.M.PATCH) or semver |
| `description` | string | What this behavior does and when it activates |
| `platforms` | string[] | Platform compatibility list |

#### Optional Fields — Invocation

| Field | Type | Description |
|-------|------|-------------|
| `triggers` | string[] | NLP trigger phrases (invocation path, same as skills) |
| `inputs` | BehaviorInput[] | Structured, typed input parameters |

#### Optional Fields — Reactive

| Field | Type | Description |
|-------|------|-------------|
| `hooks` | Record<HookEvent, HookAction[]> | Event subscriptions (what makes it a behavior) |
| `scripts` | Record<string, string> | Logical name → relative script path |

#### Optional Fields — Daemon/Session

| Field | Type | Description |
|-------|------|-------------|
| `scope` | `daemon` \| `interactive` \| `both` | Activation scope. Default: `both` |
| `tone` | object | Voice profile reference or inline tone spec |
| `routing` | object | Intent routing configuration (for front-facing behaviors) |
| `memory` | object | Session and cross-session memory configuration |

#### Optional Fields — Metadata

| Field | Type | Description |
|-------|------|-------------|
| `manifest` | object | Category, requirements, outputs, composability |

### Input Schema

```yaml
inputs:
  - name: string          # Parameter name
    type: string|number|boolean|enum|path
    required: boolean      # Default: false
    description: string
    default: any           # Default value
    values: string[]       # Allowed values (enum type only)
```

### Hook Event Types

| Event | Fires When |
|-------|-----------|
| `on_file_write` | A file is written or modified |
| `on_tool_complete` | A tool finishes execution |
| `on_schedule` | Cron schedule matches |
| `on_commit` | A git commit is created |
| `on_pr_open` | A pull request is opened |
| `on_deploy` | A deployment is triggered |
| `on_session_start` | A new session begins |
| `on_session_end` | A session ends |

### Hook Action Schema

```yaml
hooks:
  <event>:
    - filter: string       # Glob filter (on_file_write)
      tool: string         # Tool name filter (on_tool_complete)
      cron: string         # Cron expression (on_schedule)
      action: run_script|notify|log
      script: string       # Relative path to script
```

### Lifecycle Contract

Every behavior passes through four lifecycle phases. Platforms implement as many phases as they support; the rest are no-ops.

#### Phase 1: Deploy

| Aspect | Specification |
|--------|--------------|
| **Trigger** | `aiwg use <framework> --provider <provider>` |
| **Entry condition** | Behavior directory exists with valid `BEHAVIOR.md` |
| **Action** | Copy behavior directory to provider target path |
| **Exit condition** | `BEHAVIOR.md` and `scripts/` present at target |
| **Validation** | `aiwg validate-metadata` passes on the `BEHAVIOR.md` |

#### Phase 2: Activate

| Aspect | Specification |
|--------|--------------|
| **Trigger** | Session start (daemon or interactive) |
| **Entry condition** | Behavior deployed to provider directory |
| **Action** | Register hook subscriptions with platform event system; load NLP triggers into routing |
| **Exit condition** | All declared hooks are wired; triggers are discoverable |
| **Degradation** | Platforms without hook support skip hook registration (NLP triggers still activate) |

#### Phase 3: Execute

| Aspect | Specification |
|--------|--------------|
| **Trigger** | NLP phrase match OR hook event fires |
| **Entry condition** | Behavior is activated |
| **Action (NLP)** | LLM reads markdown body + inputs; executes main script if available |
| **Action (Hook)** | Platform runs the matched script with environment variables set |
| **Exit condition** | Script exits 0 (success) or non-zero (failure logged) |
| **Environment** | `BEHAVIOR_NAME`, `BEHAVIOR_TRIGGER`, `HOOK_EVENT`, `HOOK_FILE_PATH`, `HOOK_TOOL`, `PROJECT_ROOT`, `INPUT_*` |

#### Phase 4: Deactivate

| Aspect | Specification |
|--------|--------------|
| **Trigger** | Session end OR `aiwg remove` |
| **Entry condition** | Behavior is activated |
| **Action** | Unregister hook subscriptions; release resources |
| **Exit condition** | No hooks wired; no background processes |
| **On remove** | Delete behavior directory from provider target |

### Provider Support Matrix

| Provider | Deploy Path | Hooks | NLP | Scope |
|----------|-----------|-------|-----|-------|
| OpenClaw | `~/.openclaw/behaviors/<name>/` | Full | Full | daemon + interactive |
| Claude Code | `.claude/behaviors/<name>/` | Partial (file-write, tool-complete via settings.json hooks) | Full | interactive |
| Warp | Aggregated into WARP.md | None | Full | interactive |
| Cursor | `.cursor/behaviors/<name>/` | None | Full | interactive |
| Copilot | `.github/behaviors/<name>/` | None | Full | interactive |
| Windsurf | `.windsurf/behaviors/<name>/` | None | Full | interactive |
| Factory AI | `.factory/behaviors/<name>/` | None | Full | interactive |
| Codex | `~/.codex/behaviors/<name>/` | None | Full | interactive |
| OpenCode | `.opencode/behaviors/<name>/` | None | Full | interactive |

### Graceful Degradation Rules

1. **No hooks support** → `hooks` section ignored; behavior operates as a skill (triggers + markdown body only)
2. **No script execution** → `scripts` section ignored; LLM uses markdown body instructions only
3. **No structured inputs** → `inputs` section ignored; LLM extracts parameters from natural language
4. **No daemon scope** → `scope: daemon` behaviors are inactive; `scope: both` behaviors activate in interactive mode only

### Validation Against Concierge (#602)

The Concierge behavior (#602) requires fields beyond the base format:

```yaml
---
name: concierge
version: 2026.3.0
description: Front-facing concierge for daemon interactions
platforms: [openclaw, claude-code]
scope: daemon
tone:
  register: professional-warm
  verbosity: concise
  escalation: absorb-by-default
routing:
  strategy: intent-first
  fallback: surface-with-context
memory:
  session: true
  cross-session: true
triggers:
  - "hello"
  - "help me with"
hooks:
  on_session_start:
    - action: run_script
      script: scripts/greet.sh
  on_session_end:
    - action: run_script
      script: scripts/close.sh
scripts:
  greet: scripts/greet.sh
  close: scripts/close.sh
  route: scripts/route.sh
manifest:
  category: interaction
  composable_with: [voice-framework]
---
```

All Concierge fields (`scope`, `tone`, `routing`, `memory`) are accommodated by the optional daemon/session fields. Existing behaviors (build-monitor, security-sentinel, test-watcher) remain valid — they simply omit the daemon-specific fields.

## Consequences

**Positive:**
- Single canonical format works across all 9 providers at varying capability levels
- Existing behaviors are fully compatible — no migration needed
- Concierge and future daemon-scoped behaviors have formal field definitions
- Lifecycle contract gives platform implementers clear integration requirements
- Graceful degradation ensures behaviors are never broken, only reduced

**Negative:**
- Format has both required and optional sections — validation must handle sparse definitions
- `tone`, `routing`, `memory` objects are intentionally loosely typed to allow evolution
- Platforms must document which lifecycle phases they implement

## Alternatives Considered

1. **Separate daemon behavior format** — A different schema for daemon-scoped behaviors would avoid mixing concerns but would double the format surface area. The optional-field approach is simpler.

2. **Strict typing for tone/routing/memory** — Locking down these object shapes now would constrain the Concierge design (#602) prematurely. Leaving them as opaque objects allows the Concierge to define its own structure.

3. **Hook events as triggers** — Merging `hooks` into `triggers` would simplify the schema but lose the semantic distinction between "user asks" (NLP) and "system notifies" (hooks). Keeping them separate preserves clarity.

## References

- `@.aiwg/architecture/adr-behaviors-deployable-artifact.md` — Foundational ADR for behaviors as artifact type
- `@.aiwg/architecture/adr-behaviors-sticky-capabilities.md` — Runtime behavior layer
- `@src/extensions/types.ts` — TypeScript type definitions (BehaviorMetadata, BehaviorHookEvent)
- Issue #602 — Concierge behavior (first daemon-scoped behavior)
- Issue #603 — This specification (BEHAVIOR.md format spec)
- `@agentic/code/behaviors/` — Existing behavior implementations
- `@tools/scaffolding/add-behavior.mjs` — Behavior scaffolding tool
