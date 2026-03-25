# CI/CD Pipeline: {pipeline_name}

**Repository**: {repo_url}
**Last Updated**: {date}
**Owner**: {owner}

---

## Pipeline Overview

| Field | Value |
|-------|-------|
| Pipeline Name | {pipeline_name} |
| Platform | {platform} (Gitea Actions / GitHub Actions / GitLab CI) |
| Trigger | {trigger} (push to main / tag / PR / manual) |
| Builder Image | {builder_image} |
| Estimated Duration | {duration} |

---

## Trigger Configuration

| Event | Branches | Conditions |
|-------|----------|-----------|
| push | {branches} | {conditions} |
| pull_request | {branches} | {conditions} |
| tag | {tag_pattern} | {conditions} |
| schedule | {cron} | {conditions} |
| manual | — | {input_parameters} |

---

## Stages

### 1. Build

| Field | Value |
|-------|-------|
| Image | `{builder_image}` |
| Commands | See below |
| Artifacts | {build_artifacts} |
| Cache | {cache_config} |

```bash
{build_commands}
```

### 2. Test

| Field | Value |
|-------|-------|
| Image | `{test_image}` |
| Commands | See below |
| Coverage Threshold | {coverage_threshold} |
| Timeout | {test_timeout} |

```bash
{test_commands}
```

### 3. Security Scan (if applicable)

| Field | Value |
|-------|-------|
| Scanner | {scanner} (trivy / snyk / grype) |
| Fail On | {fail_severity} (CRITICAL / HIGH) |

```bash
{scan_commands}
```

### 4. Deploy

| Field | Value |
|-------|-------|
| Target | {deploy_target} |
| Method | {deploy_method} |
| Approval Required | {approval_required} |

```bash
{deploy_commands}
```

---

## Artifacts

| Artifact | Stage | Path | Retention |
|----------|-------|------|-----------|
| {artifact_name} | {stage} | {path} | {retention} |

---

## Secrets Required

> Never list secret values. Reference the secret store location only.

| Secret Name | Purpose | Source |
|-------------|---------|--------|
| `{secret_name}` | {purpose} | {source} (repository secrets / vault / env) |

---

## Runner Requirements

| Requirement | Value |
|------------|-------|
| Runner Type | {runner_type} (hosted / self-hosted) |
| Runner Labels | {labels} |
| OS | {runner_os} |
| Min Resources | {min_cpu}, {min_memory} |
| Required Tools | {required_tools} |

---

## Troubleshooting

### Common Failures

| Symptom | Cause | Fix |
|---------|-------|-----|
| {symptom_1} | {cause_1} | {fix_1} |
| {symptom_2} | {cause_2} | {fix_2} |

### Debug Steps

```bash
# Re-run with debug logging
{debug_command}

# Check runner status
{runner_status_command}

# View full logs
{log_command}
```

---

## Change Log

| Date | Change | By |
|------|--------|-----|
| {date} | {change} | {author} |
