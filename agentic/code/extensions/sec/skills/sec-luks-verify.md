---
name: sec-luks-verify
description: Confirm LUKS slot state and TPM2 enrollment on all encrypted hosts
trigger: when the operator requests LUKS verification, TPM2 check, or encryption audit
---

# LUKS and TPM2 Verification

## Purpose

Verify the LUKS encryption and TPM2 enrollment state on all fleet hosts that use disk encryption. Confirm that passphrase slot 0 is intact on every encrypted host, that TPM2 enrollment matches the documented state, and that initramfs contains required TPM2 modules. Produce a verification report with pass/fail per host and flag any configuration that requires remediation.

## Workflow

### 1. Identify Encrypted Hosts

Scan fleet documentation to identify all hosts with LUKS-encrypted volumes:

- Host profiles and system-spec documents — look for `encryption:` or `luks:` sections
- Fleet inventory YAML — filter hosts with `encryption: luks` role
- SSH into candidate hosts and check for LUKS devices directly if documentation is incomplete:

```bash
# Detect LUKS devices on a host
lsblk -o NAME,FSTYPE | grep -i "crypto_LUKS"
ls /dev/mapper/ | grep -v control
```

Build a list: `[(hostname, device, expected_slots)]` where `expected_slots` describes the documented slot configuration (e.g., slot 0 = passphrase, slot 1 = TPM2).

### 2. Collect LUKS Header State

For each encrypted host, collect the LUKS header dump. This is a read-only operation and does not require the passphrase:

```bash
# Read LUKS header (read-only — safe to run without passphrase)
sudo cryptsetup luksDump /dev/{device}
```

Parse the output to extract:
- LUKS version (should be LUKS2 for all modern hosts)
- Total keyslot count and which slots are ENABLED
- For each ENABLED slot: slot type (luks2 = passphrase, clevis/tpm2 = TPM2 enrollment)
- Token section: presence of `tpm2` or `clevis` token type
- Header integrity: no error reading the header

**Check for slot 0 specifically**:

```bash
sudo cryptsetup luksDump /dev/{device} | grep -A10 "Keyslots:" | grep -A5 "0:"
```

Expected output for a healthy host with both passphrase and TPM2:
```
Keyslots:
  0: luks2                   <- passphrase slot, must be ENABLED
  1: luks2                   <- TPM2 slot (if enrolled)
Tokens:
  0: tpm2                    <- TPM2 token present
```

### 3. Verify TPM2 Enrollment Status

```bash
# Check TPM2 enrollment in the LUKS token section
sudo cryptsetup luksDump /dev/{device} | grep -A5 "Tokens:"

# Verify TPM2 PCR binding (which PCRs are used)
sudo cryptsetup luksDump /dev/{device} | grep -i pcr

# Check TPM2 device is present and accessible
ls /dev/tpm* 2>/dev/null || echo "No TPM device found"
sudo tpm2_getcap properties-fixed 2>/dev/null | grep TPM2_PT_VENDOR || echo "TPM2 not accessible"
```

Compare against documented enrollment state from host profile or system-spec.

### 4. Verify Initramfs Contains Required TPM2 Modules

```bash
# List initramfs contents and filter for TPM2 and encryption modules
lsinitramfs /boot/initrd.img-$(uname -r) 2>/dev/null \
  | grep -E "tpm|cryptsetup|systemd-cryptenroll" | sort

# If lsinitramfs is unavailable, use lsinitrd (RHEL/Fedora)
lsinitrd 2>/dev/null | grep -E "tpm|crypt"
```

Required modules for TPM2 auto-unlock to work:
- `tpm2_tis` or `tpm2_tis_core`
- `tpm_crb`
- `cryptsetup` binary or shared library
- `systemd-cryptenroll` binary (if using systemd-based enrollment)

### 5. Classify Findings Per Host

| Check | Pass Condition | Fail Condition |
|-------|---------------|----------------|
| LUKS header readable | `cryptsetup luksDump` returns 0 | Error reading header |
| Slot 0 (passphrase) ENABLED | Slot 0 shows as `ENABLED` in dump | Slot 0 absent or DISABLED |
| LUKS version | LUKS 2 | LUKS 1 (note: not a failure, but flag for upgrade) |
| TPM2 enrollment (if documented) | TPM2 token present in header | No token found when enrollment expected |
| TPM2 PCR binding (if enrolled) | PCRs 0+7 or per documented policy | Binding on unusual PCR set or none |
| Initramfs TPM2 modules | All required modules present | Any required module missing |
| TPM2 device accessible | `/dev/tpm0` or `/dev/tpmrm0` present | No TPM device found |

### 6. Produce Verification Report

```markdown
# LUKS / TPM2 Verification Report
**Date**: {YYYY-MM-DD HH:MM UTC}
**Operator**: {operator}
**Hosts Checked**: {N}

## Summary

| Status | Count |
|--------|-------|
| PASS — all checks passed | {N} |
| WARN — non-critical findings | {N} |
| FAIL — requires immediate action | {N} |
| UNREACHABLE — could not connect | {N} |

## Results Per Host

| Host | Device | Slot 0 | TPM2 Enrolled | Initramfs OK | TPM2 Device | Overall |
|------|--------|--------|--------------|--------------|-------------|---------|
| {hostname} | {/dev/device} | {PASS\|FAIL} | {YES\|NO\|NOT_EXPECTED} | {PASS\|FAIL\|WARN} | {PRESENT\|ABSENT} | {PASS\|WARN\|FAIL} |

## Failures — Requires Immediate Action

| Host | Finding | Detail | Recommended Action |
|------|---------|--------|--------------------|
| {hostname} | SLOT_0_MISSING | Slot 0 not present in LUKS header | CRITICAL: host may be locked out. Verify with operator before any reboot. |
| {hostname} | HEADER_ERROR | Cannot read LUKS header: {error} | Investigate filesystem or device issue immediately. |
| {hostname} | INITRAMFS_MISSING_MODULE | Missing: tpm2_tis_core | Rebuild initramfs with TPM2 modules before next reboot. |

## Warnings — Review Required

| Host | Finding | Detail | Recommended Action |
|------|---------|--------|--------------------|
| {hostname} | LUKS_VERSION_1 | Device uses LUKS1 | Plan migration to LUKS2 for improved security features. |
| {hostname} | TPM2_ENROLLED_NOT_DOCUMENTED | TPM2 token found but not in host profile | Update host documentation to record enrollment. |
| {hostname} | TPM2_NOT_ENROLLED | Host documented as TPM2-enrolled but no token found | Re-enroll per LUKS Enrollment Runbook. |
| {hostname} | UNUSUAL_PCR_BINDING | PCRs bound: {N} (expected 0+7) | Review PCR policy and update if needed. |

## Unreachable Hosts

| Host | Error |
|------|-------|
| {hostname} | {connection-refused\|ssh-timeout\|permission-denied} |
```

### 7. Post-Verification Actions

For any FAIL findings:
- Do not allow unattended reboots of affected hosts until findings are resolved
- Notify the host owner and create a remediation ticket
- If slot 0 is missing: treat as a P1 incident — host may be permanently locked out on next reboot

For WARN findings:
- Create remediation tickets with the next maintenance window as target date
- Initramfs missing modules: resolve before the next scheduled maintenance reboot

For all findings:
- Save report to `.aiwg/security/luks-verify-{YYYY-MM-DD}.md`
- Update host profile YAML to reflect current slot state

## Output

- `luks-verify-{YYYY-MM-DD}.md` saved to `.aiwg/security/`
- Exit non-zero if any FAIL findings are present
- Per-host status suitable for dashboard or monitoring integration
