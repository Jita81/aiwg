---
name: dev-release-coordinate
description: Orchestrate tag → build → promote → verify release sequence
trigger: when the operator requests release coordination, version promotion, or deployment pipeline execution
---

# Release Coordination

## Purpose

Orchestrate the full release sequence: pre-release validation, tag creation, build pipeline trigger, staging deployment and smoke test, production promotion gate, production deployment with health verification, and release announcement. Each gate is a hard stop — the operator confirms before the sequence advances to the next irreversible step.

## Workflow

### 1. Pre-Release Validation

Confirm the repository is ready to release:

- Run the full test suite: `npm test` (or project-equivalent)
- Run the UAT suite if present: `npm run uat`
- Verify CHANGELOG has an entry for the target version
- Confirm `package.json` version matches the intended release tag
- Check CI status on the release commit — all checks must be green
- Confirm no open blocking issues labeled `release-blocker`

Report any failures. Do not proceed until all pre-release checks pass.

### 2. Tag Creation

Once pre-release validation passes:

```bash
git tag -m "v{version}" v{version}
git push origin main --tags
```

Verify the tag appears in the remote tag list. Record the commit SHA and tag name for the audit trail.

### 3. Build Pipeline Trigger

After the tag is pushed, the CI pipeline should trigger automatically on tag push events. Monitor pipeline status:

- Poll the CI API for the pipeline triggered by the tag push
- Wait for pipeline completion before proceeding
- Record the pipeline run ID and outcome
- Capture the image digest from the artifact manifest: `{artifact-manifest-path}`

If the pipeline fails, surface the failure log and pause. Do not attempt promotion from a failed build.

### 4. Staging Deployment and Smoke Test

Pull the release image to staging and run the smoke test suite:

```bash
# Pull and deploy to staging
docker pull {registry}/{project}:v{version}
docker stop {project}-staging || true
docker run -d --name {project}-staging \
  --env-file /etc/opt/{project}/staging.env \
  -p {staging-port}:8080 \
  {registry}/{project}:v{version}

# Run smoke tests
{smoke-test-command} --target https://{staging-host}:{staging-port}
```

Report smoke test results. Do not proceed to production if smoke tests fail.

### 5. Production Promotion Gate

**Hard stop — human authorization required.**

Present the operator with a summary:
- Tag: `v{version}`
- Commit: `{git-sha}`
- Image digest: `sha256:{digest}`
- Staging smoke test: PASSED
- Pipeline run: {pipeline-run-url}

Ask the operator to confirm production promotion before continuing.

### 6. Production Deploy and Health Verification

After operator confirmation, execute the deployment:

```bash
ssh {production-host} "
  docker pull {registry}/{project}:v{version}
  docker stop {project} || true
  docker rm {project} || true
  docker run -d --name {project} \
    --restart unless-stopped \
    --env-file /etc/opt/{project}/production.env \
    -p {production-port}:8080 \
    {registry}/{project}:v{version}
"
```

Verify production health:

```bash
curl -sf https://{production-host}/health
curl -sf https://{production-host}/version
```

Both must return HTTP 200. If the health endpoint does not return 200 within 5 minutes, escalate to the operator immediately and do not proceed to the announcement step. Rollback using the previous version per the `release-runbook.md`.

### 7. Release Announcement

Once production health is confirmed:

- Create a Gitea release via the API with the tag name and CHANGELOG entry
- Post release notification to the configured channel (if a messaging integration is configured)
- Close any issues labeled for this release milestone
- Record the completed release in the audit trail

## Output Artifacts

- Gitea release entry for `v{version}`
- Artifact manifest with image digest: `{artifact-manifest-path}`
- Release audit entry (operator confirmation timestamp, pipeline run ID, deployed digest)
- Pipeline run URL for the tag build
