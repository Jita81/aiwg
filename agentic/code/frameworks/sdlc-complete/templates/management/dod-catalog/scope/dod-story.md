---
dod_id: dod-story
name: Story Definition of Done
scope: scope
category: story
version: 1.0.0
extensible: true
---

# Story Definition of Done

## Purpose

Ensures every user story, task, or defect fix is genuinely complete before moving to the next item. Prevents partially-done work from accumulating and blocking integration, release, or downstream teams.

## Criteria

### Required

- [ ] All acceptance criteria stated in the story are met and verified by the author
- [ ] Happy path and at least one negative path are covered by automated tests
- [ ] Unit tests pass locally and in CI with no skipped tests
- [ ] Code coverage for new/changed lines meets or exceeds the project threshold (default 80%)
- [ ] Code reviewed and approved by at least one peer other than the author
- [ ] All review comments are resolved or explicitly deferred with written rationale
- [ ] No new lint errors or type errors introduced (CI lint step is green)
- [ ] Code merged to the integration branch with no uncommitted local changes
- [ ] CI pipeline is green on the integration branch after merge
- [ ] Product Owner or designated proxy has accepted the story

### Recommended

- [ ] Edge cases and boundary conditions identified in story comments or test names
- [ ] Inline comments added for any logic that is not self-evident
- [ ] Related documentation page updated if user-visible behavior changed
- [ ] Analytics or feature flag instrumentation added where applicable
- [ ] Pair programmed or mob reviewed for complex business logic

## Verification

**Automated checks (CI must pass before merge):**
- Test runner: all unit and integration tests green
- Coverage reporter: new line coverage >= project threshold
- Linter: zero new errors
- Type checker: zero new type errors

**Manual review steps:**
- Reviewer confirms acceptance criteria are met by reading the story and checking the implementation
- Product Owner runs the feature in a development or staging environment and accepts it
- Author verifies no related tests were deleted or weakened to achieve coverage

## Tailoring Guide

**Add criteria when:**
- Story touches an API contract: require API contract tests pass
- Story involves user-facing copy or UI: require design review sign-off
- Story modifies a security boundary: require security-focused reviewer
- Story is a bug fix: require a regression test that would have caught the original defect

**Remove or relax criteria when:**
- Story is a prototype or spike: may relax coverage requirement; document the decision
- Story is a docs-only change: skip test and CI criteria; apply dod-documentation instead
- Story is a chore with no behavior change: skip Product Owner acceptance; require tech lead sign-off instead

## Extension Points

- `ext-story-compliance` — inject compliance-specific criteria (e.g., audit log entry, PII handling)
- `ext-story-platform` — inject platform-specific criteria (e.g., mobile, embedded, browser compat)
- `ext-story-domain` — inject domain-specific criteria contributed by domain DoDs (security, accessibility, etc.)
