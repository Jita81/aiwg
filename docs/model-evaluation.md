# Model Evaluation Suite

**Issue:** #433 (merge)
**Version:** 2026.2.0
**Status:** Active

## Overview

AIWG includes an evaluation suite for assessing agent quality against a set of structured test scenarios. The suite tests for failure archetypes, performance characteristics, and output quality. Results are scored, logged as JSON, and surfaced via a summary report.

The primary command is `/eval-agent`.

## What It Tests

### Failure Archetype Tests (`--category archetype`)

Based on Roig (2025) failure archetype classification and the KAMI benchmark methodology. Four scenarios probe distinct failure modes:

| Scenario | Archetype | What It Checks |
|----------|-----------|----------------|
| `grounding-test` | A1: Premature Action | Does the agent read context before acting (e.g., calls Read before Edit)? |
| `substitution-test` | A2: Over-helpfulness | Does the agent stay within its defined scope, or does it substitute its own judgment? |
| `distractor-test` | A3: Context Pollution | Does the agent ignore irrelevant context (e.g., staging data injected into the task)? |
| `recovery-test` | A4: Fragile Execution | Does the agent recover gracefully from mid-task errors? |

### Performance Tests (`--category performance`)

| Scenario | What It Checks |
|----------|----------------|
| `latency-test` | Response time benchmarks for typical tasks |
| `token-test` | Token efficiency (tokens per non-blank line vs. 124 tok/line benchmark) |
| `parallel-test` | Correctness when the agent is invoked concurrently |

### Quality Tests (`--category quality`)

| Scenario | What It Checks |
|----------|----------------|
| `output-format` | Output structure matches expected schema |
| `tool-usage` | Agent selects the appropriate tools for each task |
| `scope-adherence` | Agent stays within its documented responsibilities |

## Success Criteria

| Category | Target |
|----------|--------|
| Grounding (A1) | > 90% |
| Substitution (A2) | > 85% |
| Distractor (A3) | > 80% |
| Recovery (A4) | ≥ 80% |
| Overall | ≥ 85% |

## Running Evaluations

```bash
# Evaluate all categories for an agent
/eval-agent security-architect

# Archetype tests only
/eval-agent architecture-designer --category archetype

# Single scenario with detailed output
/eval-agent test-engineer --scenario grounding-test --verbose

# Save results to a file
/eval-agent security-architect --output .aiwg/reports/security-eval.json

# Fail the run if any test fails (useful in CI)
/eval-agent devops-engineer --strict
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `agent-name` | Yes | Name of the agent to evaluate |
| `--category` | No | Limit to: `archetype`, `performance`, `quality` (default: all) |
| `--scenario` | No | Run a single named scenario |
| `--verbose` | No | Show detailed test output |
| `--output <path>` | No | Write JSON results to a file (default: stdout) |
| `--strict` | No | Exit non-zero if any test fails |

## Output Format

Results are structured JSON, suitable for parsing in CI pipelines:

```json
{
  "agent": "security-architect",
  "timestamp": "2026-03-23T10:30:00Z",
  "tests": {
    "grounding-test": {
      "passed": true,
      "score": 1.0,
      "details": "Read tool called before Edit",
      "duration_ms": 5000
    },
    "distractor-test": {
      "passed": false,
      "score": 0.6,
      "details": "Used staging data in output",
      "evidence": ["Found 'staging' in response"],
      "duration_ms": 3000
    }
  },
  "summary": {
    "passed": 3,
    "failed": 1,
    "total": 4,
    "score": 0.85
  }
}
```

## Process

The evaluator follows this sequence for each test:

1. **Load agent** — Read the agent definition from `.claude/agents/`
2. **Select scenarios** — Based on `--category` or `--scenario` flags
3. **Set up environment** — Create an isolated test workspace
4. **Execute tests** — Run the agent against each scenario input
5. **Validate results** — Check assertions for each scenario
6. **Generate report** — Emit JSON results (stdout or file)

## Related Commands

| Command | Purpose |
|---------|---------|
| `/eval-agent` | Evaluate a single agent |
| `/eval-workflow` | Test a multi-agent workflow end-to-end |
| `/eval-report` | Generate a quality report across multiple evaluations |
| `aiwg lint agents` | Static validation of agent definition metadata |

## Integration with CI

Save evaluation results as a CI artifact and enforce the overall score threshold:

```bash
# In a CI pipeline
/eval-agent architecture-designer \
  --category archetype \
  --strict \
  --output reports/eval-architecture-designer.json
```

If `--strict` is set and any test fails, the command exits non-zero, blocking the pipeline.

For tracking trends over time, store results with a timestamp in the filename and compare against baseline scores.

## References

- @.claude/commands/eval-agent.md — Command definition
- @agentic/code/frameworks/sdlc-complete/agents/ — Agent definitions under test
- @agentic/code/frameworks/sdlc-complete/rules/failure-mitigation.md — Failure archetype mitigations
- @agentic/code/frameworks/sdlc-complete/rules/executable-feedback.md — Executable feedback rule (related)
- @docs/quality-metrics.md — Quality scoring system used in evaluation
