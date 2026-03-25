# Stream Service Profile: {service_name}

**Type**: {type} (transcoder / restreamer / ingest / relay)
**Host**: {hostname}
**Status**: {status} (active / standby / disabled)
**Last Updated**: {date}
**Owner**: {owner}

---

## Service Overview

| Field | Value |
|-------|-------|
| Service Name | {service_name} |
| Purpose | {purpose} |
| Software | {software} (FFmpeg / OBS / SRS / Nginx-RTMP / Owncast / custom) |
| Version | {version} |
| Systemd Unit | `{unit_name}.service` |

---

## Input Sources

| Source | Protocol | URL / Address | Format | Bitrate | Notes |
|--------|----------|--------------|--------|---------|-------|
| {source_name} | {rtmp / srt / hls / rtp} | `{input_url}` | {format} | {bitrate} | {notes} |

---

## Output Targets

| Target | Protocol | URL / Address | Platform | Quality Profile | Notes |
|--------|----------|--------------|----------|----------------|-------|
| {target_name} | {rtmp / srt / hls} | `{output_url}` | {platform} | {quality} | {notes} |

### Quality Profiles

| Profile | Resolution | Bitrate (video) | Bitrate (audio) | Codec | FPS |
|---------|-----------|-----------------|-----------------|-------|-----|
| {profile_name} | {resolution} | {video_bitrate} | {audio_bitrate} | {codec} | {fps} |

---

## Platform Credentials

> **CRITICAL**: Never commit stream keys, API tokens, or platform credentials to this document or any repository. Reference the credential storage location only.

| Platform | Credential Type | Storage Location | Last Rotated |
|----------|----------------|-----------------|-------------|
| {platform} | {stream_key / api_token / oauth} | {vault_path_or_env_ref} | {last_rotated} |

---

## Configuration

### Transcode Command (if applicable)

```bash
{transcode_command}
```

### Configuration File

**Location**: `{config_file_path}`

```
{config_excerpt_without_secrets}
```

> Any secrets in the config file must use environment variable substitution or external key files.

---

## Systemd Unit

**Unit file**: `/etc/systemd/system/{unit_name}.service`

```ini
[Unit]
Description={service_description}
After=network-online.target
Wants=network-online.target

[Service]
Type={service_type}
User={service_user}
ExecStart={exec_start_command}
Restart=always
RestartSec={restart_sec}
EnvironmentFile={env_file_path}

[Install]
WantedBy=multi-user.target
```

### Management Commands

```bash
# Start
sudo systemctl start {unit_name}

# Stop
sudo systemctl stop {unit_name}

# Status
sudo systemctl status {unit_name}

# Logs
journalctl -u {unit_name} -f
```

---

## Monitoring

| Metric | Source | Alert Threshold | Check Command |
|--------|--------|----------------|--------------|
| Stream uptime | {source} | Down > {threshold} | `{check_command}` |
| Frame drops | {source} | > {threshold}/min | `{check_command}` |
| Bitrate deviation | {source} | > {threshold}% from target | `{check_command}` |
| CPU usage | {source} | > {threshold}% sustained | `{check_command}` |
| Disk usage (recordings) | {source} | > {threshold}% | `{check_command}` |

### Health Check

```bash
# Verify stream is active
{health_check_command}

# Expected output when healthy:
# {expected_healthy_output}
```

---

## Network Requirements

| Direction | Protocol | Port | Source/Dest | Purpose |
|-----------|----------|------|------------|---------|
| Inbound | {proto} | {port} | {source} | {purpose} |
| Outbound | {proto} | {port} | {dest} | {purpose} |

---

## Disaster Recovery

| Field | Value |
|-------|-------|
| RTO | {rto} |
| Failover | {failover_strategy} (manual / automatic / none) |
| Backup Stream | {backup_stream_ref} |
| Config Backup | {config_backup_location} |

---

## Known Quirks

| Quirk | Reason | Workaround |
|-------|--------|-----------|
| {quirk} | {reason} | {workaround} |

---

## Change Log

| Date | Change | By |
|------|--------|-----|
| {date} | {change} | {author} |
