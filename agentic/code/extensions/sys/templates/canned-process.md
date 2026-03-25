# Canned Process: {process_title}

**ID**: CP-{id}
**Applies To**: {hostname_or_fleet_scope}
**Last Used**: {last_used_date}
**Last Verified**: {last_verified_date}
**Author**: {author}

---

## Symptom

> What does the operator observe that triggers this process?

{symptom_description}

**Detection method**: {how_detected} (monitoring alert / user report / log pattern)

**Example log output**:
```
{example_log_lines}
```

---

## Diagnosis

> How to confirm this is the correct problem before applying the fix.

### Verification Commands

```bash
# Step 1: {diagnosis_step_1_description}
{diagnosis_command_1}

# Step 2: {diagnosis_step_2_description}
{diagnosis_command_2}
```

### Expected Output When This Process Applies

```
{expected_diagnostic_output}
```

### If Diagnosis Does Not Match

Stop. This canned process does not apply. Escalate to {escalation_target}.

---

## Fix

> Copy-paste ready. Each step is idempotent where possible.

### Pre-Conditions

- [ ] Diagnosis confirmed (above)
- [ ] {precondition_1}
- [ ] {precondition_2}

### Steps

```bash
# Step 1: {fix_step_1_description}
{fix_command_1}

# Step 2: {fix_step_2_description}
{fix_command_2}

# Step 3: {fix_step_3_description}
{fix_command_3}
```

### If a Step Fails

| Step | Failure Mode | Recovery |
|------|-------------|----------|
| {step_number} | {failure_description} | {recovery_action} |

---

## Verification

> Confirm the fix worked.

```bash
# Verify service/state is restored
{verification_command_1}

# Expected output:
# {expected_verification_output}

# Verify no side effects
{verification_command_2}
```

### Success Criteria

- [ ] {success_criterion_1}
- [ ] {success_criterion_2}
- [ ] Monitoring alert resolved (if applicable)

---

## Root Cause

{root_cause_description}

**Permanent fix available?** {yes_no_with_reference}

---

## History

| Date | Occurrence | Notes |
|------|-----------|-------|
| {date} | {host_or_context} | {notes} |
