---
name: dev-pipeline-audit
description: Pipeline health analysis — runner capacity, build times, failure rates, bottleneck detection
trigger: when the operator requests CI/CD audit, pipeline health check, or build performance analysis
---

# Pipeline Health Audit

## Purpose

Analyze CI/CD pipeline health across projects. Identify bottlenecks, measure reliability, assess runner capacity, and produce actionable recommendations.

## Workflow

### 1. Collect Pipeline Data

For each project's CI configuration:

- Parse workflow files to understand pipeline structure
- Identify stages, dependencies, and parallelism
- Note runner requirements and resource constraints

### 2. Analyze Build Times

Review recent pipeline runs:

| Project | Avg Duration | P95 Duration | Trend | Bottleneck Stage |
|---------|-------------|-------------|-------|-----------------|
| {project} | {avg} | {p95} | {trend} | {stage} |

Identify:
- Stages that consume disproportionate time
- Cache misses causing slow installs
- Sequential stages that could be parallel

### 3. Analyze Failure Rates

| Project | Total Runs | Pass Rate | Top Failure Cause | Flaky Tests |
|---------|-----------|-----------|-------------------|-------------|
| {project} | {total} | {pass_rate} | {top_cause} | {flaky_count} |

Classify failures:
- **Legitimate**: Code/test issue (expected)
- **Infrastructure**: Runner timeout, OOM, network (actionable)
- **Flaky**: Intermittent, non-deterministic (quarantine candidates)

### 4. Assess Runner Capacity

| Runner | Type | Queue Time | Utilization | Projects |
|--------|------|-----------|-------------|----------|
| {runner} | {type} | {avg_queue} | {utilization}% | {project_count} |

Flag:
- Runners with consistently high queue times
- Underutilized runners that could be consolidated
- Missing self-hosted runners for resource-intensive builds

### 5. Check Pipeline Safety

Scan all workflow files for pipeline safety violations (see dev-pipeline-safety rule):

| Project | Issue | Severity | Location |
|---------|-------|----------|----------|
| {project} | {issue} | {severity} | {file}:{line} |

### 6. Produce Report

```markdown
## Pipeline Health Report
**Date**: {date}
**Projects Audited**: {count}

### Summary
- Overall pass rate: {overall_pass_rate}%
- Average build time: {avg_build_time}
- Pipeline safety violations: {violation_count}

### Recommendations
1. {recommendation_1} — Expected impact: {impact_1}
2. {recommendation_2} — Expected impact: {impact_2}

### Action Items
- [ ] {action_1} (priority: {priority})
- [ ] {action_2} (priority: {priority})
```

## Output

- Pipeline health report
- Per-project build time analysis
- Failure classification and flaky test list
- Runner capacity assessment
- Safety violation inventory
- Prioritized recommendation list
