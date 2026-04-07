---
name: sys-cert-check
description: Scan fleet hosts for TLS certificate expiry across all tracked services
trigger: when the operator requests a certificate audit, cert expiry check, or TLS health scan
---

# Fleet Certificate Expiry Check

## Purpose

Scan all tracked fleet hosts and services for TLS certificate expiry. Produce a consolidated report showing certificates approaching expiry, already expired, and healthy. Flag any host where certificate state cannot be determined.

## Workflow

### 1. Discover Services with TLS

Scan fleet documentation (system-spec documents, fleet-inventory, host-profiles) and extract all services that use TLS certificates:

```
Input: Fleet documentation directory or OpsInventory YAML
Output: List of (hostname, service, port, expected_cn) tuples
```

Common TLS-bearing services to check:
- HTTPS (443, 8443)
- SSH (22 — host key, not TLS but include fingerprint)
- SMTP/SMTPS (25, 465, 587)
- LDAPS (636)
- Docker API (2376)
- PostgreSQL with TLS (5432)
- MySQL with TLS (3306)
- Custom services documented in host profiles

### 2. Collect Certificate State

For each reachable (host, port) pair, retrieve the TLS certificate:

```bash
# Retrieve certificate details from a TLS service
echo | openssl s_client -connect {host}:{port} -servername {hostname} 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates -fingerprint -serial

# Parse expiry specifically
echo | openssl s_client -connect {host}:{port} -servername {hostname} 2>/dev/null \
  | openssl x509 -noout -enddate \
  | cut -d= -f2

# Check days until expiry
echo | openssl s_client -connect {host}:{port} -servername {hostname} 2>/dev/null \
  | openssl x509 -noout -checkend $((86400 * 30)) && echo "Valid >30d" || echo "Expires within 30d"
```

For local certificate files (when running on the host):

```bash
# Check a certificate file directly
openssl x509 -in {cert_path} -noout -subject -issuer -dates -fingerprint

# Check all certs in a directory
for cert in /etc/ssl/certs/*.pem; do
  printf "%s: " "$cert"
  openssl x509 -in "$cert" -noout -enddate 2>/dev/null || echo "PARSE_ERROR"
done
```

### 3. Classify Certificates

For each certificate, compute days until expiry and classify:

| Status | Criteria |
|--------|----------|
| EXPIRED | Expiry date is in the past |
| CRITICAL | Expires within 7 days |
| WARNING | Expires within 30 days |
| HEALTHY | Expires in more than 30 days |
| UNREACHABLE | Host or port not accessible |
| PARSE_ERROR | Certificate could not be parsed |
| SELF_SIGNED | Issuer matches subject (flag for review, not necessarily a problem) |

### 4. Produce Certificate Report

```markdown
# Fleet Certificate Report
**Scanned**: {timestamp}
**Hosts Checked**: {host_count}
**Services Checked**: {service_count}

## Summary

| Status | Count |
|--------|-------|
| EXPIRED | {n} |
| CRITICAL (<7d) | {n} |
| WARNING (<30d) | {n} |
| HEALTHY (>30d) | {n} |
| UNREACHABLE | {n} |
| PARSE_ERROR | {n} |

## Action Required

### Expired Certificates

| Host | Service | Port | Subject | Expired On |
|------|---------|------|---------|------------|
| {host} | {service} | {port} | {subject_cn} | {expiry_date} |

### Expiring Within 7 Days

| Host | Service | Port | Subject | Expires On | Days Left |
|------|---------|------|---------|------------|-----------|
| {host} | {service} | {port} | {subject_cn} | {expiry_date} | {days} |

### Expiring Within 30 Days

| Host | Service | Port | Subject | Expires On | Days Left |
|------|---------|------|---------|------------|-----------|
| {host} | {service} | {port} | {subject_cn} | {expiry_date} | {days} |

## Healthy Certificates

| Host | Service | Port | Subject | Issuer | Expires On | Days Left |
|------|---------|------|---------|--------|------------|-----------|
| {host} | {service} | {port} | {subject_cn} | {issuer_cn} | {expiry_date} | {days} |

## Unreachable / Errors

| Host | Service | Port | Error |
|------|---------|------|-------|
| {host} | {service} | {port} | {error_description} |
```

### 5. Recommended Actions

For each non-healthy certificate, suggest:
- **EXPIRED / CRITICAL**: Immediate renewal required. Identify the CA (Let's Encrypt, internal CA, vendor) and the renewal method.
- **WARNING**: Schedule renewal. Add to next maintenance window.
- **SELF_SIGNED**: Confirm whether self-signed is intentional. If not, recommend CA-signed replacement.
- **UNREACHABLE**: Verify host is online, firewall allows the port, and the service is running.

## Output

- `fleet-cert-report.md` — Consolidated certificate status report
- Exit with non-zero status if any EXPIRED or CRITICAL certificates found (for CI/cron integration)
