# Hermes Agent Quick Start

Integrate AIWG with [Hermes Agent](https://github.com/NousResearch/hermes-agent) as an MCP sidecar.

> **This is not a traditional provider deployment.** Unlike other AIWG integrations where `aiwg use sdlc --provider X` deploys artifacts into the provider's directory structure, Hermes has its own memory management model. AIWG runs as an external MCP server that Hermes calls — the architecture is `Hermes → MCP → AIWG`.

---

## Architecture

```
Hermes Agent (host)
  ├── Conversation, memory, sessions
  ├── Built-in tools (40+)
  ├── Skills (~/.hermes/skills/)
  └── MCP connection
        └── AIWG MCP Server (sidecar)
              └── .aiwg/ artifacts, workflows, templates
```

**Hermes owns**: conversation flow, persistent memory (MEMORY.md, USER.md), session history (state.db), user model, skills.

**AIWG owns**: workflow execution, artifact output in `.aiwg/`, template rendering, agent definitions.

**MCP is the seam.** Coexistence with clear boundaries — not system unification.

---

## Prerequisites

- Hermes Agent installed ([installation guide](https://hermes-agent.nousresearch.com/docs))
- AIWG installed (`npm install -g aiwg`)
- A local model running via Ollama (e.g., `qwen2.5-coder:14b`)
- A project directory with source code

---

## Part 1: Verify Both CLIs Independently

Before connecting, confirm both work on their own.

**Verify Hermes:**

```bash
hermes --version
# Start a test conversation to confirm model connection
hermes chat "Hello, what model are you?"
```

**Verify AIWG:**

```bash
aiwg version
aiwg mcp info    # Confirm MCP server is available
```

---

## Part 2: Connect AIWG to Hermes via MCP

Add the AIWG MCP server to Hermes configuration.

**Edit `~/.hermes/config.yaml`:**

```yaml
mcp_servers:
  aiwg:
    command: "aiwg"
    args: ["mcp", "serve"]
    tools:
      include:
        - workflow-run
        - artifact-read
        - artifact-write
        - template-render
        - agent-list
      prompts: false
      resources: false
```

**Why this whitelist:** MCP tool schemas accumulate in the context window. Each connected server adds schema overhead before any tool is called. A 5-tool whitelist keeps AIWG's footprint to ~3,000 tokens (vs. ~12,000+ with full surface). On a 12GB VRAM model with 32K context, this is the difference between 81% and 54% of context available for conversation.

**Reload and verify:**

```bash
# Restart Hermes or reload MCP servers
hermes chat "What AIWG tools are available?"
```

Hermes should list the 5 whitelisted tools.

---

## Part 3: Add Routing Guidance (AGENTS.md)

Create an `AGENTS.md` at your project root that tells Hermes when to call AIWG.

> **Critical context:** Hermes loads `AGENTS.md` in full on every turn. Every character costs tokens on every message. Keep this file under 1,000 characters.

**Create `AGENTS.md` in your project root:**

```markdown
# AIWG Integration

AIWG connected via MCP (`aiwg mcp serve`). Tools: workflow-run, artifact-read,
artifact-write, template-render, agent-list.

## Route to AIWG When

- Structured artifacts needed (requirements, architecture, test plans, risk registers)
- Multi-step workflows with phase gates or checkpoints
- Template-driven output that persists across sessions

Handle in Hermes directly: one-off questions, short tasks, conversation.

## Memory Boundary

When AIWG returns an artifact: store path + one-sentence summary in MEMORY.md.
Do NOT copy artifact body text into memory. Reference, don't replicate.

Use `delegate_task(skip_context_files=True, skip_memory=True)` for AIWG workflows.

## Artifact Store (.aiwg/)

Fetch on demand via `artifact-read`:
- `requirements/` — use cases, user stories
- `architecture/` — SAD, ADRs
- `planning/` — phase plans
- `testing/` — test strategy
- `security/` — threat models
```

A template is available at `agentic/code/frameworks/sdlc-complete/templates/hermes/AGENTS.md.aiwg-template`.

---

## Part 4: Run Your First Workflow

Ask Hermes to create a structured artifact that routes through AIWG.

**Example prompt:**

```
Create an architecture decision record for choosing PostgreSQL over MongoDB
for our user service. Save it as a persistent AIWG artifact.
```

**What should happen:**

1. Hermes reads the routing rules in AGENTS.md
2. Hermes calls `workflow-run` or `artifact-write` via MCP
3. AIWG creates the artifact in `.aiwg/architecture/`
4. Hermes receives the result and stores a reference

**Verify:**

```bash
ls .aiwg/architecture/
# Should show the new ADR file
```

---

## Part 5: State Boundaries

Hermes and AIWG each own distinct state. Do not synchronize them.

| Owned by Hermes | Owned by AIWG |
|---|---|
| `~/.hermes/memories/MEMORY.md` | `.aiwg/requirements/` |
| `~/.hermes/memories/USER.md` | `.aiwg/architecture/` |
| `~/.hermes/state.db` (sessions) | `.aiwg/planning/` |
| `~/.hermes/skills/` | `.aiwg/testing/` |
| Conversation context | `.aiwg/security/` |

**The contract:** Exchange references, not synchronized databases. Hermes stores a path and summary; AIWG stores the full artifact.

---

## Part 6: Add the Optional Skill (delegate_task)

After the base flow works, add a convenience skill that uses `delegate_task` to keep AIWG workflows out of the parent context.

**Why:** Direct MCP calls add 3,000-8,000 tokens to the parent context per workflow. `delegate_task` reduces this to ~200 tokens — a 95% reduction.

**Create `~/.hermes/skills/aiwg-orchestrate/SKILL.md`:**

```markdown
---
name: aiwg-orchestrate
description: Route structured artifact work to AIWG workflows via MCP
version: 1.0.0
platforms: [hermes]
metadata:
  tags: [aiwg, sdlc, artifacts, delegation, mcp]
---

## When to Use

Use when the user asks for a requirements document, architecture decision,
test plan, or any structured artifact that persists in .aiwg/.

## Procedure

1. Confirm the task needs a persistent AIWG artifact
2. Use delegate_task to isolate the AIWG interaction:
   delegate_task(
       task="Run AIWG workflow for [description]",
       skip_context_files=True,
       skip_memory=True
   )
3. Store artifact path + one-sentence summary in MEMORY.md
4. Report result to user

## Memory Rule

Store: [date] Created [type] at [path]: [summary]
Never store artifact body content in memory.

## Verification

Confirm artifact exists under .aiwg/ and summary is accurate.
```

A template is available at `agentic/code/frameworks/sdlc-complete/templates/hermes/skills/aiwg-orchestrate/SKILL.md`.

---

## Part 7: Context Budget Reference

Understanding the token budget helps configure Hermes for local hardware.

### With lean AGENTS.md + 5-tool whitelist (recommended)

| Component | Tokens |
|---|---|
| Hermes system prompt | ~1,500 |
| AGENTS.md (<1,000 chars) | ~250 |
| MEMORY.md | ~800 |
| USER.md | ~500 |
| AIWG MCP schema (5 tools) | ~3,000 |
| **Total overhead** | **~6,050** |
| **Available for conversation** (32K context) | **~26,700 (81%)** |

### Without lean approach (full surface)

| Component | Tokens |
|---|---|
| Hermes system prompt | ~1,500 |
| AGENTS.md (~5,000 chars) | ~1,500 |
| MEMORY.md | ~800 |
| USER.md | ~500 |
| AIWG MCP schema (20+ tools) | ~12,000 |
| **Total overhead** | **~16,300** |
| **Available for conversation** (32K context) | **~16,468 (50%)** |

The compression threshold fires at 50% of context by default. With the lean approach, you get ~16,384 tokens of conversation before compression. With the full approach, compression fires at ~9,200 tokens — very early.

### Recommended compression config for 12GB VRAM

```yaml
compression:
  enabled: true
  threshold: 0.30
  summary_model: "ollama/qwen3.5:9b"
  summary_provider: "custom"
  summary_base_url: "http://localhost:11434/v1"
```

---

## Part 8: Advanced — Prompt Exposure

After the basic integration is stable, you can enable AIWG prompt exposure for richer workflow access.

**Update `~/.hermes/config.yaml`:**

```yaml
mcp_servers:
  aiwg:
    command: "aiwg"
    args: ["mcp", "serve"]
    tools:
      include:
        - workflow-run
        - artifact-read
        - artifact-write
        - template-render
        - agent-list
      prompts: true          # Enable after baseline is stable
      resources: false
```

This adds AIWG workflow prompts as callable templates. Only enable after Part 4 is working reliably.

---

## Part 9: Validation Checklist

Run these checks to confirm the integration is working:

| Check | Command / Action | Expected |
|---|---|---|
| Connectivity | Ask Hermes "list AIWG tools" | 5 tools listed |
| Routing | Ask a one-off question | Hermes answers directly (no AIWG call) |
| Routing | Ask for a requirements document | Routes to AIWG via MCP |
| Artifact write | Check `.aiwg/` after workflow | New artifact file exists |
| Artifact read | Ask Hermes to read the artifact | Uses `artifact-read`, not memory |
| Memory boundary | Check `~/.hermes/memories/MEMORY.md` | Contains path + summary, not body |
| Failure mode | Stop `aiwg mcp serve`, ask for artifact | Hermes handles gracefully |

---

## What This Integration Is NOT

- **Not `aiwg use sdlc --provider hermes`** — there is no `hermes.mjs` provider
- **Not mirroring `.aiwg/` into Hermes memory** — exchange references only
- **Not a TypeScript-to-Python bridge** — MCP is the seam
- **Not a replacement for Hermes's built-in tools** — AIWG adds structured workflows on top

---

## Troubleshooting

**AIWG tools not visible in Hermes:**
- Verify `aiwg mcp serve` runs successfully on its own
- Check `~/.hermes/config.yaml` syntax (YAML is whitespace-sensitive)
- Ensure `aiwg` is in your PATH

**Context filling up too fast:**
- Check AGENTS.md character count (`wc -c AGENTS.md`) — keep under 1,000
- Verify `prompts: false` and `resources: false` in MCP config
- Use `delegate_task` for AIWG workflows to isolate context cost
- Lower compression threshold to 0.30

**Artifacts not appearing in `.aiwg/`:**
- Ensure AIWG is initialized in the project (`aiwg use sdlc`)
- Check that `artifact-write` is in the tool whitelist
- Verify the working directory matches the project root

---

## Related Resources

- [Hermes Agent documentation](https://hermes-agent.nousresearch.com/docs)
- [AIWG MCP server reference](../cli-reference.md#mcp)
- [Local models guide](../models/local-models.md)
- [agentskills.io skill standard](https://agentskills.io)
- Integration plan: `.aiwg/planning/hermes-aiwg-integration-plan.md`
- Context research: `.aiwg/planning/hermes-context-research.md`
