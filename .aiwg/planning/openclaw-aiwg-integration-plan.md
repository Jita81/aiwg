# OpenClaw + AIWG Integration Plan

**Type**: Full platform integration — skills, agents, commands, rules, MCP
**Status**: Planning
**Architecture**: MCP sidecar (primary) + native skill deployment (secondary)
**Reference**: @.aiwg/planning/hermes-aiwg-integration-plan.md — Hermes follows the same model

---

## Core Thesis

**Make AIWG available in OpenClaw the same way it works with Hermes — through the MCP sidecar pattern, extended with native skill deployment for skills-only workflows.**

The Hermes precedent: `Hermes → MCP → AIWG`. OpenClaw follows the same seam.

```
OpenClaw → MCP → AIWG
```

- **OpenClaw** owns: conversation flow, tool orchestration, skill loading, session state, user-facing chat
- **AIWG** owns: workflow execution, template-driven outputs, artifact generation, framework-scoped project state in `.aiwg/`
- **MCP** is the seam. Clear ownership boundaries, not system fusion.

---

## What AIWG Makes Available

All five artifact types must be reachable from OpenClaw:

| Artifact Type | AIWG location | OpenClaw target | Delivery mechanism |
|---|---|---|---|
| **Skills** | `.claude/skills/*/SKILL.md` | `~/.openclaw/skills/` or `workspace/skills/` | `aiwg use <framework> --provider openclaw` |
| **Agents** | `.claude/agents/*.md` | `~/.openclaw/agents/` | `aiwg use <framework> --provider openclaw` |
| **Commands** | `.claude/commands/*.md` | `~/.openclaw/commands/` | `aiwg use <framework> --provider openclaw` |
| **Rules** | `.claude/rules/*.md` | `~/.openclaw/rules/` | `aiwg use <framework> --provider openclaw` |
| **Workflows** | `.aiwg/` + MCP tools | MCP sidecar | `aiwg mcp serve` |

---

## Integration Model: Two Modes

### Mode 1 — MCP Sidecar (Full AIWG, same as Hermes)

Connect AIWG to OpenClaw via MCP. OpenClaw gains the full workflow engine, artifact management, and template rendering.

```json
// openclaw.config.json (or equivalent settings)
{
  "mcp_servers": {
    "aiwg": {
      "command": "aiwg mcp serve",
      "tools": [
        "workflow-run",
        "artifact-read",
        "artifact-write",
        "template-render",
        "agent-list",
        "skill-list"
      ]
    }
  }
}
```

OpenClaw routing guidance (in system prompt or AGENTS.md equivalent):

- **Route to AIWG MCP**: artifact-backed planning, staged SDLC execution, templated document generation, recovery-oriented workflows
- **Keep in OpenClaw**: short one-off tasks, ordinary conversation, quick skill invocations

### Mode 2 — Native Skill Deployment

Deploy AIWG skills directly into OpenClaw's skill loader directories. OpenClaw discovers and loads them natively without MCP.

```bash
# Deploy all frameworks to OpenClaw
aiwg use all --provider openclaw

# Deploy specific framework
aiwg use sdlc --provider openclaw

# Verify deployment
openclaw skills list | grep aiwg
```

Skills land in:
- Per-workspace: `workspace/skills/<skill-name>/SKILL.md`
- User-global: `~/.openclaw/skills/<skill-name>/SKILL.md`

---

## Skill Format Compatibility

### Current AIWG SKILL.md Format

```markdown
---
name: doc-scraper
description: Scrape documentation websites into organized reference files.
tools: Read, Write, Bash, WebFetch
platforms: [claude-code, hermes]
---

# Skill content...
```

### Required Extensions for OpenClaw

Add `openclaw` to `platforms` and optionally add `metadata.openclaw.*` gating fields:

```markdown
---
name: doc-scraper
description: Scrape documentation websites into organized reference files.
tools: Read, Write, Bash, WebFetch
platforms: [claude-code, hermes, openclaw]
metadata: {"openclaw": {"requires": {"bins": ["curl"]}, "primaryEnv": "terminal"}}
---
```

### OpenClaw Metadata Gating Fields

| Field | Type | Purpose |
|---|---|---|
| `openclaw.requires.bins` | `string[]` | Binary dependencies (e.g., `["curl", "ffmpeg"]`) |
| `openclaw.requires.env` | `string[]` | Required env vars |
| `openclaw.requires.config` | `string[]` | Required config keys |
| `openclaw.always` | `boolean` | Load unconditionally (no gating) |
| `openclaw.os` | `string[]` | OS filter (`["linux", "macos"]`) |
| `openclaw.primaryEnv` | `string` | Preferred environment (`"terminal"`, `"ide"`, `"browser"`) |
| `openclaw.install` | `object` | Auto-install instructions |

Most AIWG skills require no gating metadata — they run on any platform. Add gating only for skills with hard external dependencies (e.g., `linux-forensics` needs Linux + forensics tools).

### Migration Strategy

1. **Phase 1** — Add `openclaw` to `platforms` list in all SKILL.md frontmatter. No other changes needed for basic compatibility. ~100 skills.
2. **Phase 2** — Add `metadata.openclaw.*` gating for ~15 skills with real external dependencies (linux-forensics, container-forensics, memory-forensics, etc.).
3. **Phase 3** — Publish to ClawHub for public discovery.

---

## Provider Implementation

### Add `openclaw` Provider to Deployment System

Following the same pattern as `hermes`, `cursor`, `opencode`, etc.:

```
agentic/code/frameworks/<framework>/
├── skills/        → ~/.openclaw/skills/
├── agents/        → ~/.openclaw/agents/
├── commands/      → ~/.openclaw/commands/
└── rules/         → ~/.openclaw/rules/
```

OpenClaw skill discovery precedence (from OpenClaw docs):
1. `workspace/skills/` — project-local
2. `~/.openclaw/skills/` — user-global (AIWG deploys here)
3. Bundled skills
4. `extraDirs` config

`aiwg use sdlc --provider openclaw` should:
1. Copy skill dirs to `~/.openclaw/skills/<skill-name>/`
2. Copy agent defs to `~/.openclaw/agents/`
3. Copy command defs to `~/.openclaw/commands/`
4. Copy rules to `~/.openclaw/rules/`
5. Register in AIWG framework registry

### CLI Command: `aiwg use <framework> --provider openclaw`

Already supported by the multi-platform deployment system. Requires:
- Adding `openclaw` case to the provider switch in deployment code
- Defining target directory mappings (above)
- Testing with a live OpenClaw installation

---

## ClawHub Distribution

ClawHub (https://clawhub.ai) is the public skill registry for OpenClaw. Publishing AIWG skills there makes them discoverable without a full AIWG installation.

### Publishing Strategy

**Option A — Monorepo bundle**: Publish AIWG as a single ClawHub package containing all skills.

```bash
# In aiwg repo
clawhub publish --name aiwg --version 2026.3.x
```

**Option B — Per-framework packages**: Publish each framework separately.

```bash
clawhub publish agentic/code/frameworks/sdlc-complete --name aiwg-sdlc
clawhub publish agentic/code/frameworks/forensics-complete --name aiwg-forensics
```

**Recommendation**: Start with Option B. Users who only need SDLC shouldn't pull in forensics skills. Mirrors how `aiwg use sdlc` vs `aiwg use all` works today.

### ClawHub Package Manifest

Each package needs `clawhub.json` at package root:

```json
{
  "name": "aiwg-sdlc",
  "version": "2026.3.0",
  "description": "AIWG SDLC framework skills for OpenClaw — 90+ specialized agents, SDLC workflows, and artifact management",
  "homepage": "https://aiwg.io",
  "repository": "https://github.com/jmagly/aiwg",
  "skills": "./skills",
  "tags": ["sdlc", "agile", "testing", "security", "documentation"],
  "license": "MIT"
}
```

### User Install via ClawHub

```bash
# Install AIWG SDLC skills from ClawHub
clawhub install aiwg-sdlc

# Install all AIWG skills
clawhub install aiwg-sdlc aiwg-forensics aiwg-media aiwg-research

# Update
clawhub update --all
```

---

## Skill Search and Registry Interface

### Provider-Agnostic Skill Search

Add `aiwg skills` subcommand with provider support:

```bash
# Search across all registries
aiwg skills search "security"

# Search by provider
aiwg skills search "documentation" --provider openclaw
aiwg skills search "documentation" --provider clawhub
aiwg skills search "documentation" --provider agentskills

# Show skill details
aiwg skills info doc-scraper

# List installed skills for a provider
aiwg skills list --provider openclaw

# Install skill from registry
aiwg skills install aiwg-sdlc --provider clawhub
```

### Registry Adapters

```
aiwg skills search
    ├── local (agentic/code/ + .claude/skills/)
    ├── clawhub   → https://clawhub.ai/api/search
    ├── agentskills → https://agentskills.io/api/search (if API available)
    └── openclaw  → openclaw skills search (delegates to openclaw CLI)
```

Each adapter implements:
- `search(query) → SkillResult[]`
- `info(name) → SkillDetails`
- `install(name, target_dir)`

### Official Registries

| Registry | URL | CLI | Notes |
|---|---|---|---|
| ClawHub | https://clawhub.ai | `clawhub search/install/publish` | OpenClaw's official registry |
| AgentSkills | https://agentskills.io | TBD | Cross-platform skill index |
| OpenClaw native | `openclaw skills` | `openclaw skills list/install` | Built into OpenClaw CLI |

---

## Routing Guidance (AGENTS.md / system prompt)

Add OpenClaw routing guidance to AIWG deployment output for OpenClaw provider:

```markdown
## AIWG Integration

AIWG is connected as an MCP server and via native skills.

### Route to AIWG MCP when:
- User asks for SDLC phase work (inception, elaboration, construction, etc.)
- Artifact generation is needed (.aiwg/ documents)
- Multi-agent orchestration is requested
- Template-driven output required (architecture docs, test plans, etc.)
- Ralph loops or iterative task execution

### Use AIWG skills natively when:
- Skill trigger phrase matches (e.g., "scrape docs", "run security audit")
- Quick single-step operation with no artifact persistence needed

### Keep in OpenClaw when:
- Short one-off conversation questions
- Code editing without SDLC artifact tracking
- Quick debugging sessions
```

---

## Implementation Phases

### Phase 1 — Skill Compatibility (low effort, high value)
- [ ] Add `openclaw` to `platforms` list in all SKILL.md frontmatter (scripted)
- [ ] Add `openclaw` provider to `aiwg use` deployment system
- [ ] Define OpenClaw directory structure mappings
- [ ] Test: `aiwg use sdlc --provider openclaw` → skills visible in OpenClaw

### Phase 2 — MCP Connection (medium effort, full AIWG power)
- [ ] Document `aiwg mcp serve` OpenClaw config (analogous to Hermes tutorial)
- [ ] Add routing guidance generation to OpenClaw provider output
- [ ] Test: OpenClaw can call `workflow-run`, `artifact-read` via AIWG MCP
- [ ] Write tutorial: "Connecting AIWG to OpenClaw"

### Phase 3 — ClawHub Distribution (enables discovery without AIWG install)
- [ ] Write `clawhub.json` manifests for each framework
- [ ] Add `aiwg skills publish --provider clawhub` command
- [ ] Publish initial packages (aiwg-sdlc, aiwg-forensics, aiwg-media, aiwg-research)
- [ ] Add ClawHub search to `aiwg skills search --provider clawhub`

### Phase 4 — Provider-Agnostic Skill Registry (multi-registry search)
- [ ] Design `RegistryAdapter` interface
- [ ] Implement ClawHub adapter
- [ ] Implement AgentSkills adapter (if API available)
- [ ] Implement openclaw-native adapter (delegates to `openclaw skills` CLI)
- [ ] Ship `aiwg skills search/info/install/list` commands

---

## What NOT To Do

- Do not mirror `.aiwg/` contents into OpenClaw's session state
- Do not patch OpenClaw internals as the first step
- Do not build a version-negotiation layer before any skill works
- Do not require OpenClaw to understand AIWG's internal framework registry

---

## References

- @.aiwg/planning/hermes-aiwg-integration-plan.md — Hermes integration (same model)
- OpenClaw Skills docs: https://docs.openclaw.ai/tools/skills
- OpenClaw Skills config: https://docs.openclaw.ai/tools/skills-config
- ClawHub: https://clawhub.ai
- ClawHub docs: https://docs.openclaw.ai/tools/clawhub
- AgentSkills: https://agentskills.io
- @docs/cli-reference.md — AIWG CLI commands
- @src/extensions/commands/definitions.ts — Command definitions
