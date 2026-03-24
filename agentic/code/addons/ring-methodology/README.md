# Ring Methodology Addon

A cyclical development execution framework with four-layer verification, process health measurement, and automatic circuit breakers.

**Deploy:** `aiwg use ring`

---

## What It Does

The ring methodology enforces a structured completion standard for every feature. Work moves through four verification layers in sequence — Developer Reality → Integration Reality → User Surface Reality → Generative Reflection. Only when all four layers confirm completion is a feature considered done.

Process health is measured continuously via **spectral gap** — the fraction of features where Layer C (User Surface) passed on the first try. When this rate degrades, the system warns or halts before problems compound.

---

## Quick Start

```bash
# Deploy to your project
aiwg use ring

# Check ring completion after finishing a feature
aiwg ring check

# View process health dashboard
aiwg ring status

# Run circuit breaker manually
aiwg ring circuit-breaker
```

After deployment, the ring namespace is available as `aiwg ring <subcommand>`. Wire `aiwg ring check` and `aiwg ring circuit-breaker` into your Claude Code hooks for automatic enforcement.

---

## The Ring

Work moves through four positions in a cycle. Each position feeds the next. The ring closes when all four complete — then it begins again on the next feature.

```
         IDENTITY
         (Feature scoped,
          kernels loaded)
              │
              ▼
  ┌─────────────────────────┐
  │                         │
REFLECTION               ACTION
(Layer D —             (Layers A + B —
 structured             developer + integration
 artifact)              verification)
  │                         │
  └─────────┐   ┌───────────┘
            ▼   ▼
         VERIFICATION
         (Layer C —
          user surface
          reality)
```

Enter at any position. The ring is not a checklist — it is a cycle. Skipping Layer D means the ring ran as a line. The circuit breaker measures how often Layer C is reached cleanly (spectral gap).

---

## The Four Layers

| Layer | Name | What It Verifies |
|-------|------|-----------------|
| **A** | Developer Reality | Syntax clean, imports resolve, unit tests pass |
| **B** | Integration Reality | System tests pass, CLI subcommands work, API endpoints respond |
| **C** | User Surface Reality | Works from `~`, via installed command, in login shell (`bash -lc`) |
| **D** | Generative Reflection | Structured reflection artifact produced — what failed, what was learned |

Layer D always runs. A ring running without Layer D is running as a line.

Layer C has a retry ceiling of 3. First-pass success is tracked separately as the **spectral gap** metric.

---

## CLI Commands

All commands are available after `aiwg use ring`. Artifacts are stored in `.aiwg/working/ring/`.

### `aiwg ring check`

Validates ring completion for the latest feature entry. Reads the last line of `features.jsonl` and checks all four layers.

```bash
aiwg ring check
```

**Exit 0 (PROCEED):** All four layers complete.

**Exit 1 (HALT):** One or more layers missing. Output names each failing layer with remediation guidance:
```
HALT: Layer C (User Surface Reality) not complete.
  → Test from ~, via installed command, in login shell.
  → bash -lc "tool --version" from home directory.
```

Graceful first-run: exits 0 with informational message if no `features.jsonl` exists yet.

---

### `aiwg ring circuit-breaker`

Reads all feature and kernel records, computes spectral gap, checks for consecutive failures on the same feature. Writes current state to `session-state.json`.

```bash
aiwg ring circuit-breaker
```

**Health phases** (φ-derived thresholds):

| Phase | Spectral Gap | Exit |
|-------|-------------|------|
| PEAK | ≥ 61.8% | 0 |
| STABLE | ≥ 38.2% | 0 |
| DEGRADED | ≥ 23.6% | 0 (warning) |
| CRITICAL | < 23.6% | 1 (soft halt) |

Consecutive failures on the same feature (≥ 2 kernels) trigger a hard **HALT** (exit 1) regardless of spectral gap.

---

### `aiwg ring session-start`

Reads prior `session-state.json` and surfaces anything that needs attention before new work begins.

```bash
aiwg ring session-start
```

Reports:
- Prior health phase and spectral gap
- Unresolved KENOPHORIA state (blocked on external dependency)
- DEGRADED or CRITICAL health warnings
- Pending perinoetic review (triggered when 3+ features completed since last review)

Always exits 0 — informational only.

---

### `aiwg ring session-end`

Computes session metrics and appends a structured reflection record to `perinoesis.jsonl`.

```bash
aiwg ring session-end
```

Captures per-session:
- Features attempted and ring-complete count
- Spectral gap at session close
- Kernel count and unique archetypes encountered
- Morpholepsis signal frequency
- Whether KENOPHORIA state is unresolved (carried to next session)

---

### `aiwg ring status`

Human-readable dashboard showing current ring methodology health.

```bash
aiwg ring status
```

**Example output:**
```
Ring Methodology — Project Health

  Health:       STABLE (spectral gap: 54.2%)
  Features:     12 tracked, 11 ring-complete
  Kernels:      8 extracted (3 archetypes)
  Last review:  2 features ago

  Morpholepsis signals: retry-escalation (3), success-arrest (1)
```

Shows `HALTED` status and reason if circuit breaker has fired. Shows `KENOPHORIA` notice if blocked on external dependency.

---

## Artifacts

All artifacts live in `.aiwg/working/ring/`:

| File | Contents |
|------|----------|
| `features.jsonl` | One record per feature: layer completion flags, spectral gap contribution, morpholepsis signals |
| `kernels.jsonl` | Extracted failure/insight kernels with archetype classification |
| `perinoesis.jsonl` | Perinoetic review records appended each session |
| `session-state.json` | Latest health snapshot: spectral gap, health phase, halt state |

### Feature Record Schema

See `templates/feature-record.json` for the full schema. Key fields:

```json
{
  "feature": "descriptive-feature-name",
  "timestamp": "2026-03-24T...",
  "layer_a": true,
  "layer_b": true,
  "layer_c_first": false,
  "layer_c_retries": 2,
  "layer_d": { "reflection": "..." },
  "ring_complete": true,
  "morpholepsis_signals": ["retry-escalation"]
}
```

### Kernel Record Schema

See `templates/kernel-entry.json`. Key fields:

```json
{
  "feature": "descriptive-feature-name",
  "archetype": "retry-escalation",
  "description": "Layer C failed twice due to PATH not set in login shell",
  "prevention": "Always test with bash -lc from ~"
}
```

---

## Hook Wiring

The `hook_event` field in the manifest declares the lifecycle event each command maps to. To wire as Claude Code hooks, add to `.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [{ "command": "aiwg ring circuit-breaker" }],
    "SessionStart": [{ "command": "aiwg ring session-start" }],
    "SessionEnd": [{ "command": "aiwg ring session-end" }]
  }
}
```

`aiwg ring check` is typically invoked manually or via a custom `FeatureComplete` hook when you declare a feature done.

---

## Concepts

### Spectral Gap

The fraction of features where Layer C (User Surface) passed on the first try, without retries. Measures how often work reaches the user surface cleanly vs. requiring surface-level fixes.

High spectral gap → process is healthy. Low spectral gap → integration or deployment issues are masking problems until they surface at the user layer.

### Morpholepsis

Patterns of work arrest: moments when progress stops, loops, or collapses in a recognizable way. The ring tracks these signals across features so recurring archetypes surface during perinoetic review.

Common archetypes: `retry-escalation`, `success-arrest`, `layer-c-path-failure`, `tool-not-installed`.

### Kenophoria

Blocked state where progress depends on an external factor the agent cannot resolve (waiting on a dependency, external API unavailable, human decision required). KENOPHORIA state is recorded in `session-state.json` and surfaced at session start so it is not forgotten across sessions.

### Perinoesis

Periodic review of accumulated kernels and session feedback. Triggered after every 3 features. The `aiwg ring session-end` command appends the review record. `aiwg ring session-start` surfaces when a review is overdue.

### Kernels

Distilled failure and insight records extracted when Layer C retries occur or when Layer D reflection identifies a recurring pattern. Kernels are reused in future features to prevent repeating known failure modes.

---

## Integration with AIWG Core Rules

Ring methodology rules complement and extend the AIWG core rules rather than replacing them:

| Ring Rule | Complements | Extension |
|-----------|-------------|-----------|
| `verification-ring` | `executable-feedback` | Adds Layer C (user surface from `~`) and Layer D (structured reflection artifact) beyond unit/integration tests |
| `morpholepsis-detection` | `anti-laziness` | Detects wrong-frame pattern before destructive resolution occurs — earlier intervention than "3 attempts then escalate" |
| `kenophoria-state` | `failure-mitigation` | Adds KENOPHORIA as a distinct non-failure blocking state with explicit carry-forward tracking across sessions |
| `temporal-coupling` | `subagent-scoping` (spatial) | Adds the temporal dimension: run-to-run state entanglement, not just cross-task coupling in a single session |
| `kernel-extraction` | `anti-laziness` | Adds mandatory insight preservation mechanism — failures generate reusable kernels rather than just triggering retry |
| `spectral-gap` | *(no direct equivalent)* | First process-level health instrument in AIWG — measures methodology quality, not just task success |

---

## Removal

```bash
aiwg remove ring
```

Removes: rules, CLI extension registry entry for `ring` namespace, hook entries from `.claude/settings.json`.

**Does not remove:** `.aiwg/working/ring/` — accumulated feature records, kernels, and perinoetic history are preserved. This is accumulated knowledge about your project's development patterns and is not deleted automatically.

---

## Rules Included

| Rule | Enforces |
|------|----------|
| `verification-ring` | Four-layer ring structure and completion standard |
| `spectral-gap` | φ-derived health thresholds and tracking discipline |
| `morpholepsis-detection` | Signal recognition and archetype classification |
| `kenophoria-state` | Blocked-state management and escalation |
| `kernel-extraction` | When and how to extract kernels from failures |
| `temporal-coupling` | Awareness of time-dependent dependencies in verification |

---

## Configuration

Default values (override in `.aiwg/config.yaml`):

```yaml
ring:
  artifactPath: .aiwg/working/ring
  perinoesisInterval: 3          # features between required reviews
  retryCeiling: 3                # max Layer C retries before halt
  spectralGapThresholds:
    peak: 0.618
    stable: 0.382
    degraded: 0.236
  consecutiveFailureLimit: 2     # same-feature kernel failures before halt
```

---

## Compatibility

Works alongside: `sdlc-complete`, `rlm`

Optional dependencies: `ralph`, `aiwg-utils`
