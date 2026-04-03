# setup-generate

Generate a `setup.manifest.yaml` file for a project using the `setup.aiwg.io/v1` SetupManifest language.

## Trigger Phrases

- "generate a setup manifest for [project]"
- "create installer for [project]"
- "scaffold setup manifest"
- "write a setup.manifest.yaml for [directory]"
- "generate install workflow for [project]"

## Parameters

### project-dir (positional, optional)
Path to the project root. Defaults to `.`.

### --from-readme (optional)
Extract requirements from `README.md` or `INSTALL.md` in the project dir.

### --from-existing (optional)
Update an existing `setup.manifest.yaml` rather than creating from scratch.

### --platforms (optional)
Comma-separated list of target platforms: `linux,macos,windows,wsl2`.
Default: `linux,macos`.

### --interactive (optional)
Ask clarifying questions before generating.

## Execution Flow

### Phase 1: Discovery

1. Read the project root to understand structure:
   - Check for `package.json`, `requirements.txt`, `Cargo.toml`, `go.mod`, `Makefile`, etc.
   - Check for `README.md`, `INSTALL.md`, `docs/install.md`
   - Check for existing `setup.manifest.yaml`
2. If `--from-readme`, parse installation instructions from readme
3. If `--interactive`, ask:
   - What OSes must be supported?
   - What are the hard prerequisites (git, node, python version)?
   - Is there a config directory that needs to be created?
   - Does the project chain sub-projects?

### Phase 2: Assemble Manifest

Build the manifest YAML following this priority order:

1. **platform block** — from `--platforms` or detected by project type
2. **params block** — standard params: `INSTALL_DIR`, `BRANCH` (default: `main`); add `CONFIG_DIR` if a config step is needed
3. **prerequisites block** — from project type (e.g., `node` for npm projects, `python3` for Python)
4. **steps block** — construct from script templates:
   - Always start with a `clone` or `verify-existing` detect step
   - Add `install-deps-*` steps for each target platform
   - Add `configure` step if config files are needed
   - End with a `verify` step
5. **recovery_procedures block** — always include a `full-reset` fallback

### Phase 3: Script Assembly

For each script step:
1. Copy the relevant template from `agentic/code/addons/agentic-installer/scripts/templates/`
2. Place in `<project>/installer/scripts/`
3. Customize placeholders (package lists, config paths, etc.)
4. Record relative path in the manifest `script:` field

### Phase 4: Output

Write `setup.manifest.yaml` to the project root (or `installer/setup.manifest.yaml` if `installer/` dir exists).

Report:
```
Generated: setup.manifest.yaml
  Platform:      linux, macos
  Params:        INSTALL_DIR, BRANCH
  Prerequisites: git, node (>=18)
  Steps:         clone, install-deps-ubuntu, install-deps-macos, configure, verify
  Recovery:      full-reset
  Scripts:       installer/scripts/ (3 files)

Validate with: aiwg setup-validate
Run with:      aiwg setup-run
```

## Script-First Rule

Every step that can be scripted MUST be a `script` step. Only use `type: agentic` for:
- Steps that require real-time environment inspection that cannot be expressed in bash
- Recovery from unexpected failures where the script approach has been exhausted

## Example Output

```yaml
apiVersion: setup.aiwg.io/v1
kind: SetupManifest
metadata:
  name: myapp
  version: 1.0.0
  description: Install myapp and configure default settings

platform:
  os: [linux, macos]
  distros: [ubuntu, debian, fedora]
  arch: [x86_64, arm64]
  shell: [bash, zsh]

params:
  - name: INSTALL_DIR
    type: path
    required: true
    description: Installation directory
  - name: BRANCH
    type: string
    default: main
    description: Git branch to clone

prerequisites:
  - detect: "command -v git"
    version_min: "2.30"
    install_hint: "Install git: https://git-scm.com"
  - detect: "command -v node"
    version_min: "18.0"
    install_hint: "Install Node.js: https://nodejs.org"

steps:
  - id: clone
    type: script
    script: installer/scripts/clone.sh
    verify: "test -d ${INSTALL_DIR}/.git"

  - id: install-deps
    type: platform-route
    routes:
      ubuntu: installer/scripts/install-deps-ubuntu.sh
      debian: installer/scripts/install-deps-ubuntu.sh
      fedora: installer/scripts/install-deps-fedora.sh
      macos:  installer/scripts/install-deps-macos.sh
    depends_on: [clone]

  - id: configure
    type: script
    script: installer/scripts/configure.sh
    depends_on: [install-deps]
    when: "test ! -f ${CONFIG_DIR}/config.conf"

  - id: verify
    type: script
    script: installer/scripts/verify.sh
    depends_on: [configure]

recovery_procedures:
  - id: full-reset
    description: Remove and re-clone the installation
    triggers: [clone, configure]
    script: installer/scripts/reset.sh
```

## References

- Schema: `agentic/code/addons/agentic-installer/schemas/v1/setup-manifest.schema.json`
- Templates: `agentic/code/addons/agentic-installer/scripts/templates/`
- Run skill: `agentic/code/addons/agentic-installer/skills/setup-run/SKILL.md`
- Validate skill: `agentic/code/addons/agentic-installer/skills/setup-validate/SKILL.md`
