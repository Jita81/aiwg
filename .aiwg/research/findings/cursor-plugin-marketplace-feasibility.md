# Cursor Plugin Marketplace Feasibility Assessment

**Issue:** #583
**Date:** 2026-03-27
**Decision:** Pursue marketplace distribution — prototype created

---

## Background

Cursor launched a Plugin Marketplace in March 2026 with 30+ partner plugins (Atlassian, Datadog, GitLab, etc.). Plugins bundle MCP servers, rules, skills, agents, and commands via a `.cursor-plugin/plugin.json` manifest. This creates a potential native distribution channel for AIWG.

---

## Plugin Manifest Format

Based on Cursor's plugin architecture, `.cursor-plugin/plugin.json` follows this structure:

```json
{
  "name": "aiwg-sdlc",
  "displayName": "AIWG SDLC Framework",
  "version": "YYYY.M.PATCH",
  "description": "...",
  "publisher": "aiwg",
  "engines": { "cursor": ">=2.4.0" },
  "contributes": {
    "agents": ".cursor/agents/",
    "skills": ".cursor/skills/",
    "rules": ".cursor/rules/",
    "commands": ".cursor/commands/",
    "mcp": { "server": "aiwg", "command": "aiwg", "args": ["mcp", "serve"] }
  },
  "install": { "command": "aiwg use sdlc --provider cursor" }
}
```

A prototype manifest is available at:
`agentic/code/frameworks/sdlc-complete/templates/cursor/cursor-plugin.json.aiwg-template`

---

## Feasibility Assessment

### In Favor

| Factor | Assessment |
|--------|-----------|
| Artifact volume | AIWG's 58 agents, 42+ commands, 100+ rules fit the plugin model — artifacts already deploy to `.cursor/` directories natively |
| MCP server | AIWG already has a working MCP server (`aiwg mcp serve`), which is a first-class plugin feature |
| Skills native | Cursor 2.4 supports native skills in `.cursor/skills/` — AIWG already deploys there |
| Rules native | Cursor's MDC rules in `.cursor/rules/*.mdc` are already supported by AIWG's deploy pipeline |
| Install hook | AIWG's `aiwg use sdlc --provider cursor` is a single-command install — maps cleanly to a plugin install hook |
| Existing packaging | `tools/plugin/package-plugins.mjs` provides infrastructure that can be extended |

### Concerns

| Factor | Assessment |
|--------|-----------|
| Volume limits | Marketplace plugins may have artifact count limits — 58 agents may require splitting into focused plugins (sdlc, marketing, voice) |
| Submission process | Cursor's marketplace has a review/approval process; timeline unknown |
| Monolithic vs modular | A single `aiwg` plugin vs multiple focused plugins (sdlc@aiwg, marketing@aiwg, voice@aiwg) — modular is safer for limits |
| Manifest format | Cursor hasn't published a public plugin manifest schema; prototype is based on observable patterns |

---

## Decision: Pursue Marketplace Distribution

**Recommendation:** Yes, pursue. The artifact format is already compatible. Short-term path:

1. **Prototype** — Create `.cursor-plugin/plugin.json` for the sdlc plugin (done — see template)
2. **Modular strategy** — Publish 3 focused plugins: `aiwg-sdlc`, `aiwg-marketing`, `aiwg-voice`
3. **Submit** — Apply to Cursor marketplace partner program
4. **Fallback** — Users can always install via `aiwg use sdlc --provider cursor` (CLI path unchanged)

---

## Prototype Plugin Package

The prototype manifest is at:
```
agentic/code/frameworks/sdlc-complete/templates/cursor/cursor-plugin.json.aiwg-template
```

To create a full plugin package:
1. Copy to `.cursor-plugin/plugin.json` at project root
2. Ensure `.cursor/` directory is populated (run `aiwg use sdlc --provider cursor`)
3. Bundle per Cursor's packaging requirements

---

## Next Steps

- [ ] Obtain official Cursor plugin manifest schema (contact Cursor marketplace team)
- [ ] Test plugin load in local Cursor installation
- [ ] Extend `package-plugins.mjs` to generate `.cursor-plugin/plugin.json` alongside `.claude-plugin/`
- [ ] Apply to Cursor marketplace partner program
- [ ] Validate artifact count limits with Cursor team
