# Application Profile: {service_name}

**Version**: {version}
**Owner**: {owner}
**Last Updated**: {date}
**Status**: {status} (active / deprecated / planned)

---

## Service Overview

| Field | Value |
|-------|-------|
| Service Name | {service_name} |
| Purpose | {purpose} |
| Type | {type} (web app / API / daemon / scheduled job) |
| Repository | {repo_url} |
| Language / Runtime | {language} {runtime_version} |
| License | {license} |

---

## Architecture

### Deployment Topology

| Component | Host(s) | Port(s) | Protocol |
|-----------|---------|---------|----------|
| {component_name} | {hostname} | {port} | {protocol} |

### Dependencies

| Dependency | Type | Version | Required | Notes |
|-----------|------|---------|----------|-------|
| {dep_name} | {database / cache / API / service} | {version} | {yes / no} | {notes} |

### Data Flow

```
{upstream_source} → {service_name} → {downstream_target}
```

---

## Deployment

### Method

| Field | Value |
|-------|-------|
| Deployment Method | {method} (Docker / systemd / Kubernetes / bare metal) |
| Image / Package | {image_or_package} |
| Configuration | {config_location} |
| Secrets | {secrets_reference} (never list actual values) |

### Environment Variables

| Variable | Purpose | Source |
|----------|---------|--------|
| {var_name} | {purpose} | {source} (env file / vault / configmap) |

### Deployment Command

```bash
{deployment_command}
```

---

## Health Checks

| Check | Endpoint / Command | Expected Result | Interval |
|-------|-------------------|-----------------|----------|
| Liveness | {liveness_check} | {expected} | {interval} |
| Readiness | {readiness_check} | {expected} | {interval} |
| Deep Health | {deep_health_check} | {expected} | {interval} |

---

## Monitoring

| Metric | Source | Alert Threshold | Escalation |
|--------|--------|----------------|------------|
| {metric_name} | {source} | {threshold} | {escalation_target} |

### Log Locations

| Log | Path / Stream | Retention |
|-----|--------------|-----------|
| Application | {app_log_path} | {retention} |
| Access | {access_log_path} | {retention} |
| Error | {error_log_path} | {retention} |

---

## Disaster Recovery

| Field | Value |
|-------|-------|
| RTO | {rto} |
| RPO | {rpo} |
| Backup Method | {backup_method} |
| Recovery Runbook | {runbook_reference} |
| Last DR Test | {last_dr_test_date} |

### Data Persistence

| Data Store | Location | Backup Schedule | Recovery Method |
|-----------|----------|----------------|-----------------|
| {store_name} | {location} | {schedule} | {recovery_method} |

---

## Contacts

| Role | Name | Contact |
|------|------|---------|
| Service Owner | {owner_name} | {contact} |
| On-Call | {oncall_team} | {contact} |
| Escalation | {escalation_name} | {contact} |

---

## Change Log

| Date | Version | Change | By |
|------|---------|--------|-----|
| {date} | {version} | {change} | {author} |
