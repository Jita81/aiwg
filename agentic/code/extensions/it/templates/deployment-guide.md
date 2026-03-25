# Deployment Guide: {service_name}

**Version**: {version}
**Target Environment**: {environment} (production / staging / dev)
**Last Deployed**: {last_deploy_date}
**Deployment Method**: {method}
**Owner**: {owner}

---

## Pre-Deployment Checks

- [ ] All tests passing in CI: {ci_url}
- [ ] Version tag created: `{version_tag}`
- [ ] Changelog updated
- [ ] Dependencies up to date and pinned
- [ ] Configuration changes documented: {config_changes}
- [ ] Database migrations prepared: {migration_status}
- [ ] Rollback procedure reviewed (see below)
- [ ] Monitoring dashboards accessible: {dashboard_url}
- [ ] On-call engineer aware: {oncall_contact}

---

## Deployment Procedure

### Step 1: Prepare

```bash
# Pull latest version
{pull_command}

# Verify artifact integrity
{verify_command}

# Backup current state
{backup_command}
```

### Step 2: Deploy

```bash
# Apply database migrations (if any)
{migration_command}

# Deploy new version
{deploy_command}

# Wait for readiness
{readiness_wait_command}
```

### Step 3: Verify

```bash
# Health check
{health_check_command}

# Smoke test
{smoke_test_command}

# Verify version deployed
{version_check_command}
```

**Expected**: Health check returns `200`, version reports `{version}`.

---

## Health Verification

| Check | Command | Expected | Timeout |
|-------|---------|----------|---------|
| Liveness | `{liveness_cmd}` | {expected} | {timeout} |
| Readiness | `{readiness_cmd}` | {expected} | {timeout} |
| Dependencies | `{deps_cmd}` | {expected} | {timeout} |
| Smoke Test | `{smoke_cmd}` | {expected} | {timeout} |

### Watch Period

After deployment, monitor for {watch_duration}:

```bash
# Tail logs for errors
{log_tail_command}

# Watch key metrics
{metrics_watch_command}
```

**Proceed if**: No errors in logs, latency within baseline, error rate below {error_threshold}.

---

## Rollback Procedure

If issues detected during watch period or health verification fails:

### Immediate Rollback

```bash
# Revert to previous version
{rollback_command}

# Verify rollback successful
{rollback_verify_command}

# Revert database migrations (if applicable)
{migration_rollback_command}
```

### Rollback Verification

```bash
# Confirm previous version running
{version_check_command}

# Health check
{health_check_command}

# Verify data integrity
{data_check_command}
```

### Rollback Decision Matrix

| Condition | Action |
|-----------|--------|
| Health check fails within {timeout} | Automatic rollback |
| Error rate > {error_threshold} | Manual rollback decision |
| Latency > {latency_threshold} for > {duration} | Manual rollback decision |
| Data corruption detected | Immediate rollback + incident |
| Single transient error | Monitor, do not rollback |

---

## Monitoring Setup

### Dashboards

| Dashboard | URL | Purpose |
|-----------|-----|---------|
| {dashboard_name} | {url} | {purpose} |

### Alerts

| Alert | Condition | Severity | Notification |
|-------|-----------|----------|-------------|
| {alert_name} | {condition} | {severity} | {notification_channel} |

---

## Post-Deployment

- [ ] Verify all health checks green
- [ ] Watch period completed without issues
- [ ] Deployment logged in change management
- [ ] Stakeholders notified
- [ ] Monitoring confirmed operational
- [ ] Documentation updated if configuration changed

---

## Notes

{additional_notes}
