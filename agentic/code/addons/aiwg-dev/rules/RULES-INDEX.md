# AIWG Developer Tools Rules Index

Contributor-focused rules for building AIWG addons, frameworks, skills, agents, and commands correctly. Install explicitly with `aiwg use aiwg-dev` — not included in `aiwg use all`.

---

## AIWG Developer Tools Rules (4 rules — active with aiwg-dev addon)

### HIGH

#### skill-placement
**Summary**: New skills, agents, commands, rules, and templates MUST go into `agentic/code/addons/<name>/` or `agentic/code/frameworks/<name>/`. Files placed directly in `.claude/`, `.github/`, `.cursor/`, `.warp/`, `.codex/`, `.windsurf/`, `.opencode/`, or `~/.openclaw/` are deployment targets — they are overwritten by `aiwg sync` and are invisible to the installer. A file only ships to users if it lives in `agentic/code/`.
**When to apply**: Creating any new AIWG artifact (skill, agent, command, rule, template), editing a deployed file, onboarding as a new AIWG contributor
**Full rule**: @agentic/code/addons/aiwg-dev/rules/skill-placement.md

#### no-circular-skill-calls
**Summary**: A command marked `executedViaSkillRunner: true` removes its TypeScript handler from the CLI routing table. If the SKILL.md then invokes `aiwg <same-command>`, the CLI has no handler to receive the call — creating an infinite loop. SKILL.md for skill-executed commands MUST perform all work via provider tools (Read, Write, Bash, Task) or direct script invocation. Never call back into the CLI command by name. `sdlc-accelerate` is the reference implementation.
**When to apply**: Setting `executedViaSkillRunner: true` on a command, writing SKILL.md for a CLI command, auditing existing skill-executed commands
**Full rule**: @agentic/code/addons/aiwg-dev/rules/no-circular-skill-calls.md

### MEDIUM

#### component-completeness
**Summary**: Each artifact type has required files before it is considered complete. Skill: SKILL.md with `description:` frontmatter, title, behavior section, and manifest registration. Agent: `.md` with `name`, `description`, `model`, `tools` frontmatter and manifest registration. Command: definition in `definitions.ts` plus handler or `executedViaSkillRunner: true`. Addon: `manifest.json` with required fields and a `README.md`. Rule: `.md` file with priority level and entry in `RULES-INDEX.md`. Incomplete components cause silent deployment failures.
**When to apply**: Before marking any artifact as done, before filing a PR, after scaffolding a new component, during code review of new extensions
**Full rule**: @agentic/code/addons/aiwg-dev/rules/component-completeness.md

#### addon-boundaries
**Summary**: `agentic/code/` is framework source that ships to users via `aiwg use`. `.aiwg/` is project-local output for the AIWG project's own development — it does NOT ship. Never put framework artifacts in `.aiwg/` (they become invisible to the installer) and never reference `@.aiwg/` paths from deployable artifacts (those paths only resolve inside this repository). The decision guide: "Is this for AIWG users? → agentic/code/. Is this a project artifact? → .aiwg/."
**When to apply**: Adding schemas, templates, or process documents, writing agent/skill definitions that reference local files, any time you are unsure whether content is framework source or project output
**Full rule**: @agentic/code/addons/aiwg-dev/rules/addon-boundaries.md

---

## Quick Reference by Context

| Task Type | Relevant Rules |
|-----------|---------------|
| **Creating a new skill or agent** | skill-placement, component-completeness |
| **Creating a new CLI command** | component-completeness, no-circular-skill-calls |
| **Setting `executedViaSkillRunner: true`** | no-circular-skill-calls |
| **Creating or extending an addon** | skill-placement, component-completeness, addon-boundaries |
| **Adding schemas or templates** | addon-boundaries |
| **Writing agent definitions** | addon-boundaries, skill-placement |
| **Onboarding as a contributor** | skill-placement, addon-boundaries |
| **Pre-PR checklist** | component-completeness, skill-placement |

---

*Generated from aiwg-dev manifest.json — 4 rules*
*Full rule files: @agentic/code/addons/aiwg-dev/rules/*
