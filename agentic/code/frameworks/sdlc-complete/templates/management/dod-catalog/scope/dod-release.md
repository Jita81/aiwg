---
dod_id: dod-release
name: Release Definition of Done
scope: scope
category: release
version: 1.0.0
extensible: true
---

# Release Definition of Done

## Purpose

Confirms the software is production-ready before a release tag is cut and deployment is authorized. Prevents releases that pass iteration gates but fail on operational, security, or compliance dimensions that only matter at release boundary.

## Criteria

### Required

- [ ] All stories planned for this release meet dod-story criteria; no P0 or P1 defects open
- [ ] User acceptance testing (UAT) completed in a production-like environment and signed off by PO
- [ ] Unit, integration, and end-to-end test suites all pass in CI with coverage at or above project threshold
- [ ] Security scan (SAST + dependency vulnerability scan) completed with no critical or high findings unmitigated
- [ ] CHANGELOG updated with all user-visible changes for this release
- [ ] Version bumped in package manifest following project versioning policy
- [ ] Deployment runbook reviewed and confirmed current (step-by-step, includes rollback procedure)
- [ ] Rollback procedure tested in a staging environment within this release cycle
- [ ] Monitoring and alerting confirmed configured for any new services or endpoints introduced
- [ ] All required approvals obtained: Product Owner, Technical Lead, Security Architect (if applicable)

### Recommended

- [ ] Performance benchmarks run and results within agreed SLO bounds
- [ ] Exploratory testing session completed and findings triaged
- [ ] Database migration scripts (if any) tested on a copy of production data
- [ ] Feature flags audited: deprecated flags removed, new flags documented
- [ ] Release announcement or communication drafted and reviewed
- [ ] Support team or help desk briefed on user-facing changes
- [ ] Legal/license review completed for any new open-source dependencies

## Verification

**Automated checks:**
- CI release gate: all test suites green at the release commit SHA
- SAST tool: report shows zero critical/high findings or all are documented with accepted-risk sign-off
- Dependency scanner: no known CVE above CVSS 7.0 without an accepted exception
- Coverage tool: total coverage >= project threshold at release commit

**Manual steps:**
- UAT sign-off document on file (physical or digital)
- CHANGELOG diff reviewed by tech lead: all user-visible changes present
- Runbook walkthrough: a team member not in the author role follows the runbook and confirms it works
- Rollback drill results documented: rollback completed in under the agreed RTO target
- Approval chain complete: all required sign-offs in the project tracker or documented communication

## Tailoring Guide

**Add criteria when:**
- Regulated environment (HIPAA, PCI-DSS, SOC 2): require compliance evidence package assembled
- Public API release: require deprecation notices sent and API changelog published
- Multi-region deployment: require region-by-region rollout plan and canary health check criteria
- Mobile release: require app store submission assets prepared and version codes confirmed

**Remove or relax criteria when:**
- Internal tool with a single team of users: may replace formal UAT with PO demo acceptance
- Hotfix release: scope to only regression tests for the fix area and rollback procedure; skip full UAT
- Pre-release channel (alpha/beta): may defer exploratory testing and support briefing to stable release

## Extension Points

- `ext-release-compliance` — regulatory evidence and audit artifact requirements
- `ext-release-comms` — communication plan and stakeholder notification criteria
- `ext-release-infra` — infrastructure provisioning and capacity verification criteria
