---
dod_id: dod-performance
name: Performance Definition of Done
scope: domain
category: performance
version: 1.0.0
extensible: true
---

# Performance Definition of Done

## Purpose

Ensures changes that touch performance-sensitive paths do not introduce regressions and that newly defined SLOs have been validated before the code ships to production. Performance problems found in production are an order of magnitude more expensive to diagnose and fix than those caught pre-merge.

## Criteria

### Required

- [ ] Benchmark or profiling baseline exists for the changed code path (established before the change, not after)
- [ ] Post-change benchmark shows no performance regression greater than 10% on the defined baseline metric (or project-defined threshold)
- [ ] Critical-path latency target is met: P95 response time <= project SLO for the affected endpoint or operation
- [ ] Memory usage under sustained load does not grow unbounded (no detectable memory leak over a 10-minute load run)
- [ ] No new N+1 query patterns introduced (verified by query count monitoring or ORM slow-query log review)
- [ ] Database queries on the changed path have execution plans reviewed; no full table scans on tables with > 10k rows

### Recommended

- [ ] Load test run at expected peak concurrency (defined in project NFRs) with pass/fail threshold configured
- [ ] Performance test results committed to the repository or linked in the PR description
- [ ] Profiling flamegraph or trace captured and reviewed for obvious hotspots
- [ ] Caching strategy reviewed: new data is cached where appropriate, cache invalidation is correct
- [ ] Connection pool and thread pool sizing confirmed adequate for new load pattern

## Verification

**Automated checks:**
- Benchmark CI step: runs before/after comparison and fails if regression exceeds threshold
- APM or tracing tool (e.g., OpenTelemetry, Datadog): P95 latency metric in CI environment within SLO
- Query monitor: ORM or database slow query log shows no new queries exceeding 100ms threshold
- Memory leak detector: long-running test process heap size stable (< 5% growth over test duration)

**Manual steps:**
- Author reviews benchmark results and confirms the baseline was established on the same hardware/environment
- Tech lead reviews any cases where the regression threshold was adjusted
- Database expert reviews execution plan for any new or modified queries on large tables

## Tailoring Guide

**Add criteria when:**
- Real-time or latency-sensitive feature (trading, gaming, communications): tighten P95 threshold; add P99 check
- Batch processing feature: require throughput (records/second) benchmark in addition to latency
- Mobile feature: require battery and data usage measurements on representative device
- Third-party API integration: require timeout and retry behavior tested under artificial latency injection

**Remove or relax criteria when:**
- Change is exclusively in non-critical paths (admin tools, logging, config): skip load test; require only code review confirmation no hot path affected
- Prototype or spike: document that performance has not been validated; attach known limitation to the story

## Extension Points

- `ext-performance-slo` — project-specific SLO thresholds injected from the project NFR config
- `ext-performance-load-profile` — load test profile (concurrency, ramp-up, duration) contributed by project
- `ext-performance-platform` — platform-specific performance criteria (mobile battery, embedded CPU budget)
