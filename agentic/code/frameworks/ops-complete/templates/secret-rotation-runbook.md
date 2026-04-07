# Secret Rotation Runbook: {Secret Type}

## Purpose

Rotate {secret type — e.g., API tokens, database passwords, SSH keys, service account credentials} following a controlled ceremony procedure. This runbook ensures zero-downtime rotation by deploying the new secret to all consumers before revoking the old one. Every rotation is logged for audit compliance.

**Warning**: Revoking the old secret before all consumers have the new one will cause an outage. Follow the dual-active window strictly.

## System Topology

| Field | Value |
|-------|-------|
| Secret type | {API token / database password / SSH key / TLS cert / service credential} |
| Secret name | {identifier — e.g., db-prod-password, gitea-api-token} |
| Credential store | {vault / file / env / k8s secret — with path} |
| Rotation schedule | {schedule — e.g., quarterly, on-demand, after incident} |
| Consumers | {list of services/hosts that use this secret} |
| Generator | {method — e.g., openssl rand, vault, manual} |
| Last rotated | {date} |
| Rotation reason | {scheduled / incident / personnel change / audit finding} |

### Consumer Inventory

| Consumer | Host | Config Path | Reload Method |
|----------|------|-------------|---------------|
| {service-1} | {host} | {path — e.g., /etc/{service}/config.yaml} | systemctl reload {service} |
| {service-2} | {host} | {path} | {reload command} |
| {CI/CD pipeline} | {runner} | {env var or secret ref} | {redeploy / re-trigger} |

## Prerequisites

- [ ] Consumer inventory above is complete and current
- [ ] Access to credential store confirmed
- [ ] All consumer hosts are reachable
- [ ] Maintenance window scheduled (if required)
- [ ] Rollback plan reviewed (restore old secret)
- [ ] Two authorized personnel available (for ceremony, if required)

## Procedure

### Phase 1: Generate New Secret

```bash
# Generate new secret value
# Option A: Random token (32 bytes, base64)
NEW_SECRET=$(openssl rand -base64 32)

# Option B: Random password (alphanumeric, 32 chars)
NEW_SECRET=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)

# Option C: SSH key pair
ssh-keygen -t ed25519 -f /tmp/new-key -N "" -C "{purpose}@{date}"
```

```bash
# Verify new secret was generated (do NOT print the value)
echo "New secret length: ${#NEW_SECRET}"
```
**Expected output:**
```
New secret length: 44
```

### Phase 2: Store New Secret

```bash
# Store in credential store alongside old secret (dual-active)
# Option A: File-based store
bash <<'EOF'
# Write new secret to secure file
umask 077
echo "$NEW_SECRET" > {credential-store-path}/{secret-name}.new
chmod 600 {credential-store-path}/{secret-name}.new
EOF
```

```bash
# Option B: HashiCorp Vault
bash <<'EOF'
VAULT_TOKEN=$(cat {vault-token-path})
vault kv put secret/{secret-path} \
  current="$(vault kv get -field=current secret/{secret-path})" \
  new="$NEW_SECRET"
EOF
```

### Phase 3: Deploy New Secret to All Consumers

Deploy to each consumer **before** revoking the old secret. The dual-active window starts now.

```bash
# For each consumer in the inventory:

# Consumer 1: {service-1}
ssh {host-1} bash <<'DEPLOY'
# Update configuration with new secret
# Method depends on how the service reads credentials
sed -i 's|password: .*|password: "{NEW_SECRET_ESCAPED}"|' {config-path}
chmod 600 {config-path}
DEPLOY
```

```bash
# Reload consumer 1 (graceful — no restart if possible)
ssh {host-1} "systemctl reload {service-1}"
```

```bash
# Verify consumer 1 is healthy with new secret
ssh {host-1} "curl -sf http://localhost:{port}/healthz"
```
**Expected output:**
```json
{"status": "ok"}
```

```bash
# Repeat for each consumer in inventory
# Consumer 2: {service-2}
ssh {host-2} bash <<'DEPLOY'
sed -i 's|password: .*|password: "{NEW_SECRET_ESCAPED}"|' {config-path}
chmod 600 {config-path}
DEPLOY
ssh {host-2} "systemctl reload {service-2}"
ssh {host-2} "curl -sf http://localhost:{port}/healthz"
```

### Phase 4: Verify All Consumers Use New Secret

```bash
# Verify each consumer is healthy
for host in {all-consumer-hosts}; do
  echo -n "$host: "
  ssh "$host" "curl -sf http://localhost:{port}/healthz | jq -r .status"
done
```
**Expected output:**
```
host-1: ok
host-2: ok
```

```bash
# Verify no authentication errors in logs
for host in {all-consumer-hosts}; do
  echo "--- $host ---"
  ssh "$host" "journalctl -u {service} --since '-10min' --no-pager | grep -i 'auth\|denied\|unauthorized' | head -5"
done
```
**Expected output:**
```
--- host-1 ---
--- host-2 ---
(no output = no auth errors)
```

### Phase 5: Revoke Old Secret

**Gate**: Only proceed after ALL consumers are verified healthy with the new secret.

```bash
# Revoke old secret at the source
# Option A: Database password change (old password no longer valid)
{database-client} -e "ALTER USER '{user}' IDENTIFIED BY '{new-password}'"

# Option B: API token revocation
bash <<'EOF'
TOKEN=$(cat {admin-token-path})
curl -s -X DELETE -H "Authorization: token $TOKEN" \
  "{api-url}/tokens/{old-token-id}"
EOF

# Option C: SSH key removal
ssh {target-host} "sed -i '/{old-key-fingerprint}/d' ~/.ssh/authorized_keys"
```

```bash
# Remove old secret from credential store
bash <<'EOF'
# Promote new to current
mv {credential-store-path}/{secret-name}.new {credential-store-path}/{secret-name}
# Or in Vault:
# vault kv put secret/{secret-path} current="$NEW_SECRET"
EOF
```

### Phase 6: Post-Rotation Verification

```bash
# Final health check — all consumers still healthy after old secret revoked
for host in {all-consumer-hosts}; do
  echo -n "$host: "
  ssh "$host" "curl -sf http://localhost:{port}/healthz | jq -r .status"
done
```
**Expected output:**
```
host-1: ok
host-2: ok
```

## Verification

```bash
# 1. Old secret no longer works (expect failure)
{test-command-with-old-secret}
```
**Expected output:**
```
401 Unauthorized (or connection refused)
```

```bash
# 2. New secret works
{test-command-with-new-secret}
```
**Expected output:**
```
200 OK (or successful connection)
```

```bash
# 3. No consumer errors
for host in {all-consumer-hosts}; do
  echo -n "$host errors: "
  ssh "$host" "journalctl -u {service} --since '-30min' -p err --no-pager | wc -l"
done
```
**Expected output:**
```
host-1 errors: 0
host-2 errors: 0
```

```bash
# 4. Audit log records rotation
echo "$(date -Iseconds) SECRET-ROTATED name={secret-name} reason={reason} operator={operator}" >> /var/log/secret-rotation.log
```

## Rollback

If consumers fail after deploying the new secret but before revoking the old:

```bash
# Restore old secret in consumer configs
ssh {host} bash <<'ROLLBACK'
cp {config-path}.bak {config-path}
systemctl reload {service}
ROLLBACK
```

If the old secret has already been revoked, you must complete the forward rotation — there is no rollback. Fix the failing consumers with the new secret.

## Troubleshooting

| Symptom | Likely Cause | Resolution |
|---------|-------------|------------|
| Consumer fails after reload | Config syntax error from sed replacement | Check config file, restore from .bak |
| Auth errors after Phase 5 | Missed a consumer in inventory | Identify consumer from error logs, deploy new secret |
| Secret file has wrong permissions | umask not set during write | `chmod 600 {secret-file}` |
| Vault write fails | Token expired or insufficient policy | Refresh Vault token, check policy |
| Consumer can't read new secret | Credential store path changed | Verify config points to correct path |

## What NOT to Fix

- Credential store infrastructure (Vault unsealing, HA failover) — separate runbook
- Upstream provider credential rotation (cloud IAM) — provider-specific procedures
- Certificate rotation — see cert-ops-runbook.md instead

## Agent Rules

- DO: Complete the full consumer inventory before starting
- DO: Deploy to ALL consumers before revoking the old secret
- DO: Verify each consumer individually after deploying new secret
- DO: Log every rotation with timestamp, reason, and operator
- DO: Use heredoc pattern for any command that handles secret values
- DO NOT: Print, echo, or log the actual secret value
- DO NOT: Revoke the old secret before verifying all consumers
- DO NOT: Store secrets in git, shell history, or world-readable files
- DO NOT: Rotate secrets on a host you are not authorized to access
- ESCALATE IF: A consumer cannot be reached during the dual-active window
- ESCALATE IF: Any consumer fails health check after receiving new secret
- ESCALATE IF: The old secret was revoked before all consumers were updated

## Audit Trail

| Field | Value |
|-------|-------|
| Author | {author} |
| Created | {date} |
| Last tested | {date} |
| Last modified | {date} |
| Ceremony witnesses | {names, if ceremony required} |
| Rotation reason | {scheduled / incident / personnel / audit} |
| Consumers updated | {count} |
