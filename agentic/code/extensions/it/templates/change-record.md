# Change Record: {change-title}

**Change ID**: CHG-{id}
**Date**: {date}
**Requestor**: {requestor}
**Approver**: {approver}
**Status**: {draft|pending-approval|approved|in-progress|completed|rolled-back}

---

## Purpose

{Brief description of why this change is needed and what problem it solves.}

---

## Change Details

| Field | Value |
|-------|-------|
| Change Type | {standard|normal|emergency} |
| Category | {network|identity|compute|storage|application} |
| Environment | {production|staging|dev} |
| Scope | {hosts, services, or components affected} |
| Blast Radius | {low|medium|high} — {description of worst-case impact} |
| Scheduled Window | {start-datetime} to {end-datetime} |
| Expected Downtime | {duration or "none"} |

---

## Impact Assessment

### Affected Assets

| Asset / Service | Impact | Mitigation |
|----------------|--------|------------|
| {asset-or-service} | {description of impact} | {how impact is minimized} |

### Risk Assessment

| Risk | Likelihood | Severity | Mitigation |
|------|-----------|----------|------------|
| {risk-description} | {low|medium|high} | {low|medium|high} | {mitigation-plan} |

### Dependencies

- {Dependency on other changes, maintenance windows, or team availability}

---

## Procedure

### Pre-Change Checks

- [ ] Backup of affected systems completed
- [ ] Rollback procedure reviewed and understood
- [ ] Monitoring dashboards accessible
- [ ] Stakeholders notified of maintenance window
- [ ] {Additional pre-check}

### Execution Steps

1. {Step 1 — include exact commands where applicable}
   ```bash
   {command}
   ```
   **Expected**: {expected output or state}

2. {Step 2}
   ```bash
   {command}
   ```
   **Expected**: {expected output or state}

3. {Step 3}

---

## Verification

After the change is applied, verify correctness:

- [ ] {Verification check 1 — e.g., "DNS resolves new record: `dig {hostname}`"}
- [ ] {Verification check 2 — e.g., "Service health check returns 200"}
- [ ] {Verification check 3 — e.g., "Firewall rule active: `nft list ruleset | grep {rule}`"}
- [ ] {Verification check 4 — e.g., "No errors in application logs for 15 minutes"}
- [ ] Monitoring confirms normal operation

---

## Rollback Procedure

If verification fails or unexpected issues arise:

1. {Rollback step 1}
   ```bash
   {rollback-command}
   ```

2. {Rollback step 2}
   ```bash
   {rollback-command}
   ```

3. Verify rollback:
   ```bash
   {rollback-verify-command}
   ```

**Rollback deadline**: If issues are not resolved by {deadline}, execute rollback.

---

## Approval

| Role | Name | Decision | Date |
|------|------|----------|------|
| Change Requestor | {name} | Submitted | {date} |
| Technical Reviewer | {name} | {approved|rejected|pending} | {date} |
| Change Approver | {name} | {approved|rejected|pending} | {date} |

### Approval Notes

{Any conditions or comments from reviewers.}

---

## Audit Trail

| Timestamp | Action | By | Notes |
|-----------|--------|----|-------|
| {timestamp} | Change record created | {author} | |
| {timestamp} | {action} | {actor} | {notes} |
