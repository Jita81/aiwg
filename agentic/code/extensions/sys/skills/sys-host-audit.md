---
name: sys-host-audit
description: Verify that a host's documentation matches its actual system state
trigger: when the operator requests a host audit, doc verification, or drift check for a specific host
---

# Host Documentation Audit

## Purpose

Verify that a host's system-spec document accurately reflects the host's actual state. Identify documentation drift and produce a remediation report.

## Workflow

### 1. Load Documentation

Read the target host's system-spec document. Parse all documented values into a structured representation.

### 2. Collect Live State

Connect to the host and gather current system information:

```bash
# Identity
hostname -f
cat /etc/machine-id

# CPU
lscpu

# Memory
free -h
dmidecode -t memory 2>/dev/null || echo "dmidecode unavailable"

# Storage
lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,MODEL,SERIAL
df -h
cat /etc/fstab

# Network
ip -br addr
ip -br link
cat /etc/resolv.conf
ss -tlnp

# OS
cat /etc/os-release
uname -r

# Services
systemctl list-units --type=service --state=running --no-pager

# Encryption
lsblk -o NAME,FSTYPE | grep -i crypt
cryptsetup status /dev/mapper/* 2>/dev/null

# RAID
cat /proc/mdstat 2>/dev/null
```

### 3. Compare

For each documented field, compare against the live value:

| Category | Field | Documented | Actual | Status |
|----------|-------|-----------|--------|--------|
| Hardware | CPU Model | {doc_value} | {live_value} | MATCH / DRIFT / MISSING |
| Hardware | RAM Total | {doc_value} | {live_value} | MATCH / DRIFT / MISSING |
| Network | {iface} IP | {doc_value} | {live_value} | MATCH / DRIFT / MISSING |
| ... | ... | ... | ... | ... |

### 4. Classify Findings

- **MATCH**: Documented value matches live state
- **DRIFT**: Documented value differs from live state
- **MISSING_DOC**: Live system has something not documented
- **MISSING_LIVE**: Documentation claims something that doesn't exist on the host
- **UNABLE_TO_VERIFY**: Could not collect live data for comparison (e.g., requires root)

### 5. Produce Audit Report

```markdown
# Host Audit: {hostname}
**Date**: {timestamp}
**Overall**: {pass_count}/{total_count} checks passed ({percentage}%)

## Drift Detected
| Field | Documented | Actual | Severity |
|-------|-----------|--------|----------|

## Undocumented Items
| Category | Item | Details |

## Recommended Actions
1. Update system-spec: {specific_fields}
2. Investigate: {unexpected_findings}
```

## Output

- Audit report with pass/fail per field
- Suggested diff to update the system-spec document
- Severity classification (cosmetic / operational / security-relevant drift)
