---
title: Project-Local Customization
description: How to use .aiwg/.project/ to carry project-specific agents, skills, and scripts across platforms.
---

# Project-Local Customization (`.aiwg/.project/`)

> **Status**: Planned — tracked in [#750](https://git.integrolabs.net/roctinam/aiwg/issues/750). The directory structure and reference implementation are available now; `aiwg use` integration ships in a future release.

The `.aiwg/.project/` container lets you ship project-specific agents, skills, and scripts alongside your code — so they deploy automatically when anyone runs `aiwg use`.

---

## The Problem It Solves

Standard AIWG installations deploy agents and skills from the framework source (`agentic/code/`). Project-specific customizations — a corpus curator agent, domain-specific skills, integration scripts — have nowhere to live that survives a clean reinstall.

The consequence: teams add project-specific tooling to `.claude/` directly, which gets lost every time someone runs `aiwg use` to refresh a broken workspace.

`.aiwg/.project/` fixes this by giving project-local assets a **source location that `aiwg use` reads**, making the platform directories fully expendable.

---

## How It Works

```
.aiwg/.project/
├── manifest.json        ← project identity, namespace, asset declarations
├── agents/              ← .md agent definitions
└── skills/              ← SKILL.md subdirs
    ├── my-skill/
    │   └── SKILL.md
    └── another-skill/
        └── SKILL.md
```

When `aiwg use` runs (with or without a framework argument), it:

1. Deploys bundled/npm frameworks and addons as usual
2. Detects `.aiwg/.project/manifest.json`
3. Deploys project assets into a namespace-isolated subdirectory on every target platform

Destroying `.claude/` (or `.codex/`, `.cursor/`, etc.) and running `aiwg use` fully restores both AIWG assets and your project-local assets.

---

## The Namespace

The `namespace` field in `manifest.json` controls where project assets land inside the platform directory:

```json
{ "namespace": "corpus" }
```

With this namespace:

| Asset type | Deployed to |
|-----------|-------------|
| Agent `agents/corpus-curator.md` | `.claude/agents/corpus/corpus-curator.md` |
| Skill `skills/paper-intake/SKILL.md` | `.claude/skills/corpus/paper-intake/SKILL.md` |

AIWG's own assets land under `aiwg/` (per the [Skill Namespace ADR](../extensions/extension-types.md#skill-namespace-strategy)). Project namespaces sit beside them without collision.

---

## Benefits

| Property | What it means |
|----------|--------------|
| **Platform dirs are expendable** | `rm -rf .claude/ && aiwg use` restores everything |
| **Namespace isolation** | Project skills live at `skills/{ns}/`, no collisions with AIWG's `skills/aiwg/` |
| **Version-controlled source** | `.aiwg/.project/` commits with the repo; platform dirs can stay gitignored |
| **Zero config for team members** | `aiwg use` auto-detects the container — no extra flags |
| **Platform-portable** | Works for every supported platform: Claude Code, Cursor, Copilot, Codex, etc. |

---

## Relationship to Other Patterns

`.aiwg/.project/` follows the same design pattern as other AIWG module declarations:

| Pattern | What the module declares | AIWG materializes at... |
|---------|--------------------------|------------------------|
| `memory.creates` in addons | Memory graph schemas | install time |
| `index.graphs` in manifest (#726) | Artifact index graph configs | `aiwg index build` |
| `.aiwg/.project/` | Project-local agents, skills, scripts | `aiwg use` |

---

## See Also

- [Walkthrough: Setting Up Project-Local Customization](walkthrough.md)
- [Manifest Reference](manifest-reference.md)
- [File Placement Guide](../development/file-placement-guide.md) — Where all assets belong
- [Graph Backends](../extensions/graph-backends.md) — Companion feature for project-local graph config
- Issue [#750](https://git.integrolabs.net/roctinam/aiwg/issues/750) — Implementation tracking
