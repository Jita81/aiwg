# ADR-020: JSON Schema for YAML Metalanguage

**Status**: Accepted
**Date**: 2026-03-23
**Deciders**: Architecture Designer, Project Owner
**Context**: AIWG Declarative Flow and Outcome Expression

---

## Context and Problem Statement

AIWG workflows, hooks, and outcomes are currently described in Markdown prose inside flow command files (`.claude/commands/flow-*.md`). This works for human readers but is difficult for tooling to parse, validate, or transform. As AIWG expands to 8 provider platforms with different hook formats and execution models, the need for a machine-readable, provider-independent expression language for flows and outcomes becomes critical.

A declarative YAML format is needed that:
- Expresses flows, outcomes, hooks, and constraints in a structured, parseable form
- Can be validated without running the workflow
- Can be transformed into provider-specific formats (Claude Code hooks, GitHub Actions steps, etc.)
- Has a formal schema so tools can provide autocomplete and validation

Options considered:
1. **Continue with Markdown prose** — current approach; human-readable, not machine-parseable
2. **Custom DSL** — purpose-built language; maximum expressiveness, high implementation cost
3. **JSON Schema for YAML** — industry-standard schema format applied to AIWG's YAML structure
4. **OpenAPI/AsyncAPI extension** — reuse existing API schema conventions
5. **TypeScript types only** — define shapes in TypeScript; no YAML validation

## Decision Drivers

- **Tooling ecosystem**: JSON Schema has mature validators, IDE support, and code generators in all target languages
- **Multi-provider support**: Schema-validated YAML can be transformed into any provider's native format
- **Validation at author time**: IDE plugins validate YAML against schema before runtime
- **Low adoption barrier**: YAML + JSON Schema is a known pattern (used by OpenAPI, GitHub Actions, etc.)
- **Extensibility**: JSON Schema composition (`$ref`, `allOf`, `oneOf`) supports schema reuse across flow types

## Decision

Adopt **JSON Schema** as the formal schema language for AIWG's YAML metalanguage, covering:
- Flow definitions (`flows/`)
- Hook definitions (`hooks/`)
- Outcome specifications (`outcomes/`)
- Provider adapter manifests (`providers/`)

Schemas reside in `agentic/code/frameworks/sdlc-complete/schemas/`.

Multi-provider hook support is expressed as a provider map in each hook definition, allowing a single AIWG hook to declare its equivalent in each supported platform.

## Rationale

1. **JSON Schema is the standard**: Used by OpenAPI 3.x, GitHub Actions, VS Code settings, and hundreds of other tools — authors already know it
2. **YAML + JSON Schema = validated YAML**: No custom tooling required; existing validators (`ajv`, `jsonschema`, `yq`) apply
3. **Provider map pattern is natural in YAML**: A `providers:` key in each hook maps to Claude Code hooks, GitHub Action steps, Cursor rules, etc.
4. **IDE autocomplete without plugins**: VS Code and JetBrains provide schema-driven YAML autocomplete via `yaml.schemas` setting
5. **Schema composition enables DRY**: Common fields (metadata, versioning, author) defined once and `$ref`-ed across schema types

## Consequences

### Positive

- AIWG flow definitions are validatable before deployment
- `aiwg validate-metadata` can enforce schema compliance as a quality gate
- Provider-specific code generators consume the schema to produce native artifacts
- Formal schema serves as living documentation for the metalanguage

### Negative

- All existing flow Markdown files must be accompanied by (or migrated to) YAML equivalents — not a breaking change but requires authoring effort
- JSON Schema has sharp edges (e.g., `additionalProperties`, `unevaluatedProperties` subtleties) requiring schema author expertise
- Schema versioning must be managed as the metalanguage evolves

### Risks

**Risk: Schema version drift — documents reference an old schema version that has changed** (MEDIUM)
- **Mitigation**: `$schema` field required in all YAML documents; `aiwg validate-metadata` rejects documents without it or with deprecated schema versions
- **Acceptance**: Schema version is explicit and checkable; drift is detectable

## Schema File Locations

```
agentic/code/frameworks/sdlc-complete/schemas/
├── flows/
│   ├── flow-definition.schema.yaml
│   ├── hook-definition.schema.yaml
│   ├── outcome-specification.schema.yaml
│   └── provider-adapter.schema.yaml
├── artifacts/
│   ├── use-case.schema.yaml
│   ├── adr.schema.yaml
│   └── agent-manifest.schema.yaml
└── common/
    ├── metadata.schema.yaml
    └── versioning.schema.yaml
```

## Provider Map Example

```yaml
# hook-definition.yaml
$schema: "urn:aiwg:schema:hook-definition:1.0"
hook-id: pre-session-grounding
trigger: session-start
action: inject-constraints
providers:
  claude-code:
    type: pre-tool-use
    matcher: "**"
  github-copilot:
    type: workspace-instruction
    file: .github/copilot-instructions.md
  cursor:
    type: rule
    file: .cursor/rules/grounding.md
```

## Alternatives Considered

### Alternative 1: Continue with Markdown prose
Rejected: Not machine-parseable. Cannot validate, transform, or generate from it. Does not scale to 8-provider support.

### Alternative 2: Custom DSL
Rejected: High implementation cost, no ecosystem tooling, steep learning curve for contributors.

### Alternative 3: OpenAPI/AsyncAPI extension
Rejected: These are API description formats, not workflow/hook formats. Reusing them would require significant semantic abuse of their constructs.

### Alternative 4: TypeScript types only
Rejected: Types validate at compile time only; no runtime YAML validation; no IDE support for YAML documents.

## References

- **ADR-008** (Plugin Type Taxonomy): Schema types extend the plugin taxonomy
- **ADR-019** (@.aiwg/architecture/decisions/ADR-019-hybrid-addressing.md): Schema URNs use hybrid addressing
- @agentic/code/frameworks/sdlc-complete/schemas/ (schema definitions)
- @.aiwg/requirements/use-cases/UC-015-model-evaluation.md (evaluation fixtures use schema-validated YAML)
- `aiwg validate-metadata` command: `@docs/cli-reference.md`

---

**Last Updated**: 2026-03-23
