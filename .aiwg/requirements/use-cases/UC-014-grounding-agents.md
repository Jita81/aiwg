# Use Case Specification: UC-014 - Grounding Agents for Domain Knowledge Injection

---
document: Use Case Specification
use-case-id: UC-014
use-case-name: Grounding Agents for Domain Knowledge Injection
project: AI Writing Guide - SDLC Framework
version: 1.0
status: APPROVED
created: 2026-03-23
author: Requirements Analyst
phase: Construction
priority: P0 (CRITICAL)
feature-id: FID-184
complexity: HIGH
estimated-effort: L (Large)
---

## 1. Use Case Summary

### 1.1 Brief Description

A grounding agent intercepts agent invocations and injects project-specific domain constraints, vocabulary, patterns, and learned rules before the target agent begins work. This prevents agent drift — the gradual divergence of agent outputs from project conventions — without requiring developers to re-specify constraints on every interaction.

### 1.2 Primary Actor

**Orchestrator** (AIWG multi-agent orchestration layer)

### 1.3 Secondary Actors

- **Grounding Agent** (specialized AIWG agent responsible for constraint injection)
- **Target Agent** (any AIWG domain agent receiving grounded context)

### 1.4 Supporting Actors

- **Constraint Store** (`.aiwg/constraints/` — source of learned and declared rules)
- **Developer** (defines domain constraints; reviews grounding quality)

### 1.5 Stakeholders and Interests

| Stakeholder | Interest |
|-------------|----------|
| **Developer** | Agents behave consistently with project conventions; no re-explanation needed |
| **Project Team** | Domain knowledge encoded once, applied everywhere |
| **Framework Maintainer** | Systematic drift prevention reduces support and rework |

## 2. Relationship to Other Use Cases

### 2.1 Dependencies (Prerequisites)

- **UC-013** (@.aiwg/requirements/use-cases/UC-013-agent-constraint-learning.md): Learned constraints sourced from constraint learning pipeline
- **UC-004** (@.aiwg/requirements/use-cases/UC-004-multi-agent-workflows.md): Grounding operates within multi-agent orchestration

### 2.2 Enables

- Any domain UC (UC-001 through UC-012): All agents benefit from grounding

## 3. Preconditions

1. Target agent is being invoked within an AIWG-managed session
2. `.aiwg/constraints/` contains at least one constraint file or the project has a domain profile
3. Grounding agent is registered in the session orchestration pipeline

## 4. Postconditions

**Success Postconditions:**
- Target agent context includes all applicable constraints before first token generation
- Grounding report logged: which constraints injected, which filtered as non-applicable
- Agent output demonstrably consistent with injected constraints

**Failure Postconditions:**
- Constraint load fails: target agent proceeds without grounding; developer notified
- Constraint conflict detected: grounding agent surfaces conflict before proceeding

## 5. Trigger

Orchestrator invokes any domain agent. Grounding is a pre-invocation hook, not a separate explicit user action.

## 6. Main Success Scenario

1. **Orchestrator schedules agent task**: e.g., Architecture Designer to produce a component diagram.
2. **Grounding agent activates** (pre-invocation hook):
   - Reads `.aiwg/constraints/learned-rules.yaml` (from constraint learning)
   - Reads `.aiwg/constraints/domain-profile.yaml` (manually declared project conventions)
   - Filters constraints to those applicable to the target agent's role and task domain
3. **Constraint package assembled**:
   - Prohibited patterns (e.g., "do not use constructor injection")
   - Required vocabulary (e.g., "use 'service' not 'provider' for this domain")
   - Structural conventions (e.g., "all ADRs must include a Consequences section")
4. **Injection into target agent context**: Constraint package prepended to agent system prompt as a grounding preamble.
5. **Target agent executes** with grounded context; produces output consistent with domain constraints.
6. **Grounding report appended** to `.aiwg/working/{session}/grounding-log.yaml`.

## 7. Extensions (Alternative Flows)

**7a. No applicable constraints found**:
- Target agent invoked without grounding preamble
- Grounding log records "no constraints applicable to role: {role}"

**7b. Constraint volume exceeds context budget**:
- Grounding agent ranks constraints by relevance to current task
- Top N constraints injected (N determined by available context budget)
- Overflow constraints logged for manual review

**7c. Developer requests grounding override**:
- Developer flags session: `--no-grounding`
- Grounding agent bypassed; target agent runs with clean context
- Override recorded in session log

## 8. Non-Functional Requirements

- Grounding overhead: <200ms per agent invocation
- Constraint relevance precision: >85% (measured by developer feedback on injected constraints)
- No grounding constraint may exceed 150 tokens (enforced at storage time)

## 9. Related Artifacts

- @agentic/code/frameworks/sdlc-complete/agents/grounding-agent.md
- @agentic/code/frameworks/sdlc-complete/rules/subagent-scoping.md
- @.aiwg/requirements/use-cases/UC-013-agent-constraint-learning.md
- @.aiwg/architecture/decisions/ADR-018-hook-file-architecture.md
