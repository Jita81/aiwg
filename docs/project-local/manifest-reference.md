---
title: Project Manifest Reference
description: Complete reference for .aiwg/.project/manifest.json
---

# Project Manifest Reference

The `manifest.json` file at `.aiwg/.project/manifest.json` describes your project-local customization container — who owns it, what namespace to use, and which asset directories to deploy.

---

## Full Example

```json
{
  "$schema": "https://aiwg.io/schemas/project-manifest.v1.json",
  "name": "my-project",
  "description": "Domain-specific agents and skills for my-project",
  "version": "1.0.0",
  "namespace": "myns",
  "assets": {
    "agents": ["agents/"],
    "skills": ["skills/"]
  },
  "scripts": {
    "setup": "scripts/setup.sh",
    "import": "scripts/import-data.py"
  }
}
```

---

## Fields

### `$schema`

Optional. Points to the JSON Schema for editor validation and autocomplete.

```json
"$schema": "https://aiwg.io/schemas/project-manifest.v1.json"
```

---

### `name`

**Required.** Slug identifying this project container. Used in the `aiwg.config` installed registry.

- Lowercase, hyphenated
- Unique within the project (you only have one `.project/`, but the name helps distinguish projects if configs are shared)

```json
"name": "research-papers"
```

---

### `description`

Optional. Human-readable description shown in `aiwg status` and registry output.

```json
"description": "Citation analysis, paper induction, and synthesis workflows"
```

---

### `version`

Optional. Semantic version for this project container. Used to track when the container was last updated.

```json
"version": "1.0.0"
```

---

### `namespace`

**Required.** The subdirectory name used when deploying assets to platform directories.

| Value | Agents deploy to | Skills deploy to |
|-------|-----------------|-----------------|
| `"corpus"` | `.claude/agents/corpus/` | `.claude/skills/corpus/` |
| `"myns"` | `.claude/agents/myns/` | `.claude/skills/myns/` |

**Choosing a namespace:**
- Use a short, descriptive slug related to your project domain
- Avoid `aiwg` (reserved for AIWG framework assets)
- Avoid built-in platform names
- All team members share the same namespace — keep it stable once set

```json
"namespace": "corpus"
```

---

### `assets`

**Required.** Declares which directories contain agents and skills to deploy.

```json
"assets": {
  "agents": ["agents/"],
  "skills": ["skills/"]
}
```

**Fields:**
- `agents` — Array of directory paths (relative to `.aiwg/.project/`) containing `*.md` agent definition files. Each `.md` file is deployed as an agent.
- `skills` — Array of directory paths containing skill subdirectories. Each subdirectory with a `SKILL.md` is deployed as a skill.

Multiple source directories are supported:

```json
"assets": {
  "agents": ["agents/", "agents-experimental/"],
  "skills": ["skills/", "skills-beta/"]
}
```

---

### `scripts`

Optional. Named scripts that can be invoked via `aiwg run <name>` (planned) or called from agents/skills.

```json
"scripts": {
  "import": "scripts/import-to-fortemi.sh",
  "import-api": "scripts/import-via-api.py",
  "validate": "scripts/validate-corpus.sh"
}
```

Scripts are not deployed to platform directories — they live in `.aiwg/.project/` and are intended to be run locally via the AIWG CLI or referenced from skills.

---

## Agent File Format

Each `.md` file in an `agents/` directory follows the standard AIWG agent frontmatter format:

```markdown
---
name: My Agent
description: What this agent does
model: sonnet
tools: Read, Write, Bash, Glob, Grep
namespace: myns
---

# My Agent

Agent system prompt here...
```

The `namespace` frontmatter field is optional when all agents from this container share the same namespace — the manifest's `namespace` field is used as the default.

---

## Skill Directory Format

Each skill is a subdirectory under a `skills/` path declared in `assets.skills`:

```
skills/
├── paper-intake/
│   └── SKILL.md
└── corpus-search/
│   └── SKILL.md
```

Each `SKILL.md` follows the standard SKILL format with frontmatter:

```markdown
---
platforms: [claude-code]
description: What this skill does
namespace: myns
commandHint:
  argumentHint: [argument description]
  allowedTools: Read, Write, Bash
  model: sonnet
  category: domain-management
---

# Skill Name

Skill instructions here...
```

The `namespace` frontmatter field in a SKILL.md is optional — the manifest's `namespace` is the default.

---

## `aiwg.config` Registry Entry

After `aiwg use` deploys the project container, it records the entry in `.aiwg/aiwg.config`:

```json
{
  "installed": {
    "my-project": {
      "version": "1.0.0",
      "source": "project-local",
      "path": ".aiwg/.project/manifest.json",
      "installedAt": "2026-04-06T00:00:00.000Z",
      "deployedTo": {
        "claude": {
          "agents": 1,
          "skills": 2
        }
      }
    }
  }
}
```

Zero-arg `aiwg use` (redeploy all) picks up `project-local` entries and redeploys them alongside bundled/npm entries.

---

## See Also

- [Overview](overview.md) — Why `.aiwg/.project/` exists
- [Walkthrough](walkthrough.md) — End-to-end setup guide
- [Extension Types Reference](../extensions/extension-types.md) — Agent and skill format details
