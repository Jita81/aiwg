---
dod_id: dod-code-review
name: Code Review Definition of Done
scope: domain
category: code-review
version: 1.0.0
extensible: true
---

# Code Review Definition of Done

## Purpose

Defines when a code review is genuinely complete, not just when the "Approve" button has been clicked. Superficial reviews that miss defects or approve without reading are a false quality signal. This DoD ensures reviews add real value.

## Criteria

### Required

- [ ] At least two reviewers have approved (one for hotfixes with written rationale for exception)
- [ ] No reviewer is the same person as the author
- [ ] All comments marked as "required" or "blocking" by reviewers are resolved before merge
- [ ] All review comment threads are closed: either fixed and marked resolved, or the reviewer who raised it has confirmed the response is acceptable
- [ ] Author has not self-merged without completing the review cycle
- [ ] PR description explains what changed, why it changed, and how to verify it (not just a link to the ticket)
- [ ] CI is green at the head commit at the time of merge (not just at approval time)

### Recommended

- [ ] At least one reviewer has domain expertise relevant to the changed area (security, data, performance, etc.)
- [ ] Reviewer has actually run the code or verified the feature manually for changes affecting user-facing behavior
- [ ] Reviewer comments are constructive and explain the reason for the request (not just "change this")
- [ ] Large PRs (>500 lines) are broken into multiple smaller PRs or reviewed in sessions with the author
- [ ] Time-to-first-review SLO met: review started within the team's agreed window (default: next business day)

## Verification

**Automated checks:**
- Branch protection rules: minimum 2 required reviewers enforced by repository settings
- CI status check: required status checks all pass before merge is allowed
- Self-merge prevention: repository settings block author from approving their own PR

**Manual steps:**
- Reviewer confirms they read the diff, not just the description
- Tech lead spot-checks that blocking comments are actually resolved (not just dismissed)
- Team retrospective metrics: review time, comment resolution rate, and defect-escape-from-review rate reviewed quarterly

## Tailoring Guide

**Add criteria when:**
- Security-sensitive code: require one reviewer is a designated security-knowledgeable team member
- Public API change: require one reviewer is a consumer of the API or API standards owner
- Database schema change: require DBA or data architect review
- Regulated codebase: require review evidence captured (reviewer name, timestamp, commit SHA) in audit log

**Remove or relax criteria when:**
- Hotfix under incident pressure: may reduce to one reviewer with written rationale; require second async review post-merge
- Sole contributor project: require author self-review checklist instead; automated checks must compensate
- Documentation-only PR: may reduce to one reviewer; CI and self-merge rules still apply

## Extension Points

- `ext-code-review-checklist` — project-specific review checklist contributed by team standards
- `ext-code-review-slo` — SLO thresholds for review turnaround time
- `ext-code-review-expertise` — domain expert reviewer requirements for specific file path patterns
