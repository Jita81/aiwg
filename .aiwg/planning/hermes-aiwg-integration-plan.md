# Hermes Agent + AIWG Integration Plan

**Type**: Tutorial-focused integration design
**Status**: Planning
**Architecture**: MCP sidecar (not provider embedding)

---

## Core Thesis

**Teach Hermes calling AIWG over MCP. Do not teach AIWG embedded inside Hermes core.**

---

## Executive Summary

| Decision area | Recommended approach | Avoid |
|---|---|---|
| Host model | Hermes remains the host agent and conversation owner | Deep bridge into Hermes runtime files |
| Workflow engine | AIWG runs as an external MCP sidecar with artifact-backed workflows | TypeScript-to-Python adapter layer |
| State ownership | Hermes owns memory and sessions. AIWG owns `.aiwg` artifacts | Session DB to `.aiwg` synchronization |
| Rollout path | Config-first pilot, then routing rules, then optional packaging | Version negotiator as a first milestone |

---

## Architecture

```
Hermes → MCP → AIWG
```

- **Hermes** owns: conversation flow, tool orchestration, session persistence, memory, skills, user-facing chat
- **AIWG** owns: workflow execution, template-driven outputs, artifact generation, framework-scoped project state in `.aiwg/`
- **MCP** is the seam. Coexistence with clear boundaries, not system unification.

---

## What the Tutorial Should NOT Teach

- Do not mirror `.aiwg` contents into Hermes memory
- Do not patch Hermes core as the first integration step
- Do not build a version-negotiation layer or dual-mode compatibility scaffold
- Do not translate AIWG agents into Hermes-native Python objects on day one

---

## Tutorial Outcome

By the end, the reader has:
1. Hermes running with AIWG connected as an MCP server
2. A minimal AIWG tool surface exposed inside Hermes
3. Routing guidance in AGENTS.md for when to call AIWG
4. A working demo that creates and reads AIWG artifacts from a project workspace

---

## Implementation Plan

### Part 1: Explain the integration model
Open with the mental model before any setup.
- Show the integration diagram: `Hermes → MCP → AIWG`
- Explain Hermes remains the host agent
- Explain AIWG contributes structured workflows and artifacts

### Part 2: Prepare the environment
Use a clean demo repository. Verify both CLIs independently before connecting.
- Install Hermes in a supported environment
- Install AIWG and confirm CLI
- Create a small demo project with `AGENTS.md` and a source folder

### Part 3: Connect AIWG to Hermes through MCP
Add minimal MCP configuration with tightly restricted tool list.
- Add `aiwg mcp serve` under `mcp_servers`
- Whitelist: `workflow-run`, `artifact-read`, `artifact-write`, `template-render`, `agent-list`
- Reload MCP and confirm Hermes can see the server

### Part 4: Add routing guidance without touching core code
Use `AGENTS.md` to define when Hermes should route to AIWG.
- Route to AIWG: artifact-backed planning, staged execution, templated documents, recovery-oriented work
- Keep in Hermes: short one-off tasks, ordinary conversation
- Store references to AIWG outputs — do not copy artifact bodies into memory

### Part 5: Run the first real workflow
Demonstrate one task that benefits from persistent artifacts (architecture note, implementation plan, risk register).
- Use a prompt that asks for a structured artifact and a saved result
- Show the new `.aiwg/` folder appearing
- Read the artifact back through the AIWG tool surface

### Part 6: Explain state boundaries
Contrast Hermes session/memory ownership with AIWG artifact ownership.
- Hermes owns sessions and persistent memory
- AIWG owns artifact-backed workflow state in `.aiwg/`
- Exchange references, not synchronized databases

### Part 7: Add an optional Hermes skill
After the base flow works, add a skill as a convenience wrapper.
- Create a skill that decides whether AIWG is needed
- Return plain-language answer + artifact location
- Keep clearly optional — not a substitute for the MCP integration

### Part 8: Advanced prompt and resource exposure
Follow-up chapter only after basic tool path is stable.
- Turn on prompt exposure only after minimal setup is working
- Demonstrate a recovery-oriented or staged planning flow
- Do not broaden tool surface until reader has a stable baseline

### Part 9: Optional programmatic embedding
For advanced readers, show Hermes used programmatically while still connecting to AIWG through MCP.
- Instantiate Hermes through its programmatic interface
- Reuse the same MCP configuration
- AIWG remains external even in embedded mode

### Part 10: Validation and troubleshooting
Objective checks so the tutorial feels production-aware and testable.
- Connectivity check after reload
- Routing check: one Hermes-native task, one AIWG-routed task
- Artifact check: `.aiwg` writes and reads succeed
- Failure check: disable AIWG server, observe effect

---

## Tutorial Assets

| Asset | Purpose |
|---|---|
| `README.md` | Main written tutorial |
| `AGENTS.md` | Routing rules that steer Hermes toward AIWG only when needed |
| `hermes-config-minimal.yaml` | First-run MCP configuration |
| `hermes-config-prompts.yaml` | Optional advanced config that exposes prompts later |
| `skills/aiwg-orchestrate/SKILL.md` | Optional convenience wrapper for repeated structured tasks |
| `demo-prompts.md` | Copy-paste prompts for recording or testing |

---

## Minimal MCP Configuration (tutorial)

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

---

## Recording Flow

1. Introduce the architecture and explain the boundary (~2 minutes)
2. Verify Hermes and AIWG separately before connecting
3. Add the MCP config, reload, prove AIWG tools are visible
4. Add AGENTS.md routing rules
5. Run one structured task that creates a real artifact
6. Open `.aiwg/` and read the artifact back
7. Close with validation checklist and why this beats bridge-first integration

---

## Final Guidance

Keep the tutorial disciplined. The main path stays config-first, artifact-aware, and boundary-safe. Only introduce optional skills, prompt exposure, or programmatic embedding after the reader has a stable working integration.
