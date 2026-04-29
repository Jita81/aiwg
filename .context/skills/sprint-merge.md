# Skill: Sprint Merge

Follow the Context Engineering standard at .context/skills/context-engineering.md.

## Input
Sprint number is provided as a parameter.

## Process
1. Ensure all tests pass on the sprint branch
2. Merge sprint-{N} into main
3. Resolve any merge conflicts (prefer the sprint branch changes)
4. Run ALL tests on the merged result
5. If tests pass: push main
6. If tests fail: report the failures, do NOT push
7. Create .context/delivery/sprint-{N}/results.json with:
   - merge_status: "merged" | "conflicts" | "test_failures"
   - tests_passed: true/false
   - test_output: summary of test results
8. Commit with message: "delivery: sprint {N} merged to main"

## Rules
- Never push if tests fail
- Always run the full test suite after merge, not just sprint tests
