# VLAN Change Runbook: {change-title}

**Change ID**: CHG-{id}
**Date**: {date}
**Requestor**: {requestor}
**Approver**: {approver}
**Status**: {draft|pending-approval|approved|in-progress|completed|rolled-back}

---

## Purpose

{Describe why this VLAN change is needed. Include the business or operational driver, the service or host affected, and the expected outcome.}

---

## Prerequisites

Before beginning this runbook, confirm all of the following:

- [ ] UniFi controller or switch CLI access confirmed
- [ ] Out-of-band (OOB) access to affected switch(es) confirmed — **do not proceed without OOB access**
- [ ] Change record filed and approved: {change-record-link}
- [ ] Rollback window agreed: changes must complete or roll back before {rollback-deadline}
- [ ] Affected team(s) or service owners notified of maintenance window
- [ ] Current network-state.yaml saved to: `{backup-path}`
- [ ] Monitoring dashboards accessible: {monitoring-url}

---

## System Topology

| Device | Role | Management IP | OOB Access |
|--------|------|---------------|-----------|
| {switch-name} | {core|distribution|access} switch | {mgmt-ip} | {oob-method} |
| {ap-name} | Access point | {mgmt-ip} | {oob-method} |
| {host-name} | Affected host | {ip} | {oob-method} |

---

## Change Summary

| Field | Value |
|-------|-------|
| VLAN ID | {vlan-id} |
| VLAN Name | {vlan-name} |
| Subnet | {cidr} |
| Gateway | {gateway-ip} |
| DHCP Range | {dhcp-start} — {dhcp-end} |
| Tagged Ports | {list-of-ports} |
| Change Type | {add|modify|remove} |
| Blast Radius | {description-of-worst-case-impact} |

---

## Procedure

### Step 1: Verify Current State

Before making any changes, document the current VLAN configuration on the affected switch:

```bash
# UniFi CLI — list current VLANs
show vlan

# Or via UniFi API
curl -s -H "Authorization: Bearer {token}" \
  "https://{controller}/api/s/default/rest/networkconf" | jq '.data[] | {name, vlan}'
```

**Expected output**: {describe the current VLAN list, confirm target VLAN does or does not exist}

Record the current trunk port configuration:

```bash
# Show port configuration for trunk ports
show interfaces {trunk-port-id} switchport
```

---

### Step 2: Configure VLAN on Switch

```bash
# Create the VLAN
vlan {vlan-id}
  name {vlan-name}
  exit

# Verify VLAN was created
show vlan id {vlan-id}
```

**Expected output**: VLAN {vlan-id} appears in the VLAN table with name `{vlan-name}`.

---

### Step 3: Tag Trunk Ports

Tag the new VLAN on all trunk ports that need to carry it:

```bash
# For each trunk port in scope
interface {trunk-port-id}
  switchport trunk allowed vlan add {vlan-id}
  exit

# Verify trunk configuration
show interfaces {trunk-port-id} trunk
```

**Expected output**: VLAN {vlan-id} appears in the allowed VLAN list for each trunk port.

> **Warning**: Verify you are adding (`vlan add`), not replacing. Replacing the allowed list can isolate other VLANs.

---

### Step 4: Update DHCP Scope

Configure DHCP scope for the new VLAN on {dhcp-server-hostname}:

```bash
# Add DHCP scope (dnsmasq example)
# Append to /etc/dnsmasq.d/{vlan-name}.conf:
dhcp-range={dhcp-start},{dhcp-end},{lease-time}
dhcp-option=option:router,{gateway-ip}
dhcp-option=option:dns-server,{dns-server}

# Reload DHCP service
systemctl reload dnsmasq
```

For DHCP on the UniFi controller, apply via the Network configuration GUI or API — do not hand-edit controller config files directly.

---

### Step 5: Verify Host Connectivity

From a host on the new VLAN, verify basic connectivity:

```bash
# Confirm IP assignment
ip addr show {interface}

# Ping gateway
ping -c 3 {gateway-ip}

# Verify DNS resolution
dig {test-hostname} @{dns-server}

# Verify expected cross-VLAN access is permitted
nc -zv {target-host} {target-port}
```

**Success criteria**: Host receives IP in {dhcp-start}–{dhcp-end}, gateway ping succeeds, DNS resolves correctly.

---

### Step 6: Update network-state.yaml

Update `network-state.yaml` to reflect the change:

```yaml
vlans:
  - id: "{vlan-id}"
    name: "{vlan-name}"
    subnet: "{cidr}"
    gateway: "{gateway-ip}"
    dhcp:
      range_start: "{dhcp-start}"
      range_end: "{dhcp-end}"
      lease_seconds: {lease-seconds}
    tagged_ports:
      - switch: "{switch-name}"
        port: "{port-id}"
        mode: "trunk"
```

Commit the updated state file:

```bash
git add network-state.yaml
git commit -m "net: add VLAN {vlan-id} {vlan-name} — CHG-{id}"
```

---

## Verification

After all steps are complete, verify end-to-end correctness:

- [ ] VLAN {vlan-id} appears in `show vlan` on all affected switches
- [ ] VLAN {vlan-id} appears in trunk allowed list for all required ports
- [ ] DHCP server responds and assigns addresses in {dhcp-start}–{dhcp-end}
- [ ] Gateway {gateway-ip} is reachable from a host on VLAN {vlan-id}
- [ ] DNS resolution works from a host on VLAN {vlan-id}
- [ ] Cross-VLAN firewall rules allow or block as expected (test each)
- [ ] network-state.yaml is committed and reflects the new VLAN
- [ ] Monitoring shows no unexpected alerts for 15 minutes post-change

---

## Rollback

If verification fails, roll back in reverse order:

1. Remove VLAN from trunk ports:
   ```bash
   interface {trunk-port-id}
     switchport trunk allowed vlan remove {vlan-id}
     exit
   ```

2. Remove VLAN from switch:
   ```bash
   no vlan {vlan-id}
   ```

3. Remove DHCP scope from {dhcp-server-hostname} and reload service.

4. Revert network-state.yaml to the pre-change backup and commit:
   ```bash
   cp {backup-path} network-state.yaml
   git add network-state.yaml
   git commit -m "net: revert VLAN {vlan-id} change — rollback CHG-{id}"
   ```

5. Verify no hosts are stranded on the removed VLAN:
   ```bash
   # Check for ARP entries on the removed VLAN subnet
   arp -n | grep "{vlan-subnet-prefix}"
   ```

**Rollback deadline**: {rollback-deadline}. If unresolved by this time, execute rollback and open a new change record.

---

## Troubleshooting

| Symptom | Likely Cause | Check |
|---------|-------------|-------|
| Host gets no IP from DHCP | VLAN not tagged on access port | `show interfaces {port} switchport` |
| Gateway unreachable from VLAN | Layer 3 routing not configured | Verify router has interface in VLAN {vlan-id} |
| VLAN traffic not crossing trunk | VLAN not in trunk allowed list | `show interfaces {trunk} trunk` |
| Other VLANs affected after change | Trunk allowed list replaced instead of appended | Check and restore allowed list |
| DNS not resolving | DHCP not passing DNS server option | Check `dhcp-option` for dns-server |

---

## Agent Rules

- **DO**: Confirm out-of-band access is available before applying any VLAN change to a production switch.
- **DO**: Read and record current trunk port configuration before modifying it.
- **DO**: Use `vlan add` (not `vlan` alone) when modifying an existing trunk allowed list.
- **DO NOT**: Remove a VLAN before verifying that no hosts are actively assigned to it.
- **DO NOT**: Apply firewall rule changes for the new VLAN in the same change window without a separate approval.
- **ESCALATE IF**: A trunk port change affects more than one VLAN beyond the target VLAN.
- **ESCALATE IF**: The DHCP server is unavailable after configuration changes.
- **ESCALATE IF**: Rollback does not restore connectivity within 10 minutes.
