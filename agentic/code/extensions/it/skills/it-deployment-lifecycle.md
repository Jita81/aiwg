---
name: it-deployment-lifecycle
description: Deploy, verify, monitor, and rollback workflow for services
trigger: when the operator requests a service deployment, upgrade, or rollback
---

# Deployment Lifecycle

## Purpose

Manage the full deployment lifecycle for a service: pre-flight checks, deployment execution, health verification, watch period, and rollback if needed.

## Workflow

### 1. Pre-Flight

- Load the service's deployment guide
- Verify CI pipeline passed for the target version
- Confirm rollback procedure is understood
- Check that monitoring dashboards are accessible
- Notify stakeholders that deployment is starting

### 2. Deploy

Execute the deployment procedure from the service's deployment guide:

- Apply database migrations (if any)
- Deploy new version
- Wait for readiness probe to pass

Record deployment start time.

### 3. Verify

Run the health verification matrix from the deployment guide:

- Liveness check
- Readiness check
- Dependency check
- Smoke test

If any check fails, proceed to rollback.

### 4. Watch

Monitor for the configured watch period:

- Tail application logs for errors
- Watch key metrics (latency, error rate, throughput)
- Compare against pre-deployment baseline

Decision criteria:
- **Green**: No anomalies, proceed to post-deployment
- **Yellow**: Minor anomalies, extend watch period
- **Red**: Significant anomalies, initiate rollback

### 5. Rollback (If Needed)

If rollback is triggered:

- Execute rollback procedure from deployment guide
- Revert database migrations if applicable
- Verify previous version is running and healthy
- Record rollback reason

### 6. Post-Deployment

If deployment is successful:

- Record deployment in change log
- Update service documentation if configuration changed
- Confirm monitoring is operational
- Notify stakeholders of completion

## Output

- Deployment result (success / rolled back)
- Health verification results
- Watch period metrics summary
- Updated deployment guide (if procedure needed corrections)
