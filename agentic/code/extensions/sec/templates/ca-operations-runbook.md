# CA Operations Runbook

**CA Name**: {CA Name}
**CA Type**: {Root|Intermediate|Issuing}
**Operator**: {operator}
**Last Updated**: {YYYY-MM-DD}
**PKI Hierarchy Reference**: {path/to/pki-hierarchy.yaml}

---

## Purpose

Standard operating procedures for certificate issuance, renewal, revocation, CRL publication, and trust chain distribution for {CA Name}.

---

## Prerequisites

- CA private key is accessible at {HSM slot N | /path/to/ca.key}
- Operator has been through key ceremony training
- HSM PIN / key file passphrase is accessible in the authorized credential store
- CRL distribution point {http://pki.example.com/crl} is operational
- Fleet trust store distribution mechanism is available

---

## Procedure 1 — Issue Certificate

**Trigger**: New service, host, or user requires a certificate signed by this CA.

### Step 1.1 — Receive and Validate CSR

```bash
# Display the CSR and validate its contents
openssl req -in {request.csr} -noout -text

# Verify CSR signature (self-signed by the requestor's private key)
openssl req -in {request.csr} -noout -verify
```

**Validate**:
- [ ] Subject DN matches policy for this CA (correct OU, O, C)
- [ ] SANs are present and correct for the intended use
- [ ] Key algorithm meets minimum requirements (EC P-384 or RSA 4096)
- [ ] Purpose (TLS server, TLS client, code signing) is appropriate for this issuing CA
- [ ] CSR is from an authorized requestor (verify via ticket or signed request)

### Step 1.2 — Sign the Certificate

```bash
# Sign with the CA — adjust extensions config for the cert type
openssl ca \
  -config {ca-openssl.cnf} \
  -extensions {server_cert|client_cert|code_signing} \
  -days {398} \
  -notext \
  -md sha384 \
  -in {request.csr} \
  -out {signed-cert.pem}
```

For HSM-backed CAs, use the appropriate PKCS#11 engine:

```bash
openssl ca \
  -config {ca-openssl.cnf} \
  -engine pkcs11 \
  -keyform engine \
  -key "pkcs11:slot={N};object={ca-key-label}" \
  -extensions {server_cert} \
  -days 398 \
  -notext \
  -md sha384 \
  -in {request.csr} \
  -out {signed-cert.pem}
```

### Step 1.3 — Verify the Signed Certificate

```bash
# Display the signed certificate
openssl x509 -in {signed-cert.pem} -noout -text

# Verify the certificate chain
openssl verify -CAfile {ca-chain.pem} {signed-cert.pem}
```

**Verify**:
- [ ] Subject and SANs match the CSR
- [ ] Validity period is correct (not_before today, not_after 398 days for TLS)
- [ ] Issuer matches this CA's DN
- [ ] Key Usage and Extended Key Usage match the intended purpose
- [ ] Certificate chain verification returns `OK`

### Step 1.4 — Record and Distribute

```bash
# Record the new certificate in the cert registry
# Serial number from:
openssl x509 -in {signed-cert.pem} -noout -serial
```

- Create or update a `cert-lifecycle-record.yaml` for this certificate
- Send the signed certificate and CA chain bundle to the requestor
- Update the `issued_cert_count` in `pki-hierarchy.yaml`

---

## Procedure 2 — Renew Certificate

**Trigger**: Certificate is approaching expiry (WARNING threshold: ≤ 30 days) or explicit renewal request.

### Step 2.1 — Check Current Certificate State

```bash
# Verify current cert expiry
openssl x509 -in {current-cert.pem} -noout -dates -subject -serial

# Check days remaining
openssl x509 -in {current-cert.pem} -noout -checkend $((86400 * 30)) \
  && echo "Valid >30d" || echo "Expires within 30d"
```

### Step 2.2 — Generate New CSR

For services managing their own keys (key stays on service host):

```bash
# Generate new key and CSR on the target host
ssh {hostname} "openssl req -new -newkey ec -pkeyopt ec_paramgen_curve:P-384 \
  -nodes -out /tmp/renewal.csr \
  -subj '/CN={hostname}/O={org}/C={CC}'"

# Retrieve the CSR
scp {hostname}:/tmp/renewal.csr ./renewal.csr
```

### Step 2.3 — Sign the Renewal

Follow Procedure 1, Steps 1.2 and 1.3, using the renewal CSR.

### Step 2.4 — Deploy the New Certificate

```bash
# Copy new cert and chain to host
scp {signed-cert.pem} {ca-chain.pem} {hostname}:{/etc/ssl/certs/}

# Reload the service (service-specific — examples)
ssh {hostname} "sudo systemctl reload nginx"
ssh {hostname} "sudo systemctl reload postfix"
```

### Step 2.5 — Verify Deployment

```bash
# Verify the live certificate via TLS connection
echo | openssl s_client -connect {hostname}:{port} -servername {hostname} 2>/dev/null \
  | openssl x509 -noout -dates -subject -serial
```

- [ ] New certificate serial matches the issued certificate
- [ ] Expiry date reflects the new validity period
- [ ] Service responds correctly on TLS

### Step 2.6 — Revoke the Old Certificate

Follow Procedure 3 to revoke the previous certificate with reason `superseded`. Update the `cert-lifecycle-record.yaml` to mark the old certificate as revoked.

---

## Procedure 3 — Revoke Certificate

**Trigger**: Key compromise, certificate misuse, operator departure, or routine supersession on renewal.

### Step 3.1 — Add Certificate to CRL

```bash
# Revoke the certificate (update the CA database)
openssl ca \
  -config {ca-openssl.cnf} \
  -revoke {cert-to-revoke.pem} \
  -crl_reason {keyCompromise|superseded|cessationOfOperation|affiliationChanged}
```

### Step 3.2 — Regenerate and Publish CRL

```bash
# Generate updated CRL
openssl ca \
  -config {ca-openssl.cnf} \
  -gencrl \
  -out {ca-name.crl}

# Convert to DER format if required by distribution point
openssl crl -in {ca-name.crl} -outform DER -out {ca-name.crl.der}

# Publish to CRL distribution point
scp {ca-name.crl} {crl-server}:{/var/www/pki/}
```

### Step 3.3 — Verify CRL Publication

```bash
# Verify the CRL is accessible and valid
curl -s {http://pki.example.com/ca-name.crl} | openssl crl -noout -text | grep -E "issuer|Last Update|Next Update"

# Verify the revoked certificate appears in the CRL
openssl crl -in {ca-name.crl} -noout -text | grep -A3 "{serial-number-of-revoked-cert}"
```

### Step 3.4 — Push Trust Update to Fleet

If the revoked certificate is a CA certificate, push the updated trust store to all fleet hosts:

```bash
# Example: push updated CA bundle via Ansible
ansible -i {inventory} all -m copy \
  -a "src={ca-bundle.pem} dest=/etc/ssl/certs/org-ca-bundle.pem owner=root mode=0644"

# Trigger trust store update on Debian/Ubuntu hosts
ansible -i {inventory} all -m command -a "update-ca-certificates"
```

Update the `cert-lifecycle-record.yaml` to record the revocation.

---

## Procedure 4 — CRL Publish Schedule

The CRL must be published on a regular schedule regardless of revocation activity. An expired CRL is treated the same as a CRL containing the certificate — many clients will reject all certificates from this CA.

| CA Type | CRL Validity | Publish Frequency | Next Publish Due |
|---------|-------------|------------------|-----------------|
| Root CA | 365 days | Every 180 days | {YYYY-MM-DD} |
| Intermediate CA | 30 days | Every 14 days | {YYYY-MM-DD} |
| Issuing CA | 7 days | Every 3 days | {YYYY-MM-DD} |

**Automated CRL publication** (systemd timer — recommended):

```ini
# /etc/systemd/system/crl-publish.timer
[Unit]
Description=Publish CRL for {CA Name}

[Timer]
OnCalendar={Mon,Thu} 02:00:00
RandomizedDelaySec=300
Persistent=true

[Install]
WantedBy=timers.target
```

---

## Procedure 5 — Trust Chain Distribution

When a new CA certificate is issued or an existing CA is renewed, distribute the updated trust chain to all fleet hosts.

```bash
# Build the CA chain bundle (leaf CA up to root)
cat {issuing-ca.pem} {intermediate-ca.pem} {root-ca.pem} > {org-ca-bundle.pem}

# Distribute via configuration management
ansible-playbook {trust-distribution.yml}

# Verify on a sample host
ssh {sample-host} "openssl verify -CAfile /etc/ssl/certs/org-ca-bundle.pem {/path/to/test-cert.pem}"
```

Update `pki-hierarchy.yaml` `trust_distribution.last_distributed` after successful distribution.
