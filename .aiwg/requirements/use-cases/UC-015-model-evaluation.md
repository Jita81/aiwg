# Use Case Specification: UC-015 - Model Evaluation Suite

---
document: Use Case Specification
use-case-id: UC-015
use-case-name: Model Evaluation Suite for AIWG Operational Compatibility
project: AI Writing Guide - SDLC Framework
version: 1.0
status: APPROVED
created: 2026-03-23
author: Requirements Analyst
phase: Construction
priority: P1 (High)
feature-id: FID-433
complexity: MEDIUM
estimated-effort: M (Medium)
---

## 1. Use Case Summary

### 1.1 Brief Description

Developers and CI pipelines evaluate local and cloud AI models against a standardized AIWG benchmark suite to determine operational compatibility. The suite measures whether a candidate model can reliably produce AIWG-compliant artifacts (correct format, traceability links, schema validity) and meets minimum performance thresholds before being recommended for use.

### 1.2 Primary Actor

**Developer** (evaluating a model for use with AIWG)

### 1.3 Secondary Actors

- **CI Pipeline** (automated evaluation on model version changes or AIWG releases)

### 1.4 Supporting Actors

- **AIWG Orchestrator** (Claude Code core platform)
- **Evaluation Agent** (runs benchmarks, scores results)
- **Model Registry** (records evaluation results per model version)

### 1.5 Stakeholders and Interests

| Stakeholder | Interest |
|-------------|----------|
| **Developer** | Know which models work reliably with AIWG before committing to one |
| **Enterprise Team** | Reproducible evaluation results for compliance and vendor selection |
| **Framework Maintainer** | Track model compatibility across AIWG releases; catch regressions |
| **CI Pipeline** | Automated gate: block AIWG release if reference model scores degrade |

## 2. Relationship to Other Use Cases

### 2.1 Dependencies (Prerequisites)

- **UC-002** (@.aiwg/requirements/use-cases/UC-002-deploy-sdlc-framework.md): Framework must be deployed to run evaluation suite
- **UC-007** (@.aiwg/requirements/use-cases/UC-007-metrics-collection.md): Evaluation results feed metrics tracking

### 2.2 Enables

- Framework release gating: CI pipeline blocks releases where reference model scores degrade

## 3. Preconditions

1. AIWG framework deployed in evaluation environment
2. Candidate model accessible (local via Ollama/llama.cpp or cloud via API key)
3. Evaluation fixtures present in `test/evaluation/fixtures/`
4. Baseline scores available for comparison (`.aiwg/reports/model-evaluation-baseline.yaml`)

## 4. Postconditions

**Success Postconditions:**
- Evaluation report generated: `.aiwg/reports/model-evaluation-{model-id}-{date}.yaml`
- Pass/fail verdict per benchmark category
- Overall compatibility rating: `compatible` / `partial` / `incompatible`
- Results appended to model registry: `.aiwg/reports/model-registry.yaml`

**Failure Postconditions:**
- Model unreachable: evaluation aborted; error report with remediation steps
- Evaluation fixture missing: partial run; results marked incomplete
- Score below baseline: report generated with regression details; CI gate blocks if in pipeline mode

## 5. Trigger

Developer runs `aiwg evaluate --model <model-id>` or CI pipeline triggers evaluation job on schedule or pull request.

## 6. Main Success Scenario

1. **Developer initiates evaluation**: `aiwg evaluate --model ollama/llama3.3`
2. **Orchestrator validates preconditions**: model reachable, fixtures present, baseline loaded.
3. **Evaluation Agent executes benchmark suite** (6 categories, each with 3-5 fixture tasks):

   | Category | What it measures |
   |----------|-----------------|
   | Artifact format compliance | Produced artifacts match expected schema |
   | Traceability link generation | @-mentions correctly generated and valid |
   | Instruction follow accuracy | Agent follows multi-step SDLC instructions |
   | Constraint adherence | Grounding constraints respected in output |
   | Synthesis quality | Conflicting inputs resolved correctly |
   | Token budget discipline | Output stays within expected bounds |

4. **Scoring**: Each category scored 0–100; weighted composite score calculated.
5. **Baseline comparison**: Composite score compared to baseline; regression flagged if delta > 5 points.
6. **Report written** to `.aiwg/reports/model-evaluation-{model-id}-{date}.yaml`.
7. **Developer receives summary**: compatibility verdict, category breakdown, recommended use cases (or disqualifying failures).

## 7. Extensions (Alternative Flows)

**7a. CI pipeline mode** (`--ci` flag):
- Evaluation runs headless
- Exit code 0 (pass) or 1 (fail) for pipeline integration
- Detailed results artifact uploaded for inspection

**7b. Partial evaluation** (developer specifies category subset):
- `aiwg evaluate --model <id> --categories artifact-format,traceability`
- Only specified categories run; composite score not computed

**7c. New baseline establishment**:
- `aiwg evaluate --model <id> --set-baseline`
- Current results replace baseline after developer confirmation
- Previous baseline archived

## 8. Non-Functional Requirements

- Full suite runtime: <10 minutes for cloud models, <30 minutes for local models
- Results reproducible: same model + same fixtures → same score (±2 points)
- Fixture coverage: minimum 30 tasks across 6 categories

## 9. Related Artifacts

- @agentic/code/frameworks/sdlc-complete/agents/evaluation-agent.md
- @.aiwg/architecture/decisions/ADR-019-yaml-metalanguage.md (schema definitions used in fixture validation)
- @.aiwg/requirements/use-cases/UC-007-metrics-collection.md
- test/evaluation/fixtures/ (benchmark task fixtures)
