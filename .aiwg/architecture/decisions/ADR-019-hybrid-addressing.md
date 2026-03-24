# ADR-019: Hybrid File Path + Semantic URN Addressing

**Status**: Accepted
**Date**: 2026-03-23
**Deciders**: Architecture Designer, Project Owner
**Context**: AIWG Artifact Reference System

---

## Context and Problem Statement

AIWG artifacts reference each other using file paths (e.g., `@.aiwg/requirements/use-cases/UC-001.md`). File paths are simple and human-readable but are fragile: renaming, moving, or reorganizing a directory tree silently breaks all references that point into it. For a framework whose traceability is a core value proposition, silent reference breakage is a serious defect.

A more stable reference scheme is needed that:
- Survives file moves and renames
- Remains human-readable in its short form
- Does not require a database or central registry
- Complements (not replaces) existing file path references

Options considered:
1. **File paths only** — current approach; fragile on refactor
2. **Semantic URN as primary, file path as secondary** — stable URN is canonical; file path is convenience alias
3. **File path as primary, semantic URN as stable fallback** — file path for daily use; URN for cross-reference stability
4. **UUID-based IDs** — globally unique but opaque; breaks human readability
5. **Symlink layer** — filesystem symlinks provide stable aliases; platform-dependent, poor git experience

## Decision Drivers

- **Stability**: References must survive file reorganization
- **Human readability**: References should be understandable without tooling
- **Zero-infrastructure**: No database, registry service, or build step required
- **Backward compatibility**: Existing file path references must continue to work
- **Tooling integration**: `aiwg index` must be able to resolve both forms

## Decision

Adopt **hybrid addressing**: file path as the primary form (human-friendly, IDE-navigable), with a semantic URN as a stable fallback that survives file moves.

**Format**:
```
urn:aiwg:{artifact-type}:{artifact-id}
```

**Example**:
```
urn:aiwg:use-case:UC-001              # resolves to current file location of UC-001
urn:aiwg:adr:ADR-005                  # resolves to current file location of ADR-005
urn:aiwg:agent:security-architect     # resolves to current agent definition file
```

The URN-to-path mapping is maintained in the artifact index (`.aiwg/index/artifact-index.json`), built by `aiwg index build`.

## Rationale

1. **File path remains primary**: No change for everyday use. Authors write `@.aiwg/requirements/UC-001.md` as before.
2. **URN as stable anchor**: Cross-cutting references in rules, agents, and templates use URNs so they survive reorganization
3. **Index resolves both**: `aiwg index query` accepts either form and returns the current file path
4. **No opaque IDs**: URNs embed human-readable artifact type and ID, unlike UUIDs
5. **Git-friendly**: URN-to-path mapping is a JSON file; changes are diffable and reviewable

## Consequences

### Positive

- Framework rules and agent definitions that use URN references survive project reorganization
- `aiwg index` becomes a URN resolver, adding tangible value to the index tooling
- Migration path is additive: existing file path references do not break
- URN format is extensible to cross-project references (`urn:aiwg:{org}/{project}:{type}:{id}`)

### Negative

- Artifact index must be rebuilt after file moves for URN resolution to remain accurate
- Authors must know which reference form to use (file path vs URN) — convention needed
- URNs in documents are slightly more verbose than short file paths

### Risks

**Risk: Index goes stale after file moves, URN resolves to wrong path** (MEDIUM)
- **Mitigation**: CI gate runs `aiwg index build --verify` on every PR; broken URNs fail the gate
- **Acceptance**: Stale index produces a clear error (file not found at resolved path), not silent wrong behavior

## Reference Convention

| Context | Use |
|---------|-----|
| Inline document cross-reference (same project) | File path `@.aiwg/...` |
| Framework rule referencing project artifact type | Semantic URN `urn:aiwg:...` |
| Agent definition referencing another agent | Semantic URN `urn:aiwg:agent:...` |
| Template referencing a required input artifact | Semantic URN `urn:aiwg:...` |

## Alternatives Considered

### Alternative 1: File paths only
Rejected: Fragile. As the AIWG artifact tree grows, reorganization is inevitable. Silent broken references undermine traceability.

### Alternative 2: Semantic URN as primary
Rejected: Degrades daily authoring experience. Authors lose IDE navigation (click-through on file paths). File path as primary preserves tooling ergonomics.

### Alternative 3: UUID-based IDs
Rejected: `urn:aiwg:a3f2c1b0-...` is opaque. Authors cannot tell from the reference what it points to without resolving it.

### Alternative 4: Symlink layer
Rejected: Symlinks behave poorly in git (cross-platform issues, confusing diffs, Windows incompatibility).

## References

- **ADR-003** (Traceability Automation): Hybrid addressing extends traceability graph resolution
- @agentic/code/frameworks/sdlc-complete/rules/mention-wiring.md (updated to document URN form)
- @agentic/code/frameworks/sdlc-complete/rules/qualified-references.md (URN qualifiers extend this rule)
- `aiwg index` CLI: `@docs/cli-reference.md`

---

**Last Updated**: 2026-03-23
