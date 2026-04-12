---
dod_id: dod-runbook
name: Runbook Definition of Done
scope: operational
category: runbook
version: 1.0.0
extensible: true
---

# Runbook Definition of Done

## Purpose

Defines when a runbook is fit for use by an on-call engineer who did not write the system. A runbook that only its author can follow is not a runbook — it is tribal knowledge with a document wrapper. Runbooks must be accurate, complete, and independently executable under incident pressure.

## Criteria

### Required

- [ ] Runbook is stored in version control (not a personal wiki, not a shared drive folder, not someone's notes app)
- [ ] Runbook has a clear title, service name, and last-verified date in the header
- [ ] Every step is written as an imperative action with the exact command or UI action (no "run the deployment script" — write the command)
- [ ] All commands include the expected output or success indicator so the operator knows the step succeeded
- [ ] Prerequisites listed: access rights, tools, and environment variables required before starting
- [ ] Runbook has been followed by an engineer other than the author with no additional help from the author (verified walkthrough)
- [ ] Links to monitoring dashboards and log queries relevant to the procedure are included and verified working

### Recommended

- [ ] Each step includes a "what if this fails" note with the next troubleshooting action
- [ ] Runbook linked from the alert that triggers it (alert annotation or on-call tool)
- [ ] Runbook version history tracked: each update notes what changed and why
- [ ] Estimated time for the procedure documented (helps operator manage SLA timers)
- [ ] Rollback or undo instructions included for every step that makes a state change

## Verification

**Manual steps (all required):**
- Independent walkthrough: an engineer who did not write the runbook executes it in a staging or non-production environment and reports any steps that were unclear, missing, or produced unexpected output
- Author resolves all feedback from the walkthrough before marking the runbook done
- Link verification: at least three runbook links (dashboards, log queries, related runbooks) confirmed reachable

## Tailoring Guide

**Add criteria when:**
- Deployment runbook: require rollback section meets dod-deployment rollback criteria
- Security incident runbook: require evidence collection steps before any remediation steps (preserve logs, capture snapshots)
- Runbook for a regulated process: require version-controlled audit trail of each execution (who ran it, when, outcome)
- High-complexity procedure: require runbook has a "stop and escalate" decision point after each major phase

**Remove or relax criteria when:**
- Runbook is a one-time procedure (data backfill, one-off migration): may relax version history requirement; require post-execution notes appended instead
- Automated procedure where the runbook is actually a script: document the script as the runbook; require the script tested in staging with expected output captured

## Extension Points

- `ext-runbook-template` — organization runbook template with standard sections and formatting
- `ext-runbook-review` — runbook review and approval workflow (who must sign off before a runbook is live)
- `ext-runbook-testing` — automated runbook test harness (chaos engineering integration)
