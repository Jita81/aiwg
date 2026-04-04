# ADR: Agent-Oriented Estimation — Replace Time Estimates with Scope/Agent/Pass Metrics

**Status**: Accepted  
**Date**: 2026-04-04  
**Deciders**: Joseph Magly  
**Tags**: estimation, planning, agents, parallelism, metrics

---

## Context

AIWG agents consistently produce time-based estimates ("this will take 2-3 days", "expected duration: 45 minutes") when planning or decomposing tasks. These estimates are:

1. **Systematically wrong**: Human+AI development velocity has no established baseline. The same task can take minutes or hours depending on operator skill, model quality, tool configuration, and task decomposability.

2. **Non-informative**: A time estimate conveys no actionable information about HOW to approach the work. Knowing "3 days" doesn't help an operator decide how to parallelize, which agents to deploy, or when to gate on quality.

3. **Context-polluting**: False precision on an unverifiable claim wastes tokens and creates anchoring bias in subsequent agent decisions.

4. **Incompatible with centaur configurations**: REF-169 (Evans et al. 2026) documents that human-AI composite actors — "centaurs" where one human directs many agents — make individual velocity estimates structurally meaningless. The same operator with different tool configurations produces wildly different throughput.

5. **Non-linear with agent count**: REF-086 (DeepMind) shows 17.2× error amplification above 4 concurrent agents in "bag of agents" architectures, and REF-127 (Zylos) shows doubling agent run duration quadruples failure rate. More time/agents ≠ more output.

---

## Decision

**Replace all time-based estimates with agent-oriented metrics** across all AIWG agents, skills, templates, and orchestration patterns.

The five required estimation dimensions are:

| Dimension | What It Captures | Example |
|-----------|-----------------|---------|
| **Scope count** | Number of atomic deliverable work items | "7 scope units" |
| **Agent count + roles** | Specialized agents needed, within 3-7 optimal range | "4 agents: Orchestrator, Security Auditor, Test Engineer, Reviewer" |
| **Parallelism map** | Which units are independent vs sequential | "Batches 1+2 parallel → gate → Batches 3+4 parallel" |
| **Pass estimate** | Iterations to reach quality gate | "2-4 passes to `npm test` green" |
| **Quality gate** | Verifiable completion command | "`npx tsc --noEmit && npm test` exits 0" |

---

## Rationale

### What makes agent-oriented estimates superior

**Scope count** is honest: it counts things that are countable (files, endpoints, use cases, test cases) without predicting velocity. An operator can look at a scope count and make their own throughput estimate given their tooling.

**Parallelism map** is the most actionable output: it tells an orchestrator which agents can run simultaneously and which must wait. This is the key planning artifact for multi-agent execution.

**Pass estimate** is grounded: it comes from the quality gate command. Agents with working test suites can estimate how many fix-verify cycles are typical for the class of work. This is empirically observable and correctable.

**Quality gate** makes completion verifiable, not subjective. An exit code is a fact. "Looks good" is not.

### Research grounding

- **REF-086**: Multi-agent coordination tax — 17.2× error amplification, 4-agent threshold, n*(n-1)/2 communication paths. Directly motivates agent count guidance.
- **REF-088**: 3-7 agent optimal range, 60-80% time compression from parallelism (but this is topology-dependent, not a universal multiplier). Grounds parallelism map value.
- **REF-127**: 35-minute degradation threshold, duration↑ → failure rate↑ quadratically. Grounds pass estimate over duration estimate.
- **REF-169**: Centaur configurations, fission-fusion dynamics, one-human-many-agents. Grounds the impossibility of individual velocity estimates.

---

## Consequences

### Positive
- Agent planning outputs become immediately actionable
- Parallelism maps enable orchestrators to maximize throughput
- Pass estimates + quality gates enable the agent loop (`/al`) to know when it's done
- No false precision; operators aren't anchored to wrong numbers
- Consistent with vague-discretion rule (measurable criteria) and subagent-scoping rule (parallel decomposition)

### Negative / Trade-offs
- Operators who expect time estimates will need to adjust their mental model
- Pass estimates can still be wrong (though they're more improvable over time than time estimates)
- Some stakeholders require time estimates for scheduling; agents must redirect these to scope/pass counts and explain why

### Neutral
- This does not change how work is done — only how it is described and planned
- Existing templates (phase plans, iteration plans) need updating to remove time-estimate fields

---

## Implementation

**Rule**: `agentic/code/addons/aiwg-utils/rules/no-time-estimates.md` — HIGH severity, applies to all agents

**Templates to update**: 
- Phase plan templates (remove "duration: N weeks" fields)
- Iteration plan templates (remove "sprint duration" fields, add parallelism map section)
- Completion report templates (add scope count, pass count fields)

**Tracking**: Issue filed for template updates.

---

## Related

- `agentic/code/addons/aiwg-utils/rules/no-time-estimates.md` — enforcement rule
- `agentic/code/addons/aiwg-utils/rules/vague-discretion.md` — quality gate measurability
- `agentic/code/addons/aiwg-utils/rules/subagent-scoping.md` — parallel decomposition
- `.aiwg/research/findings/agent-oriented-estimation.md` — research synthesis
- REF-086, REF-088, REF-127, REF-169 — supporting research
