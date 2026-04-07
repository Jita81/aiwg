# Firewall Change Runbook: {change-title}

**Change ID**: CHG-{id}
**Date**: {date}
**Requestor**: {requestor}
**Approver**: {approver}
**Status**: {draft|pending-approval|approved|in-progress|completed|rolled-back}

---

## Purpose

{Describe why this firewall change is needed. Include the service or flow being controlled, the source and destination segments, and whether this is permitting new traffic or restricting existing traffic.}

---

## Prerequisites

Before beginning this runbook, confirm all of the following:

- [ ] Current ruleset exported and saved to: `{backup-path}` (timestamp: {export-timestamp})
- [ ] Change record filed and approved with full impact analysis: {change-record-link}
- [ ] Rollback window defined — changes must complete or roll back before {rollback-deadline}
- [ ] Affected service owners notified of maintenance window
- [ ] Active connections on affected ports verified (no active flows will be severed without consent)
- [ ] Out-of-band access to the firewall host or controller confirmed
- [ ] If the change affects inter-VLAN routing: separate network change record exists for router config

---

## Change Summary

| Field | Value |
|-------|-------|
| Chain | {INPUT|FORWARD|OUTPUT|custom-chain} |
| Action | {accept|drop|reject|log-and-accept|log-and-drop} |
| Source | {cidr-or-any} |
| Destination | {cidr-or-any} |
| Port / Range | {port-or-range} |
| Protocol | {tcp|udp|icmp|any} |
| Change Type | {add-rule|modify-rule|remove-rule|reorder-rules} |
| Blast Radius | {description-of-worst-case-impact} |
| Affected VLANs | {list-of-vlan-ids} |

---

## Procedure

### Step 1: Export Current Ruleset

Always export the current ruleset before making any changes. This is the authoritative rollback artifact.

**nftables:**
```bash
nft list ruleset > {backup-path}/nft-rules-{timestamp}.nft
echo "Exported ruleset to {backup-path}/nft-rules-{timestamp}.nft"
```

**iptables:**
```bash
iptables-save > {backup-path}/iptables-{timestamp}.rules
ip6tables-save > {backup-path}/ip6tables-{timestamp}.rules
```

**pfSense / OPNsense:**
```bash
# Export via API or GUI backup before applying changes
# Config path: Diagnostics > Backup & Restore
```

Verify the export is readable:
```bash
wc -l {backup-path}/nft-rules-{timestamp}.nft
```

**Expected output**: Non-zero line count confirming the file is not empty.

---

### Step 2: Add / Modify / Remove Rule

#### Add Rule (nftables):

```bash
# Add rule to the appropriate chain
nft add rule inet filter {chain} {protocol} dport {port} {source-match} {action}

# Example: allow TCP 443 from management VLAN
nft add rule inet filter forward ip saddr {mgmt-cidr} ip daddr {dest-cidr} tcp dport 443 accept
```

#### Add Rule (iptables):

```bash
iptables -I {chain} 1 -s {source-cidr} -d {dest-cidr} -p {protocol} --dport {port} -j {ACTION}
```

#### Remove Rule (nftables):

```bash
# List rules with handles first — never remove by position alone
nft -a list chain inet filter {chain}

# Remove by handle number
nft delete rule inet filter {chain} handle {handle-number}
```

#### Remove Rule (iptables):

```bash
# List rules with line numbers
iptables -L {chain} -n -v --line-numbers

# Delete by line number
iptables -D {chain} {line-number}
```

---

### Step 3: Verify Rule Syntax

Before applying (if tool supports dry-run or validation):

**nftables dry-run:**
```bash
# Validate a proposed ruleset file before loading
nft -c -f {proposed-ruleset-file}
```

**iptables — verify current state after add/remove:**
```bash
iptables -L {chain} -n -v --line-numbers | grep "{port}\|{source-cidr}"
```

**Expected output**: The new rule appears at the correct position in the chain. No syntax errors reported.

---

### Step 4: Test Connectivity from Affected Segments

Verify the intended flow is permitted or blocked as expected:

```bash
# Test TCP reachability (should succeed for allow rules)
nc -zv {destination-host} {port}

# Test ICMP (if applicable)
ping -c 3 -I {source-interface} {destination-ip}

# Test that previously-open flows still work (regression check)
nc -zv {existing-service-host} {existing-service-port}
```

**Expected outcomes**:
- New allowed flow: connection succeeds
- New blocked flow: connection refused or times out (as expected per protocol)
- Existing flows: no regression, connections succeed as before

---

### Step 5: Update network-state.yaml

Update the firewall rules section of `network-state.yaml` to reflect the change:

```yaml
firewall_rules:
  - chain: "{chain}"
    action: "{action}"
    source: "{source-cidr}"
    destination: "{dest-cidr}"
    port: "{port}"
    protocol: "{protocol}"
    comment: "{description — who/what this allows or blocks}"
    issue: "CHG-{id}"
```

Commit the updated state file:

```bash
git add network-state.yaml
git commit -m "net: update firewall rule — {brief-description} — CHG-{id}"
```

---

## Verification

After all steps are complete:

- [ ] Exported ruleset backup confirmed non-empty at {backup-path}
- [ ] New rule appears in `nft list ruleset` or `iptables -L` at the correct position
- [ ] Intended traffic flow verified from an actual source host
- [ ] Regression check: existing flows on adjacent rules still work
- [ ] network-state.yaml updated and committed with change record reference
- [ ] Monitoring shows no unexpected connection failures or security alerts for 15 minutes post-change

---

## Rollback

If verification fails or unexpected flows are impacted, roll back by restoring the exported ruleset:

**nftables:**
```bash
nft flush ruleset
nft -f {backup-path}/nft-rules-{timestamp}.nft
nft list ruleset | grep "{chain}" | head -20  # Verify restore
```

**iptables:**
```bash
iptables-restore < {backup-path}/iptables-{timestamp}.rules
ip6tables-restore < {backup-path}/ip6tables-{timestamp}.rules
iptables -L {chain} -n --line-numbers  # Verify restore
```

After restoring:
- [ ] Verify original allowed flows still work
- [ ] Verify the problematic rule is no longer present
- [ ] Revert network-state.yaml to pre-change state and commit
- [ ] File post-rollback incident note on the change record

**Rollback deadline**: {rollback-deadline}. If unresolved by this time, execute rollback immediately.

---

## Troubleshooting

| Symptom | Likely Cause | Check |
|---------|-------------|-------|
| Expected traffic still blocked after allow rule added | Rule inserted after a DROP-all catch-all | `iptables -L -n --line-numbers` — check rule order |
| Unexpected traffic allowed after block rule added | Rule inserted after the traffic is already matched by an earlier ACCEPT | Same — rule order and specificity |
| Connection refused vs. timed out | DROP vs. REJECT semantics | Verify rule action matches intended behavior |
| Existing service stops working | Removal hit the wrong rule | Compare running ruleset to backup; restore if needed |
| Rule missing after reboot | Rule not persisted | `netfilter-persistent save` or equivalent for your distro |
| Inter-VLAN flow broken after change | FORWARD chain rule missing or route absent | Check both firewall FORWARD chain and routing table |

---

## Agent Rules

- **DO**: Export current rules to a timestamped backup before any change.
- **DO**: Use rule handles (nftables) or line numbers (iptables) — never delete rules by pattern match alone.
- **DO**: Test from an actual host on the affected segment, not just from the firewall host itself.
- **DO NOT**: Remove an allow rule without verifying no active connections depend on it (`ss -tnp` or `conntrack -L`).
- **DO NOT**: Apply changes during peak traffic hours without explicit approval from service owners.
- **ESCALATE IF**: A rule change affects inter-VLAN routing beyond the declared scope.
- **ESCALATE IF**: Rollback does not restore expected connectivity within 10 minutes.
- **ESCALATE IF**: Any active connection is severed unexpectedly — do not proceed until root cause is identified.
