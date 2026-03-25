# Disaster Recovery Runbook: {service_name}

**DR Plan ID**: DR-{id}
**Service**: {service_name}
**Last Tested**: {last_test_date}
**Next Test Due**: {next_test_date}
**Owner**: {owner}

---

## Recovery Targets

| Target | Value | Justification |
|--------|-------|---------------|
| RTO (Recovery Time Objective) | {rto} | {rto_justification} |
| RPO (Recovery Point Objective) | {rpo} | {rpo_justification} |
| MTTR (Mean Time to Recover) | {mttr_estimate} | Based on last {n} tests |

---

## Prerequisites

Before starting recovery, ensure:

- [ ] Access to {infrastructure_platform} with {required_permissions}
- [ ] Backup location accessible: {backup_location}
- [ ] Credentials available: {credentials_reference} (see vault, not listed here)
- [ ] Network connectivity to: {required_network_targets}
- [ ] Recovery environment available: {recovery_environment}
- [ ] This runbook version matches current service version: {service_version}

---

## Disaster Scenarios

### Scenario A: {scenario_a_name}

**Trigger**: {trigger_description}
**Impact**: {impact_description}
**Recovery path**: Steps {start_step}–{end_step} below

### Scenario B: {scenario_b_name}

**Trigger**: {trigger_description}
**Impact**: {impact_description}
**Recovery path**: Steps {start_step}–{end_step} below

---

## Recovery Steps

### Step 1: Assess and Declare

```bash
# Verify the failure
{assessment_command_1}

# Check backup availability
{backup_check_command}
```

**Expected output**: {expected_assessment_output}
**Decision point**: If backups are not available, escalate to {escalation_target}.

---

### Step 2: Prepare Recovery Environment

```bash
# Provision recovery target (if needed)
{provision_command}

# Verify recovery target is ready
{verify_target_command}
```

**Expected output**: {expected_prep_output}

---

### Step 3: Restore Data

```bash
# Restore from backup
{restore_command}

# Verify data integrity
{integrity_check_command}
```

**Expected output**: {expected_restore_output}
**Time estimate**: {restore_time_estimate}

---

### Step 4: Restore Service

```bash
# Deploy service to recovery environment
{deploy_command}

# Apply configuration
{config_command}

# Start service
{start_command}
```

**Expected output**: {expected_service_output}

---

### Step 5: Verify Recovery

```bash
# Health check
{health_check_command}

# Functional verification
{functional_test_command}

# Data consistency check
{data_consistency_command}
```

**Success criteria**:
- [ ] Health check returns healthy
- [ ] All functional tests pass
- [ ] Data consistent with RPO target (no data loss beyond {rpo})
- [ ] Performance within acceptable range

---

### Step 6: Redirect Traffic

```bash
# Update DNS / load balancer / service discovery
{redirect_command}

# Verify traffic flowing to recovery environment
{traffic_verify_command}
```

---

## Post-Recovery Checklist

- [ ] All health checks passing
- [ ] Monitoring configured for recovery environment
- [ ] Alerts routing correctly
- [ ] Stakeholders notified of recovery completion
- [ ] Incident timeline documented
- [ ] Root cause analysis scheduled
- [ ] Backup of recovered environment initiated
- [ ] Plan to return to primary environment documented (if applicable)

---

## Rollback (If Recovery Fails)

If recovery introduces new issues:

```bash
# Revert to previous state
{rollback_command}

# Verify rollback
{rollback_verify_command}
```

**Escalation**: If rollback also fails, contact {emergency_escalation}.

---

## Test History

| Date | Scenario | Result | Duration | Issues Found | Fixed |
|------|----------|--------|----------|-------------|-------|
| {date} | {scenario} | {pass / fail} | {duration} | {issues} | {fixed_date} |

---

## Notes

{additional_notes}
