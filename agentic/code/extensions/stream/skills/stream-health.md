---
name: stream-health
description: Platform connectivity check, transcode pipeline verification, stream quality metrics
trigger: when the operator requests stream health check, platform connectivity test, or stream quality analysis
---

# Stream Health Check

## Purpose

Verify streaming infrastructure health: platform connectivity, transcode pipeline integrity, and stream quality metrics. Produce a health report with actionable findings.

## Workflow

### 1. Service Status

For each documented stream service:

```bash
# Check systemd unit
systemctl is-active {unit_name}

# Check process
pgrep -a {process_name}

# Check resource usage
ps -o pid,pcpu,pmem,etime,args -p $(pgrep {process_name})
```

### 2. Platform Connectivity

Test reachability of each output platform:

```bash
# RTMP endpoint connectivity (without streaming)
timeout 5 bash -c "echo > /dev/tcp/{rtmp_host}/{rtmp_port}" && echo "OK" || echo "FAIL"

# SRT endpoint connectivity
srt-live-transmit "srt://{srt_host}:{srt_port}?mode=caller&transtype=live" file://con -timeout 5000

# HLS endpoint accessibility
curl -s -o /dev/null -w "%{http_code}" {hls_url}
```

> Never use actual stream keys during connectivity tests. Test transport-level reachability only.

### 3. Transcode Pipeline Verification

If the service includes transcoding:

```bash
# Test transcode with a short input
ffmpeg -f lavfi -i testsrc=duration=5:size=1920x1080:rate=30 \
  -f lavfi -i sine=frequency=440:duration=5 \
  {transcode_options} \
  -f null - 2>&1 | tail -5
```

Verify:
- Transcode completes without errors
- Output format matches expected profile
- Performance is sufficient (realtime or better)

### 4. Stream Quality Metrics

If a stream is currently active, collect quality data:

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Input bitrate | {value} kbps | {expected} kbps +/- {tolerance}% | OK / WARN / FAIL |
| Output bitrate | {value} kbps | {expected} kbps +/- {tolerance}% | OK / WARN / FAIL |
| Frame rate | {value} fps | {expected} fps | OK / WARN / FAIL |
| Dropped frames | {value}/min | < {threshold}/min | OK / WARN / FAIL |
| Encoder CPU load | {value}% | < {threshold}% | OK / WARN / FAIL |
| Buffer health | {value} | > {threshold} | OK / WARN / FAIL |
| Uptime | {value} | — | INFO |

### 5. Disk and Recording Health

If recording is enabled:

```bash
# Check recording disk space
df -h {recording_path}

# Check recent recordings
ls -lht {recording_path} | head -10

# Verify recording integrity (latest file)
ffprobe -v error -show_format {latest_recording}
```

### 6. Produce Health Report

```markdown
## Stream Health Report
**Date**: {timestamp}
**Services Checked**: {count}

### Service Status
| Service | Unit | Status | Uptime | CPU | Memory |
|---------|------|--------|--------|-----|--------|

### Platform Connectivity
| Platform | Protocol | Status | Latency |
|----------|----------|--------|---------|

### Quality Summary
| Service | Bitrate | Frames | Drops | Overall |
|---------|---------|--------|-------|---------|

### Issues Found
| Service | Issue | Severity | Recommendation |
|---------|-------|----------|---------------|

### Recommendations
1. {recommendation}
```

## Output

- Stream health report
- Per-service quality metrics
- Platform connectivity status
- Issue list with severity and recommendations
