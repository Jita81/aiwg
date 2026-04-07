# Network Change Runbook: {Change Description}

## Purpose

Apply a network configuration change with pre-checks, controlled rollout, post-change verification, and automatic rollback on failure. Network changes are high-blast-radius operations — a misconfiguration can isolate hosts or take down services fleet-wide. This runbook enforces a pre-check → dry-run → apply → verify → rollback-if-failed sequence.

**Warning**: Network changes can sever your own access to the target host. Always have out-of-band access (IPMI, console, secondary interface) available before making changes to the primary network interface.

## System Topology

| Field | Value |
|-------|-------|
| Change type | {VLAN / firewall rule / route / interface / DNS / MTU / VPN} |
| Target host(s) | {hostnames} |
| Affected interface(s) | {interface names} |
| Affected subnet(s) | {CIDRs} |
| Change window | {start — end} |
| Out-of-band access | {IPMI IP / console method} |
| Rollback deadline | {time — changes auto-revert if not confirmed} |

### Affected Services

| Service | Port | Expected Impact |
|---------|------|-----------------|
| {service} | {port} | {brief during reload / none / outage window} |

## Prerequisites

- [ ] Change request approved (if change control required)
- [ ] Out-of-band access to target host(s) verified
- [ ] Pre-change configuration backed up
- [ ] Monitoring dashboards open: {dashboard-url}
- [ ] Affected service owners notified
- [ ] Rollback procedure tested (or `netplan try` available)

## Pre-Checks

```bash
# 1. Record current network state (save for comparison)
ip addr show > /tmp/network-pre-change.ip-addr.txt
ip route show > /tmp/network-pre-change.ip-route.txt
ip link show > /tmp/network-pre-change.ip-link.txt
```

```bash
# 2. Record current firewall state
ufw status verbose > /tmp/network-pre-change.ufw.txt 2>&1 || \
  iptables-save > /tmp/network-pre-change.iptables.txt
```

```bash
# 3. Record current DNS resolution
dig +short {critical-domain} > /tmp/network-pre-change.dns.txt
```

```bash
# 4. Verify connectivity to critical endpoints
for target in {gateway} {dns-server} {critical-service-ip}; do
  echo -n "$target: "
  ping -c 1 -W 2 "$target" > /dev/null 2>&1 && echo "OK" || echo "FAIL"
done
```
**Expected output:**
```
{gateway}: OK
{dns-server}: OK
{critical-service-ip}: OK
```

```bash
# 5. Verify out-of-band access works
ipmitool -I lanplus -H {ipmi-ip} -U {user} -P {pass} chassis status
# Or confirm console session is active
```

## Procedure

### Step 1: Dry Run (When Available)

```bash
# Netplan: test configuration with automatic revert
netplan try --timeout 120
```
**Expected output:**
```
Do you want to keep these settings?

Press ENTER before the timeout to accept the new configuration

Changes will revert in 118 seconds
```

```bash
# Firewall: preview rule before applying
ufw --dry-run allow from {source-cidr} to any port {port} proto tcp
```

### Step 2: Apply Change

**Choose the section matching your change type.**

#### VLAN / Interface Change

```bash
# Edit netplan configuration
cat > /etc/netplan/{config-file}.yaml << 'NETPLAN'
network:
  version: 2
  ethernets:
    {interface}:
      addresses:
        - {new-ip}/{cidr}
      routes:
        - to: {destination}
          via: {gateway}
      mtu: {mtu}
      {additional-config}
NETPLAN
```

```bash
# Apply with automatic revert safety net
netplan try --timeout 120
# Press ENTER to accept if connectivity is maintained
```

#### Firewall Rule Change

```bash
# Add firewall rule
ufw allow from {source-cidr} to any port {port} proto {tcp/udp} comment "{change description}"
```
**Expected output:**
```
Rule added
```

```bash
# Or remove a rule
ufw delete allow from {old-source} to any port {port}
```

#### Route Change

```bash
# Add static route
ip route add {destination-cidr} via {gateway} dev {interface} metric {metric}
```

```bash
# Make persistent (add to netplan or /etc/network/interfaces)
cat >> /etc/netplan/{config-file}.yaml << 'ROUTE'
      routes:
        - to: {destination-cidr}
          via: {gateway}
          metric: {metric}
ROUTE
netplan apply
```

#### DNS Change

```bash
# Update DNS resolver configuration
cat > /etc/systemd/resolved.conf.d/{change}.conf << 'DNS'
[Resolve]
DNS={new-dns-1} {new-dns-2}
Domains={search-domain}
DNS
systemctl restart systemd-resolved
```

### Step 3: Immediate Verification

```bash
# Verify the change took effect
ip addr show {interface}
ip route show
```

```bash
# Verify connectivity is maintained
for target in {gateway} {dns-server} {critical-service-ip}; do
  echo -n "$target: "
  ping -c 3 -W 2 "$target" > /dev/null 2>&1 && echo "OK" || echo "FAIL"
done
```
**Expected output:**
```
{gateway}: OK
{dns-server}: OK
{critical-service-ip}: OK
```

```bash
# Verify affected services are reachable
for svc in {affected-services-with-ports}; do
  echo -n "$svc: "
  curl -sf --connect-timeout 5 "http://$svc" > /dev/null && echo "OK" || echo "FAIL"
done
```

## Verification

```bash
# 1. Compare post-change state to pre-change
diff /tmp/network-pre-change.ip-addr.txt <(ip addr show)
diff /tmp/network-pre-change.ip-route.txt <(ip route show)
```

```bash
# 2. DNS still resolves
dig +short {critical-domain}
```

```bash
# 3. All services healthy
for svc in {service-list}; do
  echo -n "$svc: "
  systemctl is-active "$svc"
done
```

```bash
# 4. No packet loss to critical endpoints
ping -c 10 {gateway} | tail -1
```
**Expected output:**
```
... 0% packet loss ...
```

```bash
# 5. MTU path works (if MTU changed)
ping -c 3 -M do -s {mtu-minus-28} {remote-host}
```

## Rollback

**Trigger rollback if**: Connectivity lost, services unreachable, or unexpected routing behavior.

```bash
# Option A: Restore netplan from backup
cp /etc/netplan/{config-file}.yaml.bak /etc/netplan/{config-file}.yaml
netplan apply
```

```bash
# Option B: Remove firewall rule
ufw delete allow from {source-cidr} to any port {port}
```

```bash
# Option C: Remove route
ip route del {destination-cidr} via {gateway}
```

```bash
# Verify rollback restored connectivity
for target in {gateway} {dns-server} {critical-service-ip}; do
  echo -n "$target: "
  ping -c 1 -W 2 "$target" > /dev/null 2>&1 && echo "OK" || echo "FAIL"
done
```

**If primary access is lost**: Use out-of-band access (IPMI/console) to revert changes.

## Troubleshooting

| Symptom | Likely Cause | Resolution |
|---------|-------------|------------|
| Lost SSH after netplan apply | IP or route misconfigured | Use IPMI/console to revert netplan config |
| `RTNETLINK: File exists` | Route already exists | Delete existing route first, then add new one |
| UFW rule has no effect | Rule order — deny rule is higher | Check `ufw status numbered`, reorder rules |
| DNS not resolving after change | systemd-resolved not restarted | `systemctl restart systemd-resolved` |
| MTU blackhole (large packets dropped) | Path MTU mismatch | Check MTU on each hop, reduce to lowest common |
| ARP timeout to gateway | Wrong VLAN or interface | Verify VLAN tag and switch port configuration |

## What NOT to Fix

- Physical switch port configuration — coordinate with network team
- ISP routing / BGP changes — outside scope of host-level runbook
- Wireless / WiFi configuration — not applicable to server infrastructure

## Agent Rules

- DO: Run all pre-checks before making any change
- DO: Use `netplan try` with timeout for interface/route changes
- DO: Have out-of-band access confirmed before touching primary interface
- DO: Save pre-change state for diff comparison
- DO NOT: Apply network changes without a tested rollback path
- DO NOT: Change the primary interface on a remote host without console access
- DO NOT: Apply changes to multiple hosts simultaneously — one at a time
- DO NOT: Remove firewall rules without understanding what they protect
- ESCALATE IF: Out-of-band access is unavailable for the target host
- ESCALATE IF: The change affects cross-host routing or fleet-wide DNS
- ESCALATE IF: Post-change verification shows unexpected connectivity loss

## Audit Trail

| Field | Value |
|-------|-------|
| Author | {author} |
| Change request | {CR number or "ad-hoc"} |
| Created | {date} |
| Last tested | {date} |
| Last modified | {date} |
| Applicable hosts | {hostname list} |
| Pre-change snapshot | /tmp/network-pre-change.*.txt |
