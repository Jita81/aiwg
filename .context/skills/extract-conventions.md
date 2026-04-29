# Skill: Extract Code Conventions

Follow the Context Engineering standard at .context/skills/context-engineering.md.

## Process
1. Analyse the existing source code in this repository
2. Create .context/discovery/code-conventions.md with:
   - Naming conventions (files, functions, classes, variables, branches)
   - Error handling patterns (how errors are caught, reported, logged)
   - Import organization (order, grouping)
   - Test patterns (framework, naming, structure)
   - Documentation style (docstrings, comments)
   - Architecture patterns (factory, observer, middleware, etc.)
3. Commit with message: "discovery: extract code conventions"

## Rules
- Every convention MUST include a real code example from this repo
- Do not guess or invent conventions — only document what you observe
- If no pattern exists for a category, state "No established pattern found"
