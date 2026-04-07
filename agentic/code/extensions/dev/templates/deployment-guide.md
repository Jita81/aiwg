# Deployment Guide: {service-name}

## Purpose

Step-by-step procedure for deploying {service-name} to a target environment. Covers pre-deployment checks, deployment execution (Docker and systemd variants), post-deployment verification, and rollback. Agents must not proceed past gate steps without human authorization. All state changes are logged.

## Prerequisites

- [ ] Deployment artifact available at `{registry}/{service-name}:{version}` (Docker) or `{artifact-path}` (binary/package)
- [ ] Sufficient disk space on target host: `df -h {deploy-path}` — at least {min-disk} free
- [ ] Target service dependencies reachable (database, message broker, external APIs)
- [ ] Environment configuration file present: `/etc/opt/{service-name}/{env}.env`
- [ ] SSH access to target host confirmed
- [ ] On-call contact notified if deploying outside business hours

## System Topology

| Component | Value |
|-----------|-------|
| Service | {service-name} |
| Version | {version} |
| Target host(s) | {target-host} |
| OS | {os-version} |
| Deploy path | {deploy-path} |
| Registry | {registry} |
| Port | {service-port} |
| Systemd unit | {unit-name}.service (if systemd variant) |

---

## Pre-Deployment Checks

### Check 1: Disk Space

```bash
ssh {target-host} "df -h {deploy-path}"
```

**Expected output:**

```
Filesystem      Size  Used Avail Use%
/dev/sdX        ...   ...  {min-disk}+  <90%   {deploy-path}
```

Abort if available space is below {min-disk}.

### Check 2: Dependencies Reachable

```bash
# Database connectivity
ssh {target-host} "{db-check-command}"

# External API reachable
ssh {target-host} "curl -sf {external-api-health-url}"
```

**Expected output:**

```
{db-check-success-output}
{"status":"ok"}
```

### Check 3: Configuration Present

```bash
ssh {target-host} "ls -l /etc/opt/{service-name}/{env}.env"
```

**Expected output:**

```
-rw------- 1 {service-user} {service-user} {size} {date} /etc/opt/{service-name}/{env}.env
```

If the file is missing, create it from the configuration template before proceeding.

---

## Deployment — Docker Variant

Use this procedure when the service runs as a Docker container.

### Step 1: Pull Image

```bash
ssh {target-host} "docker pull {registry}/{service-name}:{version}"
```

**Expected output:**

```
{version}: Pulling from {registry}/{service-name}
Status: Downloaded newer image for {registry}/{service-name}:{version}
```

### Step 2: Stop and Remove Old Container

```bash
ssh {target-host} "
  docker stop {service-name} || true
  docker rm   {service-name} || true
"
```

**Expected output:**

```
{service-name}
{service-name}
```

No error if the container did not previously exist (first deploy).

### Step 3: Start New Container

```bash
ssh {target-host} "
  docker run -d \
    --name {service-name} \
    --restart unless-stopped \
    --env-file /etc/opt/{service-name}/{env}.env \
    -p {service-port}:8080 \
    --log-driver json-file \
    --log-opt max-size=50m \
    --log-opt max-file=3 \
    {registry}/{service-name}:{version}
"
```

**Expected output:**

```
{container-id}
```

### Step 4: Verify Container Started

```bash
ssh {target-host} "docker ps --filter name={service-name} --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'"
```

**Expected output:**

```
NAMES            IMAGE                                  STATUS
{service-name}   {registry}/{service-name}:{version}   Up N seconds
```

---

## Deployment — Systemd Variant

Use this procedure when the service runs as a systemd unit (binary or package install).

### Step 1: Transfer Artifact

```bash
scp {artifact-path} {target-host}:{deploy-path}/{service-name}-{version}
ssh {target-host} "chmod 755 {deploy-path}/{service-name}-{version}"
```

**Expected output:**

```
{artifact-name}                 100%  {size}  {speed}
```

### Step 2: Update Symlink

```bash
ssh {target-host} "
  ln -sf {deploy-path}/{service-name}-{version} {deploy-path}/{service-name}
  ls -la {deploy-path}/{service-name}
"
```

**Expected output:**

```
{deploy-path}/{service-name} -> {deploy-path}/{service-name}-{version}
```

### Step 3: Restart Service

```bash
ssh {target-host} "
  systemctl restart {unit-name}.service
  systemctl is-active {unit-name}.service
"
```

**Expected output:**

```
active
```

### Step 4: Check Service Logs

```bash
ssh {target-host} "journalctl -u {unit-name}.service -n 30 --no-pager"
```

**Expected output:**

```
... {service-name} started, listening on :{service-port}
```

---

## Post-Deployment Verification

Run these checks after either deployment variant:

```bash
# Health endpoint
curl -sf https://{target-host}/health | jq .

# Version confirmation
curl -sf https://{target-host}/version

# Check for error spike in logs (Docker)
ssh {target-host} "docker logs {service-name} --tail 50 2>&1 | grep -c ERROR || true"

# Check for error spike in logs (systemd)
ssh {target-host} "journalctl -u {unit-name}.service -n 50 --no-pager | grep -c ERROR || true"
```

**Expected output:**

```json
{"status": "ok", "version": "{version}"}
{version}
0
```

An error count above 0 in the first 60 seconds of startup warrants investigation before declaring the deployment successful.

---

## Rollback

If health checks fail or a critical issue is found, roll back to the previous version.

**Docker rollback:**

```bash
PREV_VERSION="{previous-version}"

ssh {target-host} "
  docker stop {service-name} || true
  docker rm   {service-name} || true
  docker run -d \
    --name {service-name} \
    --restart unless-stopped \
    --env-file /etc/opt/{service-name}/{env}.env \
    -p {service-port}:8080 \
    {registry}/{service-name}:${PREV_VERSION}
"

# Verify rollback
curl -sf https://{target-host}/health
```

**Systemd rollback:**

```bash
PREV_VERSION="{previous-version}"

ssh {target-host} "
  ln -sf {deploy-path}/{service-name}-${PREV_VERSION} {deploy-path}/{service-name}
  systemctl restart {unit-name}.service
  systemctl is-active {unit-name}.service
"

curl -sf https://{target-host}/health
```

After rollback, open a pipeline incident report using the `pipeline-incident` template.

---

## Troubleshooting

| Symptom | Likely Cause | Resolution |
|---------|-------------|------------|
| Container exits immediately after start | Missing env var or bad config | `docker logs {service-name}`; compare env file against template |
| Health endpoint returns 502/503 | Service not ready yet | Wait 30 s; check logs for startup errors |
| Port already in use | Previous container not stopped | `docker ps -a`; remove stale container |
| Image pull fails | Registry credentials expired | Re-authenticate with registry; check token expiry |
| systemd unit stays in `activating` | Startup probe timeout | Increase `TimeoutStartSec` or check logs for blocking call |
| Disk full on target | Large image or log accumulation | `docker system prune`; clean old deployments in `{deploy-path}` |

---

## Agent Rules

- DO: Complete all pre-deployment checks before touching the running service
- DO: Capture the previous version before stopping the old container or relinking the binary
- DO: Verify health endpoint returns HTTP 200 before closing the deployment
- DO NOT: Remove the previous image or binary until health is confirmed
- DO NOT: Use `:latest` image tags in production deployments
- DO NOT: Skip post-deployment verification steps
- ESCALATE IF: Health check does not return 200 within 5 minutes of deploy
- ESCALATE IF: Error count in logs exceeds {error-threshold} per minute after startup

## Audit Trail

| Field | Value |
|-------|-------|
| Author | {author} |
| Created | {date} |
| Last tested | {date} |
| Last modified | {date} |
| Related issue | #775 |
