---
description: Orchestrate multi-agent behavioral specification generation from use cases (Layer 3 + Layer 4)
category: sdlc-orchestration
argument-hint: [use-case-id | "all"] [--guidance "text"] [--interactive] [--layer 3|4|both]
allowed-tools: Task, Read, Write, Glob, TodoWrite
orchestration: true
model: opus
---

# Use Case Realization Flow

**You are the Core Orchestrator** for generating behavioral specifications (Layer 3) and pseudo-code specifications (Layer 4) from use cases.

## Your Role

**You orchestrate multi-agent workflows. You do NOT execute bash scripts.**

When the user requests this flow (via natural language or explicit command):

1. **Interpret the request** and confirm understanding
2. **Read this template** as your orchestration guide
3. **Extract agent assignments** and workflow steps
4. **Launch agents via Task tool** in correct sequence
5. **Synthesize results** and finalize artifacts
6. **Report completion** with summary

## Purpose

Bridge the gap between architecture (Layer 2) and code generation (Layer 5) by producing detailed behavioral specifications and pseudo-code for each architecturally significant use case. This ensures the final code generation step is **translation, not design**.

### Refinement Layers

```
Layer 2: ARCHITECTURE BASELINE (input — SAD, ADRs, component boundaries)
    ↓
Layer 3: BEHAVIORAL SPECIFICATIONS (this flow generates)
    Use case realizations (sequence diagrams)
    State machine specs (stateful entities)
    Decision tables (complex branching)
    Method-level interface contracts
    Activity diagrams (complex business logic)
    Data flow specifications
    ↓
Layer 4: PSEUDO-CODE SPECIFICATIONS (this flow generates)
    Language-neutral algorithm specs
    Error handling trees
    Data structure definitions with invariants
    ↓
Layer 5: CODE GENERATION (downstream — translation from specs)
```

## Natural Language Triggers

Users may say:
- "Realize UC-003"
- "Generate behavioral specs"
- "Create use case realizations"
- "Realize all use cases"
- "Generate pseudo-code for the login flow"
- "Deepen the specifications"
- "Create Layer 3 artifacts"
- "Spec out UC-001 through UC-005"

You recognize these as requests for this orchestration flow.

## Parameter Handling

### Use Case Selection

- Single: `UC-003` or `"realize UC-003"`
- Multiple: `UC-001 UC-003 UC-005`
- All architecturally significant: `"all"` or `"realize all use cases"`

### --layer Parameter

- `3` — Generate only behavioral specifications (Layer 3)
- `4` — Generate only pseudo-code specifications (Layer 4, requires Layer 3 exists)
- `both` (default) — Generate both layers

### --guidance Parameter

**Examples**:
```
--guidance "Focus on security boundaries, this is a HIPAA system"
--guidance "Performance-critical path, include latency annotations"
--guidance "Minimal specs, just the core happy path for now"
```

### --interactive Parameter

**Questions to Ask** (if --interactive):

```
Q1: Which use cases should we realize?
    (specific IDs, "architecturally significant", or "all")

Q2: What depth of behavioral specification?
    (minimal: sequence only, standard: + state machines + contracts, comprehensive: full Layer 3)

Q3: Should we generate pseudo-code (Layer 4) as well?
    (yes/no — Layer 4 is needed for construction entry)

Q4: Any domain-specific concerns?
    (security boundaries, concurrency, data sensitivity, performance constraints)

Q5: Who should review the specifications?
    (default: Security Architect + Test Architect + Requirements Analyst)
```

## Artifacts Generated

**Layer 3 (per use case)**:
- Use case realization: `.aiwg/requirements/realizations/BS-{NNN}-realization.md`
- Interface contracts: `.aiwg/requirements/contracts/IC-{NNN}-{method}.md`
- State machine specs: `.aiwg/requirements/state-machines/SM-{entity}.md`
- Decision tables: `.aiwg/requirements/decision-tables/DT-{NNN}-{rule}.md`
- Activity diagrams: `.aiwg/requirements/activities/ACT-{NNN}-{flow}.md`
- Data flow specs: `.aiwg/requirements/data-flows/DFS-{NNN}-{flow}.md`

**Layer 4 (per method)**:
- Pseudo-code specs: `.aiwg/requirements/pseudocode/PC-{NNN}-{method}.md`

**Traceability**:
- Spec-to-code matrix: `.aiwg/traceability/spec-to-code-matrix.md`

## Multi-Agent Orchestration Workflow

### Step 1: Identify Target Use Cases

**Your Actions**:

1. **Read use cases and SAD**:
   ```
   Read .aiwg/requirements/use-case-*.md
   Read .aiwg/architecture/software-architecture-doc.md
   ```

2. **Select architecturally significant use cases**:
   - If specific IDs provided → use those
   - If "all" → filter for architecturally significant (referenced in SAD, tagged as significant)
   - Present selection for confirmation

**Communicate Progress**:
```
✓ Identified {N} use cases for realization:
  - UC-001: {title} (architecturally significant)
  - UC-003: {title} (architecturally significant)
  - UC-005: {title} (architecturally significant)
```

### Step 2: Generate Use Case Realizations (Layer 3)

**For each use case, launch realization agent**:

Use cases can be realized in parallel (independent of each other).

```
# For each use case (parallel):
Task(
    subagent_type="architecture-designer",
    description="Realize UC-{id}: {title}",
    prompt="""
    Read use case: .aiwg/requirements/use-case-{id}-{name}.md
    Read SAD: .aiwg/architecture/software-architecture-doc.md
    Read templates:
    - $AIWG_ROOT/agentic/code/frameworks/sdlc-complete/templates/analysis-design/use-case-realization-template.md
    - $AIWG_ROOT/agentic/code/frameworks/sdlc-complete/templates/analysis-design/method-interface-contract-template.md
    - $AIWG_ROOT/agentic/code/frameworks/sdlc-complete/templates/analysis-design/state-machine-spec-template.md
    - $AIWG_ROOT/agentic/code/frameworks/sdlc-complete/templates/analysis-design/decision-table-template.md

    Generate use case realization:

    1. SEQUENCE DIAGRAM (MermaidJS sequenceDiagram)
       - Map each use case step to object interactions
       - Show method calls with parameters and return types
       - Include exception paths as alt/opt blocks
       - Annotate with component boundaries from SAD

    2. METHOD-LEVEL INTERFACE CONTRACTS
       - For each method call in the sequence diagram:
         - Signature, preconditions, postconditions, invariants
         - Exception specifications with recovery strategies
         - Data transformation description
       - ID convention: IC-{use-case-id}-{method-number}

    3. STATE MACHINE SPECS (if stateful entities found)
       - For each entity with lifecycle behavior:
         - States, transitions, guards, entry/exit actions
         - MermaidJS stateDiagram-v2
       - ID convention: SM-{entity-name}

    4. DECISION TABLES (if complex branching found)
       - For logic with ≥3 interacting conditions:
         - Condition stubs, action stubs, rule columns
         - Completeness check (2^N or "don't care")
       - ID convention: DT-{use-case-id}-{rule-name}

    5. ACTIVITY DIAGRAMS (if complex multi-step flows)
       - Decision nodes, fork/join, swim lanes
       - MermaidJS flowchart

    6. DATA FLOW SPECS (if data transformations)
       - Source → transformation → intermediate → destination
       - Validation constraints at each step

    Traceability:
    - UC-{id} → BS-{id} (realization)
    - BS-{id} → IC-{id}-{N} (per method contract)
    - BS-{id} → SM-{entity} (per stateful entity)
    - BS-{id} → DT-{id}-{rule} (per decision table)

    Output files:
    - .aiwg/requirements/realizations/BS-{id}-realization.md
    - .aiwg/requirements/contracts/IC-{id}-{method}.md (per method)
    - .aiwg/requirements/state-machines/SM-{entity}.md (if applicable)
    - .aiwg/requirements/decision-tables/DT-{id}-{rule}.md (if applicable)
    - .aiwg/requirements/activities/ACT-{id}-{flow}.md (if applicable)
    - .aiwg/requirements/data-flows/DFS-{id}-{flow}.md (if applicable)
    """
)
```

**Communicate Progress**:
```
⏳ Generating use case realizations (Layer 3)...
  ✓ UC-001: {title} — realization complete (1 sequence, 4 contracts, 1 state machine)
  ✓ UC-003: {title} — realization complete (1 sequence, 6 contracts, 2 decision tables)
  ✓ UC-005: {title} — realization complete (1 sequence, 3 contracts, 1 activity diagram)
✓ Layer 3 artifacts: {N} realizations, {M} contracts, {P} supporting specs
```

### Step 3: Parallel Review of Behavioral Specs

**Launch all reviewers simultaneously** (single message with 3-4 Task calls):

```
# Security Architect Review
Task(
    subagent_type="security-architect",
    description="Review behavioral specs: security boundary validation",
    prompt="""
    Read all behavioral specs:
    - .aiwg/requirements/realizations/*.md
    - .aiwg/requirements/contracts/*.md

    Validate:
    - Authentication/authorization at every component boundary crossing
    - Sensitive data transformations have encryption annotations
    - Exception paths don't leak security-sensitive information
    - State machine transitions enforce security invariants

    Create review with APPROVED | CONDITIONAL | NEEDS_WORK status
    Save to: .aiwg/working/realizations/reviews/security-architect-review.md
    """
)

# Test Architect Review
Task(
    subagent_type="test-architect",
    description="Review behavioral specs: testability validation",
    prompt="""
    Read all behavioral specs:
    - .aiwg/requirements/realizations/*.md
    - .aiwg/requirements/contracts/*.md

    Validate:
    - Each interaction in sequence diagrams is independently testable
    - Exception paths have clear test scenarios
    - State machine transitions are verifiable
    - Decision table rules map to test cases (1 rule = 1 test)
    - Interface contracts have testable preconditions and postconditions

    Create review with APPROVED | CONDITIONAL | NEEDS_WORK status
    Save to: .aiwg/working/realizations/reviews/test-architect-review.md
    """
)

# Domain Expert Review
Task(
    subagent_type="domain-expert",
    description="Review behavioral specs: business logic correctness",
    prompt="""
    Read all behavioral specs:
    - .aiwg/requirements/realizations/*.md
    - .aiwg/requirements/decision-tables/*.md
    - .aiwg/requirements/state-machines/*.md

    Validate:
    - Business rules correctly captured in decision tables
    - Entity lifecycles match real-world behavior
    - Sequence flows match expected business processes
    - Edge cases and exception paths are realistic

    Create review with APPROVED | CONDITIONAL | NEEDS_WORK status
    Save to: .aiwg/working/realizations/reviews/domain-expert-review.md
    """
)

# Requirements Analyst Review
Task(
    subagent_type="requirements-analyst",
    description="Review behavioral specs: traceability validation",
    prompt="""
    Read use cases: .aiwg/requirements/use-case-*.md
    Read behavioral specs: .aiwg/requirements/realizations/*.md

    Validate bidirectional traceability:
    - Every use case step maps to at least one behavioral spec interaction
    - Every behavioral spec links back to its parent use case
    - Every interface contract links to its parent realization
    - No orphaned specs (specs without parent use case)
    - No uncovered use case steps (steps without behavioral spec)

    Calculate coverage metric: % of use case steps with behavioral specs

    Create review with APPROVED | CONDITIONAL | NEEDS_WORK status
    Save to: .aiwg/working/realizations/reviews/requirements-analyst-review.md
    """
)
```

**Communicate Progress**:
```
⏳ Parallel review of behavioral specs (4 agents)...
  ✓ Security Architect: {status}
  ✓ Test Architect: {status}
  ✓ Domain Expert: {status}
  ✓ Requirements Analyst: {status} (coverage: {N}%)
```

### Step 4: Synthesize and Resolve Review Feedback

```
Task(
    subagent_type="documentation-synthesizer",
    description="Merge behavioral spec review feedback",
    prompt="""
    Read all reviews:
    - .aiwg/working/realizations/reviews/security-architect-review.md
    - .aiwg/working/realizations/reviews/test-architect-review.md
    - .aiwg/working/realizations/reviews/domain-expert-review.md
    - .aiwg/working/realizations/reviews/requirements-analyst-review.md

    For each CONDITIONAL or NEEDS_WORK finding:
    1. Identify the affected spec file
    2. Apply the fix (update the spec in place)
    3. Document what changed and why

    Generate synthesis report:
    - All feedback items with resolution status
    - Conflicts resolved (with rationale)
    - Outstanding concerns escalated (if any)
    - Final review status: all APPROVED or escalated

    Save to: .aiwg/working/realizations/synthesis/synthesis-report.md
    """
)
```

### Step 5: Generate Pseudo-Code Specifications (Layer 4)

**Skip if --layer 3**

**For each method in interface contracts** (can parallel across methods within a realization):

```
Task(
    subagent_type="architecture-designer",
    description="Generate pseudo-code specs from behavioral specs",
    prompt="""
    Read interface contracts: .aiwg/requirements/contracts/IC-*.md
    Read behavioral specs: .aiwg/requirements/realizations/BS-*.md
    Read decision tables: .aiwg/requirements/decision-tables/DT-*.md
    Read template: $AIWG_ROOT/agentic/code/frameworks/sdlc-complete/templates/analysis-design/pseudocode-spec-template.md

    For each method in the interface contracts:

    1. SIGNATURE from contract
    2. PRECONDITIONS from contract → VALIDATE blocks
    3. ALGORITHM from sequence diagram method call chain:
       - Map each step to SET/CALL operations
       - Map decision table rules to IF/SWITCH blocks
       - Map exception paths to VALIDATE...ON FAILURE blocks
    4. POSTCONDITIONS from contract → final state assertions
    5. ERROR HANDLING TREE from exception specifications
    6. DATA STRUCTURES from contract type definitions
    7. INVARIANTS from contract invariants

    Language-neutral notation:
    - Keywords: SET, FUNCTION, FOR EACH, IF, RETURN, VALIDATE, ON FAILURE
    - No language-specific syntax
    - Walkable by domain experts

    Keep each function under 30 pseudo-code lines. Decompose larger algorithms.

    Traceability: BS-{id} → IC-{id} → PC-{id}

    Output: .aiwg/requirements/pseudocode/PC-{id}-{method}.md (one per method)
    """
)
```

**Review pseudo-code**:

```
Task(
    subagent_type="requirements-analyst",
    description="Verify pseudo-code against behavioral specs",
    prompt="""
    Read pseudo-code specs: .aiwg/requirements/pseudocode/PC-*.md
    Read behavioral specs: .aiwg/requirements/realizations/BS-*.md
    Read interface contracts: .aiwg/requirements/contracts/IC-*.md

    Verify:
    - Every branch in behavioral spec has corresponding pseudo-code path
    - Every exception in contract has error handling entry
    - Data structures match contract types
    - Algorithm is walkable by non-programmer
    - All VALIDATE blocks have ON FAILURE handlers
    - Traceability: BS → IC → PC is complete

    Report: APPROVED | NEEDS_WORK with specific gaps
    Save to: .aiwg/working/realizations/reviews/pseudocode-review.md
    """
)
```

**Communicate Progress**:
```
⏳ Generating pseudo-code specifications (Layer 4)...
  ✓ PC-001-createUser: 18 lines, 3 VALIDATE blocks
  ✓ PC-001-validateEmail: 12 lines, 2 VALIDATE blocks
  ✓ PC-003-processOrder: 28 lines, 5 VALIDATE blocks
  ...
✓ Layer 4 complete: {N} pseudo-code specs generated
✓ Review: APPROVED (all specs verified against behavioral specs)
```

### Step 6: Generate Traceability Matrix

```
Task(
    subagent_type="requirements-analyst",
    description="Generate spec-to-code traceability matrix",
    prompt="""
    Read all artifacts:
    - .aiwg/requirements/use-case-*.md (UC-{NNN})
    - .aiwg/requirements/realizations/BS-*.md (BS-{NNN})
    - .aiwg/requirements/contracts/IC-*.md (IC-{NNN})
    - .aiwg/requirements/pseudocode/PC-*.md (PC-{NNN})

    Generate traceability matrix:

    | Use Case | Behavioral Spec | Interface Contracts | Pseudo-Code | Status |
    |----------|----------------|--------------------|-----------| -------|
    | UC-001 | BS-001 | IC-001-1, IC-001-2 | PC-001-1, PC-001-2 | Complete |
    | UC-003 | BS-003 | IC-003-1..6 | PC-003-1..6 | Complete |

    Coverage metrics:
    - Use cases with realizations: {N}/{M} ({%})
    - Methods with contracts: {N}/{M} ({%})
    - Methods with pseudo-code: {N}/{M} ({%})
    - Orphaned artifacts: {list}

    Save to: .aiwg/traceability/spec-to-code-matrix.md
    """
)
```

### Step 7: Present Summary

```
─────────────────────────────────────────────
Use Case Realization Complete
─────────────────────────────────────────────

**Use Cases Realized**: {N}
**Layer 3 (Behavioral Specs)**: {M} artifacts
**Layer 4 (Pseudo-Code)**: {P} specs
**Traceability Coverage**: {%}

**Artifacts by Type**:
- Realizations: .aiwg/requirements/realizations/ ({N} files)
- Interface Contracts: .aiwg/requirements/contracts/ ({M} files)
- State Machines: .aiwg/requirements/state-machines/ ({P} files)
- Decision Tables: .aiwg/requirements/decision-tables/ ({Q} files)
- Pseudo-Code: .aiwg/requirements/pseudocode/ ({R} files)
- Traceability: .aiwg/traceability/spec-to-code-matrix.md

**Review Status**:
- Security: {status}
- Testability: {status}
- Business Logic: {status}
- Traceability: {status}

**Next Steps**:
- Review generated specs for domain accuracy
- Run /flow-gate-check elaboration to validate ABM criteria
- Proceed to /flow-elaboration-to-construction when ready

─────────────────────────────────────────────
```

## Quality Gates

Before marking workflow complete, verify:
- [ ] All target use cases have realizations
- [ ] All reviews completed (≥3 reviewers per realization)
- [ ] MermaidJS diagrams render without errors
- [ ] Completeness checklists in each spec satisfied
- [ ] Traceability matrix generated and validated
- [ ] Pseudo-code specs reviewed against behavioral specs (if Layer 4 generated)

## Error Handling

**Missing Use Cases**:
```
❌ No use cases found in .aiwg/requirements/

Run /flow-inception-to-elaboration first to generate use case specifications.
```

**Missing SAD**:
```
❌ Software Architecture Document not found

Behavioral specifications require architecture context.
Run /flow-inception-to-elaboration to generate SAD first.
```

**Review Conflicts**:
```
⚠️ Security and performance reviewers disagree on {topic}

Options:
1. Accept security recommendation (safer)
2. Accept performance recommendation (faster)
3. Create ADR documenting trade-off

Escalating to user for decision...
```

## Success Criteria

This orchestration succeeds when:
- [ ] All target use cases have complete realizations (Layer 3)
- [ ] All realizations reviewed by ≥3 specialized agents
- [ ] Pseudo-code specs generated for target methods (Layer 4)
- [ ] Traceability chain validated: UC ↔ BS ↔ IC ↔ PC
- [ ] Coverage metric ≥80% of architecturally significant use cases

## References

**Templates** (via $AIWG_ROOT):
- Use Case Realization: `templates/analysis-design/use-case-realization-template.md`
- State Machine Spec: `templates/analysis-design/state-machine-spec-template.md`
- Decision Table: `templates/analysis-design/decision-table-template.md`
- Method Interface Contract: `templates/analysis-design/method-interface-contract-template.md`
- Activity Diagram Spec: `templates/analysis-design/activity-diagram-spec-template.md`
- Data Flow Spec: `templates/analysis-design/data-flow-spec-template.md`
- Pseudo-Code Spec: `templates/analysis-design/pseudocode-spec-template.md`

**Gate Criteria**:
- `flows/gate-criteria-by-phase.md` (Elaboration section 3a, 8a)

**Multi-Agent Pattern**:
- `docs/multi-agent-documentation-pattern.md`

**Orchestrator Architecture**:
- `docs/orchestrator-architecture.md`

**Parent Issue**: #745
