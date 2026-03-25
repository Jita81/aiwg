# ADR: Daemon Profile System via YAML Templates

## Status

**PROPOSED**

## Date

2026-03-25

## Context

The daemon requires configuration covering provider credentials, concurrency limits, budget caps, messaging rooms, and autonomous mode settings. A new user needs a reasonable starting point without having to author configuration from scratch. Configuration also needs to be deployable alongside framework artifacts via `aiwg use`.

There is no existing mechanism for shipping opinionated daemon configurations with the framework. Hand-editing a raw config file is error-prone and undiscoverable.

## Decision

Use YAML profile templates stored in `agentic/code/daemon-profiles/` to generate `.aiwg/daemon.yaml` at initialization time. The `manager` profile is the default and covers the most common single-operator use case.

Profiles ship with the framework and are deployed to projects via `aiwg use sdlc` (or `aiwg use daemon`). When a user initializes the daemon without an existing `daemon.yaml`, the CLI selects the default profile and materializes it at `.aiwg/daemon.yaml`.

Profile selection:

```bash
aiwg daemon init                    # uses manager profile (default)
aiwg daemon init --profile minimal  # lightweight, no autonomous mode
aiwg daemon init --profile team     # multi-operator, shared messaging
```

The generated `.aiwg/daemon.yaml` is a regular file — users edit it directly after generation. Profiles are not re-applied on subsequent runs unless `--reset` is passed.

## Alternatives Considered

1. **JSON-only config** -- JSON is machine-readable but not human-editable in practice. No comment support makes it difficult to document intent inline. Rejected in favor of YAML, which supports comments and is the established convention for AIWG configuration files.

2. **Environment variables only** -- Suitable for secrets (credentials remain env-var-only) but insufficient for complex structured config such as room definitions, behavior schedules, and budget caps. Rejected as the sole mechanism; env vars remain the injection point for secrets.

3. **Interactive wizard** -- Viable for first-time setup but generates no reusable artifact and is not scriptable. Profiles provide the same guided starting point in a reproducible, versionable form.

## Consequences

**Positive:**
- New users get a working configuration without reading documentation
- Profiles are versioned alongside the framework; improvements ship automatically
- Profile YAML files serve as living documentation of supported configuration options
- Environment-specific overrides layer cleanly on top via standard YAML merge

**Negative:**
- Profile proliferation risk if too many specialized profiles are added; keep to a small canonical set
- Users who edit `daemon.yaml` heavily may diverge from the profile; re-initialization with `--reset` would overwrite their changes (mitigated by the `--reset` flag being explicit)

## References

- Issue #512
- RFC: `.aiwg/planning/rfc-daemon-behaviors.md`
- Existing convention: `agentic/code/frameworks/sdlc-complete/` as the deployment source pattern
