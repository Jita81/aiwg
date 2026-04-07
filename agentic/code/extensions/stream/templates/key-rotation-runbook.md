# Stream Key Rotation Runbook

## Purpose

Rotate stream keys across one or more platforms with zero-downtime verification. Stream keys are bearer credentials — possession equals broadcast access. Rotation must follow a generate → test → cutover → revoke sequence: the new key is verified working before the old key is revoked, and the old key is never revoked while the stream is live.

**Warning**: Never rotate keys during an active broadcast. A key rotation mid-stream causes an immediate disconnect on all platforms using the rotated key. Schedule rotations inside a maintenance window or between broadcasts.

## System Topology

| Field | Value |
|-------|-------|
| Service(s) | {relay-unit.service, encoder-unit.service} |
| Platform(s) | {YouTube / Twitch / custom RTMP platform} |
| Key storage | {file: /etc/stream/keys/ \| vault: secret/stream/} |
| Config target | {/etc/stream/{service-name}/env} |
| Rotation schedule | {quarterly / on-demand / after suspected leak} |
| Last rotated | {YYYY-MM-DD} |
| Rotation reason | {scheduled / suspected-leak / personnel-change / audit-finding} |

### Platform Inventory

| Platform | Key Type | Storage Path | Reload Method |
|----------|----------|-------------|---------------|
| {YouTube} | {stream_key} | {/etc/stream/keys/youtube.key} | systemctl reload {relay-unit} |
| {Twitch} | {stream_key} | {/etc/stream/keys/twitch.key} | systemctl reload {relay-unit} |
| {custom-rtmp} | {stream_key} | {/etc/stream/keys/custom.key} | systemctl reload {relay-unit} |

## Prerequisites

- [ ] Platform dashboard access confirmed for each platform being rotated
- [ ] Backup keys documented: current key values noted in a secure offline location before rotation begins
- [ ] Maintenance window scheduled — stream is not currently live
- [ ] All stream service hosts are reachable
- [ ] Credential store (file or Vault) is accessible
- [ ] Rollback plan reviewed (restoring old key from backup)
- [ ] Service config paths verified against platform inventory above

## Procedure

### Step 1: Confirm Stream Is Offline

Before generating any new keys, verify no active broadcast is running.

```bash
# Check all stream service units
for unit in {relay-unit} {encoder-unit}; do
  echo -n "$unit: "
  systemctl is-active "$unit"
done
```

**Expected output:**

```
{relay-unit}: inactive
{encoder-unit}: inactive
```

If any unit reports `active`, stop and schedule this runbook for after the broadcast ends. Do not proceed.

### Step 2: Generate New Key on Platform Dashboard

For each platform being rotated, log into the platform's dashboard and generate a new stream key. Do not activate the new key yet — keep the old key active.

| Platform | Dashboard URL | Action |
|----------|--------------|--------|
| YouTube | https://studio.youtube.com → Live Dashboard → Stream Settings → Reset Stream Key | Generate new, copy to clipboard |
| Twitch | https://dashboard.twitch.tv → Settings → Stream → Primary Stream Key → Reset | Generate new, copy to clipboard |
| {custom} | {dashboard URL} → {navigation path} | Generate new, copy to clipboard |

```bash
# Create a temporary secure file for the new key value during this procedure
# This file will be removed in Step 7
umask 077
touch /tmp/stream-key-rotation-workspace
chmod 600 /tmp/stream-key-rotation-workspace
```

### Step 3: Update Key in Secret Store

Write the new key to the credential store without yet reloading the service. This places the new key in the store while the old key is still active — the dual-active window.

```bash
# Option A: File-based store
bash <<'EOF'
NEW_KEY="{paste-new-key-here}"
KEY_FILE="/etc/stream/keys/{platform-name}.key"

# Back up old key before overwriting
cp "$KEY_FILE" "${KEY_FILE}.bak.$(date +%Y%m%d)"
chmod 600 "${KEY_FILE}.bak.$(date +%Y%m%d)"

# Write new key
echo "$NEW_KEY" > "$KEY_FILE"
chmod 600 "$KEY_FILE"
chown {stream-user}:{stream-group} "$KEY_FILE"
unset NEW_KEY
EOF
```

```bash
# Option B: HashiCorp Vault
bash <<'EOF'
VAULT_TOKEN=$(cat {vault-token-path})
vault kv put secret/stream/{platform-name} \
  key="$(vault kv get -field=key secret/stream/{platform-name})" \
  key_new="{paste-new-key-here}"
# Both old and new keys exist in Vault; service still uses old until reloaded
EOF
```

```bash
# Verify the new key file has correct permissions
stat -c "%a %U %G %n" /etc/stream/keys/{platform-name}.key
```

**Expected output:**

```
600 {stream-user} {stream-group} /etc/stream/keys/{platform-name}.key
```

### Step 4: Update Service Configuration to Reference New Key

If the service config references the key by filename, no config change is needed — the file was updated in Step 3. If the config embeds the key path or variable name differently, update it now.

```bash
# Verify the service environment file references the correct key file path
grep "STREAM_KEY" /etc/stream/{service-name}/env
```

**Expected output:**

```
STREAM_KEY_FILE=/etc/stream/keys/{platform-name}.key
```

If the environment file path is wrong, correct it before proceeding.

### Step 5: Test Stream with New Key

Run a short test stream using the new key. This uses a synthetic source — no camera or live content required.

```bash
# Test stream: 10-second synthetic source to platform using new key
# Do not use for live content — this will appear as a test broadcast
NEW_KEY=$(cat /etc/stream/keys/{platform-name}.key)
ENDPOINT="${STREAM_ENDPOINT}"  # Load from env, do not hardcode

ffmpeg -f lavfi -i testsrc=duration=10:size=1280x720:rate=30 \
  -f lavfi -i sine=frequency=440:duration=10 \
  -c:v libx264 -preset ultrafast -b:v 2500k -maxrate 2500k -bufsize 5000k \
  -g 60 -keyint_min 60 \
  -c:a aac -b:a 128k \
  -f flv "${ENDPOINT}/${NEW_KEY}" \
  2>&1 | tail -10

unset NEW_KEY ENDPOINT
```

**Expected output (last lines):**

```
frame=  300 fps= 30 q=... size=  ...kB time=00:00:10.00 bitrate= ...kbits/s
video:...kB audio:...kB
```

If ffmpeg exits with a non-zero code or logs `Connection refused`, `403`, or `stream key invalid`, the new key is not accepted. Stop here and escalate — do not revoke the old key.

### Step 6: Verify All Platforms Are Receiving

Log into each platform dashboard and confirm the test stream was received successfully.

| Platform | Verification | Expected |
|----------|-------------|----------|
| YouTube | Studio → Live Dashboard → stream ingest health | Green / connected |
| Twitch | Dashboard → Stream Manager → stream health | Active / healthy |
| {custom} | {dashboard path} | {expected state} |

Make a note in your rotation log that the test stream was received before proceeding.

### Step 7: Reload Live Services with New Key

The new key is verified. Reload stream services to activate it for live use.

```bash
# Reload each stream service unit (graceful — no full restart)
for unit in {relay-unit} {encoder-unit}; do
  echo "Reloading $unit..."
  sudo systemctl reload "$unit"
  sleep 2
  systemctl is-active "$unit"
done
```

**Expected output:**

```
Reloading {relay-unit}...
active
Reloading {encoder-unit}...
active
```

```bash
# Confirm no errors in service logs after reload
for unit in {relay-unit} {encoder-unit}; do
  echo "--- $unit ---"
  journalctl -u "$unit" --since '-30s' --no-pager | grep -i 'error\|fail\|denied\|key' | head -5
done
```

**Expected output:**

```
--- {relay-unit} ---
--- {encoder-unit} ---
(no output = no errors)
```

### Step 8: Revoke Old Key on Platform

**Gate**: Only proceed after the test stream succeeded in Step 5 and services reloaded cleanly in Step 7.

For each platform, revoke the old key via the dashboard. This is irreversible.

| Platform | Revocation Action |
|----------|------------------|
| YouTube | Studio → Live Dashboard → Stream Settings → Reset again (invalidates previous) |
| Twitch | Dashboard → Settings → Stream → Primary Stream Key → the key was already reset in Step 2 — it is now the new key |
| {custom} | {revocation path on dashboard} |

For platforms where the dashboard reset in Step 2 already invalidated the old key, no further action is needed here.

```bash
# Remove old key backup files after revocation is confirmed
# Keep backups for 7 days in case of unexpected issues
find /etc/stream/keys/ -name "*.bak.*" -mtime +7 -exec rm {} \;
```

### Step 9: Update Documentation

```bash
# Record rotation in key rotation log
echo "$(date -Iseconds) KEY-ROTATED platform={platform-name} reason={reason} operator=$(whoami)" \
  >> /var/log/stream-key-rotation.log

# Update stream-service profile or encoder-config.yaml:
# credential_refs[].last_rotated: {today's date}
```

Update the `last_rotated` field in the relevant `encoder-config.yaml` or `stream-service.md` profile for each rotated platform.

## Verification

```bash
# Verify service is running without auth errors
for unit in {relay-unit} {encoder-unit}; do
  echo -n "$unit: "
  systemctl is-active "$unit"
done
```

**Expected output:**

```
{relay-unit}: active
{encoder-unit}: active
```

```bash
# Verify no auth-related errors in the last 10 minutes
for unit in {relay-unit} {encoder-unit}; do
  echo "--- $unit ---"
  journalctl -u "$unit" --since '-10min' --no-pager \
    | grep -i 'auth\|key\|denied\|401\|403' | head -5
done
```

**Expected output:**

```
--- {relay-unit} ---
--- {encoder-unit} ---
(no output = no auth errors)
```

```bash
# Confirm key rotation was logged
grep "KEY-ROTATED" /var/log/stream-key-rotation.log | tail -3
```

**Expected output:**

```
{timestamp} KEY-ROTATED platform={platform-name} reason={reason} operator={operator}
```

## Rollback

Rollback is only possible if the old key has not yet been revoked on the platform.

```bash
# Restore old key from backup (only if old key is still valid on platform)
OLD_KEY_BACKUP=$(ls -t /etc/stream/keys/{platform-name}.key.bak.* | head -1)
cp "$OLD_KEY_BACKUP" /etc/stream/keys/{platform-name}.key
chmod 600 /etc/stream/keys/{platform-name}.key

# Reload services to use restored key
for unit in {relay-unit} {encoder-unit}; do
  sudo systemctl reload "$unit"
done
```

If the old key was already revoked on the platform, rollback is not possible. Complete the forward rotation: the new key is now in the key file and services are configured to use it. Verify the new key works and escalate if it does not.

## Troubleshooting

| Symptom | Likely Cause | Resolution |
|---------|-------------|------------|
| ffmpeg exits with 403 or `stream key invalid` | New key not yet active on platform | Wait 60s for platform propagation, retry test stream |
| Service fails to reload after Step 7 | Config syntax error or missing env var | Check `journalctl -u {unit} -n 50`, fix env file |
| Platform dashboard shows no ingest after test | Network or endpoint issue, not key issue | Verify endpoint connectivity: `timeout 5 bash -c "echo > /dev/tcp/{rtmp-host}/1935"` |
| Old key still active after revocation | Platform cache | Wait up to 5 minutes, retry |
| Key file has wrong permissions after write | umask was not set | `chmod 600 /etc/stream/keys/{platform-name}.key` |
| Backup file not created | Previous key file missing | Proceed without backup; document in rotation log |

## What NOT to Do

- Do not rotate keys while a broadcast is active — stop the stream first
- Do not print or log key values during this procedure
- Do not commit key files, backup files, or the rotation workspace to git
- Do not skip the test stream step — revocation is irreversible
- Do not rotate multiple platforms simultaneously without a separate test stream per platform

## Agent Rules

- DO: Verify stream is offline before beginning
- DO: Complete the test stream before revoking the old key
- DO: Log every rotation with timestamp, reason, and operator
- DO: Verify each platform individually after test stream
- DO: Remove the old key backup files after 7 days
- DO NOT: Revoke the old key before the test stream succeeds
- DO NOT: Rotate during an active broadcast
- DO NOT: Print, echo, or store key values in logs or shell history
- DO NOT: Commit key files or workspace files to git
- ESCALATE IF: Platform rejects the new key during test stream
- ESCALATE IF: Service fails health check after reload in Step 7
- ESCALATE IF: Any platform is unable to be verified before old key revocation

## Audit Trail

| Field | Value |
|-------|-------|
| Author | {author} |
| Created | {date} |
| Last tested | {date} |
| Last modified | {date} |
| Platforms covered | {list} |
| Rotation reason | {scheduled / incident / personnel / audit} |
| Platforms rotated | {count} |
