---
dod_id: dod-data-migration
name: Data Migration Definition of Done
scope: domain
category: data-migration
version: 1.0.0
extensible: true
---

# Data Migration Definition of Done

## Purpose

Ensures database schema changes and data transformations can be executed safely in production: with a tested rollback path, validated data integrity, zero unplanned downtime, and a complete audit trail. Data migrations are among the highest-risk operations in production deployment — failures can be irreversible without careful preparation.

## Criteria

### Required

- [ ] Migration script is version-controlled alongside the application code it supports
- [ ] Migration is idempotent: running it twice produces the same result as running it once (or is protected by an applied-check guard)
- [ ] Rollback script exists and has been tested: rollback restores the previous schema state and does not lose data that existed before the migration
- [ ] Migration dry-run performed on a copy of the current production data (or a representative anonymized sample) with no errors
- [ ] Row counts, checksums, or sample spot-checks confirm data integrity before and after migration on the test dataset
- [ ] Estimated migration duration documented; if duration exceeds 60 seconds on production data volume, a zero-downtime strategy (online migration, batching, shadow table) is in place
- [ ] All application code that reads or writes the migrated schema is deployed atomically with the migration, or the migration is backwards-compatible with both old and new application versions

### Recommended

- [ ] Migration performance benchmarked on a dataset matching production size; no table locks held longer than the agreed downtime budget
- [ ] Audit trail created: migration run timestamp, operator identity, row counts affected, and checksum recorded in a migration history table or log
- [ ] Alerting configured to fire if migration takes longer than 2x the estimated duration
- [ ] Affected downstream consumers (ETL, analytics, reporting) notified and confirmed compatible with schema change

## Verification

**Automated checks:**
- Migration framework (e.g., Flyway, Alembic, ActiveRecord, golang-migrate): `migrate status` shows migration applied cleanly in CI test database
- Integration test suite: all tests pass against a database that has had the migration applied
- Rollback test: CI job applies migration, then applies rollback, then confirms schema and data match the pre-migration state

**Manual steps:**
- DBA or senior engineer reviews migration script for lock duration, index strategy, and impact on concurrent transactions
- Author documents the rollback procedure in the PR description with exact commands
- Tech lead confirms zero-downtime strategy is used if migration duration on production data volume exceeds the deployment downtime budget

## Tailoring Guide

**Add criteria when:**
- Migration touches PII or regulated data: require data classification review and confirmation that anonymized test data matches production schema exactly
- Large table migration (> 10M rows): require batched migration with configurable batch size and progress logging
- Multi-region deployment: require migration applied to all regions before application version rolled out

**Remove or relax criteria when:**
- Additive-only migration (new nullable column, new table): may relax rollback script requirement if the forward migration is trivially undoable; document rationale
- Development or staging environment only: may skip production-size dry-run; require CI database test only

## Extension Points

- `ext-data-migration-compliance` — data sovereignty, retention, and audit trail requirements
- `ext-data-migration-zero-downtime` — organization-specific zero-downtime migration patterns and tooling
- `ext-data-migration-notification` — downstream consumer notification workflow
