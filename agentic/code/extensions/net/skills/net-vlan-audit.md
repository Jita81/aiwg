---
name: net-vlan-audit
description: Compare live VLAN assignments against network-state.yaml and report drift
trigger: when the operator requests VLAN audit, network state verification, or switch config check
---

# VLAN Audit

## Purpose

Compare the declared VLAN configuration in `network-state.yaml` against the live state on managed switches and the UniFi controller. Produce a drift report with a severity classification per finding, and flag any VLAN or port configuration that deviates from the documented state.

## Workflow

### 1. Load Declared State

Read `network-state.yaml` from the repository root (or the path specified by the operator). Extract the declared VLAN table:

```
Input: network-state.yaml
Output: Declared VLAN list with id, name, subnet, gateway, dhcp range, and tagged_ports per VLAN
```

Build the expected state model:

```yaml
expected_vlans:
  - id: {vlan-id}
    name: {name}
    subnet: {cidr}
    gateway: {ip}
    dhcp:
      range_start: {ip}
      range_end: {ip}
    tagged_ports:
      - switch: {switch-name}
        port: {port-id}
        mode: {trunk|access}
```

### 2. Collect Live VLAN State

Query live VLAN state from each switch or controller in scope.

**UniFi Controller API:**

```bash
# Authenticate and retrieve network configuration
TOKEN=$(cat /etc/unifi/api-token)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://{controller}/api/s/default/rest/networkconf" \
  | jq '.data[] | {vlan_id: .vlan, name, ip_subnet, dhcpd_start, dhcpd_stop}'
```

**Managed Switch CLI (SSH):**

```bash
# Show VLAN database
ssh {switch-mgmt-ip} "show vlan"

# Show trunk port configuration for each documented trunk port
ssh {switch-mgmt-ip} "show interfaces {port} trunk"
ssh {switch-mgmt-ip} "show interfaces {port} switchport"
```

**DHCP Server (dnsmasq or ISC DHCP):**

```bash
# Show active DHCP scopes
cat /etc/dnsmasq.d/*.conf | grep "dhcp-range"
# or
cat /etc/dhcp/dhcpd.conf | grep -A5 "subnet"
```

Collect output into a live state model matching the expected state structure.

### 3. Diff Documented vs. Actual

For each declared VLAN, compare each field of the expected state against the live state:

| Field | Comparison |
|-------|-----------|
| VLAN ID | Present in live switch VLAN database |
| VLAN Name | Matches declared name |
| Subnet | Matches declared CIDR |
| Gateway | Reachable and assigned to correct interface |
| DHCP Range | Scope start/end matches declared values |
| Tagged Ports | Each declared port has the VLAN in its trunk allowed list |

Classify each discrepancy:

- **CRITICAL**: VLAN exists live but is absent from `network-state.yaml` (undocumented) — security and audit risk
- **CRITICAL**: VLAN declared but absent from the live switch — the documented state is fictional
- **HIGH**: Subnet, gateway, or DHCP range mismatch between documented and live
- **HIGH**: A declared trunk port does not carry the VLAN in its live allowed list
- **HIGH**: A VLAN appears on ports not listed in `network-state.yaml` (undocumented trunk scope creep)
- **INFORMATIONAL**: VLAN name mismatch, minor — verify whether this is an alias or a real drift

### 4. Produce Drift Report

Output a structured drift report:

```markdown
# VLAN Audit Report — {timestamp}

## Summary
- Switches audited: {count}
- VLANs declared: {count}
- VLANs matched: {count}
- Drift items: {count} ({critical} critical, {high} high, {informational} informational)

## Drift Items

| VLAN | Field | Documented | Actual | Severity | Recommended Action |
|------|-------|-----------|--------|----------|--------------------|
| {id} | {field} | {expected} | {actual} | {severity} | {action} |

## Undocumented VLANs (Live but Not in State File)

| VLAN ID | Name | Switch | Ports |
|---------|------|--------|-------|
| {id} | {name} | {switch} | {ports} |

## Phantom VLANs (Documented but Not Live)

| VLAN ID | Name | Documented Subnet | Last Seen |
|---------|------|--------------------|-----------|
| {id} | {name} | {cidr} | {date-if-known|unknown} |
```

### 5. Flag Remediation Actions

For each drift item, include a recommended action:

- **Undocumented VLAN**: "Add to network-state.yaml or remove from switch — operator decision required"
- **Phantom VLAN**: "Remove from network-state.yaml or recreate on switch — operator decision required"
- **Subnet / DHCP mismatch**: "Reconcile — verify which state is intended; update state file or live config"
- **Missing trunk port**: "Add VLAN {id} to trunk allowed list on {switch}/{port} or remove from state file"
- **Extra trunk port**: "Remove VLAN {id} from trunk on {switch}/{port} or add port to state file"

## Output

- `vlan-audit-{timestamp}.md` — Full drift report with remediation recommendations
- Console summary with drift count by severity
- Exit non-zero if any CRITICAL or HIGH drift items are found (for CI integration)
