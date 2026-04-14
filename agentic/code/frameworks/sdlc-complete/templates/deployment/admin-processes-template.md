# Admin Processes Template

**Factor**: 12-factor XII — Admin Processes
**Related**: Issue #821

## Purpose

Document one-off administrative tasks — database migrations, data backfills, emergency fixes, backup/restore, analytics exports, cron-like maintenance — so they are treated as first-class deliverables rather than ad-hoc scripts.

## Principles

1. **Same codebase**: admin tasks live in the same repo as the application they operate on
2. **Same deployment artifact**: admin tasks ship in the same container/package as the application
3. **Same review**: admin tasks go through the same code review as application code
4. **Same environment**: admin tasks run in an environment equivalent to the target (not from a developer laptop against production)
5. **Auditable**: every invocation is logged with who, when, what, and result
6. **Reversible**: every task has a documented rollback procedure (or an explicit ADR stating why rollback is impossible)

## Admin Task Catalog

| Task ID | Name | Category | Invoked by | Approval | Rollback |
|---------|------|----------|-----------|----------|----------|
| ADM-001 | Database migration `add_user_table` | migration | deployment pipeline | automatic (reviewed PR) | rollback migration |
| ADM-002 | Backfill `user.locale` from browser headers | data-fix | on-demand (ticket-authorized) | engineering lead | run `ADM-002-revert` |
| ADM-003 | Rotate internal API keys | maintenance | scheduled monthly | security-architect | re-issue prior key (grace window) |
| ADM-XXX | ... | ... | ... | ... | ... |

## Per-Task Template

For each admin task, file a document under `.aiwg/admin-tasks/ADM-XXX.md`:

```markdown
# ADM-XXX: {Task Name}

**Category**: migration | data-fix | maintenance | emergency | analytics | backup
**Created**: YYYY-MM-DD
**Author**: {name}
**Status**: draft | approved | executed | reverted

## Purpose
{One paragraph: what this task does and why it's needed}

## Scope
- Services affected: {list}
- Data affected: {tables, object stores, row counts estimate}
- Environments: {dev, staging, prod — which are in scope}

## Approval
- Reviewer: {name/role}
- Approved at: YYYY-MM-DD
- Authorization: {ticket ID / PR number / ADR reference}

## Execution
**Command**:
```bash
{exact command with all args}
```

**Runtime environment**:
- Container image: {tag}
- Environment variables required: {list, referencing .env.example}
- Expected duration: {N minutes}
- Resource requirements: {memory, CPU}

**Pre-execution checks**:
- [ ] Backup completed (if data-modifying)
- [ ] Staging run successful (if applicable)
- [ ] Maintenance window scheduled (if user-visible)
- [ ] Oncall notified

**Execution log**:
- Invoked at: YYYY-MM-DDTHH:MM:SSZ
- Invoked by: {name}
- Exit code: {0 = success}
- Output summary: {link to log aggregator}
- Rows/objects affected: {N}

## Rollback
**Command**:
```bash
{exact rollback command}
```

**Verification after rollback**:
- [ ] {specific check}
- [ ] {specific check}

## Post-Execution Audit
- [ ] Results verified
- [ ] Stakeholders notified
- [ ] Task marked executed in the Admin Task Catalog
- [ ] Any follow-up tickets created
```

## Invocation Patterns

### Pattern A: CLI subcommand in the application

Preferred for most admin tasks — leverages the same runtime, libraries, and config as the application.

```bash
# Same container, same env, different entrypoint:
docker run myapp:1.2.3 admin migrate
docker run myapp:1.2.3 admin backfill --field locale
```

### Pattern B: Separate admin tool with shared code

When the admin tool requires different permissions or resources (e.g. bulk data export), ship a second entrypoint that imports the same business logic.

### Pattern C: Kubernetes Job / AWS Batch / cron

Schedule maintenance tasks using the environment's job primitives. The task code still lives in the application repo.

## Anti-Patterns

- ❌ Admin scripts on a bastion host disconnected from the application code
- ❌ Scripts ported from developer laptops (different library versions, missing env vars, unaudited)
- ❌ Direct SQL executed via psql against production (bypasses migration tooling and audit trail)
- ❌ One-off Python/Node scripts in a bin/ directory that nobody else has run
- ❌ Admin operations triggered by editing production config and waiting for a reload

## Security Considerations

- Admin tasks often require elevated permissions — document which credentials are used
- Audit log must capture the operator identity (who invoked it)
- Tasks that touch PII or sensitive data require additional approval
- Consider a break-glass procedure for emergencies (with mandatory post-mortem)

## References

- Factor XII (admin processes) — https://12factor.net/admin-processes
- `rules/stateless-processes.md` — admin tasks are themselves stateless processes
- `rules/disposable-processes.md` — admin tasks must support clean shutdown/retry
- Issue #821 — 12-factor gap analysis
