---
platforms:
  - claude-code
  - hermes
  - openclaw
---

# Ring Check

You enforce the four-layer Ring Methodology verification standard when features are completed.

## Triggers

Alternate expressions and non-obvious activations (primary phrases are matched automatically from the skill description):

- "four-layer check" / "four layers" → Ring Methodology verification shorthand
- "circuit breaker" → ring circuit-breaker health check
- "spectral gap" → ring health metric query
- "perinoetic" → session reflection record (ring session-end)
- "layer C" / "layer D" → specific ring layer verification

## Trigger Patterns Reference

| Pattern | Example | Action |
|---------|---------|--------|
| Feature done | "I finished the auth feature" | Run `aiwg ring check` |
| Layer check | "run the ring check" | Run `aiwg ring check` |
| Status check | "what's the ring health?" | Run `aiwg ring status` |
| Circuit breaker | "check circuit breaker" | Run `aiwg ring circuit-breaker` |
| Session start | beginning of work session | Run `aiwg ring session-start` |
| Session end | wrapping up session | Run `aiwg ring session-end` |

## Behavior

When a feature is declared complete:

1. **Run `aiwg ring check`** — validates all four layers:
   - **Layer A** (Developer Reality): syntax clean, unit tests pass
   - **Layer B** (Integration Reality): system tests pass, CLI/API works
   - **Layer C** (User Surface Reality): works from `~`, installed command, login shell
   - **Layer D** (Generative Reflection): structured reflection artifact produced

2. **On HALT (exit 1)**:
   - Report which layers failed
   - Guide completion of missing layers
   - Do not move to next feature until ring closes

3. **On PROCEED (exit 0)**:
   - Confirm ring closed
   - Run `aiwg ring circuit-breaker` to update spectral gap
   - Report health phase

4. **Run `aiwg ring session-end`** when wrapping up to log perinoetic record.

## Layer C Verification

Layer C is the most commonly missed layer. Always test from the user surface:

```bash
# From home directory
cd ~ && aiwg --version

# Via installed command (not local path)
aiwg <subcommand>

# In login shell
bash -lc "aiwg <subcommand>"
```

Layer C first-pass success is tracked as the **spectral gap** metric. Retries degrade health.

## Examples

### Example 1: Feature completion

**User**: "The auth handler is done"

**Action**:
```bash
aiwg ring check
```

**If HALT**:
```
HALT: Layer C (User Surface Reality) not complete.
  → Test from ~, via installed command, in login shell.
  → bash -lc "aiwg auth --version" from home directory.
```

**Response**: "Layer C is not verified. Test the command from `~` via `bash -lc 'aiwg <command>'` then we can close the ring."

### Example 2: Session status

**User**: "What's the ring health?"

**Action**:
```bash
aiwg ring status
```

**Response**: Summary of health phase, spectral gap, features tracked, and any active KENOPHORIA or HALT states.

### Example 3: End of session

**User**: "Wrapping up for today"

**Action**:
```bash
aiwg ring circuit-breaker
aiwg ring session-end
```

**Response**: Session metrics logged, health phase recorded, any unresolved KENOPHORIA states flagged for next session.

## Health Phases

| Phase | Spectral Gap | Meaning |
|-------|-------------|---------|
| PEAK | ≥ 61.8% | Excellent — Layer C passing first try consistently |
| STABLE | ≥ 38.2% | Healthy — occasional retries |
| DEGRADED | ≥ 23.6% | Warning — too many Layer C retries |
| CRITICAL | < 23.6% | Halt threshold — process needs attention |

## References

- @agentic/code/addons/ring-methodology/rules/verification-ring.md — Four-layer ring rule
- @agentic/code/addons/ring-methodology/rules/spectral-gap.md — Health measurement
- @agentic/code/addons/ring-methodology/commands/ring-check.mjs — Check command
- @agentic/code/addons/ring-methodology/README.md — Full addon documentation
