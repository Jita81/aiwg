# Use Case Specification: UC-013 - Agent Constraint Learning

---
document: Use Case Specification
use-case-id: UC-013
use-case-name: Agent Constraint Learning from Feedback
project: AI Writing Guide - SDLC Framework
version: 1.0
status: APPROVED
created: 2026-03-23
author: Requirements Analyst
phase: Construction
priority: P0 (CRITICAL)
feature-id: FID-146
complexity: HIGH
estimated-effort: L (Large)
---

## 1. Use Case Summary

### 1.1 Brief Description

Agents learn domain-specific rules and constraints from developer corrections and apply those learned constraints in future interactions within the same project. When a developer corrects agent behavior, the correction is captured, classified, and persisted so the agent does not repeat the same mistake.

### 1.2 Primary Actor

**Developer** (using AIWG framework agents)

### 1.3 Secondary Actors

- **Agent** (any AIWG agent receiving corrective feedback)
- **Constraint Store** (persistent rule repository per project)

### 1.4 Supporting Actors

- **AIWG Orchestrator** (Claude Code core platform)
- **Documentation Archivist** (persists learned constraints to `.aiwg/`)

### 1.5 Stakeholders and Interests

| Stakeholder | Interest |
|-------------|----------|
| **Developer** | Corrections applied consistently; same mistake not repeated across sessions |
| **Project Team** | Domain rules enforced automatically without manual re-specification |
| **Framework Maintainer** | Agents improve through use; reduced support burden |

## 2. Relationship to Other Use Cases

### 2.1 Dependencies (Prerequisites)

- **UC-004** (@.aiwg/requirements/use-cases/UC-004-multi-agent-workflows.md): Multi-agent workflows must be active for constraint learning to apply across agents
- **UC-007** (@.aiwg/requirements/use-cases/UC-007-metrics-collection.md): Metrics track constraint application rate

### 2.2 Enables

- **UC-014** (Grounding Agents): Learned constraints feed grounding agent injection pipeline

## 3. Preconditions

1. An AIWG agent is active in a project session
2. Developer issues a correction (explicit or implicit) to agent output
3. `.aiwg/constraints/` directory writable

## 4. Postconditions

**Success Postconditions:**
- Correction classified and stored in `.aiwg/constraints/learned-rules.yaml`
- Agent applies constraint in current session immediately
- Constraint surfaced to all subsequent agent sessions in same project
- Constraint versioned with timestamp and source (correction text excerpt)

**Failure Postconditions:**
- Classification fails: constraint stored as unclassified for human review
- Write fails: correction logged in session only (no persistence); user notified

## 5. Trigger

Developer issues a corrective statement during an active agent interaction (e.g., "don't do X", "always use Y format", "we don't use that pattern here").

## 6. Main Success Scenario

1. **Developer issues correction**: "Stop adding constructor injection — we use service locator in this codebase."
2. **Agent detects correction signal**: Keyword patterns (`don't`, `stop`, `always`, `never`, `we use`, `we don't`) trigger constraint extraction.
3. **Constraint classified**:
   - Type: `prohibition`
   - Domain: `code-generation`
   - Scope: `project`
   - Rule: "Do not use constructor injection; use service locator pattern"
4. **Constraint persisted** to `.aiwg/constraints/learned-rules.yaml` with timestamp.
5. **Agent acknowledges**: Confirms understanding, applies immediately in current session.
6. **Future sessions**: Grounding agent or session init loads constraints from `.aiwg/constraints/` and injects into agent context.

## 7. Extensions (Alternative Flows)

**7a. Implicit correction** (developer rewrites agent output without verbal correction):
- Agent detects significant divergence between its output and developer's revision
- Flags potential constraint; prompts developer: "Should I remember this preference?"
- Developer confirms → constraint stored; declines → discarded

**7b. Conflicting constraint detected**:
- New constraint conflicts with existing stored rule
- Agent surfaces conflict to developer for resolution
- Resolved constraint stored with supersedes reference

**7c. Constraint scope is global (not project-specific)**:
- Developer marks constraint as user-level
- Constraint stored to agent memory system rather than `.aiwg/constraints/`

## 8. Non-Functional Requirements

- Constraint extraction latency: <500ms (does not block response)
- Storage: YAML format, human-readable, diff-friendly
- Retention: Constraints persist until explicitly removed or superseded

## 9. Related Artifacts

- @agentic/code/frameworks/sdlc-complete/agents/constraint-learning-agent.md
- @agentic/code/addons/aiwg-utils/rules/subagent-scoping.md
- @.aiwg/architecture/decisions/ADR-018-hook-file-architecture.md (grounding integration)
- UC-014: @.aiwg/requirements/use-cases/UC-014-grounding-agents.md
