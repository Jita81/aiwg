---
name: sec-access-snapshot
description: Collect SSH authorized_keys, sudoers, and IdP client list for access audit
trigger: when the operator requests access snapshot, SSH audit, or sudo review
---

# Access Snapshot

## Purpose

Collect a point-in-time snapshot of all access grants across the fleet: SSH authorized keys, sudo grants, SSH certificate principals, and IdP client inventory. Cross-reference findings against documented access policies and flag unauthorized or undocumented access. Produce a structured access audit report per the `access-audit-report` template, satisfying the frequency requirement in `sec-access-audit-frequency`.

## Workflow

### 1. Identify Fleet Hosts and Users

Load the fleet host inventory from documentation:
- Host profiles or fleet-inventory YAML — enumerate all active hosts
- Determine which users have home directories on each host (for authorized_keys collection)
- Note any hosts excluded from automated collection (air-gapped, restricted access)

### 2. Collect SSH Authorized Keys

For each fleet host, collect all SSH authorized_keys entries across all user accounts:

```bash
# List users with home directories
getent passwd | awk -F: '$3 >= 1000 && $7 !~ /nologin|false/ {print $1, $6}' | sort

# For each user: read authorized_keys
cat /home/{username}/.ssh/authorized_keys 2>/dev/null
cat /root/.ssh/authorized_keys 2>/dev/null

# Get key fingerprints without revealing key material
# (parse the authorized_keys file and compute fingerprints)
while IFS= read -r line; do
  # Skip empty lines and comments
  [[ "$line" =~ ^[[:space:]]*$ || "$line" =~ ^# ]] && continue
  echo "$line" | ssh-keygen -lf - 2>/dev/null || echo "PARSE_ERROR: $line"
done < /home/{username}/.ssh/authorized_keys
```

**Key material handling**: Do NOT output the raw public key material in the report. Record only:
- Key type (ssh-ed25519, ecdsa-sha2-nistp384, ssh-rsa)
- Key fingerprint (SHA256:...)
- Key comment / label (the text after the key — this is the attribution field)

For each key found, attempt to attribute it to an operator via the fleet operator registry or previous audit records.

Flag:
- Keys without a comment (cannot be attributed without further investigation)
- Keys whose comment matches a departed operator's name or email
- Keys appearing across more than 5 hosts without a documented reason (potential key sprawl)

### 3. Collect Sudo Grants

For each fleet host, collect the complete sudo configuration:

```bash
# Read main sudoers file (redact any embedded credentials before recording)
sudo cat /etc/sudoers 2>/dev/null

# Read all drop-in files
for f in /etc/sudoers.d/*; do
  echo "=== $f ==="
  sudo cat "$f" 2>/dev/null
done
```

Parse each grant into structured form:
- User or group (`%group` prefix for groups)
- Allowed commands (`ALL` vs specific command paths)
- `NOPASSWD` flag
- `SETENV` and other permission flags
- Host scope (usually `ALL` in most configs)

Flag:
- `ALL=(ALL) NOPASSWD: ALL` grants (unrestricted passwordless root — requires documented justification)
- `NOPASSWD` grants for shell-escape commands (`vim`, `less`, `python`, `perl`, `bash`, `sh`, `su`)
- Grants referencing users who are not in the current user registry
- Sudoers syntax errors (attempt `visudo -c` dry-run: present this command to the operator)

### 4. Collect SSH Certificate Principals

For each host with SSH CA-based authentication, collect the authorized principals configuration:

```bash
# Check sshd_config for AuthorizedPrincipalsFile setting
sudo grep -E "AuthorizedPrincipalsFile|TrustedUserCAKeys|HostCertificate|RevokedKeys" /etc/ssh/sshd_config

# Read authorized principals file (if configured)
sudo cat /etc/ssh/auth_principals/{username} 2>/dev/null

# Check for KRL (Key Revocation List)
sudo ssh-keygen -Q -f /etc/ssh/revoked_keys {/path/to/cert-to-test.pub} 2>/dev/null
```

List all active SSH certificates from the SSH CA issuance records (`.aiwg/security/access-snapshots/ssh-cert-issuances.md`). For each certificate:
- Check if it has expired
- Verify the principal is still in the authorized principals file
- Confirm the operator is still active in the operator registry

Flag:
- Expired certificates still listed in authorized_principals
- Principals with no corresponding certificate on record
- Hosts not configured with `RevokedKeys` pointing to the KRL

### 5. Collect IdP Client Inventory

Collect the client registry from the identity provider (Keycloak, Authentik, or equivalent):

**Keycloak (via admin API)**:

```bash
# Authenticate to Keycloak admin API
TOKEN=$(curl -s -X POST \
  "https://{keycloak-host}/realms/master/protocol/openid-connect/token" \
  -d "grant_type=password&client_id=admin-cli&username={admin}&password={password}" \
  | jq -r '.access_token')

# List all realms
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://{keycloak-host}/admin/realms" | jq '.[].realm'

# List clients in a realm
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://{keycloak-host}/admin/realms/{realm}/clients" \
  | jq '.[] | {clientId, publicClient, redirectUris, defaultClientScopes}'
```

For each client, record:
- Client ID and description
- Type (public / confidential)
- Redirect URIs (flag wildcards)
- Granted scopes
- Last authentication timestamp (if available)

Flag:
- Wildcard (`*`) in any redirect URI
- Clients with no logins in the past 90 days (potentially stale)
- Clients granted scopes broader than their stated purpose
- Clients with client secrets that have not been rotated in > 365 days

### 6. Cross-Reference with Access Policies

Compare the collected snapshot against the documented access policy (`.aiwg/security/access-policies/` or equivalent):

- SSH access: compare authorized_keys fingerprints against the operator key registry
- Sudo: compare grants against the approved sudo policy document
- SSH certs: compare active certificates against the operator roster
- IdP clients: compare clients against the approved client registry

Flag any access grant that cannot be traced to a documented policy authorization.

### 7. Produce Access Audit Snapshot

Render the findings as a completed `access-audit-report.md` document:

```markdown
# Access Audit Snapshot
**Snapshot Date**: {YYYY-MM-DD HH:MM UTC}
**Operator**: {operator}
**Scope**: {all-fleet | specific-hosts}

## SSH Access Inventory
[populated from Step 2]

## Sudo Grants
[populated from Step 3]

## IdP Client Inventory
[populated from Step 5]

## Certificate Holders
[populated from Step 4]

## Findings
[populated from Steps 2–6 cross-reference]

## Compliance Status
[populated based on findings vs sec-access-audit-frequency thresholds]

## Action Items
[checklist from all findings]
```

### 8. Store and Link Snapshot

```bash
# Save snapshot
SNAPSHOT_FILE=".aiwg/security/access-snapshots/$(date +%Y-%m-%d)-access-snapshot.md"
# Write report content to $SNAPSHOT_FILE

# Update symlink to latest
ln -sf "$(date +%Y-%m-%d)-access-snapshot.md" \
  ".aiwg/security/access-snapshots/latest.md"
```

## Output

- `YYYY-MM-DD-access-snapshot.md` saved to `.aiwg/security/access-snapshots/`
- `latest.md` symlink updated to point to the new snapshot
- Findings summary returned to operator with count by severity
- Exit non-zero if any HIGH severity findings are present
