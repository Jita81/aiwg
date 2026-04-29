# Skill: Sprint Implementation Plan

Follow the Context Engineering standard at .context/skills/context-engineering.md.

## Input
Sprint number is provided as a parameter.

## Process
1. Read .context/discovery/sprint-plan.json for the sprint's stories
2. Read the relevant feature files in .context/discovery/features/
3. Read .context/inception.json (sections.technical_approach) for constraints
4. Read .context/discovery/architecture-strategy.md if it exists
5. Read .context/discovery/code-conventions.md if it exists
6. Create .context/delivery/sprint-{N}/plan.json with per-story:
   - story_title, files_to_create, files_to_modify
   - implementation_order (which story to implement first)
   - approach (2-3 sentences), risks
7. Commit with message: "delivery: sprint {N} implementation plan"

## Rules
- DO NOT WRITE ANY CODE. Just create the plan.
- Order stories so dependencies are implemented before dependants
