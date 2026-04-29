# Skill: Generate Sprint Plan

Follow the Context Engineering standard at .context/skills/context-engineering.md.

## Process
1. Read ALL feature files in .context/discovery/features/*.json
2. Read .context/inception.json (sections.phases_and_sizing) for phase structure
3. Create .context/discovery/sprint-plan.json:
   - Group stories into sprints by dependency order
   - Sprint 1: Foundation stories with NO dependencies
   - Sprint 2: Stories that depend on Sprint 1 output
   - Sprint 3+: Continue the dependency chain
4. Within each sprint, order by feature grouping
5. Each sprint should have a clear goal and no more than 10 stories
6. Commit with message: "discovery: generate sprint plan"

## Rules
- Stories in the same sprint must NOT depend on each other
- Foundation stories (auth, data models, setup) always go in Sprint 1
