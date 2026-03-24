# Verification Ring

**Enforcement Level**: HIGH
**Scope**: All code-delivering agents — CLI tools, TUI apps, libraries, API servers, full-stack apps
**Addon**: ring-methodology
**Issue**: #468

## Overview

The Verification Ring is a four-layer quality gate that catches failures the standard test suite cannot see. It separates developer-side correctness (syntax, unit tests) from integration correctness (assembled product), user-surface correctness (how the product behaves in a real shell session), and generative reflection (what the implementation revealed that the spec did not anticipate).

All four layers are mandatory for every feature. Skipping any layer is a process violation, not a time-saving shortcut.

## Problem Statement

Standard CI catches Layer A failures. It does not catch:

- A shebang that resolves to the system interpreter instead of the project interpreter
- An installed command that zsh autocorrect silently renames
- A `~/bin` entry missing from `PATH` in a login shell
- A library that imports cleanly inside the venv but fails when the user runs `python3` from their home directory
- An API server that starts fine in dev but binds to the wrong interface when launched from the documented start command

These failures share a pattern: they pass every developer-side check, then fail the moment a real user touches the product. Layer C exists specifically to intercept this class of failure. Layers A and B alone are insufficient. Layer D prevents the same gap from recurring in the next feature cycle.

## Mandatory Rules

### Rule 1: One Feature, One Full Ring

Every feature progresses through all four layers before it is marked complete. Batching features through layers (running Layer A for three features, then Layer B for three features) is forbidden. Each feature gets its own complete ring traversal.

### Rule 2: C Failure Means Feature Incomplete

A Layer C failure is not a minor finding to log and continue from. It means the feature is not done. The feature may not be marked complete, merged, or included in a release until Layer C passes.

### Rule 3: D Always Runs

Layer D does not test code. It cannot fail. It always produces output. Skipping D breaks the ring and cuts off the primary feedback path from implementation back to specification and architecture.

### Rule 4: ring_complete Gate

The `ring_complete` gate must evaluate to `true` before a `FeatureComplete` event fires:

```
ring_complete = all([
  layer_a,
  layer_b,
  layer_c_first_pass OR layer_c_retries <= 3,
  layer_d != null
])
```

This gate is enforced by the `ring-check.sh` hook on the `FeatureComplete` event. A `FeatureComplete` event that fires without `ring_complete = true` is a hook failure, not a warning.

### Rule 5: D Artifacts Feed Back Into Spec and Architecture

Layer D output is not disposable. Artifacts accumulate in `.aiwg/working/ring/layer_d.jsonl`. Every three features, aggregate entries are reviewed and candidates are fed into spec refinement, architecture updates, and the risk register. If three features complete with no D aggregation review, the process is drifting.

---

## Layer Definitions

### Layer A — Developer Reality

**Question**: Does the code work inside the project with dev tooling?

Layer A confirms that the change is internally sound before integration is attempted.

**Required checks:**

- Syntax check and compile (TypeScript, Python type check, Go build, etc.)
- Imports load without error in the project environment
- Unit tests pass
- Smoke tests pass (if present)
- Only declared files were modified (no accidental side effects)

**Failure action**: Fix before proceeding. Layer B may not start until Layer A is green.

**Enforced by**: `executable-feedback` rule (Layers A and B are its primary scope).

---

### Layer B — Integration Reality

**Question**: Does the assembled product work as a system?

Layer B confirms that components compose correctly and the product functions end-to-end as built.

**Required checks:**

- TUI or GUI boots headless; all views render without error
- CLI: every subcommand executes, exit codes are correct, output format matches spec
- API: every endpoint returns expected response structure and status codes
- Library: import succeeds from a clean script outside the project directory

**Failure action**: Fix before proceeding. Layer C may not start until Layer B is green.

---

### Layer C — User Surface Reality

**Question**: Does the product work the way the user uses it?

This is the layer that existing AIWG rules do not cover. Layer C tests from the user's position, not the developer's position.

**Required execution context** — all of the following must be tested:

- Working directory: `~` (not project root, not repo clone)
- Invocation: installed command name (`mytool`, not `python3 path/to/script.py` or `node src/index.js`)
- Shell context: `bash -lc "mytool"` (login shell, not interactive dev session)
- Interpreter resolution: shebang path, not dev venv activation
- Session reset: fresh shell after `source ~/.zshrc` (or equivalent)

**Deliverable test matrix:**

| Deliverable | Layer C Test |
|-------------|-------------|
| CLI tool | `bash -lc "tool --version"` from `~` |
| TUI app | `bash -lc "tool"` from `~` |
| Library | `pip install . && python3 -c "import pkg"` from temp dir outside project |
| API server | Documented start command → health endpoint responds |
| App + server | Open app → curl port → stop → start again (idempotency) |

**Real failures that passed Layers A and B:**

- `#!/usr/bin/env python3` resolved to system Python 3.9 (no project deps) instead of Homebrew Python 3.14 that the dev venv used
- zsh autocorrect silently rewrote the installed command name to a dotfile path
- Symlink in `~/bin` worked under the dev session but `bash -l` did not include `~/bin` in `PATH`
- `pip install` succeeded inside the venv; the shebang pointed to a different Python; the installed command imported nothing

**Failure action**: Feature is incomplete. Do not mark done. Do not merge. Fix and re-run Layer C. Maximum 3 retries before escalating to human review.

---

### Layer D — Generative Reflection

**Question**: What did Layers A through C reveal that the spec did not know?

Layer D does not execute code. It harvests the generative offset — the delta between what the spec assumed and what implementation discovered.

**Required output** (one entry per feature, written to `.aiwg/working/ring/layer_d.jsonl`):

```json
{
  "feature": "<feature name or ID>",
  "spec_assumptions_invalidated": [],
  "environment_assumptions_found": [],
  "unexpected_interactions": [],
  "adversarial_cases": [],
  "archetype_if_failed": null
}
```

Field definitions:

| Field | Content |
|-------|---------|
| `spec_assumptions_invalidated` | Assumptions the spec made that turned out to be false |
| `environment_assumptions_found` | Environment dependencies the spec did not document |
| `unexpected_interactions` | Interactions with other features, system state, or user behavior not anticipated |
| `adversarial_cases` | Inputs or conditions that could break the feature despite all layers passing |
| `archetype_if_failed` | If a layer failed, the failure archetype (e.g., `shebang-mismatch`, `path-gap`, `interpreter-version`) |

**Layer D never fails.** If there is nothing to report in a field, the field is an empty array or null. An empty D entry is valid. A missing D entry is a process violation.

**Skipping D is prohibited** even when Layers A, B, and C all passed on the first attempt. A clean run still has something to report — at minimum, that no unexpected findings were encountered. That observation belongs in the record.

---

## Circulation Path

Layer D artifacts accumulate and circulate back into upstream planning:

```
Feature complete (ring_complete = true)
  → D artifact written to .aiwg/working/ring/layer_d.jsonl

Every 3 features:
  → Aggregate D entries
  → Review spec_assumptions_invalidated → candidates for spec updates
  → Review environment_assumptions_found → candidates for architecture or NFR updates
  → Review adversarial_cases → candidates for risk register
  → Review archetype_if_failed → candidates for new Layer C tests
```

This circulation is what makes the ring self-improving. Without it, the same environment assumption gap can be discovered by every feature independently, each time as a surprise.

---

## Examples

### Example 1: CLI Tool — Layer C Failure (Shebang Mismatch)

**Scenario**: A new `aiwg` subcommand passes all unit tests and the CLI integration test suite.

**Layer A**: Passes. TypeScript compiles, imports resolve, unit tests green.

**Layer B**: Passes. Subcommand executes correctly from project root with `node dist/cli.js new-sub`.

**Layer C**:

```bash
# From ~, login shell
bash -lc "aiwg new-sub"
# Result: command not found
```

Investigation: `npm install -g` placed the binary in `/usr/local/bin` but PATH in login shell does not include `/usr/local/bin` on this system's `.bash_profile`.

**Feature status**: Incomplete. Installation instructions or PATH setup step required before Layer C can pass.

**Layer D entry**:

```json
{
  "feature": "new-sub command",
  "spec_assumptions_invalidated": ["npm -g install places binary in PATH automatically"],
  "environment_assumptions_found": ["login shell PATH on macOS does not include /usr/local/bin by default without explicit .bash_profile entry"],
  "unexpected_interactions": [],
  "adversarial_cases": ["User with nvm or volta where global npm bin differs"],
  "archetype_if_failed": "path-gap"
}
```

---

### Example 2: Library — Layer C Pass, Layer D Finding

**Scenario**: A new helper module is added to the AIWG SDK.

**Layer A**: Passes. Types check, unit tests green.

**Layer B**: Passes. Integration test imports and exercises the module.

**Layer C**:

```bash
# Temp dir, no venv, no project context
cd /tmp && python3 -c "from aiwg_sdk import new_helper; print(new_helper.ping())"
# Result: OK
```

Layer C passes on first attempt.

**Layer D entry**:

```json
{
  "feature": "new_helper module",
  "spec_assumptions_invalidated": [],
  "environment_assumptions_found": ["module depends on stdlib only — no hidden runtime deps found"],
  "unexpected_interactions": ["new_helper.ping() triggers a deprecation warning from stdlib hmac on Python 3.12+ — not a failure but worth tracking"],
  "adversarial_cases": ["Caller passes None instead of str to ping() — currently raises AttributeError, not ValueError"],
  "archetype_if_failed": null
}
```

The deprecation warning and the unhelpful exception type were not in the spec. They now exist in the D record and are candidates for a follow-up spec amendment.

---

## Integration with Existing Rules

| Existing Rule | Relationship to Verification Ring |
|---------------|----------------------------------|
| `executable-feedback` | Covers Layer A and Layer B enforcement. Verification Ring extends coverage to Layer C and D. |
| `anti-laziness` | Prevents skipping layers. A feature that skips Layer C to ship faster is the exact behavior anti-laziness prohibits. |
| `morpholepsis-detection` (ring-methodology addon) | The success arrest signal fires when Layer A passes but Layers B, C, or D are skipped — the characteristic pattern of stopping at first success. |
| `reproducibility` | Layer C tests must be reproducible. Parameterize shell and interpreter versions. Record the environment that was tested. |
| `provenance-tracking` | Layer D artifacts are provenance records. Write them to `.aiwg/working/ring/layer_d.jsonl` and reference the feature artifact URN. |

---

## Checklist

Before marking a feature complete:

- [ ] Layer A: Syntax/compile check passed
- [ ] Layer A: Imports load without error
- [ ] Layer A: Unit and smoke tests pass
- [ ] Layer A: Only declared files modified
- [ ] Layer B: Product assembles and boots correctly
- [ ] Layer B: All subcommands/endpoints/views exercised
- [ ] Layer C: Tested from `~`, not project root
- [ ] Layer C: Tested using installed command name, not dev invocation
- [ ] Layer C: Tested in login shell (`bash -lc "..."`)
- [ ] Layer C: Shebang resolution confirmed (not venv-dependent)
- [ ] Layer C: Fresh shell after `source ~/.zshrc` (or equivalent)
- [ ] Layer D: Entry written to `.aiwg/working/ring/layer_d.jsonl`
- [ ] Layer D: All five fields populated (empty arrays where nothing found)
- [ ] `ring_complete` gate evaluates to `true`

Every 3 features:

- [ ] D entries aggregated and reviewed
- [ ] Spec update candidates identified
- [ ] Architecture/NFR update candidates identified
- [ ] Risk register candidates identified
- [ ] New Layer C test candidates identified

---

## References

- @agentic/code/frameworks/sdlc-complete/rules/executable-feedback.md — Layer A and B enforcement
- @agentic/code/frameworks/sdlc-complete/rules/anti-laziness.md — Prevents layer skipping
- @agentic/code/frameworks/sdlc-complete/rules/provenance-tracking.md — Layer D artifact provenance
- @agentic/code/frameworks/sdlc-complete/rules/reproducibility.md — Layer C reproducibility requirements
- @agentic/code/addons/ring-methodology/rules/morpholepsis-detection.md — Success arrest detection (ring-methodology addon)

---

**Rule Status**: ACTIVE
**Last Updated**: 2026-03-24
