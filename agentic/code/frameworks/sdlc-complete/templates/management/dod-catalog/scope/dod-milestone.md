---
dod_id: dod-milestone
name: Milestone Definition of Done
scope: scope
category: milestone
version: 1.0.0
extensible: true
---

# Milestone Definition of Done

## Purpose

Confirms an SDLC phase or project milestone is complete and the project is ready to advance to the next phase. Phase gates exist because different lifecycle phases have fundamentally different deliverables and quality standards; passing a gate means the team has the foundation to proceed safely, not just that features were shipped.

## Criteria

### Required

- [ ] All phase gate criteria defined in the project's phase plan are met (no open gate blockers)
- [ ] All planned deliverables for the phase are baselined: version-controlled, reviewed, and formally approved
- [ ] Traceability matrix updated: all requirements for this phase trace to design artifacts, code, and tests
- [ ] Risk register reviewed: all risks assessed since last milestone are documented with status and owner
- [ ] Architecture Decision Records created for all architectural decisions made during the phase
- [ ] Phase retrospective completed and lessons-learned recorded in the project artifact store
- [ ] Next-phase plan drafted and reviewed: scope, risks, and resource commitments confirmed
- [ ] Stakeholder sign-off obtained from all required approvers (see project RACI)

### Recommended

- [ ] Technical debt register reviewed and prioritized for next phase
- [ ] Security threat model reviewed against phase deliverables and updated if new surfaces identified
- [ ] Test strategy updated to reflect next-phase scope and coverage targets
- [ ] Dependency map reviewed: external dependencies confirmed available for next phase timeline
- [ ] Team capacity and onboarding plan confirmed for next phase

## Verification

**Automated checks:**
- Artifact index: all phase deliverables present in `.aiwg/` with non-empty content
- Traceability checker (`/check-traceability`): all requirements for this phase have at least one linked test
- CI: integration branch green at the milestone commit

**Manual steps:**
- Phase gate review meeting held with required attendees present
- Each deliverable spot-checked: reviewer confirms it is complete and not a placeholder
- Risk register walkthrough: each open risk has an owner, a status date within the last two weeks, and a mitigation
- Next-phase plan reviewed by Product Owner and Technical Lead; both confirm it is actionable

## Tailoring Guide

**Add criteria when:**
- Inception milestone (Lifecycle Objective): require business case approved and funding committed
- Elaboration milestone (Lifecycle Architecture): require architectural prototype or PoC results documented
- Construction milestone (Initial Operational Capability): require staging deployment successful and UAT initiated
- Transition milestone (Product Release): require all release DoD criteria met plus hypercare plan active

**Remove or relax criteria when:**
- Milestone is an internal checkpoint (not a formal phase boundary): may reduce sign-off chain and skip external stakeholder gate
- Project uses rolling-wave planning: defer next-phase plan detail requirement; require only high-level roadmap confirmation
- Small team or startup context: may combine role sign-offs; require at least tech lead and PO regardless

## Extension Points

- `ext-milestone-gate-criteria` — phase-specific gate criteria injected by the active SDLC phase flow
- `ext-milestone-governance` — governance board or change control criteria required by the organization
- `ext-milestone-audit` — audit evidence assembly requirements for regulated projects
