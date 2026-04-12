---
dod_id: dod-iteration
name: Iteration Definition of Done
scope: scope
category: iteration
version: 1.0.0
extensible: true
---

# Iteration Definition of Done

## Purpose

Confirms the body of work committed to an iteration (sprint) is genuinely complete, the codebase is stable, and the team has reflected on the process. Prevents debt from silently accumulating across iterations and ensures the team ships working software every cycle.

## Criteria

### Required

- [ ] Every story committed at iteration start either meets dod-story criteria or is explicitly moved to the backlog with a written reason
- [ ] Sprint goal is met, or the Product Owner has accepted the adjusted scope in writing
- [ ] The CI pipeline is green on the integration branch at iteration close (all tests passing, no skipped)
- [ ] Overall test coverage has not decreased from the previous iteration's baseline
- [ ] No new P0 defects are open; all new P1 defects are triaged with an assignee and target iteration
- [ ] Regression test suite passes — no previously-passing tests have been broken
- [ ] Sprint demo completed with at least the Product Owner and one stakeholder present
- [ ] Sprint retrospective held and action items recorded (minimum one actionable improvement)
- [ ] Architecture Decision Records (ADRs) updated for any architectural decisions made this iteration
- [ ] All incomplete work moved to the backlog with status notes and acceptance criteria preserved

### Recommended

- [ ] Defect discovery rate reviewed against project baseline (flag if significantly above)
- [ ] Velocity recorded and compared to team average (flag if variance > 20%)
- [ ] Technical debt items identified during iteration logged in the backlog
- [ ] Known issues and workarounds documented in the iteration notes or release draft
- [ ] Team capacity notes (absences, interruptions) recorded for planning accuracy

## Verification

**Automated checks:**
- CI dashboard: integration branch shows all-green at iteration close timestamp
- Coverage report: current iteration coverage >= previous iteration coverage
- Defect tracker query: zero open P0s with this iteration's label

**Manual steps:**
- Product Owner confirms sprint goal met or formally accepts scope change
- Scrum Master or facilitator confirms retrospective occurred and action items are in the backlog
- Tech lead reviews ADR log and confirms any architectural decisions are captured
- Author of any deferred story confirms backlog item has sufficient context for the next team member

## Tailoring Guide

**Add criteria when:**
- Running a hardening iteration: require defect count reduced by a defined number
- Running a security-focused iteration: require security scan results reviewed
- Approaching a release: require release notes draft reviewed and staging deployment successful
- Team is distributed: require async demo recording posted and confirmed viewed by key stakeholders

**Remove or relax criteria when:**
- Using Kanban (no iteration boundary): apply dod-story continuously; replace iteration DoD with weekly health check
- Running a spike or research iteration: relax story DoD and coverage requirements; require research findings documented
- First iteration of a new project: relax regression suite requirement (no baseline exists); require CI setup complete instead

## Extension Points

- `ext-iteration-metrics` — custom velocity or quality metrics tracked by the project
- `ext-iteration-compliance` — audit evidence collection required at each iteration boundary
- `ext-iteration-reporting` — automated status report generation triggered at iteration close
