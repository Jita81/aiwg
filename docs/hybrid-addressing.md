# Hybrid File Path and Semantic Addressing

**Issue:** #187
**Version:** 2026.2.0
**Status:** Active

## Overview

AIWG artifacts can be referenced using two addressing styles: file path addressing (direct path or glob) and semantic addressing (keyword query, tag filter, or phase filter). Hybrid addressing combines both to narrow results by location while filtering semantically within that scope.

All addressing syntax uses the `@` prefix, consistent with AIWG's existing `@-mention` convention.

## Addressing Syntax

### Location (File Path)

Reference a specific file or glob pattern:

```
@.aiwg/requirements/UC-001.md
@.aiwg/architecture/*.md
@.aiwg/requirements/**
```

Location addresses are hard filters — if the path does not match, the result is excluded.

### Semantic

Search by keyword across artifact titles, paths, and tags:

```
@?"user authentication"
@?"payment integration"
@?"deployment configuration"
```

Quotes are required. Semantic search scores artifacts by how many query terms appear in the title, path, and tag fields.

### Tags

Filter by YAML frontmatter tags:

```
@#security
@#security,authentication
@#performance,database
```

Tags are a hard filter — artifacts without the specified tags are excluded.

### Phase

Filter by SDLC phase (maps to the top-level `.aiwg/` subdirectory):

```
@phase:requirements
@phase:architecture
@phase:testing
@phase:risks
```

### Hybrid

Combine a path scope with a semantic query:

```
@.aiwg/requirements/?"authentication"
@.aiwg/architecture/?"database migration"
@.aiwg/testing/?"integration tests"
```

Hybrid addressing first applies the path as a hard filter (all results must be under that path), then ranks by semantic relevance within that scope.

## Query Engine

The query engine builds an in-memory index by scanning `.aiwg/` at startup (excluding `working/`, `ralph/`, and `ralph-external/`). For each artifact it records:

- Relative path and inferred phase
- Inferred artifact type (use-case, architecture, testing, planning, risk, security, deployment, report)
- Tags from YAML frontmatter
- Title from the first heading
- `@-mention` references found in the content
- Last-modified timestamp and file size

Index build time targets under 100ms for typical project sizes.

## CLI Usage

The `aiwg index` command exposes the query engine:

```bash
# Build or rebuild the index
aiwg index build
aiwg index build --force --verbose

# Search using any addressing syntax
aiwg index query "user authentication" --json
aiwg index query "@#security" --json
aiwg index query "@phase:requirements" --json

# Show dependencies of an artifact
aiwg index deps .aiwg/requirements/UC-001.md --json

# Index health statistics
aiwg index stats --json
```

Query results include match reasons and relevance scores:

```json
[
  {
    "artifact": {
      "relativePath": "requirements/UC-001.md",
      "phase": "requirements",
      "type": "use-case",
      "title": "UC-001: User Authentication",
      "tags": ["security", "authentication"]
    },
    "score": 0.8,
    "matchReasons": ["keyword: \"authentication\" (100%)", "tags: security, authentication"]
  }
]
```

## Using in Agent Context

Agents use the artifact discovery protocol to query before starting phase work. The `artifact-discovery` rule (see `RULES-INDEX.md`) mandates:

1. Run `aiwg index query` before starting any phase work
2. Run `aiwg index deps` before modifying an existing artifact
3. Always use `--json` output for programmatic consumption
4. Rebuild the index after creating or modifying artifacts
5. Run `aiwg index stats` to assess project health

```bash
# Agent: check what exists before writing a new architecture doc
aiwg index query "architecture" --json

# Agent: check what depends on a use case before modifying it
aiwg index deps .aiwg/requirements/UC-001.md --json

# Agent: rebuild index after creating new artifacts
aiwg index build --force
```

## Dependency Traversal

The index tracks `@-mentions` within artifacts as dependency edges. This enables:

- **Finding dependents**: which artifacts reference a given file
- **Finding dependencies**: which artifacts a given file references

```bash
# What artifacts reference UC-001?
aiwg index deps .aiwg/requirements/UC-001.md --json
# Returns: architecture docs, test plans, and ADRs that @-mention UC-001

# What does the SAD reference?
aiwg index deps .aiwg/architecture/software-architecture-doc.md --json
# Returns: requirements, ADRs, and other docs referenced from the SAD
```

This dependency graph helps agents understand the blast radius of a change before making it.

## Combining with @-Mentions

Hybrid addressing syntax is an extension of AIWG's existing `@-mention` wiring. Standard `@-mentions` reference files by exact path:

```
@.aiwg/requirements/UC-001.md
```

Hybrid addressing extends this with query syntax for cases where you do not know the exact path:

```
@.aiwg/requirements/?"user authentication"
```

The query resolves to one or more matching artifacts. In agent contexts, the top result is used as the reference target.

## Source Files

- `src/artifacts/address-parser.ts` — `parseAddress`, `buildQuery`, `HybridQuery`, `ParsedAddress` types
- `src/artifacts/hybrid-query.ts` — `ArtifactIndex`, `ArtifactInfo`, `SearchResult` — index build, query, and dependency traversal
- `src/artifacts/index-builder.ts` — Index build orchestration
- `src/artifacts/query-engine.ts` — Query execution
- `src/artifacts/cli.ts` — `aiwg index` CLI commands

## References

- @agentic/code/frameworks/sdlc-complete/rules/artifact-discovery.md — Agent protocol for using the index
- @agentic/code/frameworks/sdlc-complete/rules/mention-wiring.md — @-mention wiring convention
- @agentic/code/frameworks/sdlc-complete/rules/qualified-references.md — Semantic relationship qualifiers
