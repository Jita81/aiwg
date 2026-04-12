---
dod_id: dod-sla-compliance
name: SLA Compliance Definition of Done
scope: operational
category: sla-compliance
version: 1.0.0
extensible: true
---

# SLA Compliance Definition of Done

## Purpose

Ensures that before a service with an SLA goes live or is materially changed, the SLOs that underpin the SLA are defined, instrumented, and have error budgets tracked. An SLA without corresponding SLIs and SLOs is a contractual commitment with no operational backing — it will be violated without warning.

## Criteria

### Required

- [ ] SLOs defined for all dimensions covered by the SLA: availability, latency, error rate (at minimum)
- [ ] SLI instruments exist for each SLO: the metric that will be measured is emitting data in staging
- [ ] Error budget calculated and documented: what fraction of the SLO window is allowed to be in violation before SLA breach
- [ ] Error budget burn-rate alert configured: fires before the error budget is exhausted, not after
- [ ] SLO definitions committed to version control alongside the service code (not only in a monitoring tool)
- [ ] SLO windows and targets reviewed and accepted by the Product Owner and Tech Lead
- [ ] SLA breach threshold and notification procedure documented: at what burn rate does a customer-facing SLA violation occur and who is notified

### Recommended

- [ ] Error budget report generated and shared with stakeholders at least once before go-live (confirms instrumentation is correct)
- [ ] Past 30 days of staging or load-test data shows the service meets the defined SLO under expected load
- [ ] Incident response playbook references the SLO thresholds and specifies the severity level at each burn-rate tier
- [ ] SLO review cadence defined: how often the targets are reviewed and with whom

## Verification

**Automated checks:**
- SLI metric query confirmed to return data in monitoring platform for at least 24 hours of staging traffic
- Burn-rate alert test: alert fires when error rate is artificially elevated above the configured threshold (confirmed in staging)
- SLO definition file passes schema validation if the project uses a structured SLO-as-code format (e.g., OpenSLO)

**Manual steps:**
- Product Owner reviews SLO targets and confirms they reflect the actual SLA commitment (no gap between what is promised and what is measured)
- On-call engineer confirms they understand how to read the error budget dashboard and what to do when the burn-rate alert fires
- Tech lead reviews error budget calculation and confirms the math is correct for the SLA window

## Tailoring Guide

**Add criteria when:**
- Multi-tier SLA (different targets for different customer tiers): require per-tier SLO and per-tier error budget
- Contractual SLA with financial penalty: require legal review of SLO targets before go-live; require audit trail of SLO compliance data retained for contract period
- Dependency on third-party services: require third-party SLA included in composite SLO calculation

**Remove or relax criteria when:**
- Internal service with no external SLA: require SLOs defined for internal operational use, but may omit formal error budget reporting; retain alerting
- Experimental or beta service: require SLOs marked as targets (not commitments); retain instrumentation; defer SLA notification procedure to GA launch

## Extension Points

- `ext-sla-compliance-tiers` — customer tier definitions and per-tier SLO targets
- `ext-sla-compliance-reporting` — automated SLO compliance report generation and distribution
- `ext-sla-compliance-legal` — contractual SLA review and legal sign-off criteria
