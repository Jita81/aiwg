# Service Deployment: {Service Name}

## Purpose

Deploy, upgrade, or rollback {service name} across target hosts. This runbook covers the full deployment lifecycle including pre-flight checks, staged rollout, health verification at each stage, and rollback procedures. Every deployment gate must pass before proceeding to the next stage.

## System Topology

| Field | Value |
|-------|-------|
| Service | {service name} |
| Current version | {current version} |
| Target version | {target version} |
| Target host(s) | {hostnames or host group} |
| Deployment method | {systemd / docker / k8s / ansible} |
| Config path | {path to service configuration} |
| Binary / image | {path or registry URL} |
| Data directory | {path} |
| Log path | {path or "journal"} |
| Port(s) | {port list} |
| Health endpoint | {url — e.g., http://localhost:8080/healthz} |

## Prerequisites

- [ ] Target version tested in staging / dev environment
- [ ] Changelog reviewed for breaking changes
- [ ] Database migrations prepared (if applicable)
- [ ] Rollback procedure verified in staging
- [ ] Monitoring dashboards open: {dashboard-url}
- [ ] Backup of current configuration taken
- [ ] Maintenance window communicated (if applicable)
- [ ] No active incidents on target hosts

## Pre-Flight Checks

```bash
# Verify current service is healthy
systemctl is-active {service}
```
**Expected output:**
```
active
```

```bash
# Record current version for rollback reference
{service} --version
```
**Expected output:**
```
{service} v{current-version}
```

```bash
# Verify target artifact is available
ls -la {artifact-path}
# Or for container deployments:
# docker pull {registry}/{image}:{target-version}
```

```bash
# Snapshot current configuration
cp -a {config-path} {config-path}.bak.$(date +%Y%m%d-%H%M%S)
```

```bash
# Check disk space (need at least {minimum}MB free)
df -h {data-directory}
```
**Expected output:**
```
Filesystem      Size  Used Avail Use% Mounted on
/dev/...        ...   ...  {>minimum}  ...  ...
```

## Procedure

### Stage 1: Deploy to Canary (1 host)

**Gate**: Only proceed if pre-flight checks pass on the canary host.

```bash
# Stop service gracefully
systemctl stop {service}
```
**Expected output:** (no output on success)

```bash
# Deploy new version
# Option A: Binary replacement
cp {artifact-path}/{service}-{target-version} /usr/local/bin/{service}
chmod +x /usr/local/bin/{service}

# Option B: Package upgrade
# apt install -y {service}={target-version}

# Option C: Container image update
# docker compose -f {compose-file} pull
```

```bash
# Apply configuration changes (if any)
cp {new-config-path} {config-path}
```

```bash
# Run database migrations (if applicable)
{service} migrate --dry-run
{service} migrate
```

```bash
# Start service
systemctl start {service}
```

```bash
# Verify canary health
curl -sf http://localhost:{port}/healthz
```
**Expected output:**
```json
{"status": "ok", "version": "{target-version}"}
```

**Gate**: Wait {soak-duration — e.g., 10 minutes}. Check error rates and latency on monitoring dashboard.

```bash
# Check for errors in logs during soak period
journalctl -u {service} --since "-10min" --no-pager | grep -i error | head -20
```
**Expected output:**
```
(no error lines)
```

### Stage 2: Deploy to Remaining Hosts

**Gate**: Canary soak passed with no errors or anomalies.

```bash
# Repeat deployment on each remaining host
# For each host in {host-list}:
ssh {host} "systemctl stop {service}"
scp {artifact-path}/{service}-{target-version} {host}:/usr/local/bin/{service}
ssh {host} "chmod +x /usr/local/bin/{service} && systemctl start {service}"
```

```bash
# Verify health on all hosts
for host in {host-list}; do
  echo -n "$host: "
  ssh "$host" "curl -sf http://localhost:{port}/healthz | jq -r .version"
done
```
**Expected output:**
```
host-01: {target-version}
host-02: {target-version}
host-03: {target-version}
```

### Stage 3: Post-Deployment Validation

```bash
# End-to-end smoke test
{smoke-test-command}
```
**Expected output:**
```
{expected smoke test output}
```

```bash
# Verify no elevated error rates (check monitoring)
# Dashboard: {dashboard-url}
```

```bash
# Clean up backup configs (after soak period)
# rm {config-path}.bak.*
```

## Verification

```bash
# 1. Service running on all hosts
for host in {all-hosts}; do
  echo -n "$host: "
  ssh "$host" "systemctl is-active {service}"
done
```
**Expected output:**
```
host-01: active
host-02: active
host-03: active
```

```bash
# 2. Version correct on all hosts
for host in {all-hosts}; do
  echo -n "$host: "
  ssh "$host" "{service} --version"
done
```
**Expected output:**
```
host-01: {service} v{target-version}
host-02: {service} v{target-version}
```

```bash
# 3. Health endpoints responding
for host in {all-hosts}; do
  echo -n "$host: "
  curl -sf http://$host:{port}/healthz | jq -r .status
done
```
**Expected output:**
```
host-01: ok
host-02: ok
```

```bash
# 4. No error spike in logs
journalctl -u {service} --since "-30min" --no-pager | grep -ci error
```
**Expected output:**
```
0
```

## Rollback

**Trigger rollback if**: Health check fails, error rate spikes, or latency exceeds {threshold}.

```bash
# Stop service
systemctl stop {service}
```

```bash
# Restore previous binary
cp /usr/local/bin/{service}.bak /usr/local/bin/{service}
# Or reinstall previous version:
# apt install -y {service}={current-version}
```

```bash
# Restore previous configuration
cp {config-path}.bak.{timestamp} {config-path}
```

```bash
# Rollback database migrations (if applicable)
{service} migrate rollback --to {current-version}
```

```bash
# Start service
systemctl start {service}
```

```bash
# Verify rollback
curl -sf http://localhost:{port}/healthz
```
**Expected output:**
```json
{"status": "ok", "version": "{current-version}"}
```

## Troubleshooting

| Symptom | Likely Cause | Resolution |
|---------|-------------|------------|
| Service fails to start | Config syntax error | Check `journalctl -xeu {service}`, restore .bak config |
| Health endpoint returns 503 | Dependencies not ready | Check dependent services, retry after 30s |
| Connection refused on port | Service crashed on startup | Check logs, verify binary is correct architecture |
| Database migration fails | Schema conflict | Rollback migration, check migration scripts manually |
| High latency after deploy | Missing index or config regression | Compare new vs old config, check DB query plans |

## What NOT to Fix

- Load balancer drain timing — managed by LB configuration, not this runbook
- DNS propagation delays — allow TTL to expire naturally after endpoint changes
- Monitoring alert noise during deployment — expected during service restart windows

## Agent Rules

- DO: Follow staged rollout — canary first, then remaining hosts
- DO: Wait the full soak duration between stages
- DO: Run verification after every stage
- DO: Keep the rollback config backup until deployment is confirmed stable
- DO NOT: Deploy to all hosts simultaneously (skip canary)
- DO NOT: Delete backup configs before the soak period ends
- DO NOT: Proceed past a failed gate
- ESCALATE IF: Canary health check fails
- ESCALATE IF: Rollback does not restore healthy state
- ESCALATE IF: Database migration has no rollback path

## Audit Trail

| Field | Value |
|-------|-------|
| Author | {author} |
| Created | {date} |
| Last tested | {date} |
| Last modified | {date} |
| Applicable hosts | {host list} |
| Previous version | {current version} |
| Deployed version | {target version} |
