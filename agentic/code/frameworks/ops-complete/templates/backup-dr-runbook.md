# Backup and Disaster Recovery Runbook

## Purpose

Verify backups are valid and recoverable, and execute disaster recovery procedures in correct dependency order. This runbook covers routine backup verification, point-in-time restoration of individual services, and full-site disaster recovery. The recovery sequence is dependency-ordered — restoring services out of order will fail.

**Warning**: DR procedures may involve destructive operations (reformatting, reimaging). Confirm you are operating on the correct hosts and that this is an actual DR event, not a drill, before executing full-site recovery.

## System Topology

| Field | Value |
|-------|-------|
| Backup tool | {restic / borgbackup / rsync / Veeam / custom} |
| Backup repository | {path or URL — e.g., s3://backups/{org}, /mnt/backup-nas} |
| Repository passphrase | {credential store reference — NEVER inline} |
| Backup schedule | {schedule — e.g., daily 02:00 UTC} |
| Retention policy | {policy — e.g., 7 daily, 4 weekly, 12 monthly} |
| DR site | {location or "same site"} |
| RTO | {Recovery Time Objective — e.g., 4 hours} |
| RPO | {Recovery Point Objective — e.g., 24 hours} |

### Recovery Order

Services must be restored in dependency order. Do not skip ahead.

| Order | Service | Host(s) | Depends On | Estimated Time |
|-------|---------|---------|------------|----------------|
| 1 | DNS | {dns-host} | Network | {time} |
| 2 | Certificate Authority | {ca-host} | DNS | {time} |
| 3 | Database | {db-host} | DNS, CA | {time} |
| 4 | Authentication | {auth-host} | Database, CA | {time} |
| 5 | Application tier | {app-hosts} | Database, Auth | {time} |
| 6 | Reverse proxy / LB | {lb-host} | Application | {time} |
| 7 | Monitoring | {mon-host} | All above | {time} |

## Prerequisites

- [ ] Backup repository is accessible
- [ ] Repository passphrase is available from credential store
- [ ] Target hosts are provisioned (or can be provisioned)
- [ ] Network connectivity to backup repository confirmed
- [ ] DR plan reviewed within last 90 days

## Procedure: Verify Backups

Run this procedure regularly (minimum monthly) to confirm backups are recoverable.

### Step 1: Check Backup Integrity

```bash
# Verify repository integrity
bash <<'EOF'
export RESTIC_REPOSITORY="{backup-repo}"
export RESTIC_PASSWORD_COMMAND="cat {passphrase-file}"
restic check
EOF
```
**Expected output:**
```
using temporary cache in /tmp/...
repository ... opened successfully
...
no errors were found
```

### Step 2: List Recent Snapshots

```bash
bash <<'EOF'
export RESTIC_REPOSITORY="{backup-repo}"
export RESTIC_PASSWORD_COMMAND="cat {passphrase-file}"
restic snapshots --latest 5
EOF
```
**Expected output:**
```
ID        Time                 Host        Tags        Paths
---------------------------------------------------------------
{id}      {date}               {host}      {tags}      {paths}
...
5 snapshots
```

### Step 3: Test Restore to Temporary Location

```bash
# Restore latest snapshot to /tmp for verification
bash <<'EOF'
export RESTIC_REPOSITORY="{backup-repo}"
export RESTIC_PASSWORD_COMMAND="cat {passphrase-file}"
restic restore latest --target /tmp/backup-verify --include {critical-path}
EOF
```
**Expected output:**
```
restoring <Snapshot ... > to /tmp/backup-verify
```

```bash
# Verify restored files
ls -la /tmp/backup-verify/{critical-path}
```

```bash
# Verify data integrity (e.g., database dump can be loaded)
{database-tool} --verify /tmp/backup-verify/{db-dump-path}
```

```bash
# Clean up verification restore
rm -rf /tmp/backup-verify
```

### Step 4: Record Verification Result

```bash
# Log verification result
echo "$(date -Iseconds) BACKUP-VERIFY repo={backup-repo} result=PASS snapshots=$(restic snapshots --json | jq length)" >> /var/log/backup-verify.log
```

## Procedure: Restore Single Service

### Step 1: Stop the Service

```bash
systemctl stop {service}
```

### Step 2: Restore from Backup

```bash
# Restore specific paths from a specific snapshot
bash <<'EOF'
export RESTIC_REPOSITORY="{backup-repo}"
export RESTIC_PASSWORD_COMMAND="cat {passphrase-file}"

# List snapshots for this host/path to find the right one
restic snapshots --host {hostname} --path {service-data-path}

# Restore (replace {snapshot-id} with chosen snapshot)
restic restore {snapshot-id} --target / --include {service-data-path}
EOF
```
**Expected output:**
```
restoring <Snapshot {id}> to /
```

### Step 3: Restore Database (if applicable)

```bash
# Restore database from dump
{database-tool} restore {dump-file} --database {database-name}
```

### Step 4: Start and Verify Service

```bash
systemctl start {service}
```

```bash
# Verify service health
curl -sf http://localhost:{port}/healthz
```
**Expected output:**
```json
{"status": "ok"}
```

## Procedure: Full-Site Disaster Recovery

**This is the ordered recovery sequence. Follow the Recovery Order table above strictly.**

### Phase 1: Infrastructure (DNS, CA)

```bash
# 1. Restore DNS server
# Provision host (see host-standup.md for {dns-host})
# Restore zone files from backup
bash <<'EOF'
export RESTIC_REPOSITORY="{backup-repo}"
export RESTIC_PASSWORD_COMMAND="cat {passphrase-file}"
restic restore latest --target / --host {dns-host} --include /etc/bind
EOF
systemctl start named
```

```bash
# Verify DNS resolves
dig @{dns-host-ip} {critical-domain}
```
**Expected output:**
```
;; ANSWER SECTION:
{critical-domain}.    ...    IN    A    {expected-ip}
```

```bash
# 2. Restore Certificate Authority
# Restore CA keys and certificates (see cert-ops-runbook.md)
bash <<'EOF'
export RESTIC_REPOSITORY="{backup-repo}"
export RESTIC_PASSWORD_COMMAND="cat {passphrase-file}"
restic restore latest --target / --host {ca-host} --include /etc/ssl/ca
EOF
```

```bash
# Verify CA
openssl x509 -in /etc/ssl/ca/root-ca.pem -noout -subject -dates
```

### Phase 2: Data Tier (Database)

```bash
# Restore database server
bash <<'EOF'
export RESTIC_REPOSITORY="{backup-repo}"
export RESTIC_PASSWORD_COMMAND="cat {passphrase-file}"
restic restore latest --target / --host {db-host} --include /var/lib/{database}
EOF
systemctl start {database}
```

```bash
# Verify database
{database-client} -e "SELECT 1"
```
**Expected output:**
```
1
```

### Phase 3: Application Tier

```bash
# Restore each application host in order
for host in {app-hosts}; do
  echo "Restoring $host..."
  bash <<EOF
  export RESTIC_REPOSITORY="{backup-repo}"
  export RESTIC_PASSWORD_COMMAND="cat {passphrase-file}"
  restic restore latest --target / --host "$host" --include /opt/{service}
EOF
  ssh "$host" "systemctl start {service}"
done
```

### Phase 4: Edge and Monitoring

```bash
# Restore reverse proxy / load balancer
bash <<'EOF'
export RESTIC_REPOSITORY="{backup-repo}"
export RESTIC_PASSWORD_COMMAND="cat {passphrase-file}"
restic restore latest --target / --host {lb-host} --include /etc/nginx
EOF
systemctl start nginx
```

```bash
# Restore monitoring
bash <<'EOF'
export RESTIC_REPOSITORY="{backup-repo}"
export RESTIC_PASSWORD_COMMAND="cat {passphrase-file}"
restic restore latest --target / --host {mon-host} --include /etc/prometheus /var/lib/grafana
EOF
systemctl start prometheus grafana-server
```

## Verification

```bash
# 1. All services in recovery order are running
for svc in {dns-service} {ca-service} {db-service} {auth-service} {app-service} {lb-service} {mon-service}; do
  echo -n "$svc: "
  systemctl is-active "$svc"
done
```

```bash
# 2. End-to-end health check
curl -sf https://{primary-domain}/healthz
```
**Expected output:**
```json
{"status": "ok"}
```

```bash
# 3. Data integrity spot check
{database-client} -e "SELECT COUNT(*) FROM {critical-table}"
```

```bash
# 4. Monitoring is collecting metrics
curl -sf http://{mon-host}:9090/api/v1/targets | jq '.data.activeTargets | length'
```

## Troubleshooting

| Symptom | Likely Cause | Resolution |
|---------|-------------|------------|
| `repository does not exist` | Wrong repo path or credentials | Verify RESTIC_REPOSITORY and passphrase |
| Restore fails with permission denied | Target directory not writable | Check mount permissions, run as root |
| Database restore fails with version mismatch | Backup from different DB version | Install matching DB version first |
| Service starts but can't reach dependencies | Recovery order violated | Stop service, restore dependencies first |
| Partial snapshot (missing files) | Backup job was interrupted | Use previous complete snapshot |

## What NOT to Fix

- Network switch configuration — handled by network team, separate from this runbook
- Hypervisor recovery — separate runbook for host-level disaster recovery
- External DNS (registrar) — only internal DNS zones are covered here

## Agent Rules

- DO: Follow the recovery order exactly — never skip ahead
- DO: Verify each phase before starting the next
- DO: Use the heredoc pattern for backup credentials (token does not persist in shell history)
- DO: Test restores to temporary locations before overwriting production data
- DO NOT: Restore to production paths without confirming this is an actual DR event
- DO NOT: Store or log backup repository passphrases
- DO NOT: Delete backup snapshots as part of recovery
- ESCALATE IF: Backup repository is inaccessible or corrupted
- ESCALATE IF: Most recent snapshot is older than RPO
- ESCALATE IF: Database restore fails integrity checks

## Audit Trail

| Field | Value |
|-------|-------|
| Author | {author} |
| Created | {date} |
| Last tested | {date — DR drill date} |
| Last modified | {date} |
| RTO achieved | {actual recovery time in last drill} |
| RPO achieved | {actual data loss window in last drill} |
