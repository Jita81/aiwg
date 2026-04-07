---
name: net-connectivity-test
description: Run reachability tests between fleet segments after network changes
trigger: when the operator requests connectivity test, segment reachability check, or post-change verification
---

# Connectivity Test

## Purpose

Run structured reachability tests between VLAN segments and key services after a network change. Identify traffic flows that are unexpectedly blocked or unexpectedly allowed, verify that firewall rules are enforcing the intended policy, and produce a connectivity matrix that can be compared against a baseline.

## Workflow

### 1. Load Segment Definitions

Read `network-state.yaml` to build the list of VLAN segments, their subnets, gateways, and any declared inter-VLAN firewall rules:

```
Input: network-state.yaml (vlans, firewall_rules sections)
Output:
  - Segment list: [{id, name, subnet, gateway}]
  - Expected flows: [{src-segment, dst-segment, port, proto, expected: allow|deny}]
```

If the operator has provided a specific set of source/destination pairs to test, use those. Otherwise, derive the test matrix from the declared firewall rules.

### 2. Identify Test Probes

For each VLAN segment in scope, identify a test host (a reachable host within that segment from which probes can be run):

```bash
# Find a host in the segment via ARP table or DHCP leases
arp -n | grep "^{segment-subnet-prefix}"
# or
cat /var/lib/misc/dnsmasq.leases | awk '{print $3, $4}' | grep "{segment-subnet-prefix}"
```

If no live host is available in a segment, flag the segment as `NO_PROBE_HOST` and skip it with a warning.

### 3. Run Cross-Segment Connectivity Tests

For each (source segment, destination segment, port, protocol) tuple in the test matrix:

**TCP reachability:**

```bash
# From source host, test TCP connect to destination
ssh {src-host} "nc -zv -w5 {dst-ip} {port}"
# Expected for allowed flows: connection succeeds (exit 0)
# Expected for denied flows: connection refused or timeout (exit non-zero)
```

**ICMP reachability:**

```bash
# Test ICMP (used when ICMP policy differs from TCP)
ssh {src-host} "ping -c 3 -W 2 {dst-ip}"
```

**UDP reachability (where applicable):**

```bash
# UDP is stateless — test against a service that responds (e.g., DNS)
ssh {src-host} "dig +short {hostname} @{dns-server-in-dst-segment}"
```

**HTTP/HTTPS service verification:**

```bash
# For services with a health endpoint
ssh {src-host} "curl -sf --connect-timeout 5 http://{dst-service-ip}:{port}/healthz"
```

Collect results as:
- `ALLOWED` — Connection succeeded
- `BLOCKED` — Connection refused, timed out, or ICMP unreachable received
- `ERROR` — Probe host unreachable or command failed for other reason

### 4. Compare Against Expected Policy

For each tested flow, compare the actual result against the expected result derived from the firewall rules in `network-state.yaml`:

| Flow | Expected | Actual | Status |
|------|----------|--------|--------|
| {src-segment} → {dst-segment}:{port} | ALLOWED | ALLOWED | MATCH |
| {src-segment} → {dst-segment}:{port} | BLOCKED | ALLOWED | VIOLATION — unexpected allow |
| {src-segment} → {dst-segment}:{port} | ALLOWED | BLOCKED | VIOLATION — unexpected block |
| {src-segment} → {dst-segment}:{port} | BLOCKED | BLOCKED | MATCH |

Classify:
- **MATCH**: Actual result aligns with declared firewall policy
- **UNEXPECTED_ALLOW**: Traffic was allowed when the declared policy says it should be blocked — potential security gap
- **UNEXPECTED_BLOCK**: Traffic was blocked when the declared policy says it should be allowed — potential service outage

### 5. Produce Connectivity Matrix

Output a connectivity matrix showing the result for each segment pair tested:

```
Connectivity Matrix — {timestamp}
Source\Destination    | mgmt   | prod   | storage | iot    | guest
----------------------|--------|--------|---------|--------|-------
management            |  —     | ALLOW  | ALLOW   | ALLOW  | DENY
production            | DENY   |  —     | ALLOW   | DENY   | DENY
storage               | DENY   | DENY   |  —      | DENY   | DENY
iot                   | DENY   | DENY   | DENY    |  —     | DENY
guest                 | DENY   | DENY   | DENY    | DENY   |  —
```

Color-code or annotate:
- `ALLOW (MATCH)` — expected allow, confirmed
- `DENY (MATCH)` — expected deny, confirmed
- `ALLOW (VIOLATION)` — unexpected allow — flagged for review
- `DENY (VIOLATION)` — unexpected block — flagged for review

### 6. Produce Connectivity Test Report

```markdown
# Connectivity Test Report — {timestamp}

## Trigger
{post-change verification for CHG-{id} | operator-requested segment check}

## Summary
- Segments tested: {count}
- Flows tested: {count}
- MATCH: {count}
- UNEXPECTED_ALLOW (violations): {count}
- UNEXPECTED_BLOCK (violations): {count}
- ERROR / NO_PROBE_HOST: {count}

## Violations

### Unexpected Allows (Security Gaps)

| Source Segment | Destination | Port | Protocol | Declared Policy | Actual Result |
|---------------|------------|------|----------|----------------|--------------|
| {src} | {dst-ip}:{port} | {port} | {proto} | DENY | ALLOWED |

**Recommended action**: Review firewall chain {chain} for a rule permitting this flow. If no such rule should exist, investigate and remove.

### Unexpected Blocks (Service Disruptions)

| Source Segment | Destination | Port | Protocol | Declared Policy | Actual Result |
|---------------|------------|------|----------|----------------|--------------|
| {src} | {dst-ip}:{port} | {port} | {proto} | ALLOW | BLOCKED |

**Recommended action**: Verify firewall rule for {chain} allows this flow. Check rule order — a prior DROP or REJECT rule may be matching before the intended ACCEPT.

## Connectivity Matrix

{full matrix as described in step 5}

## Skipped Tests

| Segment | Reason |
|---------|--------|
| {segment} | NO_PROBE_HOST — no reachable host found in this segment |
| {segment} | ERROR — probe host unreachable |
```

## Output

- `connectivity-test-{timestamp}.md` — Full connectivity test report with matrix
- Console summary with violation counts
- Exit non-zero if any UNEXPECTED_ALLOW or UNEXPECTED_BLOCK results are found
