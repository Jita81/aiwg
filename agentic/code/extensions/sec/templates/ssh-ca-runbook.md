# SSH Certificate Authority Operations Runbook

**CA Name**: {SSH CA Name}
**CA Key Path**: {/path/to/ssh-ca | HSM slot N}
**Operator**: {operator}
**Last Updated**: {YYYY-MM-DD}
**KRL Path**: {/path/to/revoked_keys}

---

## Purpose

Standard operating procedures for the SSH Certificate Authority: signing host and user certificates, rotating the CA key, and performing emergency revocation via Key Revocation List (KRL).

---

## Prerequisites

- SSH CA private key accessible at {/path/to/ssh-ca or HSM slot N}
- SSH CA public key deployed to all fleet hosts in `TrustedUserCAKeys` and `HostCertificate` configuration
- KRL file is deployed to all fleet hosts and updated via automation
- Operator has verified SSH identity and authorization for the requested operation

---

## Procedure 1 — Host Certificate Signing

**Trigger**: New host added to fleet, host certificate expired, or host CA rotation.

### Step 1.1 — Verify Host Identity

Before signing a host certificate, verify the host's identity through an out-of-band channel:
- New host: verify against the provisioning ticket or host profile document
- Renewal: compare the existing host fingerprint in the known_hosts database

```bash
# Collect the host's SSH public key
ssh-keyscan -t ed25519 {hostname} 2>/dev/null | awk '{print $2, $3}'

# Compare against documented fingerprint in host profile
ssh-keygen -lf {/path/to/known-good-host-key.pub}
```

- [ ] Host key fingerprint matches documented value: {expected-fingerprint}

### Step 1.2 — Sign Host Certificate

```bash
# Sign the host's public key with the CA
# -h = host certificate (not user)
# -n = principals (hostnames clients will use to connect)
# -V = validity period (e.g., +52w for one year)
# -I = certificate identity (human-readable label)
ssh-keygen -s {/path/to/ssh-ca} \
  -h \
  -n "{hostname.example.com},{alias.example.com}" \
  -V +52w \
  -I "host-{hostname}-$(date +%Y%m%d)" \
  {hostname.example.com}-key.pub
```

For HSM-backed CA keys:

```bash
# Using PKCS#11 provider (e.g., Yubikey via libykcs11)
ssh-keygen -s "pkcs11:slot={N}" \
  -D /usr/lib/libykcs11.so \
  -h \
  -n "{hostname.example.com}" \
  -V +52w \
  -I "host-{hostname}-$(date +%Y%m%d)" \
  {hostname}-key.pub
```

### Step 1.3 — Deploy Certificate to Host

```bash
# Copy signed certificate to host
scp {hostname.example.com}-key-cert.pub root@{hostname}:/etc/ssh/

# Update sshd_config to reference the host certificate
ssh root@{hostname} "echo 'HostCertificate /etc/ssh/{hostname.example.com}-key-cert.pub' >> /etc/ssh/sshd_config"
ssh root@{hostname} "systemctl reload sshd"
```

### Step 1.4 — Update known_hosts for Clients

With SSH CA-signed host certificates, clients trust certificates issued by the CA rather than individual host keys. Verify clients have the CA public key in their `known_hosts` or `/etc/ssh/ssh_known_hosts`:

```
# Format for ssh_known_hosts with CA
@cert-authority *.example.com {ca-public-key}
```

### Step 1.5 — Verify Certificate

```bash
# Display the signed certificate
ssh-keygen -L -f {hostname.example.com}-key-cert.pub
```

- [ ] Certificate type is `ssh-ed25519-cert-v01@openssh.com` (or equivalent host type)
- [ ] Principals include all hostnames used to reach this host
- [ ] Validity period is correct
- [ ] Signed by the correct CA (check key ID matches CA fingerprint)

---

## Procedure 2 — User Certificate Issuance

**Trigger**: New operator requires fleet access, certificate expired, or principal change.

### Step 2.1 — Verify Operator Identity

Confirm the requesting operator's identity via:
- Active directory / IdP lookup confirming employment and role
- Manager approval in the access request ticket
- Multi-factor authentication confirmation (operator must be signed in to IdP)

```
Requestor: {operator-name}
Email: {email}
Role: {role}
Access Level: {standard|privileged|emergency}
Principals Required: {list of target hosts or groups}
Justification: {ticket-url}
Approved By: {approver}
```

### Step 2.2 — Determine Principals and Validity

| Access Level | Principals | Validity | Source Restrictions |
|-------------|-----------|----------|---------------------|
| Standard | `{username}` on designated hosts | 90 days | None |
| Privileged | `{username},root` on designated hosts | 30 days | Restrict to office IPs |
| Emergency | `root` on specific host | 8 hours | Restrict to operator IP |
| CI/CD | `deploy` on target hosts | 365 days | Restrict to CI IP range |

### Step 2.3 — Sign User Certificate

```bash
# Sign the operator's SSH public key
ssh-keygen -s {/path/to/ssh-ca} \
  -I "{operator-email}-$(date +%Y%m%d)" \
  -n "{username},{additional-principal}" \
  -V {+90d|+30d|+8h|+365d} \
  -O "source-address={ip-range}" \  # omit if no source restriction
  {operator-public-key.pub}
```

### Step 2.4 — Deliver and Verify

```bash
# Return the signed certificate to the operator
# Operator runs:
ssh-keygen -L -f {operator-key-cert.pub}
```

Verify:
- [ ] Identity matches operator email
- [ ] Principals match the approved access scope
- [ ] Validity period matches the access level
- [ ] Source address restriction is present if required

Record the issuance in the access audit log: `.aiwg/security/access-snapshots/ssh-cert-issuances.md`

---

## Procedure 3 — CA Key Rotation

**Trigger**: CA key compromise (emergency), scheduled rotation (annual), or algorithm upgrade.

CA key rotation requires an overlap period to avoid locking out hosts and users with certificates issued by the old CA.

### Step 3.1 — Generate New CA Key

```bash
# Generate new CA key pair (never overwrite the old CA key until rotation is complete)
ssh-keygen -t ed25519 -f /path/to/ssh-ca-new -C "SSH CA {org} rotation $(date +%Y%m%d)" -N ""

# Display the new CA public key for distribution
cat /path/to/ssh-ca-new.pub
```

### Step 3.2 — Deploy New CA Public Key (Parallel Trust)

Add the new CA public key to all fleet hosts BEFORE using it to sign any certificates. This allows both old and new CA signatures to be trusted during the overlap period.

```bash
# Add new CA to fleet /etc/ssh/ssh_known_hosts (append — do not remove old CA)
ansible -i {inventory} all -m lineinfile \
  -a "path=/etc/ssh/ssh_known_hosts line='@cert-authority *.example.com {new-ca-public-key}' state=present"

# Verify on a sample host
ssh {sample-host} "grep -c cert-authority /etc/ssh/ssh_known_hosts"  # should be 2 now
```

### Step 3.3 — Re-Issue All Host Certificates

For each fleet host, issue a new host certificate signed by the new CA:
- Follow Procedure 1 for each host
- Set validity to overlap with the remaining validity of any user certificates issued by the old CA

Track progress: all hosts must have new certificates before removing the old CA from trust.

### Step 3.4 — Re-Issue All Active User Certificates

Notify all operators with active user certificates and re-issue using the new CA:
- Follow Procedure 2 for each operator
- Old certificates signed by the old CA continue to work during the overlap period

### Step 3.5 — Remove Old CA from Trust (After Overlap Period)

Only after all host and user certificates issued by the old CA have expired or been replaced:

```bash
# Remove old CA from fleet trust
ansible -i {inventory} all -m lineinfile \
  -a "path=/etc/ssh/ssh_known_hosts line='@cert-authority *.example.com {old-ca-public-key}' state=absent"

# Verify old CA removed
ansible -i {inventory} all -m command -a "grep -c cert-authority /etc/ssh/ssh_known_hosts"  # should be 1 now
```

Archive the old CA public key in the PKI records. Securely delete or decommission the old CA private key following the key destruction procedure for the storage type (HSM reset or secure file deletion with `shred`).

---

## Procedure 4 — Emergency Revocation (KRL)

**Trigger**: Operator private key compromised, certificate issued in error, or operator terminated immediately.

SSH does not use CRLs. Revocation is handled via a Key Revocation List (KRL), which must be deployed to all fleet hosts immediately upon creation.

### Step 4.1 — Identify Certificate to Revoke

```bash
# If you have the certificate file
ssh-keygen -L -f {operator-key-cert.pub}

# Get the serial number from the certificate
ssh-keygen -L -f {operator-key-cert.pub} | grep Serial
```

### Step 4.2 — Add to KRL

```bash
# Create or update the KRL — add the revoked certificate by serial number
# -u = update existing KRL (omit -u to create a new KRL)
ssh-keygen -k \
  -u \
  -f /path/to/revoked_keys \
  -s {/path/to/ssh-ca.pub} \
  -z {serial-number} \
  /dev/null

# Alternatively, revoke by public key file
ssh-keygen -k -u -f /path/to/revoked_keys {operator-public-key.pub}
```

### Step 4.3 — Deploy KRL to Fleet

```bash
# Deploy updated KRL to all fleet hosts immediately
ansible -i {inventory} all -m copy \
  -a "src=/path/to/revoked_keys dest=/etc/ssh/revoked_keys owner=root mode=0644"

# Verify KRL is loaded (sshd must reference RevokedKeys in sshd_config)
ansible -i {inventory} all -m command -a "grep RevokedKeys /etc/ssh/sshd_config"

# Reload sshd on all hosts to pick up the new KRL
ansible -i {inventory} all -m systemd -a "name=sshd state=reloaded"
```

### Step 4.4 — Verify Revocation

```bash
# Test that the revoked certificate is rejected
ssh -i {compromised-key} -o CertificateFile={operator-key-cert.pub} \
  {hostname} "echo connected" 2>&1 | grep -i "revoked\|not allowed\|permission denied"
```

Expected output should include a revocation error. If the connection succeeds, the KRL was not deployed correctly.

### Step 4.5 — Record Revocation

Update the access audit log with:
- Certificate serial number revoked
- Operator identity
- Reason for revocation
- Date and time
- KRL deployment confirmation
