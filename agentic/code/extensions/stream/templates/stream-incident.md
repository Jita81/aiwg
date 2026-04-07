# Stream Incident Report: {Title}

## Incident Summary

| Field | Value |
|-------|-------|
| Incident ID | {INC-XXXX} |
| Stream | {stream-name or pipeline-name} |
| Platform(s) | {YouTube / Twitch / custom / all} |
| Failure Type | {ingest-loss / transcode-crash / relay-disconnect / keyframe-issue / bitrate-drop / encoder-overload} |
| Severity | {P1 (all platforms down) / P2 (partial) / P3 (degraded quality) / P4 (minor)} |
| Impact | {viewer-facing / internal-only} |
| Detected | {YYYY-MM-DD HH:MM UTC} |
| Resolved | {YYYY-MM-DD HH:MM UTC or "ongoing"} |
| Total Duration | {HH:MM} |
| Status | {Investigating / Identified / Monitoring / Resolved} |

## Impact

### Viewers Affected

| Platform | Estimated Viewers | Impact Type | Duration |
|----------|------------------|-------------|----------|
| {YouTube} | {count or N/A} | {stream-offline / degraded-quality / audio-only} | {HH:MM} |
| {Twitch} | {count or N/A} | {stream-offline / degraded-quality / audio-only} | {HH:MM} |
| {platform-3} | {count or N/A} | {impact type} | {HH:MM} |

**Total estimated viewer-minutes lost**: {count}

### Services Affected

| Service | Unit | Impact |
|---------|------|--------|
| {encoder-name} | {encoder-unit.service} | {crashed / degraded / unaffected} |
| {relay-name} | {relay-unit.service} | {crashed / degraded / unaffected} |
| {ingest-name} | {ingest-unit.service} | {crashed / degraded / unaffected} |

## Root Cause Analysis

### What Happened

{Concise description of the failure. Include what broke, when it broke, and the observable symptom from the viewer perspective.}

### Why It Happened

{Root cause using 5 Whys or equivalent analysis.}

**Why 1**: {immediate trigger — e.g., "ffmpeg process exited with SIGKILL"}

**Why 2**: {first-order cause — e.g., "system OOM killer terminated the process"}

**Why 3**: {second-order cause — e.g., "memory usage grew unexpectedly"}

**Why 4**: {third-order cause — e.g., "transcoder profile switched to slow preset mid-stream"}

**Why 5**: {root cause — e.g., "no memory threshold was monitored or alerted"}

### Contributing Factors

- {factor 1 — e.g., "No automatic restart was configured for the encoder unit"}
- {factor 2 — e.g., "Monitoring alert threshold was set too high to catch early degradation"}
- {factor 3 — e.g., "No redundant relay was available"}

## Timeline

| Time (UTC) | Event |
|------------|-------|
| {HH:MM} | {First detection — viewer report, alert, or log entry} |
| {HH:MM} | {Investigation started} |
| {HH:MM} | {Affected platform(s) confirmed} |
| {HH:MM} | {Root cause identified} |
| {HH:MM} | {Mitigation applied} |
| {HH:MM} | {Stream restored / degradation cleared} |
| {HH:MM} | {All platforms verified healthy} |
| {HH:MM} | {Incident closed} |

## Resolution Steps

### Immediate Actions Taken

1. {action — e.g., "Manually restarted encoder unit via systemctl restart {encoder-unit}"}
2. {action — e.g., "Switched relay to backup profile with lower bitrate to reduce CPU load"}
3. {action — e.g., "Notified viewers via platform chat that stream was being restored"}

### Commands Executed During Response

```bash
# Restart encoder
sudo systemctl restart {encoder-unit}

# Check logs for root cause
journalctl -u {encoder-unit} --since '{start-time}' --no-pager | head -50

# Verify output bitrate after restart
ffprobe -v quiet -select_streams v:0 \
  -show_entries stream=bit_rate -of default=noprint_wrappers=1 \
  "{relay-url}" 2>&1
```

## Failover Actions Taken

| Action | Executed By | Time (UTC) | Outcome |
|--------|-------------|------------|---------|
| {Switched to backup relay} | {operator} | {HH:MM} | {Success / Partial / Failed} |
| {Lowered transcode bitrate} | {operator} | {HH:MM} | {outcome} |
| {Restarted encoder unit} | {operator} | {HH:MM} | {outcome} |
| {Activated standby host} | {operator} | {HH:MM} | {outcome} |

**Was the documented failover procedure followed?** {Yes / No / Partial — explain deviations}

## Prevention Measures

Actions to prevent recurrence, grouped by type:

### Monitoring and Alerting

- {e.g., "Add memory usage alert for encoder process: alert at 80% of system RAM"}
- {e.g., "Reduce dropped-frame alert threshold from 30/min to 10/min"}

### Configuration Changes

- {e.g., "Add Restart=always to encoder systemd unit with RestartSec=5"}
- {e.g., "Set memory limit in unit: MemoryMax=2G to prevent OOM killer ambiguity"}

### Process Changes

- {e.g., "Require pre-stream health check run (stream-health skill) before each broadcast"}
- {e.g., "Add redundant relay host to pipeline playbook"}

### Documentation Updates

- {e.g., "Update key-rotation-runbook.md with note about platform propagation delay"}
- {e.g., "Add encoder CPU threshold to stream-service.md monitoring table"}

## Postmortem Action Items

| Item | Owner | Due Date | Status |
|------|-------|----------|--------|
| {Add memory alert for encoder process} | {owner} | {YYYY-MM-DD} | {Open} |
| {Configure Restart=always in encoder unit} | {owner} | {YYYY-MM-DD} | {Open} |
| {Add standby relay host to pipeline playbook} | {owner} | {YYYY-MM-DD} | {Open} |
| {Run stream-health check before every broadcast} | {owner} | {YYYY-MM-DD} | {Open} |
| {Update monitoring thresholds per findings} | {owner} | {YYYY-MM-DD} | {Open} |
| {Document this incident in stream-service profile change log} | {owner} | {YYYY-MM-DD} | {Open} |

## References

| Reference | Link |
|-----------|------|
| Related issues | {gitea-issue-url} |
| Encoder service profile | {stream-service.md or encoder-config.yaml path} |
| Pipeline playbook | {stream-pipeline.yaml path} |
| Stream health report at time of incident | {path or "not available"} |
| Platform status pages | {platform-status-url} |
| Monitoring dashboard | {dashboard-url} |
