# Pipeline Incident Report: {title}

## Incident Summary

| Field | Value |
|-------|-------|
| Incident ID | {INC-XXXX} |
| Pipeline | {pipeline-name} |
| Stage | {failing-stage} |
| Failure Type | {failure-type} (build / test / scan / deploy / infra) |
| Severity | {P1/P2/P3/P4} |
| Status | {Investigating / Identified / Monitoring / Resolved} |
| Detected | {timestamp} |
| Resolved | {timestamp} |
| Duration | {duration} |
| Affected Projects | {project-list} |
| Blocked Deployments | {blocked-deployment-list} |

## Impact Assessment

| Dimension | Detail |
|-----------|--------|
| Deployments blocked | {count} releases waiting on this pipeline |
| Teams affected | {team-list} |
| SLA/SLO impact | {yes/no — describe if yes} |
| Production affected | {yes/no — describe if yes} |
| Workaround available | {yes/no — describe if yes} |

---

## Root Cause Analysis

### What Failed

{One paragraph describing the failure: which step in which pipeline, what error was emitted, and what automated mitigation (if any) fired.}

### 5 Whys

| Why | Answer |
|-----|--------|
| Why did the pipeline fail? | {immediate failure — e.g., image scan returned CRITICAL CVE} |
| Why was that the result? | {proximate cause — e.g., base image updated without pinning} |
| Why did that happen? | {contributing cause — e.g., no alert on upstream base image change} |
| Why wasn't it caught earlier? | {systemic cause — e.g., no nightly base-layer audit in place} |
| Why doesn't the process prevent this? | {root systemic gap — e.g., dev-idempotent-builds rule not enforced in review} |

### Contributing Factors

- {factor 1 — e.g., no image digest pinning in Dockerfile}
- {factor 2 — e.g., retry limit set to 0, causing immediate failure with no recovery}
- {factor 3 — e.g., on-call rotation not notified until 45 minutes after detection}

---

## Timeline

| Time | Event |
|------|-------|
| {HH:MM UTC} | First failure alert received (pipeline status: failed) |
| {HH:MM UTC} | On-call engineer engaged |
| {HH:MM UTC} | Failure isolated to {stage} stage |
| {HH:MM UTC} | Root cause identified: {root-cause-summary} |
| {HH:MM UTC} | Mitigation applied: {mitigation-summary} |
| {HH:MM UTC} | Affected pipeline unblocked |
| {HH:MM UTC} | All blocked deployments cleared |
| {HH:MM UTC} | Incident resolved and monitoring confirmed stable |

---

## Resolution Steps

### Immediate Mitigation

```bash
# Steps taken to unblock the pipeline
{mitigation-command-1}
{mitigation-command-2}
```

### Verification After Mitigation

```bash
# Confirm pipeline passing
{pipeline-status-command}

# Confirm no remaining blocked deployments
{deployment-check-command}
```

**Expected output:**

```
{expected-output}
```

---

## Prevention

What changes prevent this class of failure from recurring:

| Change | Type | Owner | Target Date |
|--------|------|-------|-------------|
| {change-1 — e.g., pin all base images by digest in Dockerfiles} | Process | {owner} | {date} |
| {change-2 — e.g., add nightly builder audit to dev-builder-audit skill} | Automation | {owner} | {date} |
| {change-3 — e.g., alert on pipeline failure within 5 minutes} | Monitoring | {owner} | {date} |
| {change-4 — e.g., document secret hygiene requirements for build args} | Policy | {owner} | {date} |

---

## Postmortem Action Items

- [ ] {action-1}: Update Dockerfiles to use digest-pinned base images — @{owner} — {due-date}
- [ ] {action-2}: Add pipeline failure alerting with <5 min SLA — @{owner} — {due-date}
- [ ] {action-3}: Run `dev-builder-audit` skill weekly and file issues on outdated layers — @{owner} — {due-date}
- [ ] {action-4}: Add this failure pattern to `pipeline.md` troubleshooting table — @{owner} — {due-date}
- [ ] {action-5}: Review `dev-idempotent-builds` rule compliance across all affected projects — @{owner} — {due-date}

---

## References

- Failing pipeline run: {pipeline-run-url}
- Related issues: {issue-links}
- Related runbooks: {runbook-links}
- Monitoring dashboard: {dashboard-url}
- Build playbook: `templates/build-playbook.yaml`
- Deployment guide: `templates/deployment-guide.md`
