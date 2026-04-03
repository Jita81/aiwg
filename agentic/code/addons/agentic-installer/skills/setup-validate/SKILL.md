# setup-validate

Validate a `setup.aiwg.io/v1` SetupManifest file against the schema and run consistency checks.

## Trigger Phrases

- "validate setup manifest"
- "check setup.manifest.yaml"
- "aiwg setup-validate [manifest]"
- "lint installer manifest"
- "verify my setup manifest"

## Parameters

### manifest (positional, optional)
Path to the `setup.manifest.yaml`. Default: `./setup.manifest.yaml`.

### --schema (optional)
Path to schema file. Default: auto-located from AIWG installation.

### --strict (optional)
Fail on warnings in addition to errors.

### --fix (optional)
Auto-fix simple issues (missing `id`, missing `depends_on` on sequential steps).

## Validation Checks

### Schema Validation
- `apiVersion` must be `setup.aiwg.io/v1`
- `kind` must be `SetupManifest`
- Required fields present: `metadata.name`, `platform.os`, `steps`
- All step types are one of: `script`, `detect`, `ask`, `verify`, `agentic`, `platform-route`, `chain`
- Param types are one of: `string`, `path`, `boolean`, `integer`, `choice`

### Reference Checks
- Every `script:` path exists relative to the manifest directory
- Every `chain:` manifest path exists
- Every `platform-route` route value resolves to an existing script
- `depends_on` step IDs all exist in the manifest
- Recovery `triggers` list references valid step IDs

### Consistency Checks (warnings unless --strict)
- Steps without `id` — suggest auto-generated IDs
- Sequential steps that logically depend on prior steps but have no `depends_on`
- Params declared but never referenced in scripts or `when` conditions
- Prerequisites with no `install_hint` (hard to debug without one)
- Verify expressions that look like they'd always pass (e.g., `true`)

### Script Safety Checks
- Scripts that exist: read first 5 lines to confirm they source lib scripts
- Warn if a script template is used directly without customization (template placeholder text detected)

### Agentic Step Audit
- Warn on any `type: agentic` step — print a reminder that agentic steps are exception handling only
- Error if `type: agentic` step has no `instruction` field

## Output Format

```
Validating: setup.manifest.yaml

  Schema:        ✓ Valid (setup.aiwg.io/v1 / SetupManifest)
  Metadata:      ✓ name=myapp version=1.0.0
  Platform:      ✓ linux (ubuntu, debian, fedora), macos
  Params:        ✓ 2 params (INSTALL_DIR required, BRANCH default=main)
  Prerequisites: ✓ 2 checked (git >=2.30, node >=18.0)

  Steps (4):
    ✓ clone           script  installer/scripts/clone.sh [exists]
    ✓ install-deps    platform-route  3 routes [all scripts exist]
    ✓ configure       script  installer/scripts/configure.sh [exists]
    ✓ verify          script  installer/scripts/verify.sh [exists]

  Recovery (1):
    ✓ full-reset  triggers=[clone, configure]  script [exists]

  Warnings (1):
    ⚠ configure: param CONFIG_DIR referenced in 'when' but not declared in params block

Result: VALID (1 warning)
```

### Error Example

```
  Errors (2):
    ✗ Step 'install-deps': route 'arch' → installer/scripts/install-deps-arch.sh [NOT FOUND]
    ✗ Recovery 'partial-reset': trigger 'build' does not match any step id

Result: INVALID — fix errors before running
```

## Auto-fix (--fix)

When `--fix` is passed, the skill will:
1. Add `id` fields to any steps missing them (sequential: `step-1`, `step-2`, ...)
2. Add obvious `depends_on` for sequential steps (each step depends on the previous)
3. Print a diff of changes made

It will NOT:
- Change step types
- Add or remove scripts
- Modify param definitions

## References

- Schema: `agentic/code/addons/agentic-installer/schemas/v1/setup-manifest.schema.json`
- Run skill: `agentic/code/addons/agentic-installer/skills/setup-run/SKILL.md`
- Generate skill: `agentic/code/addons/agentic-installer/skills/setup-generate/SKILL.md`
