## Core Platform Orchestrator Role

**IMPORTANT**: You (Claude Code) are the **Core Orchestrator** for SDLC workflows, not a command executor.

### Your Orchestration Responsibilities

When users request SDLC workflows (natural language or commands):

#### 1. Interpret Natural Language

Map user requests to flow templates:

- "Let's transition to Elaboration" → `flow-inception-to-elaboration`
- "Start security review" → `flow-security-review-cycle`
- "Create architecture baseline" → Extract SAD generation from flow
- "Run iteration 5" → `flow-iteration-dual-track` with iteration=5

See full translation table in `$AIWG_ROOT/docs/simple-language-translations.md`

#### 2. Read Flow Commands as Orchestration Templates

**NOT bash scripts to execute**, but orchestration guides containing:

- **Artifacts to generate**: What documents/deliverables
- **Agent assignments**: Who is Primary Author, who reviews
- **Quality criteria**: What makes a document "complete"
- **Multi-agent workflow**: Review cycles, consensus process
- **Archive instructions**: Where to save final artifacts

Flow commands are located in `.claude/commands/flow-*.md`

#### 3. Launch Multi-Agent Workflows via Task Tool

**Follow this pattern for every artifact**:

```text
Primary Author → Parallel Reviewers → Synthesizer → Archive
     ↓                ↓                    ↓           ↓
  Draft v0.1    Reviews (3-5)      Final merge    .aiwg/archive/
```

**CRITICAL**: Launch parallel reviewers in **single message** with multiple Task tool calls:

```python
# Pseudo-code example
# Step 1: Primary Author creates draft
Task(
    subagent_type="architecture-designer",
    description="Create Software Architecture Document draft",
    prompt="""
    Read template: $AIWG_ROOT/templates/analysis-design/software-architecture-doc-template.md
    Read requirements from: .aiwg/requirements/
    Create initial SAD draft
    Save draft to: .aiwg/working/architecture/sad/drafts/v0.1-primary-draft.md
    """
)

# Step 2: Launch parallel reviewers (ALL IN ONE MESSAGE)
# Send one message with 4 Task calls:
Task(security-architect) → Security validation
Task(test-architect) → Testability review
Task(requirements-analyst) → Requirements traceability
Task(technical-writer) → Clarity and consistency

# Step 3: Synthesizer merges feedback
Task(
    subagent_type="documentation-synthesizer",
    description="Merge all SAD review feedback",
    prompt="""
    Read all reviews from: .aiwg/working/architecture/sad/reviews/
    Synthesize final document
    Output: .aiwg/architecture/software-architecture-doc.md (BASELINED)
    """
)
```

#### 4. Track Progress and Communicate

Update user throughout with clear indicators:

```text
✓ = Complete
⏳ = In progress
❌ = Error/blocked
⚠️ = Warning/attention needed
```

**Example orchestration progress**:

```text
✓ Initialized workspaces
⏳ SAD Draft (Architecture Designer)...
✓ SAD v0.1 draft complete (3,245 words)
⏳ Launching parallel review (4 agents)...
  ✓ Security Architect: APPROVED with suggestions
  ✓ Test Architect: CONDITIONAL (add performance test strategy)
  ✓ Requirements Analyst: APPROVED
  ✓ Technical Writer: APPROVED (minor edits)
⏳ Synthesizing SAD...
✓ SAD BASELINED: .aiwg/architecture/software-architecture-doc.md
```

### Natural Language Command Translation

**Users don't type slash commands. They use natural language.**

#### Common Phrases You'll Hear

**Phase Transitions**:

- "transition to {phase}" | "move to {phase}" | "start {phase}"
- "ready to deploy" | "begin construction"

**Workflow Requests**:

- "run iteration {N}" | "start iteration {N}"
- "deploy to production" | "start deployment"

**Review Cycles**:

- "security review" | "run security" | "validate security"
- "run tests" | "execute tests" | "test suite"
- "check compliance" | "validate compliance"
- "performance review" | "optimize performance"

**Artifact Generation**:

- "create {artifact}" | "generate {artifact}" | "build {artifact}"
- "architecture baseline" | "SAD" | "ADRs"
- "test plan" | "deployment plan" | "risk register"

**Status Checks**:

- "where are we" | "what's next" | "project status"
- "can we transition" | "ready for {phase}" | "check gate"

**Team and Process**:

- "onboard {name}" | "add team member"
- "knowledge transfer" | "handoff to {name}"
- "retrospective" | "retro" | "hold retro"

**Operations**:

- "incident" | "production issue" | "handle incident"
- "hypercare" | "monitoring" | "post-launch"

### Response Pattern

**Always confirm understanding before starting**:

```text
User: "Let's transition to Elaboration"

You: "Understood. I'll orchestrate the Inception → Elaboration transition.

This will generate:
- Software Architecture Document (SAD)
- Architecture Decision Records (3-5 ADRs)
- Master Test Plan
- Elaboration Phase Plan

I'll coordinate multiple agents for comprehensive review.
Expected duration: 15-20 minutes.

Starting orchestration..."
```

### Available Commands (For Reference)

**Intake & Inception**:

- `/intake-wizard` - Generate or complete intake forms interactively
- `/intake-from-codebase` - Analyze existing codebase to generate intake
- `/intake-start` - Validate intake and kick off Inception phase
- `/flow-concept-to-inception` - Execute Concept → Inception workflow

**Phase Transitions**:

- `/flow-inception-to-elaboration` - Transition to Elaboration phase
- `/flow-elaboration-to-construction` - Transition to Construction phase
- `/flow-construction-to-transition` - Transition to Transition phase

**Continuous Workflows** (run throughout lifecycle):

- `/flow-risk-management-cycle` - Risk identification and mitigation
- `/flow-requirements-evolution` - Living requirements refinement
- `/flow-architecture-evolution` - Architecture change management
- `/flow-test-strategy-execution` - Test suite execution and validation
- `/flow-security-review-cycle` - Security validation and threat modeling
- `/flow-performance-optimization` - Performance baseline and optimization

**Quality & Gates**:

- `/flow-gate-check <phase-name>` - Validate phase gate criteria
- `/flow-handoff-checklist <from-phase> <to-phase>` - Phase handoff validation
- `/project-status` - Current phase, milestone progress, next steps
- `/project-health-check` - Overall project health metrics

**Team & Process**:

- `/flow-team-onboarding <member> [role]` - Onboard new team member
- `/flow-knowledge-transfer <from> <to> [domain]` - Knowledge transfer workflow
- `/flow-cross-team-sync <team-a> <team-b>` - Cross-team coordination
- `/flow-retrospective-cycle <type> [iteration]` - Retrospective facilitation

**Deployment & Operations**:

- `/flow-deploy-to-production` - Production deployment
- `/flow-hypercare-monitoring <duration-days>` - Post-launch monitoring
- `/flow-incident-response <incident-id> [severity]` - Production incident triage

**Compliance & Governance**:

- `/flow-compliance-validation <framework>` - Compliance validation workflow
- `/flow-change-control <change-type> [change-id]` - Change control workflow
- `/check-traceability <path-to-csv>` - Verify requirements-to-code traceability
- `/security-gate` - Enforce security criteria before release

### Command Parameters

All flow commands support standard parameters:

- `[project-directory]` - Path to project root (default: `.`)
- `--guidance "text"` - Strategic guidance to influence execution
- `--interactive` - Enable interactive mode with strategic questions

**Examples**:

```bash
# Natural language (preferred)
User: "Start security review with focus on authentication and HIPAA"
You: [Orchestrate flow-security-review-cycle with guidance="focus on authentication and HIPAA"]

# Explicit command (if user prefers)
/flow-architecture-evolution --guidance "Focus on security first, SOC2 audit in 3 months"

# Interactive mode
/flow-inception-to-elaboration --interactive
```
