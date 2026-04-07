# Release Runbook: {project} {version}

## Purpose

Procedure for cutting a release of {project}: tag creation, build pipeline trigger, artifact promotion from staging to production, health verification, and rollback. Agents executing this runbook must not proceed past any gate step without explicit human authorization. All actions are logged in the audit trail.

## Prerequisites

- [ ] All CI checks passing on the release commit
- [ ] CHANGELOG updated for {version}
- [ ] `package.json` (or equivalent) version bumped to {version}
- [ ] UAT suite passing: `npm run uat` (or project equivalent)
- [ ] Staging environment healthy and running the release candidate
- [ ] Registry credentials available and valid
- [ ] On-call engineer notified of deployment window

## System Topology

| Component | Value |
|-----------|-------|
| Project | {project} |
| Version | {version} |
| Registry | {registry} |
| Staging host(s) | {staging-host} |
| Production host(s) | {production-host} |
| Artifact manifest | {artifact-manifest-path} |

## Procedure

### Step 1: Verify Release Commit

```bash
# Confirm version bump and clean working tree
git diff HEAD
git log --oneline -5
grep '"version"' package.json
```

**Expected output:**

```
No diff output (clean tree)
Recent commits showing changelog + version bump
"version": "{version}"
```

### Step 2: Create and Push Release Tag

```bash
# Create annotated tag
git tag -m "v{version}" v{version}

# Push tag to origin
git push origin main --tags
```

**Expected output:**

```
To git.integrolabs.net:{owner}/{project}.git
 * [new tag]         v{version} -> v{version}
```

### Step 3: Confirm Build Pipeline Triggered

```bash
# Check CI status via Gitea API
bash <<'EOF'
TOKEN=$(cat ~/.config/gitea/token)
curl -s -H "Authorization: token $TOKEN" \
  "https://git.integrolabs.net/api/v1/repos/{owner}/{project}/actions/tasks?limit=5"
EOF
```

**Expected output:**

```
Pipeline for v{version} tag in "running" or "success" state within 60 seconds of tag push.
```

Wait for pipeline completion before proceeding. Build produces:
- `{registry}/{project}:{git-sha}` — immutable image tagged with commit SHA
- `{registry}/{project}:v{version}` — version tag
- Digest recorded to `{artifact-manifest-path}`

### Step 4: Verify Staged Artifact

```bash
# Pull and inspect the release image from staging
docker pull {registry}/{project}:v{version}
docker inspect {registry}/{project}:v{version} | grep -E '"Id"|"Created"|"Tag"'

# Confirm digest matches artifact manifest
cat {artifact-manifest-path} | grep v{version}
```

**Expected output:**

```
"Id": "sha256:{expected-digest}",
"Created": "{build-timestamp}",
digest: sha256:{expected-digest}  # matches manifest
```

### Step 5: Run Staging Smoke Test

```bash
# Deploy release candidate to staging (if not already running)
ssh {staging-host} "docker pull {registry}/{project}:v{version} && \
  docker stop {project}-staging || true && \
  docker run -d --name {project}-staging \
    --env-file /etc/opt/{project}/staging.env \
    -p {staging-port}:8080 \
    {registry}/{project}:v{version}"

# Run smoke test suite against staging
{smoke-test-command} --target https://{staging-host}:{staging-port}
```

**Expected output:**

```
All smoke tests passed (N/N)
Service version: v{version}
Health: OK
```

### Step 6: Promote to Production (Gate — Human Authorization Required)

> **GATE**: Agent must pause here and confirm with the operator before proceeding. Production deployment is irreversible until rollback is executed.

```bash
# Pull release image on production host
ssh {production-host} "docker pull {registry}/{project}:v{version}"
```

**Expected output:**

```
v{version}: Pulling from {registry}/{project}
Status: Image is up to date for {registry}/{project}:v{version}
```

### Step 7: Stop Old and Start New on Production

```bash
ssh {production-host} "
  docker stop {project} || true
  docker rm {project} || true
  docker run -d --name {project} \
    --restart unless-stopped \
    --env-file /etc/opt/{project}/production.env \
    -p {production-port}:8080 \
    {registry}/{project}:v{version}
"
```

**Expected output:**

```
{container-id}
```

### Step 8: Verify Production Health

```bash
# Wait for startup
sleep 10

# Check health endpoint
curl -sf https://{production-host}/health | jq .

# Confirm running version
curl -sf https://{production-host}/version
```

**Expected output:**

```json
{"status": "ok", "version": "v{version}"}
```

### Step 9: Record Release in Issue Tracker

```bash
bash <<'EOF'
TOKEN=$(cat ~/.config/gitea/token)
curl -s -X POST -H "Authorization: token $TOKEN" \
  -H "Content-Type: application/json" \
  "https://git.integrolabs.net/api/v1/repos/{owner}/{project}/releases" \
  -d '{
    "tag_name": "v{version}",
    "name": "v{version}",
    "body": "Release v{version}\n\nSee CHANGELOG.md for details.",
    "draft": false,
    "prerelease": false
  }'
EOF
```

**Expected output:**

```json
{"id": ..., "tag_name": "v{version}", "name": "v{version}"}
```

## Verification

```bash
# Full health verification
curl -sf https://{production-host}/health
curl -sf https://{production-host}/version
docker ps --filter name={project} --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
```

**Expected output:**

```
{"status":"ok","version":"v{version}"}
{"version":"v{version}"}
{project}   {registry}/{project}:v{version}   Up N seconds
```

## Rollback

If production health check fails or a critical defect is discovered post-deploy:

```bash
# Identify the previous image (check docker history or artifact manifest)
PREV_VERSION="{previous-version}"

ssh {production-host} "
  docker stop {project} || true
  docker rm {project} || true
  docker run -d --name {project} \
    --restart unless-stopped \
    --env-file /etc/opt/{project}/production.env \
    -p {production-port}:8080 \
    {registry}/{project}:${PREV_VERSION}
"

# Verify rollback health
curl -sf https://{production-host}/health
curl -sf https://{production-host}/version
```

After rollback, open a postmortem issue linking to this runbook and the pipeline incident template.

## Troubleshooting

| Symptom | Likely Cause | Resolution |
|---------|-------------|------------|
| Tag push rejected | Branch protection / wrong branch | Confirm on `main`, check protection rules |
| Pipeline not triggered on tag push | Workflow `on.push.tags` misconfigured | Check `.gitea/workflows/` tag filter pattern |
| Image digest mismatch | Re-built image from same tag | Re-pull and recheck; do not promote if digest unknown |
| Staging smoke test fails | Config drift or dependency issue | Check staging env vars, rollback to previous staging image |
| Production container exits immediately | Missing env vars or config mount | Check `docker logs {project}` on production host |
| Health endpoint returns non-200 | App startup failure | Check logs; rollback if startup does not recover within 5 minutes |

## Agent Rules

- DO: Verify each step's expected output before continuing
- DO: Pause at the Gate step (Step 6) and await explicit human authorization
- DO: Record container digest from artifact manifest before promotion
- DO NOT: Skip the scan or smoke test steps under any circumstances
- DO NOT: Promote to production if staging smoke tests have not passed
- DO NOT: Use `:latest` tag for production deployments — always use the pinned version tag
- ESCALATE IF: Pipeline fails and root cause is unclear after 3 attempts
- ESCALATE IF: Production health check does not recover within 5 minutes of deploy

## Audit Trail

| Field | Value |
|-------|-------|
| Author | {author} |
| Created | {date} |
| Last tested | {date} |
| Last modified | {date} |
| Related issue | #775 |
