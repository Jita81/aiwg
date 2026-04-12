---
dod_id: dod-testing
name: Testing Definition of Done
scope: domain
category: testing
version: 1.0.0
extensible: true
---

# Testing Definition of Done

## Purpose

Defines what "adequately tested" means for any code change. Provides a concrete, agreed standard that prevents coverage theater (high numbers, low confidence), flaky tests (non-deterministic results), and test gaps in edge cases and failure paths.

## Criteria

### Required

- [ ] Unit tests exist for all new public functions, methods, and classes
- [ ] Unit test coverage for new or changed lines meets or exceeds the project threshold (default 80%)
- [ ] All unit tests pass in CI; zero failing tests (no `skip`, `xtest`, or `todo` markers without a linked issue)
- [ ] Integration tests cover all interactions between the changed component and its direct dependencies
- [ ] At least one negative test exists for each new validation rule, error handler, or guard clause
- [ ] No test asserts on the implementation detail of a dependency (tests mock behavior, not internals)
- [ ] Test names describe the scenario and expected outcome (not just the method name)
- [ ] No test sleeps or arbitrary timeouts introduced; async behavior tested with proper await or callbacks

### Recommended

- [ ] Edge case tests written for boundary conditions (empty input, max value, null/nil, concurrent access)
- [ ] E2E or smoke test covers the primary user journey affected by the change
- [ ] Property-based or fuzz tests used for input parsing or data transformation logic
- [ ] Mutation testing score for the changed module is above the project baseline (if mutation testing is configured)
- [ ] Test data managed via factories or fixtures, not inline hardcoded values copied across tests

## Verification

**Automated checks:**
- Test runner in CI: all tests pass, zero skipped without documented reason
- Coverage tool: line and branch coverage report for new/changed code shows >= threshold
- Linter (if configured): test file naming convention and import style enforced
- Flakiness detector (if configured): test is run N times in isolation and passes consistently

**Manual steps:**
- Reviewer reads new tests and confirms they would fail if the implementation were deleted
- Reviewer confirms at least one test covers the failure path for each new guard or validation
- Author runs tests with the implementation temporarily broken to confirm the tests catch the regression

## Tailoring Guide

**Add criteria when:**
- Safety-critical or regulated system: require 100% coverage of new code paths and independent test review
- Public library or SDK: require contract tests covering all documented API behaviors
- Performance-sensitive module: require benchmark tests establishing baseline in CI
- Distributed system component: require tests with injected latency and partial failure simulation

**Remove or relax criteria when:**
- Prototype or spike: relax coverage requirement; require at least one smoke test that the code runs
- UI component library: unit tests for pure rendering may be replaced by visual regression snapshots
- Pure data migration script (one-time use): require manual dry-run on copy of production data; automated tests may be deferred

## Extension Points

- `ext-testing-coverage-threshold` — project-specific coverage targets per module or layer
- `ext-testing-e2e-suite` — E2E test suite identifier to run for this change category
- `ext-testing-mutation` — mutation testing configuration and minimum score threshold
