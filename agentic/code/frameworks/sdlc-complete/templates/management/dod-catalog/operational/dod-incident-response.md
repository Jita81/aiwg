---
dod_id: dod-incident-response
name: Incident Response Readiness Definition of Done
scope: operational
category: incident-response
version: 1.0.0
extensible: true
---

# Incident Response Readiness Definition of Done

## Purpose

Ensures that before a new service or significant feature ships to production, the team has the playbooks, escalation paths, and communication templates needed to respond to an incident without improvising. Improvised incident response under pressure produces longer outages and incomplete post-mortems.

## Criteria

### Required

- [ ] An incident playbook exists for the new service or significantly changed component: covers detection, triage, mitigation, and escalation steps
- [ ] Escalation path documented: who is called first, second, and third if the on-call engineer cannot resolve within 30 minutes
- [ ] On-call rotation updated: the new service is covered by a named primary and secondary on-call engineer
- [ ] Severity definitions agreed and documented: what constitutes P0, P1, P2, P3 for this service (response time, customer impact threshold)
- [ ] Communication templates exist: pre-written status page update and internal notification for each severity level
- [ ] Rollback procedure tested and documented (meets dod-deployment rollback criteria)

### Recommended

- [ ] Game day or tabletop exercise completed for the new service before go-live: team walked through at least one failure scenario
- [ ] Automated runbook or diagnostic script available that on-call can run to narrow down the failure domain within 5 minutes
- [ ] Post-mortem template linked in the playbook so the on-call engineer knows where to start the report
- [ ] Known failure modes documented: what are the top 3 ways this service has broken or is expected to break
- [ ] External status page updated to include the new service in the affected-components list

## Verification

**Manual steps (all required):**
- Incident commander or engineering manager confirms the playbook exists and has been reviewed by at least one on-call engineer who did not write it
- On-call rotation owner confirms the new service is assigned to a named engineer in the rotation system
- Communications owner confirms status page templates are approved and ready to send
- Tech lead confirms escalation path reaches someone with production access and deployment authority at each level

**No automated checks:** Incident readiness cannot be fully automated. The above manual steps are required without exception.

## Tailoring Guide

**Add criteria when:**
- Mission-critical or revenue-generating service: require 24/7 on-call coverage (not just business hours); require PagerDuty or equivalent integration verified
- Regulated domain (healthcare, finance): require incident classification includes regulatory notification trigger criteria
- Multi-tenant SaaS: require playbook includes customer-impact scoping steps (which tenants affected, how to notify them)
- Public API with SLA: require SLA breach detection step in playbook and contractual notification procedure documented

**Remove or relax criteria when:**
- Internal tooling with no SLA and business-hours-only usage: may relax to business-hours on-call only; escalation path to team lead is sufficient
- Feature behind a long-lived flag (not yet activated): defer incident playbook to flag activation gate; require monitoring DoD only

## Extension Points

- `ext-ir-communication` — external communication channels (status page provider, CRM, customer notification)
- `ext-ir-compliance` — regulatory incident notification timelines and evidence requirements (GDPR 72-hour rule, etc.)
- `ext-ir-tooling` — incident management platform (PagerDuty, OpsGenie, VictorOps) integration configuration
