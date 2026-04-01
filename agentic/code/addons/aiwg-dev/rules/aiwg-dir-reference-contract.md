# AIWG Directory Reference Contract

**Enforcement Level**: MEDIUM
**Scope**: aiwg-development
**Addon**: aiwg-dev (devOnly)

## Overview

Skills and agents in `agentic/code/` may reference `.aiwg/` paths — this is a feature, not a problem. When a skill references `.aiwg/requirements/` or `.aiwg/AIWG.md`, it gains project-specific context when deployed to any user project. **The constraint is that only normalized paths may be referenced** — paths guaranteed to exist after `aiwg init` or framework deployment.

The normalized contract is **manifest-derived**: each framework and addon declares its `.aiwg/` footprint in `memory.creates`. The allowlist is computed from those declarations, not maintained as a static document.

## Tier 1: Always Present (aiwg init)

These paths exist in every AIWG project, regardless of which frameworks are installed:

| Path | Created by | Purpose |
|------|-----------|---------|
| `.aiwg/AIWG.md` | `aiwg init` | Project context entry point — phase, architecture summary, installed frameworks |
| `.aiwg/frameworks/registry.json` | `aiwg use <framework>` | Installed framework registry |

## Tier 2: Framework-Specific (present when framework deployed)

These paths are normalized per the `memory.creates` declarations in framework manifests:

| Path | Requires | Purpose |
|------|----------|---------|
| `.aiwg/requirements/` | sdlc-complete | User stories, use cases, NFRs |
| `.aiwg/architecture/` | sdlc-complete | SAD, ADRs, diagrams |
| `.aiwg/planning/` | sdlc-complete | Phase plans, iteration plans |
| `.aiwg/risks/` | sdlc-complete | Risk register, mitigations |
| `.aiwg/testing/` | sdlc-complete | Test strategy, test plans |
| `.aiwg/security/` | sdlc-complete | Threat models, security gates |
| `.aiwg/deployment/` | sdlc-complete | Deployment plans, runbooks |
| `.aiwg/research/` | research-complete | Research artifacts |
| `.aiwg/forensics/` | forensics-complete | Digital forensics artifacts |

Skills referencing Tier 2 paths should declare the required framework in their `requires` field.

## Tier 3: Repo-Local (NOT safe in distributable skills)

Any `.aiwg/` path not declared in any installed component's `memory.creates` is Tier 3. These paths only exist in the AIWG development repository and silently fail in all user projects.

| Path | Why unsafe |
|------|-----------|
| `.aiwg/planning/issue-driven-ralph-loop-design.md` | Specific to AIWG dev repo |
| `.aiwg/architecture/adr-rules-index-hierarchy.md` | Dev-repo ADR, not in user projects |
| Any specific file not created by init or deployment | Not guaranteed to exist |

## Rules

### Rule 1: Only Reference Normalized Paths from agentic/code/

Skills and agents under `agentic/code/` may only `@`-reference `.aiwg/` paths that are normalized (Tier 1 or Tier 2).

**FORBIDDEN** (in any file under `agentic/code/`):
```
@.aiwg/planning/issue-driven-ralph-loop-design.md
@.aiwg/architecture/adr-rules-index-hierarchy.md
```

**ALLOWED**:
```
@.aiwg/AIWG.md
@.aiwg/requirements/
@.aiwg/research/
```

### Rule 2: New Frameworks Must Declare Their Memory Footprint

When a new framework or addon creates `.aiwg/` paths, it MUST add those paths to `memory.creates` in its `manifest.json`. This is what normalizes the paths and makes them safe to reference from skills.

```json
{
  "memory": {
    "creates": [
      { "path": ".aiwg/my-framework/", "description": "..." }
    ]
  }
}
```

### Rule 3: The Contract Is Manifest-Derived

Do not maintain a static allowlist document. The normalized contract is computed from `memory.creates` across all installed manifests. `validate-component` and `dev-doctor` read manifests to determine the allowlist dynamically.

## Broader Linking Contract

The same principle applies to other `@`-reference patterns in distributable skills:

| Pattern | Rule |
|---------|------|
| `@.aiwg/<normalized-path>` | ALLOWED — declared in `memory.creates` |
| `@.aiwg/<repo-local-path>` | FORBIDDEN — Tier 3, only exists in this repo |
| `@.claude/<path>` | FORBIDDEN — deployment target, overwritten by `aiwg sync` |
| `@agentic/code/<path>` | ALLOWED — exists wherever AIWG is installed |
| Relative paths | Valid within the same component directory |
| Cross-addon refs | Valid if the required addon is declared in `requires` |

## Detection

`validate-component` and `dev-doctor` (Section 4) implement this check:

1. Find all `@.aiwg/` references in the file(s) under review
2. Load `memory.creates` from all installed manifests to build the normalized allowlist
3. For each reference, check if the path starts with a Tier 1 or Tier 2 normalized prefix
4. Flag any reference that does not match a normalized path

## References

- @agentic/code/addons/aiwg-dev/rules/addon-boundaries.md — Source vs project output boundary
- @src/extensions/types.ts — `MemoryFootprint` type definition
- @docs/development/aiwg-dir-reference-contract.md — Full reference contract document

---

**Rule Status**: ACTIVE
**Last Updated**: 2026-4-1
