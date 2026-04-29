# Skill: Sprint Quality Assessment

Follow the Context Engineering standard at .context/skills/context-engineering.md.

## Input
Sprint number is provided as a parameter.

## Process
1. Read .context/delivery/sprint-{N}/plan.json (what was intended)
2. Read .context/delivery/sprint-{N}/test-plan.json (test results)
3. Read .context/inception.json (sections.technical_approach) for constraints
4. Read .context/discovery/code-conventions.md (standards)
5. Assess against: ISO 25010, OWASP Top 10, SANS/CWE Top 25, code conventions, test coverage
6. Create .context/delivery/sprint-{N}/quality-plan.json with:
   - overall_score (0-100), per_characteristic scores
   - findings: [{severity, category, description, file, fix}]
   - passing: true/false
7. Fix any critical or high severity findings. Run tests after fixes.
8. Commit with message: "delivery: sprint {N} quality assessment"

## Rules
- Critical and high findings must be fixed before marking passing=true
