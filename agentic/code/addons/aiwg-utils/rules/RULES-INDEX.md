# AIWG Utilities Rules Index

Core meta-utility rules for agent coordination, context management, and platform interaction. Deployed automatically with all AIWG installations (`core: true, autoInstall: true`).

---

## AIWG Utilities Rules (8 rules — active with aiwg-utils addon)

### HIGH

#### subagent-scoping
**Summary**: Each subagent gets ONE focused task with minimal context. Decompose complex work into parallel subagents rather than overloading one. Prompt budget <20% of context window per subagent. No delegation chains deeper than 2 levels. Spawn many focused subagents over few overloaded ones. When `AIWG_CONTEXT_WINDOW` is set, concurrent parallel count must respect the budget limit.
**When to apply**: Task delegation, subagent spawning, parallel dispatch, orchestrator fan-out, context budget planning
**Full rule**: @$AIWG_ROOT/agentic/code/addons/aiwg-utils/rules/subagent-scoping.md

#### instruction-comprehension
**Summary**: Fully parse and confirm understanding of all user instructions before acting. Extract constraints (prohibitions first), then requirements, then preferences. Track multi-part requests to completion. Re-read original instructions on failure instead of guessing. Prevent instruction drift on long tasks by periodically re-checking against original requirements. Never override user preferences with "best practices."
**When to apply**: Every user request, multi-part tasks, specification compliance, instruction drift detection, correction handling
**Full rule**: @$AIWG_ROOT/agentic/code/addons/aiwg-utils/rules/instruction-comprehension.md

#### research-before-decision
**Summary**: Research codebase, docs, and sources before making technical decisions. Prevents guessing APIs, blind retries, and missing context. Pattern: IDENTIFY > SEARCH > EXTRACT > REASON > ACT > VERIFY. When an action fails, research the root cause instead of retrying with variations (whack-a-mole detection). Read error messages completely — they frequently contain the answer. Check existing project patterns before creating new ones.
**When to apply**: Technical decision-making, API usage, configuration changes, dependency selection, error diagnosis, import resolution
**Full rule**: @$AIWG_ROOT/agentic/code/addons/aiwg-utils/rules/research-before-decision.md

#### native-ux-tools
**Summary**: Agents MUST prefer platform-native interaction tools (e.g., AskUserQuestion in Claude Code) over plain text output for interactive questions. Check tool availability before asking, fall back to formatted markdown if unavailable. One question per interaction turn. Includes platform capability matrix for all 8 supported platforms.
**When to apply**: Interactive commands (--interactive flag), decision gates, user confirmations, intake wizards, any agent question
**Full rule**: @$AIWG_ROOT/agentic/code/addons/aiwg-utils/rules/native-ux-tools.md

#### human-authorization
**Summary**: Agents must seek explicit human authorization before irreversible or high-stakes actions — especially when those actions are implied by findings rather than explicitly requested. A recommendation is not authorization to act. Covers: removal of artifacts, scope expansion beyond task, closing work items with implied resolution, acting on research findings. Pattern: discover → report → await authorization → act. Agents must proactively recognize scope boundaries; don't rely on system-level friction as the only gate.
**When to apply**: Any action not explicitly stated in the task, removal of files/artifacts/components, scope expansion, closing issues, acting on review findings or recommendations, changes to shared resources
**Full rule**: @$AIWG_ROOT/agentic/code/addons/aiwg-utils/rules/human-authorization.md

### MEDIUM

#### context-budget
**Summary**: When `AIWG_CONTEXT_WINDOW` is set in project context, agents must respect the declared context budget for parallel subagent spawning. Opt-in directive with lookup tables: max parallel count scales from 1 (32k) to 20 (512k+). Formula: `max(1, floor(context_window / 50000))`. Includes compaction guidance per tier (aggressive, moderate, standard, relaxed) and per-subagent output size targets.
**When to apply**: Parallel subagent spawning, task scheduling, agent loop batching, orchestrator fan-out on constrained systems
**Full rule**: @$AIWG_ROOT/agentic/code/addons/aiwg-utils/rules/context-budget.md

#### diagram-generation
**Summary**: Diagram generation is a standard output alongside every major documentation artifact. Defines required diagram types per artifact (C4 for SAD, ER for data models, sequence for APIs, DFD for threat models). MermaidJS is default; PlantUML for C4/formal UML. Source must be committed alongside rendered output. Max 15 nodes per diagram; split into sub-diagrams if more complex.
**When to apply**: Architecture documentation, threat modeling, API design, deployment planning, any artifact with visual communication needs
**Full rule**: @$AIWG_ROOT/agentic/code/addons/aiwg-utils/rules/diagram-generation.md

#### agent-deployment
**Summary**: Rules for working with agent definitions and multi-provider deployment. Covers the agent ecosystem (general-purpose, SDLC, marketing), deployment commands for all 8 platforms, model override configuration, agent metadata structure (YAML frontmatter with name, model, tools, category), tool selection guidelines per task type, and parallel execution patterns with agent isolation.
**When to apply**: Agent definition creation, multi-provider deployment, tool selection for agents, parallel agent execution
**Full rule**: @$AIWG_ROOT/agentic/code/addons/aiwg-utils/rules/agent-deployment.md

---

## Quick Reference by Context

| Task Type | Relevant Rules |
|-----------|---------------|
| **Delegating to subagents** | subagent-scoping, context-budget, instruction-comprehension |
| **Interactive commands** | native-ux-tools, instruction-comprehension |
| **Agent deployment** | agent-deployment |
| **Documentation** | diagram-generation |
| **Research/decisions** | research-before-decision |
| **Error diagnosis** | research-before-decision, instruction-comprehension |
| **Constrained systems** | context-budget, subagent-scoping |
| **Authorization gates** | human-authorization, native-ux-tools |
| **Scope management** | human-authorization, instruction-comprehension |

---

*Generated from aiwg-utils manifest.json — 8 rules*
*Full rule files: @$AIWG_ROOT/agentic/code/addons/aiwg-utils/rules/*
