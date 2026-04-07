---
name: stream-deploy
description: Deploy or update a streaming service stack with test-stream gate before cutover
trigger: when the operator requests stream deployment, service update, pipeline cutover, or encoder configuration change
---

# Stream Deploy

## Purpose

Deploy or update a streaming service stack — encoder, relay, or full ingest-to-relay pipeline — with a mandatory test-stream gate before any production cutover. This skill enforces the stream-pipeline-gates.md validation sequence: config validation → test stream → quality verification → OpsGate approval → production apply → health verification.

Never skip the test-stream gate. A configuration change that passes validation but fails in practice causes immediate viewer-visible impact with no graceful degradation.

## Workflow

### 1. Read Current Service Configuration

Read the OpsTarget or stream-service profile for the service being deployed or updated:

```bash
# Identify the service configuration
# - OpsTarget YAML: agentic/code/extensions/stream/templates/encoder-config.yaml (instantiated)
# - Stream-service profile: {service-name}-stream-service.md
# - Systemd unit: /etc/systemd/system/{unit-name}.service
# - Environment file: /etc/stream/{service-name}/env

# Check current service state
systemctl is-active {unit-name}
systemctl show {unit-name} --property=MainPID,ActiveState,SubState,ExecStart
```

Capture the current configuration state before applying any changes. This is the rollback baseline.

### 2. Validate New Configuration

Verify the incoming configuration is safe to deploy. Check all items before proceeding.

```bash
# Check no literal credentials in config files
grep -r "rtmp://.*?key=" /etc/stream/{service-name}/ && echo "FAIL: literal key" || echo "OK"
grep -r "srt://.*?passphrase=" /etc/stream/{service-name}/ && echo "FAIL: literal passphrase" || echo "OK"

# Verify environment file is populated
test -f /etc/stream/{service-name}/env || { echo "FAIL: env file missing"; exit 1; }
grep -q "STREAM_ENDPOINT" /etc/stream/{service-name}/env || echo "WARN: STREAM_ENDPOINT not set"
grep -q "STREAM_KEY_FILE" /etc/stream/{service-name}/env || echo "WARN: STREAM_KEY_FILE not set"

# Verify key files exist and are readable by service user
KEY_FILE=$(grep STREAM_KEY_FILE /etc/stream/{service-name}/env | cut -d= -f2)
test -r "$KEY_FILE" || echo "FAIL: key file not readable: $KEY_FILE"
stat -c "%a" "$KEY_FILE" | grep -q "^6" || echo "WARN: key file permissions not 600"

# Check hardware acceleration device if enabled
if grep -q "hardware_acceleration.*enabled.*true" {config-path}; then
  DEVICE=$(grep "device:" {config-path} | awk '{print $2}')
  test -c "$DEVICE" || echo "FAIL: hardware device not found: $DEVICE"
fi

# Verify output endpoint is reachable (transport check only — no key used)
ENDPOINT_HOST=$(grep STREAM_ENDPOINT /etc/stream/{service-name}/env | sed 's|.*://||;s|/.*||;s|:.*||')
ENDPOINT_PORT=$(grep STREAM_ENDPOINT /etc/stream/{service-name}/env | sed 's|.*:||;s|/.*||')
timeout 5 bash -c "echo > /dev/tcp/${ENDPOINT_HOST}/${ENDPOINT_PORT}" \
  && echo "OK: endpoint reachable" || echo "FAIL: endpoint not reachable"
```

**Gate**: Do not proceed if any validation produces a `FAIL`. Address the failure and re-validate.

### 3. Deploy to Test Mode

Apply the configuration to the service in test/dry-run mode if supported, or prepare for a test stream against staging.

```bash
# If service supports --test flag or dry-run mode:
{exec-start-command} --test --duration 5 2>&1 | tail -10

# If no test mode: reload systemd unit definition without starting the stream
systemctl daemon-reload
systemctl is-active {unit-name}
```

### 4. Run Test Stream

Execute a 30-second synthetic test stream to verify the new configuration produces valid output. Use a synthetic source — do not use live camera input for the test.

```bash
# Load credentials from secure store — never hardcode
KEY=$(cat "$(grep STREAM_KEY_FILE /etc/stream/{service-name}/env | cut -d= -f2)")
ENDPOINT=$(grep STREAM_ENDPOINT /etc/stream/{service-name}/env | cut -d= -f2)

# Test stream with synthetic source
ffmpeg \
  -f lavfi -i "testsrc=duration=30:size={resolution}:rate={framerate}" \
  -f lavfi -i "sine=frequency=440:duration=30" \
  -c:v libx264 \
  -preset {preset} \
  -b:v {bitrate_kbps}k -maxrate {bitrate_kbps}k -bufsize {2x_bitrate_kbps}k \
  -g {keyframe_frames} -keyint_min {keyframe_frames} \
  -pix_fmt yuv420p \
  -c:a aac -b:a {audio_bitrate_kbps}k \
  -f flv "${ENDPOINT}/${KEY}" \
  2>&1 | tee /tmp/stream-deploy-test.log | tail -15

# Clear credentials from variables immediately
unset KEY ENDPOINT

# Check ffmpeg exit code
FFMPEG_EXIT=${PIPESTATUS[0]}
if [ "$FFMPEG_EXIT" -ne 0 ]; then
  echo "FAIL: test stream exited with code $FFMPEG_EXIT"
  grep -i "error\|fail\|refused\|403\|401" /tmp/stream-deploy-test.log
fi
```

If the test stream fails, stop here. Do not apply the configuration to production. Review `/tmp/stream-deploy-test.log` for the error and escalate if the cause is unclear.

### 5. Verify Output Quality Metrics

Probe the relay output while the test stream is running (or use log output) to verify quality metrics match the configured profile.

```bash
# Probe relay output for video quality metrics
ffprobe -v quiet -select_streams v:0 \
  -show_entries stream=bit_rate,r_frame_rate,width,height,codec_name \
  -of default=noprint_wrappers=1 \
  "{relay-url-or-test-output}" 2>&1
```

Record the results in a verification table:

| Metric | Configured | Measured | Tolerance | Status |
|--------|------------|----------|-----------|--------|
| Video bitrate | {bitrate_kbps} kbps | {measured} kbps | ±15% | PASS / FAIL |
| Framerate | {framerate} fps | {measured} fps | exact | PASS / FAIL |
| Resolution | {resolution} | {measured} | exact | PASS / FAIL |
| Keyframe interval | {interval}s | {measured}s | ±0.1s | PASS / FAIL |
| Audio bitrate | {audio_kbps} kbps | {measured} kbps | ±10% | PASS / FAIL |
| Dropped frames | 0 expected | {count} | 0 | PASS / FAIL |

**Gate**: All metrics must PASS before proceeding. A single FAIL requires investigation and a re-run.

### 6. OpsGate: Approve Production Cutover

Present results to operator before applying changes to production. In automated deployments where the gate is configured as `type: automated`, this step proceeds immediately after metric verification. In manual deployments, wait for explicit approval.

```
Test stream results:
  Duration: 30s
  Video bitrate: {measured} kbps (target: {bitrate_kbps}, tolerance: ±15%)
  Framerate: {measured} fps
  Resolution: {measured}
  Keyframe interval: {measured}s
  Dropped frames: {count}
  All quality gates: PASS

Proceeding with production cutover.
```

If `type: manual`, prompt the operator and wait for confirmation before applying.

### 7. Apply to Production

Stop the current stream service (if active), apply updated configuration, and start with new settings.

```bash
# If service is currently running a live stream:
# - Do not stop until a planned stream break or end of broadcast
# - Schedule cutover for between broadcasts
# This is enforced by stream-pipeline-gates.md rule 7

# Apply configuration changes
# (config files were already updated in Step 2 validation — apply by reloading)
sudo systemctl daemon-reload

# If service was inactive, start it
sudo systemctl start {unit-name}

# If service was active and reload is supported (no codec change):
sudo systemctl reload {unit-name}

# If codec changed or full restart required:
sudo systemctl restart {unit-name}

# Wait for service to stabilize
sleep 5
systemctl is-active {unit-name}
```

### 8. Verify Production Health

After applying to production, run a production health check.

```bash
# Check service status
systemctl status {unit-name} --no-pager | head -20

# Check for errors in the first 30s after start
journalctl -u {unit-name} --since '-35s' --no-pager \
  | grep -i "error\|fail\|crash\|killed" | head -10

# Probe production output
ffprobe -v quiet -select_streams v:0 \
  -show_entries stream=bit_rate,r_frame_rate \
  -of default=noprint_wrappers=1 \
  "{production-relay-or-output-url}" 2>&1
```

Verify the same quality metrics from Step 5 are met in production output. If they are not, execute rollback and escalate.

### 9. Update Documentation

After successful deployment:

```bash
# Log the deployment
echo "$(date -Iseconds) STREAM-DEPLOYED service={service-name} profile={profile-name} operator=$(whoami)" \
  >> /var/log/stream-deployments.log
```

Update the relevant documentation:
- `stream-service.md` profile: Update the Change Log table with date, change description, and author
- `encoder-config.yaml`: Update `last_rotated` in `credential_refs` if keys were changed
- `stream-pipeline.yaml`: Note any step modifications if the playbook was updated

## Output

- **Deployment record**: Entry in `/var/log/stream-deployments.log`
- **Health verification report**: Quality metrics table with measured vs. configured values for both test and production runs
- **Updated documentation**: Change log entry in stream-service profile
- **Rollback baseline**: Pre-deployment configuration state documented in deployment record

## Rollback

If production health verification fails:

```bash
# Stop the newly deployed service
sudo systemctl stop {unit-name}

# Restore previous configuration from backup
# (backup created during Step 2 validation)
cp /etc/stream/{service-name}/env.bak /etc/stream/{service-name}/env
# Restore any changed config files from their .bak versions

# Restart with restored configuration
sudo systemctl daemon-reload
sudo systemctl start {unit-name}

# Verify restoration
systemctl is-active {unit-name}
journalctl -u {unit-name} --since '-30s' --no-pager | tail -10
```

Log the rollback:

```bash
echo "$(date -Iseconds) STREAM-ROLLBACK service={service-name} reason={reason} operator=$(whoami)" \
  >> /var/log/stream-deployments.log
```

After rollback, escalate: the test stream passed but production failed, which indicates an environment difference not covered by the test. This must be investigated before re-attempting deployment.
