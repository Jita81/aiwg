---
dod_id: dod-monitoring
name: Observability Definition of Done
scope: operational
category: monitoring
version: 1.0.0
extensible: true
---

# Observability Definition of Done

## Purpose

Ensures every service and significant feature change is observable in production before it ships. Unobservable systems cannot be debugged, cannot be SLO-tracked, and leave on-call engineers flying blind during incidents. Instrumenting after an incident is always a reactive scramble.

## Criteria

### Required

- [ ] Application logs emit structured JSON (or project-standard format) for all error, warning, and informational events on the changed code path
- [ ] Logs include a correlation/trace ID on all requests so a single user action can be followed across services
- [ ] A metric or counter exists for each significant operation: request count, error count, and latency histogram for all new or changed endpoints
- [ ] At least one alert is configured for the new endpoint or service: fires if error rate exceeds 1% over a 5-minute window (or project-defined SLO threshold)
- [ ] Dashboard updated or created: the new service or endpoint is visible on the team's operational dashboard
- [ ] No secrets, PII, or credentials appear in log output (confirmed by log sample review)

### Recommended

- [ ] Distributed tracing spans created for all cross-service calls introduced by this change (OpenTelemetry or equivalent)
- [ ] SLI instrument confirmed: the metric that will feed the SLO error budget is emitting correctly in staging
- [ ] Health check or readiness probe updated if the new service dependency affects startup behavior
- [ ] Runbook linked from alert: each new alert has a runbook URL in its annotation
- [ ] Synthetic monitor or uptime check added for any new externally-reachable endpoint

## Verification

**Automated checks:**
- Log output test: integration test confirms log lines are emitted at the correct level for success and error paths
- Metric emission test: integration test or staging run confirms counters and histograms are incremented
- Alert rule validator (if provided by monitoring platform): alert expression is syntactically valid and fires on a test condition

**Manual steps:**
- On-call engineer reviews the dashboard and confirms the new service/endpoint is visible and showing data from staging
- Author triggers an intentional error in staging and confirms the alert fires within the configured window
- Log reviewer samples 10 log lines from staging and confirms no PII or secrets are present

## Tailoring Guide

**Add criteria when:**
- SLA-bound service: require SLO defined in monitoring platform with error budget and burn-rate alerts configured
- Multi-region service: require per-region metric dimensions and regional alert routing
- Real-time feature: require P99 latency alert in addition to error rate alert
- Security-sensitive service: require audit log stream separate from application log, immutable storage confirmed

**Remove or relax criteria when:**
- Batch job or one-time migration: replace request latency metrics with job duration and rows-processed metrics; skip uptime check
- Internal tool with no SLA: may relax alert threshold; require at minimum a dashboard entry and error logging

## Extension Points

- `ext-monitoring-platform` — organization monitoring platform (Datadog, Grafana, CloudWatch) specific configuration requirements
- `ext-monitoring-slo` — SLO definitions and error budget thresholds contributed by project NFRs
- `ext-monitoring-pii` — PII field list for log sanitization verification
