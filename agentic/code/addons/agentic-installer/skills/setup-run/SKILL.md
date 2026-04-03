# setup-run

Execute a `setup.aiwg.io/v1` SetupManifest, performing cross-platform installation step by step.

## Trigger Phrases

- "run the setup manifest"
- "install using setup.manifest.yaml"
- "execute installer for [project]"
- "aiwg setup-run [manifest]"
- "run setup for [project]"

## Parameters

### manifest (positional, optional)
Path to the `setup.manifest.yaml`. Default: `./setup.manifest.yaml`.

### --dry-run (optional)
Print what would be executed without running any scripts.

### --platform (optional)
Override platform detection: `linux`, `macos`, `windows`, `wsl2`.

### --distro (optional)
Override distro detection: `ubuntu`, `debian`, `fedora`, `arch`, etc.

### --params-file (optional)
Path to a YAML file with pre-set param values (avoids interactive prompts).

### --step (optional)
Run only a specific step by `id`. Useful for resuming after failure.

### --skip (optional)
Comma-separated step IDs to skip.

## Execution Flow

### Phase 1: Load and Validate

1. Read the manifest file
2. Validate against `setup.aiwg.io/v1` schema (run setup-validate internally)
3. If invalid, report errors and stop — do not attempt partial execution

### Phase 2: Platform Detection

1. Detect OS: `uname -s` (Linux/Darwin) or `$PSVersionTable` (Windows)
2. Detect distro: `/etc/os-release` → `ID` field
3. Detect arch: `uname -m`
4. Detect shell: `$SHELL` or `$0`
5. Match against manifest `platform` block — if no match, warn and ask to proceed or abort

### Phase 3: Param Collection

For each param in manifest `params`:
1. Check if already set in environment or `--params-file`
2. If `required: true` and no value: prompt interactively
3. If `choices` list present: validate input against choices
4. Expand `~` and `$HOME` in `type: path` params

### Phase 4: Prerequisite Check

For each prerequisite:
1. Run `detect` command
2. If `version_min` set: compare version output against minimum
3. On failure: print `install_hint` and stop with non-zero exit

### Phase 5: Step Execution

Execute steps in dependency order:

```
For each step (respecting depends_on order):
  1. Evaluate `when` condition — skip step if false
  2. Dispatch by step type:
     - script:         run the script with params as env vars
     - detect:         run detect command, set env var with result
     - ask:            prompt user, set param
     - verify:         run verify expression; fail if false
     - agentic:        delegate to installer-agent with instruction
     - platform-route: resolve platform → script path, run script
     - chain:          run aiwg setup-run on sub-manifest
  3. Run `verify` expression if present
  4. On failure:
     a. Check recovery_procedures for a matching trigger
     b. If found: show recovery plan and ask user to confirm before running
     c. If not found or recovery fails: report step ID + error, stop
```

### Phase 6: Completion Report

```
[setup] Installation complete

  Steps run:    4/4
  Steps skipped: 0
  Duration:     45s

  Installed to: /opt/myapp
  Config dir:   ~/.config/myapp

Run `myapp --version` to verify.
```

## Dry Run Output

```
[setup:dry-run] Would execute: setup.manifest.yaml
  Platform: linux/ubuntu/x86_64

  Step 1: clone (script)
    script: installer/scripts/clone.sh
    env:    INSTALL_DIR=/opt/myapp BRANCH=main
    verify: test -d ${INSTALL_DIR}/.git

  Step 2: install-deps (platform-route)
    route:  ubuntu → installer/scripts/install-deps-ubuntu.sh

  Step 3: configure (script)
    when:   test ! -f ${CONFIG_DIR}/config.conf
    script: installer/scripts/configure.sh

  Step 4: verify (script)
    script: installer/scripts/verify.sh
```

## Recovery Handling

When a step fails and a recovery procedure matches:

```
[setup] Step 'clone' failed:
  Error: destination path already exists and is not empty

Recovery procedure 'full-reset' is available:
  This will: remove /opt/myapp and re-clone from git

Proceed with recovery? [y/N]: _
```

Never run destructive recovery steps without explicit user confirmation.

## Agentic Steps

When a step has `type: agentic`, the skill delegates to `installer-agent` with the step's `instruction` field as context, plus:
- The full manifest (for environment context)
- The current param values
- The failure output from any preceding script attempt

The installer-agent must explain what it detects and what it will do before making changes.

## References

- Schema: `agentic/code/addons/agentic-installer/schemas/v1/setup-manifest.schema.json`
- Agent: `agentic/code/addons/agentic-installer/agents/installer-agent.md`
- Script lib: `agentic/code/addons/agentic-installer/scripts/lib/`
- Generate skill: `agentic/code/addons/agentic-installer/skills/setup-generate/SKILL.md`
