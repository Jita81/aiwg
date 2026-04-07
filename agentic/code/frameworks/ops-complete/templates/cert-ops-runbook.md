# Certificate Operations Runbook

## Purpose

Manage the full PKI certificate lifecycle: issue new certificates, renew expiring certificates, revoke compromised certificates, and distribute trust anchors across the fleet. Incorrect certificate operations can cause service outages or security incidents — follow each procedure exactly.

**Warning**: Revoking a certificate is irreversible. Issuing a wildcard certificate expands the attack surface. Always confirm the operation type and target before proceeding.

## System Topology

| Field | Value |
|-------|-------|
| CA type | {internal CA / Let's Encrypt / commercial CA} |
| CA host | {hostname of CA or ACME endpoint} |
| CA root cert | {path — e.g., /etc/ssl/ca/root-ca.pem} |
| CA intermediate cert | {path — e.g., /etc/ssl/ca/intermediate-ca.pem} |
| Certificate store | {path — e.g., /etc/ssl/certs/} |
| Private key store | {path — e.g., /etc/ssl/private/} |
| ACME client | {certbot / acme.sh / step-ca} |
| Trust distribution | {method — e.g., ansible, scp, update-ca-certificates} |
| Monitoring | {cert-exporter endpoint or cron check} |

## Prerequisites

- [ ] CA root and intermediate certificates are accessible
- [ ] Private key storage directory exists with mode 700
- [ ] ACME client installed and configured (if using ACME)
- [ ] DNS records exist for certificate SANs
- [ ] Access to all target hosts for trust distribution

## Procedure: Issue New Certificate

### Step 1: Generate Private Key

```bash
# Generate 4096-bit RSA key (or ECDSA P-256)
openssl genrsa -out /etc/ssl/private/{domain}.key 4096
chmod 600 /etc/ssl/private/{domain}.key
```
**Expected output:**
```
Generating RSA private key, 4096 bit long modulus
...
```

### Step 2: Create Certificate Signing Request

```bash
# Generate CSR with SANs
openssl req -new \
  -key /etc/ssl/private/{domain}.key \
  -out /tmp/{domain}.csr \
  -subj "/CN={domain}/O={organization}/C={country}" \
  -addext "subjectAltName=DNS:{domain},DNS:{san2},DNS:{san3}"
```
**Expected output:** (no output on success)

```bash
# Verify CSR contents
openssl req -in /tmp/{domain}.csr -noout -text | grep -A2 "Subject:"
```
**Expected output:**
```
        Subject: CN = {domain}, O = {organization}, C = {country}
```

### Step 3: Sign Certificate

**Option A: Internal CA**
```bash
openssl x509 -req \
  -in /tmp/{domain}.csr \
  -CA /etc/ssl/ca/intermediate-ca.pem \
  -CAkey /etc/ssl/ca/intermediate-ca.key \
  -CAcreateserial \
  -out /etc/ssl/certs/{domain}.pem \
  -days {validity-days} \
  -sha256 \
  -copy_extensions copyall
```

**Option B: ACME (Let's Encrypt)**
```bash
certbot certonly \
  --dns-{provider} \
  -d {domain} \
  -d {san2} \
  --cert-path /etc/ssl/certs/{domain}.pem \
  --key-path /etc/ssl/private/{domain}.key
```

### Step 4: Build Certificate Chain

```bash
# Concatenate cert + intermediate (leaf first)
cat /etc/ssl/certs/{domain}.pem /etc/ssl/ca/intermediate-ca.pem > /etc/ssl/certs/{domain}-fullchain.pem
```

### Step 5: Verify Certificate

```bash
# Verify chain of trust
openssl verify -CAfile /etc/ssl/ca/root-ca.pem -untrusted /etc/ssl/ca/intermediate-ca.pem /etc/ssl/certs/{domain}.pem
```
**Expected output:**
```
/etc/ssl/certs/{domain}.pem: OK
```

```bash
# Check expiration date
openssl x509 -in /etc/ssl/certs/{domain}.pem -noout -enddate
```
**Expected output:**
```
notAfter={expiration date}
```

```bash
# Verify key matches certificate
diff <(openssl x509 -in /etc/ssl/certs/{domain}.pem -noout -modulus) \
     <(openssl rsa -in /etc/ssl/private/{domain}.key -noout -modulus)
```
**Expected output:** (no output = keys match)

## Procedure: Renew Expiring Certificate

### Step 1: Check Current Expiration

```bash
# Check days until expiration
openssl x509 -in /etc/ssl/certs/{domain}.pem -noout -enddate -checkend $((30*86400))
```
**Expected output (expiring within 30 days):**
```
notAfter=...
Certificate will expire
```

### Step 2: Renew

**ACME renewal:**
```bash
certbot renew --cert-name {domain} --dry-run
```
**Expected output:**
```
Congratulations, all simulated renewals succeeded
```

```bash
# Execute actual renewal
certbot renew --cert-name {domain}
```

**Manual renewal**: Follow the "Issue New Certificate" procedure above, reusing the existing key or generating a new one.

### Step 3: Reload Services

```bash
# Reload services that use this certificate
systemctl reload {nginx/haproxy/service}
```

```bash
# Verify service is using new certificate
echo | openssl s_client -connect {hostname}:{port} -servername {domain} 2>/dev/null | openssl x509 -noout -enddate
```
**Expected output:**
```
notAfter={new expiration date}
```

## Procedure: Revoke Certificate

**This operation is irreversible. Confirm the certificate serial and reason before proceeding.**

### Step 1: Identify Certificate to Revoke

```bash
# Get certificate serial number
openssl x509 -in /etc/ssl/certs/{domain}.pem -noout -serial
```
**Expected output:**
```
serial={HEXSERIAL}
```

### Step 2: Revoke

**Internal CA:**
```bash
openssl ca -revoke /etc/ssl/certs/{domain}.pem \
  -config /etc/ssl/ca/openssl.cnf \
  -crl_reason {keyCompromise/cessationOfOperation/superseded}
```

**ACME:**
```bash
certbot revoke --cert-path /etc/ssl/certs/{domain}.pem --reason {reason}
```

### Step 3: Regenerate CRL

```bash
openssl ca -gencrl -out /etc/ssl/ca/crl.pem -config /etc/ssl/ca/openssl.cnf
```

### Step 4: Distribute Updated CRL

```bash
# Push CRL to all hosts that validate against this CA
for host in {fleet-hosts}; do
  scp /etc/ssl/ca/crl.pem "$host":/etc/ssl/ca/crl.pem
  ssh "$host" "update-ca-certificates"
done
```

### Step 5: Replace Revoked Certificate

Follow the "Issue New Certificate" procedure to generate a replacement.

## Procedure: Push Trust to Fleet

### Step 1: Distribute CA Certificates

```bash
# Copy root CA to trust store on each host
for host in {fleet-hosts}; do
  scp /etc/ssl/ca/root-ca.pem "$host":/usr/local/share/ca-certificates/internal-root-ca.crt
  scp /etc/ssl/ca/intermediate-ca.pem "$host":/usr/local/share/ca-certificates/internal-intermediate-ca.crt
  ssh "$host" "update-ca-certificates"
done
```
**Expected output (per host):**
```
Updating certificates in /etc/ssl/certs...
2 added, 0 removed; done.
```

### Step 2: Verify Trust

```bash
# Verify a host trusts the internal CA
for host in {fleet-hosts}; do
  echo -n "$host: "
  ssh "$host" "openssl verify -CApath /etc/ssl/certs /etc/ssl/certs/{domain}.pem" 2>&1 | tail -1
done
```
**Expected output:**
```
host-01: /etc/ssl/certs/{domain}.pem: OK
host-02: /etc/ssl/certs/{domain}.pem: OK
```

## Verification

```bash
# 1. Certificate is valid and not expired
openssl x509 -in /etc/ssl/certs/{domain}.pem -noout -dates
```

```bash
# 2. Chain validates
openssl verify -CAfile /etc/ssl/ca/root-ca.pem -untrusted /etc/ssl/ca/intermediate-ca.pem /etc/ssl/certs/{domain}.pem
```
**Expected output:**
```
...: OK
```

```bash
# 3. TLS handshake succeeds
echo | openssl s_client -connect {hostname}:{port} -servername {domain} 2>/dev/null | head -5
```
**Expected output:**
```
CONNECTED(00000003)
depth=2 ...
verify return:1
```

```bash
# 4. Key permissions are restrictive
stat -c '%a %U' /etc/ssl/private/{domain}.key
```
**Expected output:**
```
600 root
```

## Troubleshooting

| Symptom | Likely Cause | Resolution |
|---------|-------------|------------|
| `verify error:unable to get local issuer certificate` | Incomplete chain | Ensure intermediate cert is included in fullchain |
| `certificate has expired` | Renewal not run or not reloaded | Renew cert, then `systemctl reload {service}` |
| `key values mismatch` | Key and cert from different CSRs | Re-issue cert using the correct key |
| ACME challenge fails | DNS not propagated or port 80 blocked | Verify DNS, check firewall rules |
| `certificate revoked` on clients | CRL check hitting revoked cert | Issue replacement cert, distribute to clients |

## What NOT to Fix

- CA root key rotation — separate, high-ceremony procedure with its own runbook
- Client certificate issues for external partners — coordinate through security team
- Certificate transparency log submissions — handled automatically by public CAs

## Agent Rules

- DO: Verify certificate chain after every issuance
- DO: Check key-cert match before deploying
- DO: Record serial numbers of all issued certificates
- DO NOT: Generate private keys with fewer than 2048 bits (prefer 4096 RSA or P-256 ECDSA)
- DO NOT: Issue wildcard certificates without explicit human approval
- DO NOT: Revoke certificates without human confirmation
- DO NOT: Store private keys in world-readable locations
- ESCALATE IF: CA key may be compromised
- ESCALATE IF: Revocation requested for a production certificate
- ESCALATE IF: Certificate chain validation fails after issuance

## Audit Trail

| Field | Value |
|-------|-------|
| Author | {author} |
| Created | {date} |
| Last tested | {date} |
| Last modified | {date} |
| CA fingerprint | {root CA SHA-256 fingerprint} |
