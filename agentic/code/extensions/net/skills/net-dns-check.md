---
name: net-dns-check
description: Verify DNS resolution matches declared records across all zones
trigger: when the operator requests DNS verification, zone check, or record validation
---

# DNS Health Check

## Purpose

Verify that every DNS record declared in `network-state.yaml` resolves correctly via the authoritative nameserver. Detect mismatches, NXDOMAIN responses, stale records, and missing records. Produce a DNS health report with per-record status and a prioritized remediation list.

## Workflow

### 1. Load Declared DNS Records

Read `network-state.yaml` and extract all declared DNS zones and records:

```
Input: network-state.yaml (dns_zones section)
Output: List of (zone, provider, server, record-name, record-type, expected-value, ttl)
```

Example extraction:

```yaml
zones:
  - zone: example.internal
    provider: unbound
    server: 192.168.1.1
    records:
      - name: gateway
        type: A
        value: 192.168.1.1
      - name: nas
        type: A
        value: 192.168.10.20
```

### 2. Resolve Each Record

For each declared record, perform a live DNS lookup against the declared authoritative nameserver:

```bash
# A / AAAA record
dig +short {record-fqdn} {A|AAAA} @{nameserver}

# CNAME record
dig +short {record-fqdn} CNAME @{nameserver}

# MX record
dig +short {record-fqdn} MX @{nameserver}

# TXT record
dig +short {record-fqdn} TXT @{nameserver}

# SRV record
dig +short {record-fqdn} SRV @{nameserver}

# PTR record (reverse lookup)
dig +short -x {ip-address} @{nameserver}
```

Collect results including:
- Resolved value(s)
- TTL returned
- Response code (NOERROR, NXDOMAIN, SERVFAIL, etc.)
- Query latency (for health trending)

### 3. Compare Expected vs. Actual

For each record, classify the result:

| Status | Condition |
|--------|-----------|
| PASS | Resolved value matches expected value; response is NOERROR |
| TTL_DRIFT | Value matches but TTL differs from declared value by more than 10% |
| WRONG_VALUE | Resolved value differs from declared expected value |
| NXDOMAIN | Record does not exist in DNS |
| SERVFAIL | Nameserver returned an error |
| NO_RESPONSE | Nameserver did not respond within timeout |
| EXTRA_RECORD | Record exists in DNS but is not declared in network-state.yaml (discovered via zone transfer or secondary check) |

### 4. Check for Undeclared Records (Optional Zone Transfer)

If the operator requests a full zone audit and the nameserver permits zone transfers:

```bash
dig @{nameserver} {zone} AXFR
```

Compare the live zone contents against declared records. Flag records present in DNS but absent from `network-state.yaml` as `UNDOCUMENTED`.

> This step requires explicit operator authorization — zone transfers expose the full zone and should be treated as sensitive.

### 5. Cross-Check Against Service Connectivity

For A and AAAA records that resolve to internal hosts, optionally verify the host is reachable:

```bash
# TCP connect to expected service port
nc -zv -w5 {resolved-ip} {service-port}

# ICMP ping
ping -c 2 -W 3 {resolved-ip}
```

Flag records that resolve correctly but whose target is unreachable as `STALE_RECORD` — the DNS entry exists but the host or service it points to is gone.

### 6. Produce DNS Health Report

```markdown
# DNS Health Report — {timestamp}

## Summary
- Zones checked: {count}
- Records checked: {count}
- PASS: {count}
- WRONG_VALUE: {count}
- NXDOMAIN: {count}
- SERVFAIL / NO_RESPONSE: {count}
- TTL_DRIFT: {count}
- UNDOCUMENTED: {count}
- STALE_RECORD: {count}

## Record-by-Record Results

| Zone | FQDN | Type | Expected | Actual | TTL Expected | TTL Actual | Status |
|------|------|------|----------|--------|-------------|-----------|--------|
| {zone} | {fqdn} | {type} | {expected} | {resolved} | {ttl} | {actual-ttl} | {status} |

## Critical Issues (NXDOMAIN / SERVFAIL / WRONG_VALUE)

| FQDN | Type | Issue | Expected | Actual | Impact |
|------|------|-------|----------|--------|--------|
| {fqdn} | {type} | {issue} | {expected} | {actual} | {affected-services} |

## Undocumented Records

Records present in live DNS but absent from network-state.yaml:

| Zone | FQDN | Type | Value | Action Required |
|------|------|------|-------|----------------|
| {zone} | {fqdn} | {type} | {value} | Add to state file or remove from DNS |

## Stale Records

Records that resolve correctly but whose targets are unreachable:

| FQDN | Type | Resolved IP | Reachability | Action Required |
|------|------|------------|-------------|----------------|
| {fqdn} | {type} | {ip} | UNREACHABLE | Verify host status; remove or update record |

## Remediation Actions

| Priority | FQDN | Action |
|----------|------|--------|
| {P1|P2|P3} | {fqdn} | {specific remediation step} |
```

## Output

- `dns-health-{timestamp}.md` — Full DNS health report
- Console summary with status counts
- Exit non-zero if any NXDOMAIN, SERVFAIL, WRONG_VALUE, or STALE_RECORD results are found
