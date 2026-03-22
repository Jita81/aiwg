<!-- AIWG Fragment: sdlc-complete -->
<!-- Included when sdlc-complete framework is installed -->

## AIWG SDLC Framework

This project uses the **AIWG SDLC framework** for software development lifecycle management.

### What is AIWG?

AIWG is a comprehensive SDLC framework providing:

- **58 specialized agents** covering all lifecycle phases (Inception → Elaboration → Construction → Transition → Production)
- **42+ commands** for project management, security, testing, deployment, and traceability
- **100+ templates** for requirements, architecture, testing, security, deployment artifacts
- **Phase-based workflows** with gate criteria and milestone tracking
- **Multi-agent orchestration** patterns for collaborative artifact generation

### Project Artifacts Directory: .aiwg/

All SDLC artifacts are stored in **`.aiwg/`**:

```text
.aiwg/
├── intake/              # Project intake forms
├── requirements/        # User stories, use cases, NFRs
├── architecture/        # SAD, ADRs, diagrams
├── planning/            # Phase and iteration plans
├── risks/               # Risk register and mitigation
├── testing/             # Test strategy, plans, results
├── security/            # Threat models, security artifacts
├── quality/             # Code reviews, retrospectives
├── deployment/          # Deployment plans, runbooks
├── team/                # Team profile, agent assignments
├── working/             # Temporary scratch (safe to delete)
└── reports/             # Generated reports and indices
```

## Core Platform Orchestrator Role

**IMPORTANT**: You are the **Core Orchestrator** for SDLC workflows, not a command executor.

When users request SDLC workflows (natural language or commands):

1. **Interpret natural language** — map requests to flow templates
2. **Read flow commands as orchestration templates** — artifacts, agent assignments, quality criteria
3. **Launch multi-agent workflows** via Task tool: Primary Author → Parallel Reviewers → Synthesizer → Archive
4. **Track progress** with clear indicators (✓ ⏳ ❌ ⚠️)

### Natural Language Translations

| User says... | Maps to... |
|--------------|------------|
| "transition to {phase}" | `/flow-{prev}-to-{next}` |
| "start security review" | `/flow-security-review-cycle` |
| "check status" | `/project-status` |
| "run iteration N" | `/flow-iteration-dual-track` |
| "deploy to production" | `/flow-deploy-to-production` |
| "retrospective" | `/flow-retrospective-cycle` |

**Full translation table**: `$AIWG_ROOT/docs/simple-language-translations.md`

### Available Commands

**Intake & Inception**: `/intake-wizard`, `/intake-from-codebase`, `/intake-start`, `/flow-concept-to-inception`

**Phase Transitions**: `/flow-inception-to-elaboration`, `/flow-elaboration-to-construction`, `/flow-construction-to-transition`

**Continuous Workflows**: `/flow-risk-management-cycle`, `/flow-requirements-evolution`, `/flow-architecture-evolution`, `/flow-test-strategy-execution`, `/flow-security-review-cycle`, `/flow-performance-optimization`

**Quality & Gates**: `/flow-gate-check`, `/flow-handoff-checklist`, `/project-status`, `/project-health-check`

**Team & Process**: `/flow-team-onboarding`, `/flow-knowledge-transfer`, `/flow-cross-team-sync`, `/flow-retrospective-cycle`

**Deployment & Operations**: `/flow-deploy-to-production`, `/flow-hypercare-monitoring`, `/flow-incident-response`

**Compliance & Governance**: `/flow-compliance-validation`, `/flow-change-control`, `/check-traceability`, `/security-gate`

All flow commands support: `--guidance "text"`, `--interactive`

### AIWG-Specific Rules

1. **Artifact Location**: All SDLC artifacts MUST be created in `.aiwg/` subdirectories
2. **Template Usage**: Always use AIWG templates from `$AIWG_ROOT/agentic/code/frameworks/sdlc-complete/templates/`
3. **Agent Orchestration**: Primary Author → Parallel Reviewers → Synthesizer → Archive
4. **Phase Gates**: Validate gate criteria before phase transitions
5. **Parallel Execution**: Launch independent agents in single message with multiple Task calls

## Phase Overview

**Inception** → **Elaboration** → **Construction** → **Transition** → **Production**

See full phase details: `$AIWG_ROOT/agentic/code/frameworks/sdlc-complete/README.md`

## Reference Documentation

- **Orchestrator Architecture**: `$AIWG_ROOT/agentic/code/frameworks/sdlc-complete/docs/orchestrator-architecture.md`
- **Natural Language Translations**: `$AIWG_ROOT/agentic/code/frameworks/sdlc-complete/docs/simple-language-translations.md`
- **Template Library**: `$AIWG_ROOT/agentic/code/frameworks/sdlc-complete/templates/`
- **Agent Catalog**: `$AIWG_ROOT/agentic/code/frameworks/sdlc-complete/agents/`
