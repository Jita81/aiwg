# Network Audit Report

**Audit ID**: AUDIT-NET-{id}
**Date**: {audit-date}
**Scope**: {networks, VLANs, zones, or sites in scope}
**Auditor**: {auditor-name}
**Status**: {draft|in-review|final}

---

## Audit Summary

| Field | Value |
|-------|-------|
| Date | {audit-date} |
| Scope | {scope-description} |
| Auditor | {auditor-name} |
| VLANs Audited | {count} |
| DNS Zones Audited | {count} |
| Firewall Chains Audited | {count} |
| Tunnels Audited | {count} |
| Total Drift Items | {count} |
| Critical Findings | {count} |
| High Findings | {count} |
| Informational | {count} |

---

## Methodology

This audit compares the declared network state in `network-state.yaml` against the actual live configuration gathered from:

- **Switches**: UniFi controller API / switch CLI (`show vlan`, `show interfaces trunk`)
- **DNS**: Live resolution via `dig` against authoritative nameservers
- **Firewall**: Live ruleset via `nft list ruleset` or `iptables-save`
- **Tunnels**: Cloudflare API or tunnel daemon status output
- **DHCP**: DHCP server lease and scope configuration

Any discrepancy between documented state and live state is recorded as drift. Drift items are classified by severity:

- **CRITICAL**: Live configuration is less secure or less available than documented (e.g., a firewall allow rule exists that is not in the state file, or a VLAN is missing its documented trunk ports)
- **HIGH**: Documented configuration is not reflected in live state (e.g., a DNS record is declared but does not resolve correctly)
- **INFORMATIONAL**: Minor discrepancy or stale documentation with no operational impact

---

## VLAN State Comparison

### Documented VLANs

| VLAN ID | Name | Subnet | Gateway | DHCP Range | Tagged Ports |
|---------|------|--------|---------|------------|-------------|
| {id} | {name} | {cidr} | {gateway} | {range} | {ports} |

### Live VLAN State

| VLAN ID | Name | Subnet | Gateway | DHCP Range | Tagged Ports |
|---------|------|--------|---------|------------|-------------|
| {id} | {name} | {cidr} | {gateway} | {range} | {ports} |

### VLAN Drift

| VLAN ID | Field | Documented | Actual | Severity | Notes |
|---------|-------|-----------|--------|----------|-------|
| {id} | {field} | {expected} | {actual} | {CRITICAL|HIGH|INFO} | {detail} |

---

## DNS Verification Results

### Resolution Check Summary

| Record FQDN | Type | Expected | Actual | Status |
|-------------|------|----------|--------|--------|
| {fqdn} | {type} | {expected-value} | {resolved-value} | PASS / FAIL / NXDOMAIN |

### DNS Drift Items

| Record | Issue | Severity | Notes |
|--------|-------|----------|-------|
| {record} | {stale|missing|wrong-target|wrong-ttl} | {CRITICAL|HIGH|INFO} | {detail} |

---

## Firewall Rule Audit

### Declared Rules vs. Live Rules

| Chain | Rule Description | Documented | Live | Status |
|-------|----------------|-----------|------|--------|
| {chain} | {description} | {yes|no} | {yes|no} | MATCH / DRIFT / UNDOCUMENTED |

### Undocumented Rules

Rules present in the live firewall but absent from `network-state.yaml`:

| Chain | Action | Source | Destination | Port | Protocol | Risk |
|-------|--------|--------|------------|------|----------|------|
| {chain} | {action} | {source} | {dest} | {port} | {proto} | {risk-assessment} |

> **Note**: Undocumented allow rules require immediate review. Each must either be added to the state file (with owner and purpose documented) or removed.

### Missing Rules

Rules declared in `network-state.yaml` but absent from the live firewall:

| Chain | Action | Source | Destination | Port | Protocol | Impact |
|-------|--------|--------|------------|------|----------|--------|
| {chain} | {action} | {source} | {dest} | {port} | {proto} | {impact-if-missing} |

---

## Tunnel Configuration Audit

| Tunnel | Provider | Routes | Access Policies | Cred Mode | Status |
|--------|----------|--------|----------------|-----------|--------|
| {name} | {provider} | {route-count} | {policy-count} | {600|FAIL} | OK / DRIFT |

### Tunnel Drift Items

| Tunnel | Field | Documented | Actual | Severity |
|--------|-------|-----------|--------|----------|
| {name} | {field} | {expected} | {actual} | {CRITICAL|HIGH|INFO} |

---

## Drift Summary

Items where actual configuration does not match documented state:

| # | Category | Item | Documented | Actual | Severity | Remediation Owner | Due |
|---|----------|------|-----------|--------|----------|------------------|-----|
| 1 | {VLAN|DNS|Firewall|Tunnel} | {identifier} | {expected} | {actual} | {CRITICAL|HIGH|INFO} | {owner} | {date} |
| 2 | | | | | | | |

**Total drift items**: {count}
**Requiring immediate action (CRITICAL)**: {count}
**Scheduled remediation (HIGH)**: {count}
**Informational (no immediate action)**: {count}

---

## Remediation Actions

| # | Action | Priority | Owner | Due Date | Status |
|---|--------|----------|-------|----------|--------|
| 1 | {Specific remediation step} | {P1|P2|P3} | {owner} | {date} | {open|in-progress|done} |
| 2 | | | | | |

---

## Sign-off

| Role | Name | Decision | Date |
|------|------|----------|------|
| Auditor | {name} | Report complete | {date} |
| Network Owner | {name} | {accepted|disputed} | {date} |
| Security Reviewer | {name} | {approved|pending} | {date} |

### Review Notes

{Any disputes, caveats, or conditions from reviewers.}
