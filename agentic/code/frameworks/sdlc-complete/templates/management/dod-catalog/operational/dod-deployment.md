---
dod_id: dod-deployment
name: Deployment Readiness Definition of Done
scope: operational
category: deployment
version: 1.0.0
extensible: true
---

# Deployment Readiness Definition of Done

## Purpose

Confirms that before a deployment is initiated, the team has a tested runbook, a validated rollback path, and the operational infrastructure is prepared to support the new version. Deployments that fail because of missing runbooks, untested rollbacks, or unconfigured monitoring are operational failures, not just development failures.

## Criteria

### Required

- [ ] Deployment runbook exists and was updated for this release (step-by-step, not from memory)
- [ ] Rollback procedure documented in the runbook with exact commands; rollback tested in staging within this release cycle
- [ ] Health check endpoint(s) confirmed returning 200 in staging after the release version is deployed
- [ ] All required environment variables and secrets for the new version are provisioned in the target environment (no deployment-time surprises)
- [ ] Database migrations (if any) tested and included in the deployment plan with the correct execution order
- [ ] Deployment order documented for multi-service releases: which services deploy first and which must wait
- [ ] On-call engineer notified and available during the deployment window
- [ ] Monitoring dashboards confirm current baseline metrics captured (to compare against post-deployment)

### Recommended

- [ ] Canary or blue-green deployment strategy in place for changes with high blast radius
- [ ] Smoke test suite automated to run immediately post-deployment and gate traffic switchover
- [ ] Feature flags verified: new feature is off by default until explicitly activated
- [ ] Deployment window scheduled during low-traffic period with stakeholder awareness
- [ ] Previous release artifacts retained and accessible for emergency rollback without a new build

## Verification

**Automated checks:**
- Staging CI deployment pipeline: deployment completes without error
- Health check test: automated ping to `/health` (or equivalent) after staging deploy returns 200 with expected version field
- Smoke test suite: passes within 5 minutes of staging deployment

**Manual steps:**
- Author or release engineer follows the runbook in staging from start to finish and confirms all steps work as written
- On-call engineer confirms they have been notified, have the runbook link, and have access to rollback tooling
- Monitoring reviewer confirms dashboards are loaded and showing current baseline before deployment begins

## Tailoring Guide

**Add criteria when:**
- Multi-region deployment: require per-region health check and sequenced region rollout plan
- Stateful service: require data migration plan reviewed as part of deployment plan
- Zero-downtime requirement: require blue-green or canary strategy with automated traffic shift criteria
- Regulated environment: require change ticket approved by change advisory board (CAB) before deployment

**Remove or relax criteria when:**
- Automated continuous deployment (CD) pipeline with progressive delivery: embed health checks and smoke tests in the pipeline; canary gates replace manual steps
- Hotfix under active incident: may reduce to one reviewer and abbreviated runbook; full runbook required post-incident

## Extension Points

- `ext-deployment-strategy` — organization-specific deployment strategy (blue-green, canary, rolling) configuration
- `ext-deployment-approval` — change management approval workflow and required sign-offs
- `ext-deployment-notifications` — stakeholder and on-call notification integration
