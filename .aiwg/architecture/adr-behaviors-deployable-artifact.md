# ADR: Behaviors as a Deployable Platform Artifact Type

## Status

**PROPOSED**

## Date

2026-03-25

## Context

### The Skill Spectrum

AIWG skills are NLP-triggered, instruction-only capabilities. The LLM reads the SKILL.md and acts on it — there is no execution layer, no scripts, no event subscriptions. Skills are *invoked*: something calls them, they run once, they return.

OpenClaw introduced a richer variant: **skills with scripts**. An OpenClaw skill can contain executable logic alongside its NLP instructions, making it procedurally more powerful. But it is still *pull-based* — something must call it.

This surfaces an unresolved gap in the AI tool ecosystem: there is no standard artifact type for capabilities that are *reactive* — that subscribe to system events, respond to lifecycle signals, and participate in orchestration across multiple inputs. OpenClaw's creator recognized this gap and named it "behaviors," but has not yet defined the architecture.

### What Makes a Behavior Different

| Dimension | Claude Code Skill | OpenClaw Skill | Behavior |
|---|---|---|---|
| Trigger | NLP invocation | NLP invocation | Events + NLP |
| Execution | LLM inference | Scripts | Scripts + hooks |
| Inputs | Conversational | Conversational | Structured, typed, multiple |
| Lifetime | Single invocation | Single invocation | Persistent / subscribed |
| System awareness | None | None | Subscribed to system state |
| Deployment artifact | Yes | Yes | Yes |

A behavior is not a "better skill." It is a different execution model. The hook mechanism flips the dependency direction: a skill waits to be called; a behavior *subscribes* to the system and fires when conditions are met.

### Relationship to Runtime Behaviors

`@.aiwg/architecture/adr-behaviors-sticky-capabilities.md` defines behaviors at the runtime layer — sticky capabilities attached to long-running agents at construction time. That ADR captures the same architectural insight at the process level.

This ADR captures the same insight at the platform artifact level: behaviors as deployable units that platforms (OpenClaw, and future tools) can discover, load, and wire into their event systems.

Both converge on the same principle: **hooks are what separate behaviors from skills**.

---

## Decision

Introduce **Behaviors** as a new AIWG deployable artifact type alongside skills, agents, commands, and rules.

### Format Specification

```yaml
---
name: my-behavior
version: 1.0.0
description: What this behavior does and when it activates.
platforms: [openclaw, claude-code]

# NLP triggers (invocation path — same as skills)
triggers:
  - "run security scan"
  - "check for vulnerabilities"

# Structured input schema (typed, multiple inputs)
inputs:
  - name: target
    type: string
    required: true
    description: File or directory to scan
  - name: severity
    type: enum
    values: [low, medium, high, critical]
    default: medium

# Event hooks (reactive path — what makes it a behavior)
hooks:
  on_file_write:
    - filter: "**/*.ts"
      action: run_script
      script: scripts/lint-on-write.sh
  on_tool_complete:
    - tool: deploy
      action: run_script
      script: scripts/post-deploy-scan.sh
  on_schedule:
    - cron: "*/30 * * * *"
      action: run_script
      script: scripts/periodic-audit.sh

# Executable scripts
scripts:
  main: scripts/main.sh
  lint-on-write: scripts/lint-on-write.sh
  post-deploy-scan: scripts/post-deploy-scan.sh
  periodic-audit: scripts/periodic-audit.sh

# Manifest — richer metadata than skills
manifest:
  category: security
  requires:
    bins: [npm, node]
    env: [AIWG_API_KEY]
  outputs:
    - type: report
      path: .aiwg/reports/security/
  composable_with: [code-review, test-runner]
---

# Behavior instructions (markdown body — LLM reads this for context)

When this behavior activates via NLP trigger, run the main security scan script
against the specified target. When activated via hooks, run the appropriate
script for the triggering event.

Always output findings to `.aiwg/reports/security/` in structured JSON.
```

### Directory Structure

```
agentic/code/behaviors/          # Framework-provided behaviors (ships with AIWG)
  security-sentinel/
    BEHAVIOR.md                  # The behavior definition
    scripts/
      main.sh
      lint-on-write.sh
      post-deploy-scan.sh

.aiwg/behaviors/                 # Project-specific behaviors
  my-custom-behavior/
    BEHAVIOR.md
    scripts/
```

### Deployment Targets

| Platform | Target Directory | Notes |
|---|---|---|
| OpenClaw | `~/.openclaw/behaviors/<name>/` | First implementation |
| Claude Code | `.claude/behaviors/<name>/` | Hooks degrade gracefully |
| Future platforms | Platform-specific | Hooks wired if supported |

### Graceful Degradation

On platforms that support NLP triggers but not hooks, behaviors degrade to skills — only the trigger + instructions path activates. The `hooks:` section is ignored. This preserves cross-platform transferability: a behavior deployed to Claude Code works as a skill; deployed to OpenClaw it gains its full reactive capability.

### CLI Integration

```bash
aiwg use sdlc --provider openclaw    # Deploys behaviors/ alongside agents/skills/commands/rules
aiwg add-behavior security-sentinel  # Scaffold a new behavior
aiwg catalog list --type behavior    # Discover available behaviors
```

---

## Consequences

**Positive:**
- Defines a new ecosystem-level pattern that platforms are reaching for but haven't standardized
- AIWG behaviors are transferable: same artifact works across platforms at different capability levels
- Hooks unlock reactive workflows that skills cannot express
- Structured inputs enable type-safe, multi-input capabilities
- Composable: behaviors can declare compatibility with other behaviors

**Negative:**
- New artifact type adds surface area to the deployment system
- Hook support must be negotiated per-platform (OpenClaw first, others later)
- Script portability requires care (bash scripts may not work everywhere)

---

## Alternatives Considered

1. **Extend skills with hooks** — Adding `hooks:` to SKILL.md conflates two different execution models. Skills are pull-only by design; adding hooks changes the fundamental semantics. A new artifact type with a clear name is better than a skill with bolt-on reactivity.

2. **Use agents for reactive capabilities** — Agents are AI personas, not event subscribers. Mapping hooks to agents would require keeping agents alive indefinitely and wiring them to event buses — architecturally wrong.

3. **Defer to platform-specific formats** — Each platform inventing its own behavior format creates fragmentation. AIWG is positioned to define the cross-platform standard.

---

## Implementation Plan

1. **Phase 1** — Define BEHAVIOR.md format spec (this ADR)
2. **Phase 2** — Add `behaviors/` to framework source directories (`agentic/code/behaviors/`)
3. **Phase 3** — Add `openclaw` behaviors deployment to provider module (`~/.openclaw/behaviors/`)
4. **Phase 4** — `aiwg add-behavior` scaffolding command
5. **Phase 5** — Claude Code native hook integration (`.claude/behaviors/`)

OpenClaw is Phase 3 — it is the first platform to support behaviors natively.

---

## References

- `@.aiwg/architecture/adr-behaviors-sticky-capabilities.md` — Runtime behavior layer (complementary)
- `@.aiwg/planning/rfc-daemon-behaviors.md` — RFC-001: Daemon-as-Headend
- `@.aiwg/planning/openclaw-aiwg-integration-plan.md` — OpenClaw integration plan
- Issue #535 — Add openclaw provider to deployment system
- REF-022 (AutoGen) — `register_reply()` runtime capability composition
