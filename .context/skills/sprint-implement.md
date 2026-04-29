# Skill: Sprint Implementation

Follow the Context Engineering standard at .context/skills/context-engineering.md.

## Input
Sprint number is provided as a parameter.

## Process
1. Read .context/delivery/sprint-{N}/plan.json for the implementation plan
2. Read feature files referenced in the plan for acceptance criteria
3. Read .context/inception.json (sections.technical_approach) for constraints
4. Read .context/discovery/code-conventions.md for coding standards
5. Implement each story in the order specified in the plan
6. Follow the architecture and conventions exactly
7. Write unit tests for each story
8. Write integration tests where stories interact
9. Run ALL tests — fix any failures
10. Create .context/delivery/sprint-{N}/test-plan.json with results
11. Commit with message: "delivery: sprint {N} implementation"

## Rules
- Follow the plan exactly — do not add features not in the plan
- Every story must have at least one passing test
